import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planeWoche, wuerfleFeld, bereinigeVorgaben, passt } from '../src/state/planer.js';

/** Vorhersagbarer Zufall */
function zufall(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const fisch = [{ id: 'fisch', level: 'ja' }];
const milch = [{ id: 'milch', level: 'moeglich' }];
let n = 0;
const rezept = (o = {}) => {
  n += 1;
  return {
    id: `r${n}`, title: `Gericht Nummer${n}`, meals: ['mittag', 'abend'], diet: [], totalTime: 30,
    allergens: [], servings: 4, ingredients: [{ name: 'Wasser' }], gesundheit: { punkte: 50 }, ...o,
  };
};

const pool = [
  ...Array.from({ length: 30 }, () => rezept()),
  ...Array.from({ length: 6 }, () => rezept({ allergens: fisch })),
  ...Array.from({ length: 10 }, () => rezept({ diet: ['vegetarisch'], allergens: milch })),
  ...Array.from({ length: 8 }, () => rezept({ meals: ['fruehstueck'] })),
  rezept({ lesetext: true }),
];
const lookup = new Map(pool.map((r) => [r.id, r]));

test('Vorgaben werden bereinigt', () => {
  const v = bereinigeVorgaben({ mahlzeiten: ['mittag', 'kaffee'], tage: [9, 2, 2], personen: 99, ernaehrung: 'roh', fischProWoche: -3 });
  assert.deepEqual(v.mahlzeiten, ['mittag']);
  assert.deepEqual(v.tage, [2]);
  assert.equal(v.personen, 24);
  assert.equal(v.ernaehrung, '');
  assert.equal(v.fischProWoche, 0);
  assert.deepEqual(bereinigeVorgaben(null).tage, [0, 1, 2, 3, 4, 5, 6]);
});

test('harte Grenzen: Ernährung, Zeit, Allergene, Originaltexte', () => {
  const v = bereinigeVorgaben({ ernaehrung: 'vegetarisch' });
  assert.ok(passt(pool[36], 'mittag', v));
  assert.ok(!passt(pool[0], 'mittag', v));
  assert.ok(!passt(pool[0], 'mittag', bereinigeVorgaben({ maxZeit: 20 })));
  assert.ok(!passt({ ...pool[0], totalTime: 0 }, 'mittag', bereinigeVorgaben({ maxZeit: 60 })));
  // "kann enthalten" schliesst aus
  assert.ok(!passt(pool[36], 'mittag', bereinigeVorgaben({ ohneAllergene: ['milch'] })));
  assert.ok(!passt(pool[pool.length - 1], 'mittag', bereinigeVorgaben({})));
});

test('füllt die gewählten Felder ohne Wiederholung', () => {
  const { eintraege, ohneTreffer } = planeWoche(pool, {}, { mahlzeiten: ['mittag', 'abend'], personen: 2 }, { zufall: zufall(), lookup });
  assert.equal(Object.keys(eintraege).length, 14);
  assert.deepEqual(ohneTreffer, []);
  const ids = Object.values(eintraege).map((e) => e.recipeId);
  assert.equal(new Set(ids).size, 14);
  assert.ok(Object.values(eintraege).every((e) => e.servings === 2));
  assert.ok(Object.keys(eintraege).every((k) => /^[0-6]:(mittag|abend)$/.test(k)));
});

test('belegte Felder bleiben, außer sie sollen ersetzt werden', () => {
  const woche = { '0:mittag': { recipeId: 'r1', servings: 4 } };
  const a = planeWoche(pool, woche, { mahlzeiten: ['mittag'] }, { zufall: zufall(), lookup });
  assert.ok(!('0:mittag' in a.eintraege));
  assert.ok(!Object.values(a.eintraege).some((e) => e.recipeId === 'r1'));
  const b = planeWoche(pool, woche, { mahlzeiten: ['mittag'], ersetzen: true }, { zufall: zufall(), lookup });
  assert.ok('0:mittag' in b.eintraege);
});

test('das Fischsoll wird erfüllt und über die Woche verteilt', () => {
  const { eintraege, fisch: anzahl } = planeWoche(pool, {}, { mahlzeiten: ['mittag', 'abend'], fischProWoche: 2 }, { zufall: zufall(3), lookup });
  assert.equal(anzahl, 2);
  const tage = Object.entries(eintraege).filter(([, e]) => lookup.get(e.recipeId).allergens.length && lookup.get(e.recipeId).allergens[0].id === 'fisch').map(([k]) => Number(k[0]));
  assert.equal(tage.length, 2);
  assert.ok(Math.abs(tage[1] - tage[0]) >= 2, `Fisch an Tag ${tage}`);
});

test('zu enge Vorgaben melden die leeren Felder', () => {
  const { eintraege, ohneTreffer } = planeWoche(pool, {}, { mahlzeiten: ['mittag'], ernaehrung: 'vegan' }, { zufall: zufall(), lookup });
  assert.equal(Object.keys(eintraege).length, 0);
  assert.equal(ohneTreffer.length, 7);
});

test('Vorrat und Gesundheit verschieben die Wahl', () => {
  const gesund = rezept({ title: 'Linsensalat', gesundheit: { punkte: 95 }, ingredients: [{ name: 'Linsen' }, { name: 'Karotten' }] });
  const mitVorrat = [...pool, gesund];
  let treffer = 0;
  for (let i = 1; i <= 20; i += 1) {
    const { eintraege } = planeWoche(mitVorrat, {}, { mahlzeiten: ['mittag'], tage: [0], vorrat: true, gesund: true },
      { zufall: zufall(i), vorrat: [{ name: 'Linsen' }, { name: 'Karotten' }], lookup });
    if (eintraege['0:mittag']?.recipeId === gesund.id) treffer += 1;
  }
  // Ohne Gewichtung laege die Chance bei rund 1 zu 47
  assert.ok(treffer >= 5, `${treffer} von 20`);
});

test('ein einzelnes Feld neu würfeln', () => {
  const woche = { '2:abend': { recipeId: 'r31', servings: 3 } }; // ein Fischgericht
  const neu = wuerfleFeld(pool, woche, { day: 2, meal: 'abend' }, { fischProWoche: 1 }, { zufall: zufall(), lookup });
  assert.notEqual(neu.recipeId, 'r31');
  assert.equal(lookup.get(neu.recipeId).allergens[0]?.id, 'fisch');
  assert.equal(neu.servings, 3);
});
