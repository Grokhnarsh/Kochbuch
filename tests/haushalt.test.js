import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bereinigeProfile, konflikte, erfuellt, mitHaushalt } from '../src/state/profile.js';
import {
  bereinigeBewertungen, alsGekocht, mitSternen, tageSeit, verlauf, lieblingsGewicht,
} from '../src/state/bewertung.js';
import { sicherung, wiederherstellen, planLink, ausLink, bereinigePlaene } from '../src/state/teilen.js';
import { planeWoche } from '../src/state/planer.js';

const nuss = [{ id: 'schalenfruechte', level: 'ja' }];

test('Profile werden bereinigt', () => {
  const p = bereinigeProfile([
    { name: '  Anna ', allergene: ['schalenfruechte', 'erfunden'], ernaehrung: 'vegetarisch', meidet: ['Pilze', ''] },
    { name: '' }, 'kaputt',
  ]);
  assert.equal(p.length, 1);
  assert.deepEqual(p[0], { id: 'p-1', name: 'Anna', aktiv: true, ernaehrung: ['vegetarisch'], allergene: ['schalenfruechte'], meidet: ['Pilze'] });
});

test('vegan erfüllt vegetarisch, vegetarisch erfüllt pescetarisch', () => {
  assert.ok(erfuellt({ diet: ['vegan'] }, 'vegetarisch'));
  assert.ok(erfuellt({ diet: ['vegetarisch'] }, 'pescetarisch'));
  assert.ok(!erfuellt({ diet: ['pescetarisch'] }, 'vegetarisch'));
  assert.ok(erfuellt({ diet: [] }, ''));
});

test('Konflikte nennen Person und Grund', () => {
  const profile = bereinigeProfile([
    { name: 'Anna', allergene: ['schalenfruechte'] },
    { name: 'Ben', meidet: ['Pilze'], ernaehrung: ['vegetarisch'] },
    { name: 'Gast', aktiv: false, allergene: ['milch'] },
  ]);
  const r = { diet: [], allergens: nuss, ingredients: [{ name: 'Champignons' }, { name: 'braune Pilze' }, { name: 'Walnüsse' }] };
  const k = konflikte(r, profile);
  assert.deepEqual(k.map((x) => x.name), ['Anna', 'Ben']);
  assert.deepEqual(k[0].gruende, ['enthält Nüsse']);
  assert.deepEqual(k[1].gruende, ['nicht vegetarisch', 'mag kein Pilze']);
});

test('der Planer berücksichtigt den ganzen Haushalt', () => {
  const profile = bereinigeProfile([{ name: 'Anna', allergene: ['schalenfruechte'] }, { name: 'Ben', meidet: ['Pilze'] }]);
  let n = 0;
  const r = (o) => { n += 1; return { id: `r${n}`, title: `Essen Nummer${n}`, meals: ['abend'], diet: [], allergens: [], ingredients: [{ name: 'Reis' }], ...o }; };
  const pool = [r({ allergens: nuss }), r({ ingredients: [{ name: 'Pilze' }] }), r(), r()];
  const v = mitHaushalt({ mahlzeiten: ['abend'], tage: [0, 1, 2, 3], haushalt: true }, profile);
  assert.equal(v.personen, 2);
  const { eintraege, ohneTreffer } = planeWoche(pool, {}, v);
  assert.deepEqual(Object.values(eintraege).map((e) => e.recipeId).sort(), ['r3', 'r4']);
  assert.equal(ohneTreffer.length, 2);
  assert.ok(Object.values(eintraege).every((e) => e.servings === 2));
});

test('Bewertungen: Sterne, Kochverlauf, Gewicht', () => {
  let b = mitSternen({}, 'a', 5);
  b = alsGekocht(b, 'a', '2026-10-01');
  b = alsGekocht(b, 'a', '2026-10-01');
  b = alsGekocht(b, 'b', '2026-10-05');
  assert.deepEqual(b.a.gekocht, ['2026-10-01']);
  assert.deepEqual(verlauf(b).map((x) => x.id), ['b', 'a']);
  const jetzt = new Date(2026, 9, 8);
  assert.equal(tageSeit(b.a, jetzt), 7);
  assert.ok(lieblingsGewicht(b.a, jetzt) < 1, 'gerade gekocht kommt erst später wieder');
  assert.equal(lieblingsGewicht({ sterne: 5, gekocht: [] }, jetzt), 6);
  assert.deepEqual(bereinigeBewertungen({ x: { sterne: 9, notiz: 3 }, '<b>': { sterne: 2 } }), {});
});

test('Sicherung für andere lässt Abschriften und Importe weg', () => {
  const daten = {
    plan: { '2026-10-05': { '0:mittag': { recipeId: 'kochwiki-x', servings: 4 } } },
    eigene: [
      { id: 'eigen-a', title: 'Aus dem Buch', quelle: { titel: 'Großes Kochbuch' }, ingredients: [{ n: 'Mehl' }], steps: ['backen'] },
      { id: 'eigen-b', title: 'Omas Brot', ingredients: [{ n: 'Mehl' }], steps: ['backen'] },
    ],
    importe: [{ id: 'import-chefkoch-de-x', title: 'Importiert' }],
    vorrat: [{ name: 'Salz' }],
    fotos: { 'eigen-a': 'data:image/jpeg;base64,AAAA', 'eigen-b': 'data:image/jpeg;base64,BBBB' },
  };
  const fuerMich = wiederherstellen(JSON.stringify(sicherung(daten)));
  assert.deepEqual([fuerMich.zahlen.eigene, fuerMich.zahlen.importe, fuerMich.zahlen.fotos], [2, 1, 2]);
  const fuerAndere = wiederherstellen(JSON.stringify(sicherung(daten, { fuerAndere: true })));
  assert.deepEqual(fuerAndere.daten.eigene.map((r) => r.title), ['Omas Brot']);
  assert.equal(fuerAndere.zahlen.importe, 0);
  assert.deepEqual(Object.keys(fuerAndere.daten.fotos), ['eigen-b']);
});

test('fremde Dateien werden abgewiesen oder bereinigt', () => {
  assert.throws(() => wiederherstellen('kein json'), /kein gültiges JSON/);
  assert.throws(() => wiederherstellen('{"a":1}'), /keine Sicherung/);
  const plaene = bereinigePlaene({ '2026-10-05': { '0:mittag': { recipeId: 'x', servings: 1e9 }, '9:mittag': { recipeId: 'y' } }, kaputt: {} });
  assert.deepEqual(plaene, { '2026-10-05': { '0:mittag': { recipeId: 'x', servings: 2 } } });
  const { daten } = wiederherstellen({ format: 'kochbuch-sicherung', daten: { fotos: { a: 'javascript:alert(1)', b: 'data:image/png;base64,AA==' } } });
  assert.deepEqual(Object.keys(daten.fotos), ['b']);
});

test('ein Wochenplan reist als Link, ohne eigene Rezepte', () => {
  const { hash, ausgelassen } = planLink('2026-10-05', {
    '0:mittag': { recipeId: 'kochwiki-linsensuppe', servings: 4 },
    '1:abend': { recipeId: 'eigen-omas-brot', servings: 2 },
  });
  assert.equal(ausgelassen, 1);
  assert.deepEqual(ausLink(hash), { woche: '2026-10-05', eintraege: { '0:mittag': { recipeId: 'kochwiki-linsensuppe', servings: 4 } } });
  assert.equal(ausLink('#plan=%%%'), null);
  assert.equal(ausLink('#anderes'), null);
});
