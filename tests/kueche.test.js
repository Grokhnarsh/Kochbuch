import { test } from 'node:test';
import assert from 'node:assert/strict';

import { saisonZutat, saisonFuer, imMonat, zeitraum } from '../src/state/saison.js';
import { resteAus, resteRezepte } from '../src/state/reste.js';
import { kostenRezept, kostenWoche, euroText, PREISE } from '../src/state/kosten.js';
import { aggregate } from '../src/state/shopping.js';
import { erstelleRechner } from '../src/state/naehrwerte.js';
import tabelle from '../src/data/naehrwerte.json' with { type: 'json' };

const rezept = (ingredients, o = {}) => ({ id: 'r', title: 'R', servings: 4, ingredients, ...o });

test('Saison: Spargel im Mai, nicht im November; Haltbares hat keine Saison', () => {
  assert.equal(saisonZutat('weißer Spargel'), 'Spargel');
  assert.equal(saisonZutat('Erdbeermarmelade'), null);
  assert.equal(saisonZutat('Tomatenmark'), null);
  assert.equal(saisonZutat('Dosentomaten'), null);
  assert.equal(saisonZutat('Kartoffeln'), null); // ganzjaehrig, sagt nichts
  const r = rezept([{ name: 'Spargel' }, { name: 'Erdbeeren' }, { name: 'Butter' }]);
  assert.deepEqual(saisonFuer(r, 5), { passend: ['Spargel', 'Erdbeeren'], ausser: [], saisonal: true });
  const nov = saisonFuer(r, 11);
  assert.equal(nov.saisonal, false);
  assert.deepEqual(nov.ausser.sort(), ['Erdbeeren', 'Spargel']);
});

test('Saison: Wintergemüse über den Jahreswechsel', () => {
  assert.ok(imMonat(1).includes('Grünkohl'));
  assert.ok(imMonat(12).includes('Rosenkohl'));
  assert.ok(!imMonat(7).includes('Grünkohl'));
  assert.equal(zeitraum('Rote Bete'), 'August bis März');
});

const plan = (ingredients) => aggregate([{ recipeId: 'r', servings: 4 }], new Map([['r', rezept(ingredients)]]));

test('Reste: angebrochene Becher und Dosen', () => {
  const reste = resteAus(plan([
    { amount: 120, unit: 'ml', name: 'Sahne' },
    { amount: 400, unit: 'ml', name: 'Kokosmilch' },
    { amount: 180, unit: 'g', name: 'Mehl' },
    { amount: 1, unit: 'EL', name: 'Schmand' },
  ]));
  assert.deepEqual(reste.map((r) => [r.name, r.rest, r.einheit]), [['Sahne', 80, 'ml']]);
});

test('Reste: Ideen brauchen den Rest auf und liegen nicht schon im Plan', () => {
  const r = (id, name, meals = ['abend']) => ({ id, title: id, meals, ingredients: [{ name }], gesundheit: { punkte: 50 } });
  const rezepte = [r('gratin', 'Schlagsahne'), r('suppe', 'Sahne'), r('kuchen', 'Sahne', ['snack']), r('salat', 'Gurke')];
  const ideen = resteRezepte([{ name: 'Sahne' }], rezepte, { ausschliessen: new Set(['suppe']) });
  assert.deepEqual(ideen.get('Sahne').map((x) => x.id), ['gratin']);
});

const rechner = erstelleRechner(tabelle);
const gerechnet = (ingredients, o) => {
  const r = rezept(ingredients, o);
  return { ...r, naehrwerte: rechner.fuerRezept(r) };
};

test('Kosten: aus Gramm und Richtpreis, je Portion', () => {
  const r = gerechnet([
    { amount: 500, unit: 'g', name: 'Spaghetti' },
    { amount: 400, unit: 'g', name: 'Rinderhackfleisch' },
    { amount: 1, unit: 'Dose', name: 'gehackte Tomaten' },
  ]);
  const k = kostenRezept(r);
  assert.ok(k.abdeckung >= 0.9, `${k.abdeckung}`);
  // 0,5 kg Nudeln, 0,4 kg Hack, eine Dose Tomaten
  const erwartet = 0.5 * PREISE.nudeln + 0.4 * PREISE.rinderhack;
  assert.ok(k.gesamt > erwartet && k.gesamt < erwartet + 2, `${k.gesamt}`);
  assert.ok(Math.abs(k.jePortion - k.gesamt / 4) < 1e-9);
  assert.equal(k.posten[0].lebensmittel, 'rinderhack');
});

test('Kosten: Sparhinweis für teure Zutaten', () => {
  const k = kostenRezept(gerechnet([
    { amount: 100, unit: 'g', name: 'Pinienkerne' },
    { amount: 500, unit: 'g', name: 'Nudeln' },
    { amount: 100, unit: 'g', name: 'Basilikum' },
  ]));
  assert.equal(k.sparen[0].statt, 'Pinienkerne');
  assert.ok(k.sparen[0].ersparnis > 4);
});

test('Kosten der Woche folgen den geplanten Portionen', () => {
  const r = gerechnet([{ amount: 1000, unit: 'g', name: 'Kartoffeln' }, { amount: 250, unit: 'g', name: 'Quark' }]);
  const vier = kostenWoche([{ recipeId: 'r', servings: 4 }], () => r).gesamt;
  const acht = kostenWoche([{ recipeId: 'r', servings: 8 }], () => r).gesamt;
  assert.ok(Math.abs(acht - 2 * vier) < 1e-9);
  assert.equal(euroText(3.456), '3,46 €');
});
