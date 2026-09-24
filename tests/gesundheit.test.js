import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { erstelleRechner } from '../src/state/naehrwerte.js';
import { bewerte, vorschlaege, wochenLuecke, stufeFuer } from '../src/state/gesundheit.js';

const R = erstelleRechner(JSON.parse(readFileSync(new URL('../src/data/naehrwerte.json', import.meta.url), 'utf8')));
const z = (a, u, n) => ({ amount: a, unit: u, name: n });

/** Baut ein Rezept so, wie der Index es haelt. */
function rezept(id, zutaten, weiteres = {}) {
  const r = { id, title: id, category: 'Hauptgericht', meals: ['mittag', 'abend'], servings: 4, ingredients: zutaten, ...weiteres };
  r.naehrwerte = R.fuerRezept(r);
  r.gesundheit = bewerte(r);
  return r;
}

const linsen = rezept('Linseneintopf', [
  z(250, 'g', 'Linsen'), z(3, '', 'Möhren'), z(2, '', 'Zwiebeln'), z(1, 'Stk', 'Lauch'),
  z(400, 'g', 'Kartoffeln'), z(1, 'l', 'Gemüsebrühe'), z(2, 'EL', 'Olivenöl'), z(1, 'Bund', 'Petersilie'),
]);

const wurst = rezept('Bratwurst in Sahnesoße', [
  z(8, '', 'Bratwürste'), z(400, 'ml', 'Sahne'), z(100, 'g', 'Butter'), z(200, 'g', 'Weißbrot'), z(2, 'TL', 'Salz'),
]);

test('ein Linseneintopf ist ausgewogener als Bratwurst in Sahne', () => {
  assert.ok(linsen.gesundheit.punkte >= 70, `Linsen: ${linsen.gesundheit.punkte}`);
  assert.ok(wurst.gesundheit.punkte <= 20, `Wurst: ${wurst.gesundheit.punkte}`);
});

test('jede Bewertung nennt ihre Gruende', () => {
  const gut = linsen.gesundheit.gruende.filter((g) => g.gut).map((g) => g.text).join(' | ');
  assert.match(gut, /Gemüse|Hülsenfrüchte/);
  assert.match(gut, /Ballaststoffe/);
  const schlecht = wurst.gesundheit.gruende.filter((g) => !g.gut).map((g) => g.text).join(' | ');
  assert.match(schlecht, /gesättigte Fettsäuren/);
  assert.match(schlecht, /Wurst, Schinken oder Speck/);
});

test('die Punkte bleiben zwischen 0 und 100', () => {
  for (const r of [linsen, wurst]) {
    assert.ok(r.gesundheit.punkte >= 0 && r.gesundheit.punkte <= 100);
  }
  assert.equal(stufeFuer(80), 'sehr ausgewogen');
  assert.equal(stufeFuer(62), 'ausgewogen');
  assert.equal(stufeFuer(50), 'mittel');
  assert.equal(stufeFuer(10), 'üppig');
});

test('ohne belastbare Naehrwerte gibt es keine Bewertung', () => {
  const unklar = rezept('Unklar', [z(1, '', 'Drachenfrucht-Chutney'), z(2, '', 'Yuzukosho'), z(100, 'g', 'Mehl')]);
  assert.equal(unklar.naehrwerte.vertrauen, 'gering');
  assert.equal(unklar.gesundheit, null);
});

test('ein Tomatensalat ist gesund, aber keine Mahlzeit', () => {
  const salat = rezept('Tomatensalat', [z(4, '', 'Tomaten'), z(1, '', 'Zwiebel'), z(1, 'EL', 'Essig'), z(1, 'TL', 'Olivenöl')]);
  assert.ok(salat.gesundheit.gruende.some((g) => /zu wenig|Sehr leicht/.test(g.text)));
  assert.ok(salat.gesundheit.punkte < linsen.gesundheit.punkte);
});

test('Frittiertes ohne Oelmenge bekommt keinen Bonus fuer niedrige Energie', () => {
  const chips = rezept('Auberginenchips', [z(3, '', 'Auberginen'), z(null, '', 'Sonnenblumenöl'), z(100, 'g', 'Mehl')]);
  assert.equal(chips.naehrwerte.fettUngewiss, true);
  assert.ok(!chips.gesundheit.gruende.some((g) => /Niedrige Energiedichte/.test(g.text)));
});

test('Vorschlaege: nur passende Mahlzeit, nichts schon Geplantes, das Beste zuerst', () => {
  const fruehstueck = rezept('Haferbrei', [z(200, 'g', 'Haferflocken'), z(600, 'ml', 'Milch'), z(2, '', 'Äpfel'), z(100, 'g', 'Beeren')],
    { meals: ['fruehstueck'], category: 'Frühstück' });
  const kuchen = rezept('Kuchen', [z(300, 'g', 'Mehl'), z(200, 'g', 'Zucker'), z(200, 'g', 'Butter')], { category: 'Backen', meals: ['snack'] });
  const pool = [wurst, linsen, fruehstueck, kuchen];

  const mittag = vorschlaege(pool, { mahlzeit: 'mittag' });
  assert.deepEqual(mittag.map((v) => v.rezept.id), ['Linseneintopf'], 'Wurst ist zu schlecht bewertet, Kuchen keine Mahlzeit');

  assert.deepEqual(vorschlaege(pool, { mahlzeit: 'mittag', ausschliessen: new Set(['Linseneintopf']) }), []);
  assert.deepEqual(vorschlaege(pool, { mahlzeit: 'fruehstueck' }).map((v) => v.rezept.id), ['Haferbrei']);
});

test('was der Woche fehlt, bekommt Vorrang', () => {
  const tag = (ballast, mahlzeiten = 3) => ({
    werte: { kcal: 1900, fett: 60, gesFett: 15, kh: 250, zucker: 50, ballast, eiweiss: 70, salz: 5 },
    mahlzeiten,
    belastbar: mahlzeiten,
  });
  const luecke = wochenLuecke([tag(12), tag(14), tag(10), { werte: {}, mahlzeiten: 0, belastbar: 0 }]);
  assert.equal(luecke.schwerpunkt, 'ballast');
  assert.match(luecke.text, /Ballaststoffe/);

  const mitBoost = vorschlaege([linsen], { mahlzeit: 'mittag', schwerpunkt: 'ballast' })[0];
  const ohne = vorschlaege([linsen], { mahlzeit: 'mittag' })[0];
  assert.equal(mitBoost.passtZurWoche, true);
  assert.equal(mitBoost.rang, ohne.rang + 10);

  assert.equal(wochenLuecke([tag(35)]).schwerpunkt, null, 'eine ausgewogene Woche braucht keinen Schwerpunkt');
  assert.equal(wochenLuecke([]).schwerpunkt, null);
});
