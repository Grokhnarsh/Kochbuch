import { test } from 'node:test';
import assert from 'node:assert/strict';

import { esc, safeUrl } from '../src/ui/html.js';
import { bereinige } from '../src/state/rezeptform.js';
import { parseRecipeFromHtml } from '../src/sources/schemaorg.js';

test('esc macht Markup aus Rezeptdaten unschaedlich', () => {
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(esc('Mehl "Type 405" & Salz'), 'Mehl &quot;Type 405&quot; &amp; Salz');
  assert.equal(esc("Omas 'Beste'"), 'Omas &#39;Beste&#39;');
  assert.equal(esc(null), '');
  assert.equal(esc(75), '75');
});

test('ein importierter Titel verliert eingeschleustes Markup', () => {
  // Genau so kam die Luecke zustande: der Parser entschluesselt Entitaeten,
  // aus "&lt;img …&gt;" wurde ein echtes Tag im Titel.
  const seite = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'Recipe',
    name: 'Kuchen &lt;img src=x onerror=alert(1)&gt;',
    recipeIngredient: ['200 g Mehl', '1 Ei'],
    recipeInstructions: ['Backen.'],
  })}</script>`;
  const r = parseRecipeFromHtml(seite, 'https://example.org/kuchen');
  assert.doesNotMatch(r.title, /</, 'Parser entfernt das Tag');
  assert.equal(r.title, 'Kuchen');
  // Und selbst wenn etwas durchkaeme, maskiert die Ausgabe es.
  assert.doesNotMatch(esc('<img onerror=x>'), /</);
});

test('safeUrl laesst nur http und https durch', () => {
  assert.equal(safeUrl('https://www.kochwiki.org/wiki/A%20B'), 'https://www.kochwiki.org/wiki/A%20B');
  assert.equal(safeUrl('http://beispiel.de'), 'http://beispiel.de/');
  for (const boese of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', '/relativ', '', null]) {
    assert.equal(safeUrl(boese), '#', String(boese));
  }
});

test('bereinige uebernimmt ein gueltiges Rezept', () => {
  const r = bereinige({
    id: 'eigen-suppe',
    title: '  Suppe  ',
    servings: '4',
    meals: ['mittag', 'nachts'],
    diet: ['vegan', 'paleo'],
    ingredients: [{ a: 500, u: 'g', n: 'Kartoffeln' }, { amount: 1, unit: 'l', name: 'Wasser' }],
    steps: ['Kochen.', 42, ''],
    boeseFeld: '<script>',
  });

  assert.equal(r.title, 'Suppe');
  assert.equal(r.servings, 4);
  assert.deepEqual(r.meals, ['mittag']);
  assert.deepEqual(r.diet, ['vegan']);
  assert.deepEqual(r.ingredients, [
    { a: 500, u: 'g', n: 'Kartoffeln' },
    { a: 1, u: 'l', n: 'Wasser' },
  ]);
  assert.deepEqual(r.steps, ['Kochen.']);
  assert.equal('boeseFeld' in r, false);
});

test('bereinige verwirft, was die App zum Absturz braechte', () => {
  // Frueher: normalise() rief raw.ingredients.map auf und warf — ein
  // einziger kaputter Eintrag im Speicher legte die ganze App lahm.
  for (const kaputt of [
    null,
    'Text',
    42,
    {},
    { title: 'Ohne Zutaten' },
    { title: 'Zutaten kein Feld', ingredients: 'Mehl' },
    { title: 'Zutaten ohne Namen', ingredients: [{ a: 1 }, null, { n: '  ' }] },
    { title: 'x', ingredients: [{ n: 'Mehl' }] },
  ]) {
    assert.equal(bereinige(kaputt), null, JSON.stringify(kaputt));
  }
});

test('bereinige haelt Zahlen in ihren Grenzen', () => {
  const r = bereinige({
    title: 'Grenzfall',
    ingredients: [{ a: -5, n: 'Mehl' }, { a: 'viel', n: 'Salz' }],
    servings: 99999,
    prep: -1,
    difficulty: 'schwer',
  });
  assert.equal(r.servings, 400);
  assert.equal(r.prep, 0);
  assert.equal(r.difficulty, 1);
  assert.equal(r.ingredients[0].a, null, 'negative Menge');
  assert.equal(r.ingredients[1].a, null, 'Text als Menge');
});
