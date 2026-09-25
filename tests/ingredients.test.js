import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseAmount, parseIngredientLine, toSearchTerm } from '../src/sources/ingredients.js';

test('parseAmount versteht Dezimalzahlen, Brueche und Bereiche', () => {
  assert.equal(parseAmount('500'), 500);
  assert.equal(parseAmount('1,5'), 1.5);
  assert.equal(parseAmount('1/2'), 0.5);
  assert.equal(parseAmount('½'), 0.5);
  assert.equal(parseAmount('1 ½'), 1.5);
  assert.equal(parseAmount('1½'), 1.5);
  assert.equal(parseAmount('2-3'), 2.5);
  assert.equal(parseAmount('Salz'), null);
});

test('parseIngredientLine trennt Menge, Einheit und Bezeichnung', () => {
  assert.deepEqual(parseIngredientLine('500 g Mehl'), { amount: 500, unit: 'g', name: 'Mehl' });
  assert.deepEqual(parseIngredientLine('1 ½ TL Backpulver'), { amount: 1.5, unit: 'TL', name: 'Backpulver' });
  assert.deepEqual(parseIngredientLine('2 Zehen Knoblauch'), { amount: 2, unit: 'Zehe', name: 'Knoblauch' });
  assert.deepEqual(parseIngredientLine('1 Pck. Vanillezucker'), { amount: 1, unit: 'Pck', name: 'Vanillezucker' });
});

test('mehrstellige Mengen werden nicht zerschnitten', () => {
  // Ein frueherer Parser machte aus "250 g" die Menge 2 und den Namen "50 g ...".
  assert.deepEqual(parseIngredientLine('250 g Lasagneplatten'),
    { amount: 250, unit: 'g', name: 'Lasagneplatten' });
});

test('unbestimmte Mengen behalten nur die Bezeichnung', () => {
  assert.deepEqual(parseIngredientLine('n. B. Pfeffer'), { amount: null, unit: '', name: 'Pfeffer' });
  assert.deepEqual(parseIngredientLine('etwas Butter'), { amount: null, unit: '', name: 'Butter' });
  assert.deepEqual(parseIngredientLine('Saft einer Zitrone'),
    { amount: null, unit: '', name: 'Saft einer Zitrone' });
});

test('unbekannte Einheiten bleiben Teil der Bezeichnung', () => {
  assert.deepEqual(parseIngredientLine('2 grosse Zwiebeln'),
    { amount: 2, unit: '', name: 'grosse Zwiebeln' });
});

test('angelsaechsische Einheiten werden uebersetzt', () => {
  // TheMealDB liefert imperiale Mengen. Ohne Zuordnung klebt "tsp" am
  // Namen und die Einkaufsliste kann nicht mehr zusammenfassen.
  assert.deepEqual(parseIngredientLine('1 tsp Soy Sauce'),
    { amount: 1, unit: 'TL', name: 'Soy Sauce' });
  assert.deepEqual(parseIngredientLine('2 tablespoons Oyster Sauce'),
    { amount: 2, unit: 'EL', name: 'Oyster Sauce' });
  assert.deepEqual(parseIngredientLine('2 cloves Garlic'),
    { amount: 2, unit: 'Zehe', name: 'Garlic' });
});

test('imperiale Gewichte werden metrisch umgerechnet', () => {
  assert.deepEqual(parseIngredientLine('1 lb Sirloin steak'),
    { amount: 454, unit: 'g', name: 'Sirloin steak' });
  assert.deepEqual(parseIngredientLine('8 oz Cream Cheese'),
    { amount: 227, unit: 'g', name: 'Cream Cheese' });
  assert.deepEqual(parseIngredientLine('1 pint Milk'),
    { amount: 473, unit: 'ml', name: 'Milk' });
});

test('dieselbe Zutat in verschiedenen Schreibweisen wird vergleichbar', () => {
  const a = parseIngredientLine('1 tsp Soy Sauce');
  const b = parseIngredientLine('1 teaspoon Soy Sauce');
  assert.equal(a.name, b.name);
  assert.equal(a.unit, b.unit);
});

