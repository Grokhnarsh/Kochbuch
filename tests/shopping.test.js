import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aggregate } from '../src/state/shopping.js';
import { formatAmount, toBase, fromBase } from '../src/state/units.js';
import { aisleFor } from '../src/state/aisles.js';

const recipes = new Map([
  ['a', {
    title: 'Nudeln mit Tomaten',
    servings: 2,
    ingredients: [
      { amount: 200, unit: 'g', name: 'Spaghetti' },
      { amount: 400, unit: 'g', name: 'Tomaten' },
      { amount: null, unit: '', name: 'Salz' },
    ],
  }],
  ['b', {
    title: 'Tomatensuppe',
    servings: 4,
    ingredients: [
      { amount: 800, unit: 'g', name: 'Tomaten' },
      { amount: 0.5, unit: 'l', name: 'Gemüsebrühe' },
      { amount: 1, unit: 'TL', name: 'Salz' },
    ],
  }],
]);

test('Mengen werden auf die geplanten Portionen hochgerechnet', () => {
  const groups = aggregate([{ recipeId: 'a', servings: 4 }], recipes);
  const all = groups.flatMap((g) => g.items);
  const pasta = all.find((i) => i.name === 'Spaghetti');
  assert.equal(pasta.amount, 400); // doppelte Portionen, doppelte Menge
});

test('gleiche Zutaten aus mehreren Rezepten werden summiert', () => {
  const groups = aggregate(
    [{ recipeId: 'a', servings: 2 }, { recipeId: 'b', servings: 4 }],
    recipes,
  );
  const tomaten = groups.flatMap((g) => g.items).find((i) => i.name === 'Tomaten');
  assert.equal(tomaten.amount, 1.2);
  assert.equal(tomaten.unit, 'kg'); // 1200 g werden lesbar zu 1,2 kg
  assert.deepEqual(tomaten.recipes, ['Nudeln mit Tomaten', 'Tomatensuppe']);
});

test('Positionen ohne Menge machen die Summe unbestimmt statt falsch', () => {
  const groups = aggregate(
    [{ recipeId: 'a', servings: 2 }, { recipeId: 'b', servings: 4 }],
    recipes,
  );
  const salz = groups.flatMap((g) => g.items).filter((i) => i.name.toLowerCase() === 'salz');
  // "Salz" ohne Einheit und "1 TL Salz" sind verschiedene Positionen
  assert.equal(salz.length, 2);
  assert.ok(salz.some((i) => i.amount === null));
});

test('unbekannte Rezepte werden uebersprungen', () => {
  const groups = aggregate([{ recipeId: 'weg', servings: 2 }], recipes);
  assert.deepEqual(groups, []);
});

test('abgehakte Positionen bleiben markiert', () => {
  const first = aggregate([{ recipeId: 'a', servings: 2 }], recipes);
  const key = first[0].items[0].key;
  const second = aggregate([{ recipeId: 'a', servings: 2 }], recipes, { [key]: true });
  assert.equal(second[0].items[0].done, true);
});

test('Abteilungen ordnen Zutaten dem Einkaufsweg zu', () => {
  assert.equal(aisleFor('Tomaten'), 'Obst & Gemüse');
  assert.equal(aisleFor('Rinderhack'), 'Fleisch & Fisch');
  assert.equal(aisleFor('Sahne'), 'Molkerei & Eier');
  assert.equal(aisleFor('Spaghetti'), 'Vorrat & Trockenware');
  assert.equal(aisleFor('Pfeffer, schwarz'), 'Gewürze & Öle');
  assert.equal(aisleFor('Einhornstaub'), 'Sonstiges');
});

test('Einheiten rechnen sauber hin und zurueck', () => {
  assert.deepEqual(toBase(1.5, 'kg'), { amount: 1500, unit: 'g' });
  assert.deepEqual(fromBase(1500, 'g'), { amount: 1.5, unit: 'kg' });
  assert.deepEqual(fromBase(800, 'g'), { amount: 800, unit: 'g' });
  assert.equal(formatAmount(1.5, 'kg'), '1,5 kg');
  assert.equal(formatAmount(null, 'Prise'), 'Prise');
});
