import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { erstelleRechner, ertragsart, kern, anzeige, NAEHRSTOFFE } from '../src/state/naehrwerte.js';

const tabelle = JSON.parse(readFileSync(new URL('../src/data/naehrwerte.json', import.meta.url), 'utf8'));
const R = erstelleRechner(tabelle);
const id = (name) => R.zuordnen(name)?.id ?? null;
const nahe = (ist, soll, toleranz, text) =>
  assert.ok(Math.abs(ist - soll) <= toleranz, `${text}: ${ist} statt ${soll}`);

const zutat = (a, u, n) => ({ amount: a, unit: u, name: n });

test('die Tabelle stammt vollstaendig aus der USDA-Datenbank', () => {
  assert.match(tabelle.meta.quelle, /USDA FoodData Central/);
  assert.ok(tabelle.eintraege.length >= 200);
  for (const e of tabelle.eintraege) {
    assert.ok(Number.isInteger(e.fdc) && e.fdc > 0, `${e.id}: keine FDC-Nummer`);
    assert.ok(e.quelle, `${e.id}: keine Beschreibung`);
    const w = e.je100g;
    assert.ok(w.kcal >= 0 && w.kcal <= 902, `${e.id}: kcal ${w.kcal}`);
    for (const k of ['fett', 'kh', 'eiweiss']) assert.ok(w[k] == null || (w[k] >= 0 && w[k] <= 100), `${e.id}: ${k}`);
    assert.ok(w.salz == null || (w.salz >= 0 && w.salz <= 100), `${e.id}: salz ${w.salz}`);
  }
});

test('jedes Stichwort meint genau ein Lebensmittel', () => {
  const besitzer = new Map();
  for (const e of tabelle.eintraege) {
    for (const k of e.schluessel.map((x) => x.replace(/^[=~]/, ''))) {
      assert.ok(!besitzer.has(k) || besitzer.get(k) === e.id, `"${k}": ${besitzer.get(k)} und ${e.id}`);
      besitzer.set(k, e.id);
    }
  }
});

test('ordnet deutsche Zutaten zu', () => {
  assert.equal(id('Weizenmehl Type 405'), 'weizenmehl');
  assert.equal(id('Mehl (Typ 405), gesiebt'), 'weizenmehl');
  assert.equal(id('Butter oder Margarine'), 'butter', 'die erste Alternative zählt');
  assert.equal(id('Knoblauchzehen'), 'knoblauch');
  assert.equal(id('säuerliche Äpfel'), 'aepfel');
  assert.equal(id('frisch geriebene Muskatnuss'), 'muskat');
  assert.equal(id('Salz und Pfeffer'), 'salz');
});

test('das laengste Stichwort gewinnt', () => {
  assert.equal(id('Kokosmilch'), 'kokosmilch', 'keine Kuhmilch');
  assert.equal(id('Buttermilch'), 'buttermilch', 'weder Butter noch Milch');
  assert.equal(id('Erdnussbutter'), 'erdnussbutter');
  assert.equal(id('Zitronensaft'), 'zitronensaft', 'nicht die ganze Zitrone');
  assert.equal(id('Tomatenmark'), 'tomatenmark');
  assert.equal(id('Paprikapulver'), 'paprikapulver', 'Gewürz, kein Gemüse');
  assert.equal(id('Hühnerbrühe'), 'huehnerbruehe', 'Brühe, kein Huhn');
  assert.equal(id('Weißweinessig'), 'weinessig', 'Essig, kein Wein');
  assert.equal(id('Eiswasser'), 'wasser', 'kein Ei');
});

test('rechnet Mengeneinheiten in Gramm um', () => {
  const g = (a, u, n) => R.gramm(a, u, R.zuordnen(n));
  assert.equal(g(250, 'g', 'Mehl'), 250);
  assert.equal(g(1, 'kg', 'Mehl'), 1000);
  nahe(g(2, 'EL', 'Butter'), 28.4, 0.01, 'zwei Esslöffel Butter');
  assert.equal(g(1, 'TL', 'Salz'), 6);
  assert.equal(g(2, '', 'Eier'), 100, 'Größe M ohne Schale');
  assert.equal(g(3, 'Zehe', 'Knoblauch'), 9);
  nahe(g(500, 'ml', 'Milch'), 515, 1, 'Milch ist dichter als Wasser');
  assert.equal(g(4, 'Stk', 'Kalbsschnitzel'), 600);
  assert.equal(g(1, 'Pck', 'Backpulver'), 15);
  assert.equal(g(2, 'Stk', 'Mehl'), null, 'Mehl hat kein Stückgewicht');
  assert.equal(g(0, 'g', 'Mehl'), null);
});

test('rechnet ein Rezept je Portion', () => {
  const n = R.fuerRezept({
    servings: 4,
    ingredients: [
      zutat(200, 'g', 'Weizenmehl'),
      zutat(100, 'g', 'Butter'),
      zutat(2, '', 'Eier'),
      zutat(null, '', 'Salz'),
    ],
  });
  // 2 × 364 + 717 + 1 × 143 = 1588 kcal, geteilt durch 4
  nahe(n.gesamt.kcal, 1588, 1, 'gesamt');
  nahe(n.jePortion.kcal, 397, 1, 'je Portion');
  assert.equal(n.art, 'portion');
  assert.equal(n.bezug, 'je Portion');
  assert.deepEqual(n.ohneMenge, ['Salz']);
  assert.equal(n.abdeckung, 1);
  assert.equal(n.vertrauen, 'gut');
  nahe(n.je100g.kcal, (1588 / 400) * 100, 1, 'je 100 g');
});