test('toSearchTerm reduziert auf einen Begriff fuers Sortiment', () => {
  assert.equal(toSearchTerm('Weizenmehl Type 405'), 'Weizenmehl');
  assert.equal(toSearchTerm('Tomaten, gehackt'), 'Tomaten');
  assert.equal(toSearchTerm('Paprikapulver, edelsüß'), 'Paprikapulver');
  assert.equal(toSearchTerm('Brötchen vom Vortag'), 'Brötchen');
  assert.equal(toSearchTerm('Kichererbsen (Dose)'), 'Kichererbsen');
  assert.equal(toSearchTerm('Salz'), 'Salz');
});

test('versteht die Schreibweisen, an denen der Zerleger frueher scheiterte', () => {
  // Jede dieser Zeilen blieb frueher ganz als Name stehen, ohne Menge —
  // und fehlte damit in Einkaufsliste und Naehrwerten.
  const faelle = [
    ['1∕2 Zitrone', 0.5, '', 'Zitrone'],             // Unicode-Bruchstrich
    ['3∕4 l Apfelsaft', 0.75, 'l', 'Apfelsaft'],
    ['1/2–1 Bund Bärlauch', 0.75, 'Bund', 'Bärlauch'], // Spanne mit Bruch
    ['1 – 2 EL Öl', 1.5, 'EL', 'Öl'],                  // Spanne mit Leerzeichen
    ['175ml Wasser', 175, 'ml', 'Wasser'],             // ohne Abstand
    ['60g Pinienkerne', 60, 'g', 'Pinienkerne'],
    ['2Eier (Klasse M)', 2, '', 'Eier (Klasse M)'],
    ['1­2 EL Meerrettich', 1.5, 'EL', 'Meerrettich'], // weicher Trennstrich
    ['1–x EL Zucker', 1, 'EL', 'Zucker'],              // offene Spanne
    ['ca. 200 g Butter', 200, 'g', 'Butter'],
    ['etwa 100 g Mehl', 100, 'g', 'Mehl'],
  ];
  for (const [zeile, menge, einheit, name] of faelle) {
    const r = parseIngredientLine(zeile);
    assert.ok(Math.abs(r.amount - menge) < 1e-9, `${zeile}: Menge ${r.amount}`);
    assert.equal(r.unit, einheit, `${zeile}: Einheit`);
    assert.equal(r.name, name, `${zeile}: Name`);
  }
});

test('laesst unbestimmte Mengen und gewoehnliche Woerter in Ruhe', () => {
  assert.deepEqual(parseIngredientLine('etwas Pfeffer'), { amount: null, unit: '', name: 'Pfeffer' });
  assert.deepEqual(parseIngredientLine('Gut Holz'), { amount: null, unit: '', name: 'Gut Holz' });
  assert.equal(parseIngredientLine('2 Eier, Größe M').name, 'Eier, Größe M');
});

test('versteht Spannen mit Unicode-Bruechen', () => {
  const r = parseIngredientLine('½-1 TL Cayennepfeffer');
  assert.equal(r.amount, 0.75);
  assert.equal(r.unit, 'TL');
  assert.equal(r.name, 'Cayennepfeffer');
  assert.equal(parseIngredientLine('1½ kg Mehl').amount, 1.5);
  assert.equal(parseIngredientLine('1 ½ TL Salz').amount, 1.5);
  assert.equal(parseIngredientLine('¼ l Milch').amount, 0.25);
});

test('Deziliter, Pfund und alte Loeffelkuerzel werden verstanden', () => {
  assert.deepEqual(parseIngredientLine('2 dl Rahm'), { amount: 200, unit: 'ml', name: 'Rahm' });
  assert.deepEqual(parseIngredientLine('1 Pfund Hackfleisch'), { amount: 500, unit: 'g', name: 'Hackfleisch' });
  assert.deepEqual(parseIngredientLine('1 Essl. Selleriewürfel'), { amount: 1, unit: 'EL', name: 'Selleriewürfel' });
  assert.deepEqual(parseIngredientLine('1/2 Teel. Majoran'), { amount: 0.5, unit: 'TL', name: 'Majoran' });
});
