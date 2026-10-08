import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deckt, vorratsName, postenAus, bereinigeVorrat, fuegeHinzu, vorratAbziehen, kochbarMitVorrat,
} from '../src/state/vorrat.js';
import { aggregate } from '../src/state/shopping.js';

const d = (vorrat, zutat) => deckt(vorratsName(vorrat), vorratsName(zutat));

test('der Vorrat deckt Sorten und Beugungen', () => {
  assert.ok(d('Mehl', 'Weizenmehl Type 405'));
  assert.ok(d('Weizenmehl', 'Mehl'));
  assert.ok(d('Eier', 'Ei'));
  assert.ok(d('Ei', 'Eier'));
  assert.ok(d('Tomaten', 'Tomate'));
  assert.ok(d('Zwiebeln', 'rote Zwiebel'));
  assert.ok(d('Öl', 'Olivenöl'));
  assert.ok(d('Gemüsebrühe', 'Brühe'));
  assert.ok(d('Milch', 'Vollmilch'));
});

test('aber nicht, was nur so anfängt oder etwas anderes ist', () => {
  assert.ok(!d('Ei', 'Eigelb'));
  assert.ok(!d('Ei', 'Brei'));
  assert.ok(!d('Reis', 'Reisnudeln'));
  assert.ok(!d('Tomaten', 'Tomatenmark'));
  assert.ok(!d('Milch', 'Kokosmilch'));
  assert.ok(!d('Sahne', 'saure Sahne'));
  assert.ok(!d('Öl', 'Sesamöl'));
  assert.ok(!d('Kartoffeln', 'Süßkartoffel'));
});

test('Eingaben werden zu Posten, Listen bereinigt', () => {
  assert.deepEqual(postenAus('500 g Mehl'), { name: 'Mehl', menge: 500, einheit: 'g' });
  assert.deepEqual(postenAus('Salz'), { name: 'Salz', menge: null, einheit: '' });
  assert.equal(postenAus('   '), null);
  const liste = bereinigeVorrat([{ name: 'Salz' }, { name: 'salz', menge: 3 }, { name: '' }, 'Unsinn', { name: 'Reis', menge: -1, einheit: 'g' }]);
  assert.deepEqual(liste, [{ name: 'Salz', menge: null, einheit: '' }, { name: 'Reis', menge: null, einheit: '' }]);
  assert.equal(fuegeHinzu(liste, { name: 'SALZ', menge: 1, einheit: 'kg' }).length, 2);
});

const rezept = {
  id: 'r', title: 'Kuchen', servings: 4,
  ingredients: [
    { amount: 1200, unit: 'g', name: 'Weizenmehl' },
    { amount: 4, unit: '', name: 'Eier' },
    { amount: null, unit: '', name: 'Salz' },
    { amount: 200, unit: 'g', name: 'Zucker' },
  ],
};
const liste = () => aggregate([{ recipeId: 'r', servings: 4 }], new Map([['r', rezept]]));
const offen = (groups) => Object.fromEntries(groups.flatMap((g) => g.items).map((i) => [i.name, `${i.amount ?? ''} ${i.unit}`.trim()]));

test('die Einkaufsliste zieht den Vorrat ab', () => {
  const { groups, gedeckt } = vorratAbziehen(liste(), [
    postenAus('1 kg Mehl'), postenAus('Salz'), postenAus('6 Eier'),
  ]);
  assert.deepEqual(offen(groups), { Weizenmehl: '200 g', Zucker: '200 g' });
  assert.deepEqual(gedeckt.map((i) => i.name).sort(), ['Eier', 'Salz', 'Weizenmehl']);
  assert.ok(gedeckt.find((i) => i.name === 'Weizenmehl').teil);
});

test('mehrere Posten reichen zusammen, unpassende Einheiten heißen "prüfen"', () => {
  const zusammen = vorratAbziehen(liste(), [postenAus('1 kg Mehl'), postenAus('300 g Weizenmehl')]);
  assert.ok(!('Weizenmehl' in offen(zusammen.groups)));
  const pruefen = vorratAbziehen(liste(), [{ name: 'Zucker', menge: 1, einheit: 'Packung' }]);
  assert.ok(pruefen.gedeckt.find((i) => i.name === 'Zucker').pruefen);
  assert.ok(!('Zucker' in offen(pruefen.groups)));
});

test('ohne Vorrat bleibt die Liste unverändert', () => {
  const l = liste();
  assert.equal(vorratAbziehen(l, []).groups, l);
});

test('"Was kann ich kochen?" sortiert nach dem, was fehlt', () => {
  const r = (id, ...namen) => ({ id, title: id, ingredients: namen.map((name) => ({ name })) });
  const rezepte = [
    r('pfannkuchen', 'Mehl', 'Eier', 'Milch', 'Salz'),
    r('omelett', 'Eier', 'Milch', 'Schnittlauch', 'Salz', 'Pfeffer'),
    r('lasagne', 'Nudelplatten', 'Hackfleisch', 'Tomaten', 'Käse', 'Béchamel'),
    { ...r('historisch', 'Mehl', 'Eier', 'Milch'), lesetext: true },
  ];
  const vorrat = ['Weizenmehl', 'Eier', 'Vollmilch'].map((name) => ({ name }));
  const t = kochbarMitVorrat(rezepte, vorrat);
  assert.deepEqual(t.map((x) => x.recipe.id), ['pfannkuchen', 'omelett']);
  assert.deepEqual(t[0].fehlt, []);
  assert.deepEqual(t[1].fehlt, ['Schnittlauch']);
});
