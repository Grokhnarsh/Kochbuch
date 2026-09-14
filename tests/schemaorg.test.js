import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  parseRecipeFromHtml,
  isoDurationToMinutes,
  parseYield,
  flattenInstructions,
  findRecipeNode,
} from '../src/sources/schemaorg.js';

const fixture = readFileSync(new URL('./fixtures/rezeptseite.html', import.meta.url), 'utf8');

test('ISO-Dauern werden zu Minuten', () => {
  assert.equal(isoDurationToMinutes('PT30M'), 30);
  assert.equal(isoDurationToMinutes('PT1H10M'), 70);
  assert.equal(isoDurationToMinutes('P1DT2H'), 1560);
  assert.equal(isoDurationToMinutes('unfug'), 0);
  assert.equal(isoDurationToMinutes(undefined), 0);
});

test('Portionsangaben werden aus Text gelesen', () => {
  assert.equal(parseYield('6 Portionen'), 6);
  assert.equal(parseYield(['4']), 4);
  assert.equal(parseYield(12), 12);
  assert.equal(parseYield(undefined), 4);
});

test('Anweisungen werden aus allen erlaubten Formen geholt', () => {
  assert.deepEqual(flattenInstructions([{ '@type': 'HowToStep', text: 'Eins.' }]), ['Eins.']);
  assert.deepEqual(
    flattenInstructions({ '@type': 'HowToSection', itemListElement: [{ text: 'Zwei.' }] }),
    ['Zwei.'],
  );
  assert.deepEqual(flattenInstructions('Drei. Vier.'), ['Drei.', 'Vier.']);
  assert.deepEqual(flattenInstructions(null), []);
});

test('der Recipe-Knoten wird auch in einem @graph gefunden', () => {
  const node = findRecipeNode({ '@graph': [{ '@type': 'WebPage' }, { '@type': 'Recipe', name: 'X' }] });
  assert.equal(node.name, 'X');
  assert.equal(findRecipeNode({ '@type': 'WebPage' }), null);
});

test('eine Rezeptseite wird vollstaendig uebernommen', () => {
  const r = parseRecipeFromHtml(fixture, 'https://www.chefkoch.de/rezepte/999/Gratin.html');

  assert.equal(r.title, 'Kartoffelgratin mit Thymian');
  assert.equal(r.servings, 6);
  assert.equal(r.prep, 25);
  assert.equal(r.cook, 70);
  assert.equal(r.kcal, 520);
  assert.equal(r.sourceHost, 'chefkoch.de');
  assert.deepEqual(r.diet, ['vegetarisch']);
  assert.deepEqual(r.meals, ['mittag', 'abend']); // "Hauptspeise" ist kein Snack
  assert.equal(r.steps.length, 3);

  assert.deepEqual(r.ingredients[0], { a: 1.2, u: 'kg', n: 'festkochende Kartoffeln' });
  assert.deepEqual(r.ingredients[3], { a: 2, u: 'Zehe', n: 'Knoblauch' });
  assert.deepEqual(r.ingredients[5], { a: null, u: '', n: 'Muskatnuss' });
});

test('Seiten ohne Rezeptdaten liefern null statt eines Fehlers', () => {
  assert.equal(parseRecipeFromHtml('<html><body>nichts</body></html>', 'https://x.de'), null);
  assert.equal(
    parseRecipeFromHtml('<script type="application/ld+json">{kaputt</script>', 'https://x.de'),
    null,
  );
});