test('Frittierfett zaehlt nur zum Zehntel, Bratfett zum Viertel', () => {
  const frittiert = R.fuerRezept({
    servings: 4,
    ingredients: [zutat(500, 'g', 'Kartoffeln'), zutat(1, 'l', 'Sonnenblumenöl')],
  });
  const oel = frittiert.posten.find((p) => p.lebensmittel === 'rapsoel');
  nahe(oel.gramm, 92, 1, 'ein Zehntel von 920 g');
  assert.match(frittiert.hinweise.join(), /Frittierfett/);

  const gebraten = R.fuerRezept({
    servings: 4,
    ingredients: [zutat(4, 'Stk', 'Kalbsschnitzel'), zutat(300, 'g', 'Butterschmalz')],
  });
  nahe(gebraten.posten.find((p) => p.lebensmittel === 'butterschmalz').gramm, 75, 0.01, 'ein Viertel');
});

test('Fett ohne Mengenangabe wird als Unsicherheit vermerkt', () => {
  const n = R.fuerRezept({
    servings: 2,
    ingredients: [zutat(2, '', 'Auberginen'), zutat(null, '', 'Olivenöl'), zutat(1, '', 'Zitrone')],
  });
  assert.equal(n.fettUngewiss, true);
  assert.match(n.hinweise.join(), /Fett ohne Mengenangabe/);
});

test('eine Einheit im Namen wird erkannt', () => {
  // Frueher: sechs ganze Ananas, 5,4 kg
  const n = R.fuerRezept({ servings: 4, ingredients: [zutat(6, '', 'klein geschnittene Scheiben Ananas'), zutat(100, 'g', 'Zucker')] });
  assert.equal(n.posten[0].gramm, 330);
});

test('ein ganzer Kuchen wird je 100 g gerechnet', () => {
  assert.equal(ertragsart({ yieldUnit: 'Blech' }), 'masse');
  assert.equal(ertragsart({ yieldUnit: 'Gläser' }), 'masse');
  assert.equal(ertragsart({ yieldUnit: 'Stück' }), 'stueck');
  assert.equal(ertragsart({ yieldUnit: null }), 'portion');
  assert.equal(ertragsart({ yieldUnit: null, category: 'Backen' }), 'masse');

  const kuchen = R.fuerRezept({
    servings: 1,
    yieldUnit: 'Springform',
    ingredients: [zutat(250, 'g', 'Mehl'), zutat(200, 'g', 'Butter'), zutat(200, 'g', 'Zucker'), zutat(4, '', 'Eier')],
  });
  assert.equal(kuchen.bezug, 'je 100 g');
  nahe(kuchen.jePortion.kcal, kuchen.je100g.kcal, 0.001, 'je Portion ist je 100 g');
  assert.ok(kuchen.jePortion.kcal < 600, 'kein ganzer Kuchen als Portion');
});

test('eine "Portion" mit zwei Kilo ist keine Portion', () => {
  const n = R.fuerRezept({ servings: 1, ingredients: [zutat(1500, 'g', 'Mehl'), zutat(500, 'g', 'Butter')] });
  assert.equal(n.art, 'masse');
  assert.match(n.hinweise.join(), /Portionszahl passt nicht/);
});

test('ein Teilrezept mit wenigen Gramm je Portion ist nicht belastbar', () => {
  const n = R.fuerRezept({ servings: 4, ingredients: [zutat(1, 'TL', 'Zwiebelwürfel'), zutat(10, 'g', 'Chorizo'), zutat(1, '', 'Portion Rührei')] });
  assert.equal(n.vertrauen, 'gering');
});

test('unbekannte Zutaten senken das Vertrauen', () => {
  const n = R.fuerRezept({
    servings: 2,
    ingredients: [zutat(200, 'g', 'Mehl'), zutat(100, 'g', 'Quinoa-Pops'), zutat(50, 'g', 'Yuzukosho'), zutat(1, '', 'Ei')],
  });
  assert.equal(n.abdeckung, 0.5);
  assert.equal(n.vertrauen, 'gering');
  assert.deepEqual(n.unbekannt, ['Quinoa-Pops', 'Yuzukosho']);
});

test('kern nimmt die erste Alternative ohne Zusatz', () => {
  assert.equal(kern('Butter oder Margarine'), 'butter');
  assert.equal(kern('Mehl (Type 405), gesiebt'), 'mehl');
  assert.equal(kern('Rinderbrühe, ersatzweise Gemüsebrühe'), 'rinderbrühe');
});

test('anzeige rundet und behauptet keine falsche Null', () => {
  const salz = NAEHRSTOFFE.find((n) => n.id === 'salz');
  assert.equal(anzeige(1.234, salz), '1,23');
  assert.equal(anzeige(0.004, salz), '< 0,01');
  assert.equal(anzeige(0, salz), '0');
  assert.equal(anzeige(null, salz), '—');
  assert.equal(anzeige(1234.4, 'kcal'), '1.234');
});
