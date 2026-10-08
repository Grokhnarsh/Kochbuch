import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { ohneFelder, vorkochenIn, kochEintraege, restPlatz, quelleVon } from '../src/state/vorkochen.js';
import { planeWoche, frischZutaten } from '../src/state/planer.js';
import { bereinigeVorrat, tageBis, baldAblaufend, haltbarText, kochbarMitVorrat } from '../src/state/vorrat.js';
import { icsWoche, vortagsArbeit, falten, feldText } from '../src/state/kalender.js';
import { zeitplan, schrittDauern, kurzText } from '../src/state/zeitplan.js';
import { befehlAus } from '../src/state/sprache.js';
import { ersatzFuer, ersatzKonflikte } from '../src/state/ersatz.js';
import { formIn, formFaktor, FORMEN, inMetrisch } from '../src/state/formen.js';
import { bereinigeProfile, zieleWoche, portionenFuer, mitHaushalt } from '../src/state/profile.js';
import { rueckblick } from '../src/state/rueckblick.js';
import {
  bereinigeSammlungen, umschalten, sammlungsLink, sammlungAusLink, neueSammlung,
} from '../src/state/sammlungen.js';
import { zusammenfuehren, gleicheDaten, standAusText, standAlsText, stabil } from '../src/state/abgleich.js';
import { istEan, postenAusProdukt, mengeAus } from '../src/state/produkt.js';
import { planLink, ausLink, bereinigePlaene, wiederherstellen, sicherung } from '../src/state/teilen.js';
import { aggregate } from '../src/state/shopping.js';
import { erstelleRechner } from '../src/state/naehrwerte.js';
import { parseIngredientLine } from '../src/sources/ingredients.js';

const rechner = erstelleRechner(JSON.parse(fs.readFileSync(new URL('../src/data/naehrwerte.json', import.meta.url))));

function zufall(seed = 11) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ------------------------------------------------------------ Vorkochen

test('Vorkochen: Rest einplanen, Einkauf zählt die Extraportionen, Rest nicht', () => {
  const woche = { '0:abend': { recipeId: 'chili', servings: 4 } };
  assert.equal(restPlatz(woche, '0:abend'), '1:mittag');
  const neu = vorkochenIn(woche, '0:abend', '1:mittag', 2, 'kabc');
  assert.deepEqual(neu['0:abend'], { recipeId: 'chili', servings: 4, kid: 'kabc', extra: 2 });
  assert.deepEqual(neu['1:mittag'], { recipeId: 'chili', servings: 2, rest: 'kabc' });
  assert.deepEqual(kochEintraege(neu), [{ recipeId: 'chili', servings: 6 }]);
  assert.equal(quelleVon(neu, neu['1:mittag']).id, '0:abend');
  // Kein Rest auf sich selbst, nicht von einem Rest
  assert.equal(vorkochenIn(neu, '1:mittag', '2:mittag', 2), null);
  assert.equal(vorkochenIn(woche, '0:abend', '0:abend', 2), null);
});

test('Vorkochen: Entfernen hält die Verbindungen stimmig', () => {
  let w = vorkochenIn({ '0:abend': { recipeId: 'x', servings: 4 } }, '0:abend', '1:mittag', 2, 'k1');
  w = vorkochenIn(w, '0:abend', '2:mittag', 1);
  assert.equal(w['0:abend'].extra, 3);
  // Einen Rest entfernen: weniger kochen
  const a = ohneFelder(w, ['1:mittag']);
  assert.equal(a['0:abend'].extra, 1);
  assert.ok(a['2:mittag']);
  // Letzten Rest entfernen: die Kette verschwindet
  const b = ohneFelder(a, ['2:mittag']);
  assert.deepEqual(b['0:abend'], { recipeId: 'x', servings: 4 });
  // Das gekochte Gericht entfernen: seine Reste gehen mit
  assert.deepEqual(ohneFelder(w, ['0:abend']), {});
});

test('Vorkochen: Rest landet am nächsten freien Feld, nur innerhalb der Woche', () => {
  assert.equal(restPlatz({ '1:mittag': {} }, '0:abend'), '1:abend');
  assert.equal(restPlatz({}, '1:mittag'), '1:abend');
  assert.equal(restPlatz({}, '6:abend'), null);
});

// -------------------------------------------------------------- Planer

let nr = 0;
const rezept = (o = {}) => {
  nr += 1;
  return {
    id: `p${nr}`, title: `Essen Variante${nr}`, meals: ['mittag', 'abend'], diet: [], totalTime: 30,
    allergens: [], servings: 4, ingredients: [{ name: 'Wasser' }], gesundheit: { punkte: 50 }, ...o,
  };
};

test('Einkauf bündeln: Gerichte mit gemeinsamen frischen Zutaten werden bevorzugt', () => {
  const mitSahne = Array.from({ length: 6 }, () => rezept({ ingredients: [{ name: 'Sahne' }, { name: 'Lauch' }] }));
  const andere = Array.from({ length: 40 }, () => rezept());
  const pool = [...mitSahne, ...andere];
  assert.deepEqual(frischZutaten(mitSahne[0]).sort(), ['lauch', 'schlagsahne']);
  const woche = { '0:abend': { recipeId: mitSahne[0].id, servings: 2 } };
  const lookup = new Map(pool.map((r) => [r.id, r]));
  let mit = 0;
  let ohne = 0;
  for (let s = 1; s <= 20; s += 1) {
    const a = planeWoche(pool, woche, { mahlzeiten: ['abend'], tage: [1, 2, 3], buendeln: true }, { zufall: zufall(s), lookup });
    const b = planeWoche(pool, woche, { mahlzeiten: ['abend'], tage: [1, 2, 3] }, { zufall: zufall(s), lookup });
    mit += Object.values(a.eintraege).filter((e) => mitSahne.some((r) => r.id === e.recipeId)).length;
    ohne += Object.values(b.eintraege).filter((e) => mitSahne.some((r) => r.id === e.recipeId)).length;
    if (Object.values(a.eintraege).some((e) => mitSahne.some((r) => r.id === e.recipeId))) assert.ok(a.geteilt.includes('schlagsahne'));
  }
  assert.ok(mit > ohne * 2, `gebündelt ${mit}, sonst ${ohne}`);
});

test('Vorkochen im Planer: mittags der Rest vom Vorabend', () => {
  const pool = Array.from({ length: 30 }, () => rezept());
  const lookup = new Map(pool.map((r) => [r.id, r]));
  const { eintraege, reste } = planeWoche(pool, {}, { mahlzeiten: ['mittag', 'abend'], tage: [0, 1, 2], vorkochen: true, personen: 2 },
    { zufall: zufall(), lookup });
  assert.equal(reste, 2);
  assert.equal(eintraege['1:mittag'].rest, eintraege['0:abend'].kid);
  assert.equal(eintraege['1:mittag'].recipeId, eintraege['0:abend'].recipeId);
  assert.equal(eintraege['0:abend'].extra, 2);
  assert.ok(!eintraege['0:mittag'].rest);
  // Die Einkaufsliste kocht das Abendessen für vier und den Rest gar nicht
  const koch = kochEintraege(eintraege);
  assert.equal(koch.length, 4);
});

test('Was bald abläuft, kommt zuerst auf den Plan', () => {
  const jetzt = new Date(2026, 9, 8);
  const spinat = Array.from({ length: 3 }, () => rezept({ ingredients: [{ name: 'Blattspinat' }, { name: 'Ei' }] }));
  const pool = [...spinat, ...Array.from({ length: 50 }, () => rezept())];
  const vorrat = bereinigeVorrat([{ name: 'Spinat', bis: '2026-10-09' }]);
  let treffer = 0;
  for (let s = 1; s <= 10; s += 1) {
    const { eintraege } = planeWoche(pool, {}, { mahlzeiten: ['abend'], tage: [0], ablauf: true },
      { zufall: zufall(s), vorrat, jetzt });
    if (spinat.some((r) => r.id === eintraege['0:abend'].recipeId)) treffer += 1;
  }
  assert.ok(treffer >= 8, `${treffer} von 10`);
});

// ---------------------------------------------------------- Haltbarkeit

test('Haltbarkeit: Datum, Tage bis dahin, Text', () => {
  const jetzt = new Date(2026, 9, 8, 15);
  const v = bereinigeVorrat([{ name: 'Milch', bis: '2026-10-09' }, { name: 'Quark', bis: '2026-10-05' },
    { name: 'Reis', bis: 'bald' }, { name: 'Sahne', bis: '2026-10-30' }]);
  assert.equal(v[2].bis, undefined);
  assert.equal(tageBis(v[0], jetzt), 1);
  assert.equal(tageBis(v[1], jetzt), -3);
  assert.deepEqual(baldAblaufend(v, { jetzt }).map((x) => x.posten.name), ['Quark', 'Milch']);
  assert.equal(haltbarText(0), 'läuft heute ab');
  assert.equal(haltbarText(-1), 'seit gestern abgelaufen');
  assert.equal(haltbarText(4), 'noch 4 Tage');
});

test('Was kann ich kochen? Bald Ablaufendes zuerst', () => {
  const jetzt = new Date(2026, 9, 8);
  const a = { id: 'a', title: 'A', ingredients: [{ name: 'Nudeln' }, { name: 'Tomaten' }, { name: 'Zwiebel' }] };
  const b = { id: 'b', title: 'B', ingredients: [{ name: 'Nudeln' }, { name: 'Sahne' }, { name: 'Zwiebel' }] };
  const vorrat = bereinigeVorrat([{ name: 'Nudeln' }, { name: 'Zwiebel' }, { name: 'Tomaten' }, { name: 'Sahne', bis: '2026-10-09' }]);
  const t = kochbarMitVorrat([a, b], vorrat, { jetzt });
  assert.equal(t[0].recipe.id, 'b');
  assert.deepEqual(t[0].bald, ['Sahne']);
});

// -------------------------------------------------------------- Kalender

test('Kalender: Termine enden zur Essenszeit, Reste nur aufwärmen, Vorabend-Erinnerung', () => {
  const lookup = new Map([
    ['curry', { id: 'curry', title: 'Kichererbsen-Curry, scharf', totalTime: 45, servings: 4,
      ingredients: [{ name: 'getrocknete Kichererbsen' }, { name: 'Kokosmilch' }], steps: ['Kochen.'] }],
    ['brot', { id: 'brot', title: 'Brot', totalTime: 60, servings: 1, ingredients: [{ name: 'Mehl' }],
      steps: ['Den Teig über Nacht im Kühlschrank gehen lassen.', '45 Minuten backen.'] }],
  ]);
  const { text, termine, vortag } = icsWoche(new Date(2026, 9, 12), {
    '0:abend': { recipeId: 'curry', servings: 2, kid: 'k1', extra: 2 },
    '1:mittag': { recipeId: 'curry', servings: 2, rest: 'k1' },
    '2:fruehstueck': { recipeId: 'brot', servings: 1 },
  }, lookup, { jetzt: new Date(Date.UTC(2026, 9, 8, 12)) });
  assert.equal(termine, 3);
  assert.equal(vortag, 2);
  assert.ok(text.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(text.includes('DTSTART:20261012T174500\r\nDTEND:20261012T183000'));
  assert.ok(text.includes('SUMMARY:Abendessen: Kichererbsen-Curry\\, scharf'));
  assert.ok(text.includes('SUMMARY:Mittagessen: Rest – Kichererbsen-Curry\\, scharf'));
  assert.ok(text.includes('DTSTART:20261013T121500'));
  assert.ok(text.includes('DTSTART:20261011T200000'), 'Einweichen am Sonntagabend');
  assert.ok(text.includes('DTSTART:20261013T200000'), 'Teig am Dienstagabend');
  assert.ok(text.includes('TRIGGER:-PT15M'));
  for (const zeile of text.split('\r\n')) assert.ok(new TextEncoder().encode(zeile).length <= 75, zeile);
});

test('Kalender: Vortagsarbeit, Faltung und Maskierung', () => {
  assert.deepEqual(vortagsArbeit({ steps: ['2 Stunden ruhen lassen.'], ingredients: [] }), []);
  assert.deepEqual(vortagsArbeit({ steps: ['5 Stunden marinieren.'], ingredients: [] }), ['lange Ruhezeit']);
  assert.deepEqual(vortagsArbeit({ steps: [], ingredients: [{ name: 'tiefgekühlter Blattspinat' }] }), ['Blattspinat auftauen']);
  assert.deepEqual(vortagsArbeit({ steps: [], ingredients: [{ name: 'Kichererbsen aus der Dose' }] }), []);
  assert.equal(feldText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const lang = `SUMMARY:${'ä'.repeat(60)}`;
  const gefaltet = falten(lang);
  assert.ok(gefaltet.split('\r\n ').every((z) => new TextEncoder().encode(z).length <= 75));
  assert.equal(gefaltet.replace(/\r\n /g, ''), lang);
});

// -------------------------------------------------------------- Zeitplan

test('Zeitplan: rückwärts vom Essen, Ofen vorheizen, Konflikte', () => {
  const ziel = new Date(2026, 9, 8, 19, 0);
  const auflauf = {
    id: 'a', title: 'Auflauf', totalTime: 60,
    steps: ['Kartoffeln schälen und in Scheiben schneiden.', 'Alles schichten.', 'Bei 200 °C 40 Minuten backen.'],
  };
  const salat = { id: 's', title: 'Salat', totalTime: 15, steps: ['Salat waschen.', 'Dressing anrühren.'] };
  const d = schrittDauern(auflauf);
  assert.equal(d[2].sekunden, 2400);
  assert.equal(d[2].aktiv, false);
  assert.equal(d[0].sekunden, 600);
  const { schritte, beginn, konflikte } = zeitplan([auflauf, salat], ziel);
  // 60 Minuten Gesamtzeit: 40 backen, je 10 für die beiden anderen Schritte
  assert.equal(beginn.getHours(), 18);
  assert.equal(beginn.getMinutes(), 0);
  const ofen = schritte.find((s) => s.art === 'ofen');
  assert.equal(ofen.text, 'Backofen auf 200 °C vorheizen');
  assert.equal(ofen.zeit.getHours(), 18);
  assert.equal(ofen.zeit.getMinutes(), 5);
  // Der Salat (zwei Schritte à 7,5 Min.) liegt in der Backzeit: kein Konflikt
  assert.equal(konflikte, 0);
  const letzter = schritte[schritte.length - 1];
  assert.equal(letzter.ende.getTime(), ziel.getTime());
  assert.equal(kurzText('Erst dies. Dann das.'), 'Erst dies.');
});

test('Zeitplan: zwei Arbeiten zur selben Zeit werden gemeldet', () => {
  const a = { id: 'a', title: 'A', totalTime: 10, steps: ['Zwiebeln schneiden.'] };
  const b = { id: 'b', title: 'B', totalTime: 10, steps: ['Möhren schneiden.'] };
  const { konflikte, schritte } = zeitplan([a, b], new Date(2026, 0, 1, 12));
  assert.equal(konflikte, 1);
  assert.ok(schritte.every((s) => s.konflikt));
});

// ---------------------------------------------------------------- Sprache

test('Sprachbefehle', () => {
  assert.deepEqual(befehlAus('Weiter'), { art: 'weiter' });
  assert.deepEqual(befehlAus('nächster Schritt'), { art: 'weiter' });
  assert.deepEqual(befehlAus('zurück bitte'), { art: 'zurueck' });
  assert.deepEqual(befehlAus('Timer zehn Minuten'), { art: 'timer', sekunden: 600 });
  assert.deepEqual(befehlAus('Timer auf 1,5 Stunden'), { art: 'timer', sekunden: 5400 });
  assert.deepEqual(befehlAus('Timer starten'), { art: 'timer' });
  assert.deepEqual(befehlAus('Zutaten'), { art: 'zutaten' });
  assert.deepEqual(befehlAus('vorlesen'), { art: 'vorlesen' });
  assert.deepEqual(befehlAus('Stopp'), { art: 'stopp' });
  assert.equal(befehlAus('Das Wetter ist schön'), null);
  assert.equal(befehlAus(''), null);
});

// ----------------------------------------------------------------- Ersatz

test('Ersatzzutaten mit Prüfung gegen den Haushalt', () => {
  assert.deepEqual(ersatzFuer('Buttermilch').map((a) => a.name)[0], 'Milch mit Zitronensaft');
  assert.ok(ersatzFuer('2 Eier').every((a) => a.vegan));
  assert.deepEqual(ersatzFuer('Mandelmehl'), []);
  assert.deepEqual(ersatzFuer('Erdnussbutter'), []);
  assert.ok(ersatzFuer('Weizenmehl Type 405').length);
  const glutenfrei = ersatzFuer('Mehl').find((a) => /glutenfrei/i.test(a.name));
  assert.ok(!glutenfrei.allergene.some((a) => a.id === 'gluten'));

  const profile = bereinigeProfile([{ name: 'Anna', ernaehrung: ['vegan'] }, { name: 'Ben', allergene: ['milch'] }]);
  const [milchZitrone, , drink] = ersatzFuer('Buttermilch');
  assert.deepEqual(ersatzKonflikte(milchZitrone, profile), ['Anna: nicht vegan', 'Ben: enthält Milch']);
  assert.deepEqual(ersatzKonflikte(drink, profile), []);
});

// ------------------------------------------------------- Formen und Tassen

test('Backform erkennen und umrechnen', () => {
  assert.equal(formIn({ steps: ['In eine Springform (Ø 26 cm) füllen.'] }).id, 'rund-26');
  assert.equal(formIn({ steps: ['Eine 24er Springform fetten.'] }).id, 'rund-24');
  assert.equal(formIn({ ingredients: [{ name: 'Fett für die Kastenform (30 cm)' }] }).id, 'kasten-30');
  assert.equal(formIn({ steps: ['Auf ein Backblech streichen.'] }).id, 'blech');
  assert.equal(formIn({ steps: ['In eine Form (20 x 30 cm) geben.'] }).flaeche, 600);
  assert.equal(formIn({ steps: ['Gut umrühren.'] }), null);
  const f = formFaktor(formIn({ steps: ['Springform 26 cm'] }), FORMEN.find((x) => x.id === 'rund-20'));
  assert.ok(Math.abs(f - 0.59) < 0.01, String(f));
});

test('Tassen und Cups in Gramm und Milliliter', () => {
  assert.equal(parseIngredientLine('2 cups flour').unit, 'Cup');
  assert.equal(parseIngredientLine('2 Tassen Mehl').unit, 'Tasse');
  assert.deepEqual(inMetrisch({ name: 'Mehl', amount: 1, unit: 'Tasse' }, rechner), { amount: 80, unit: 'g', von: '1 Tasse' });
  assert.deepEqual(inMetrisch({ name: 'Milch', amount: 2, unit: 'Tasse' }, rechner), { amount: 300, unit: 'ml', von: '2 Tassen' });
  assert.equal(inMetrisch({ name: 'Zucker', amount: 1, unit: 'Cup' }, rechner).unit, 'g');
  assert.equal(inMetrisch({ name: 'Mehl', amount: 100, unit: 'g' }, rechner), null);
  // In der Einkaufsliste addieren sich Tassen und Gramm
  const lookup = new Map([['a', { title: 'A', servings: 1, ingredients: [{ name: 'Mehl', amount: 1, unit: 'Tasse' }] }],
    ['b', { title: 'B', servings: 1, ingredients: [{ name: 'Mehl', amount: 200, unit: 'g' }] }]]);
  const groups = aggregate([{ recipeId: 'a', servings: 1 }, { recipeId: 'b', servings: 1 }], lookup, {},
    { umrechnen: (z) => inMetrisch(z, rechner) });
  const mehl = groups.flatMap((g) => g.items).filter((i) => i.name === 'Mehl');
  assert.equal(mehl.length, 1);
  assert.equal(mehl[0].amount, 280);
});

// ------------------------------------------------------------------ Ziele

test('Nährwertziele: Portionsfaktor und Abdeckung', () => {
  const profile = bereinigeProfile([
    { name: 'Anna', kcal: 1900, eiweiss: 48 },
    { name: 'Ben', faktor: 0.5, kcal: 1400 },
    { name: 'Gast', aktiv: false, kcal: 2000 },
    { name: 'Carl', faktor: 99 },
  ]);
  assert.equal(profile[3].faktor, 1);
  assert.equal(portionenFuer(profile.filter((p) => p.aktiv)), 3);
  assert.equal(mitHaushalt({ haushalt: true, personen: 0 }, profile).personen, 3);
  const tage = [
    { werte: { kcal: 1500, eiweiss: 60 }, mahlzeiten: 2, belastbar: 2 },
    { werte: { kcal: 1300, eiweiss: 40 }, mahlzeiten: 2, belastbar: 2 },
    { werte: { kcal: 0, eiweiss: 0 }, mahlzeiten: 0, belastbar: 0 },
  ];
  const z = zieleWoche(tage, profile);
  assert.deepEqual(z.map((x) => x.name), ['Anna', 'Ben']);
  assert.equal(z[0].kcal.ist, 1400);
  assert.ok(Math.abs(z[0].kcal.anteil - 1400 / 1900) < 1e-9);
  assert.equal(z[0].eiweiss.ist, 50);
  assert.equal(z[1].kcal.ist, 700);
  assert.equal(z[1].eiweiss, null);
});

// -------------------------------------------------------------- Rückblick

test('Monatsrückblick', () => {
  const lookup = new Map([
    ['lachs', { id: 'lachs', title: 'Lachs', servings: 2, diet: [], allergens: [{ id: 'fisch', level: 'ja' }], ingredients: [], gesundheit: { punkte: 80 } }],
    ['salat', { id: 'salat', title: 'Salat', servings: 2, diet: ['vegan'], allergens: [], ingredients: [{ name: 'Kürbis' }], gesundheit: { punkte: 70 } }],
    ['kuchen', { id: 'kuchen', title: 'Kuchen', servings: 8, diet: ['vegetarisch'], allergens: [], ingredients: [] }],
  ]);
  const plans = {
    '2026-09-28': { '3:abend': { recipeId: 'lachs', servings: 2 }, '2:abend': { recipeId: 'salat', servings: 2 } },
    '2026-10-05': {
      '0:mittag': { recipeId: 'salat', servings: 2, kid: 'k1', extra: 2 }, '1:mittag': { recipeId: 'salat', servings: 2, rest: 'k1' },
      '2:abend': { recipeId: 'lachs', servings: 2 }, '5:snack': { recipeId: 'kuchen', servings: 8 },
    },
  };
  const bewertungen = { salat: { sterne: 5, notiz: '', gekocht: ['2026-09-01', '2026-10-05'] }, kuchen: { sterne: 0, notiz: '', gekocht: ['2026-10-10'] } };
  const r = rueckblick({ plans, bewertungen, lookup, jahr: 2026, monat: 10 });
  // 1.10. ist Donnerstag der Woche ab 28.9.
  assert.equal(r.geplant, 5);
  assert.equal(r.gekocht, 2);
  assert.deepEqual(r.neu, ['Kuchen']);
  assert.equal(r.fisch, 2);
  assert.equal(r.vorgekocht, 1);
  assert.ok(Math.abs(r.vegetarisch - 1 / 3) < 1e-9);
  assert.equal(r.saisonal, 1 / 3);
  assert.equal(r.gesundheit, 77);
  assert.deepEqual(r.lieblinge.map((x) => x.title), ['Lachs', 'Salat', 'Kuchen']);
});

// ------------------------------------------------------------ Sammlungen

test('Sammlungen: bereinigen, umschalten, als Link teilen', () => {
  const s = bereinigeSammlungen([{ id: 's-1', name: ' Weihnachten ', rezepte: ['a', 'a', 'b', '<x>'] }, { name: '' }, 3]);
  assert.deepEqual(s, [{ id: 's-1', name: 'Weihnachten', rezepte: ['a', 'b'] }]);
  const t = umschalten(umschalten(s, 's-1', 'c'), 's-1', 'a');
  assert.deepEqual(t[0].rezepte, ['b', 'c']);
  const { hash, ausgelassen } = sammlungsLink({ name: 'Grillen & Co', rezepte: ['kochwiki-1', 'eigen-x', 'import-y'] });
  assert.equal(ausgelassen, 2);
  assert.deepEqual(sammlungAusLink(hash), { name: 'Grillen & Co', rezepte: ['kochwiki-1'] });
  assert.equal(sammlungAusLink('#sammlung=@@'), null);
  assert.equal(neueSammlung('Neu', 36).id, 's-10');
});

// --------------------------------------------------------------- Abgleich

const stand = (daten, zeiten = {}, entfernt = {}) => ({
  daten: {
    plan: {}, abgehakt: {}, eigene: [], importe: [], vorrat: [], planer: {}, profile: [], bewertungen: {}, sammlungen: [], ...daten,
  },
  zeiten,
  entfernt,
});

test('Abgleich: Wochen einzeln, die neuere gewinnt', () => {
  const a = stand({ plan: { '2026-10-05': { '0:abend': { recipeId: 'a', servings: 2 } }, '2026-10-12': {} } },
    { plan: { '2026-10-05': 200, '2026-10-12': 100 } });
  const b = stand({ plan: { '2026-10-05': { '0:abend': { recipeId: 'b', servings: 2 } }, '2026-10-12': { '1:mittag': { recipeId: 'c', servings: 1 } } } },
    { plan: { '2026-10-05': 150, '2026-10-12': 300 } });
  const m = zusammenfuehren(a, b);
  assert.equal(m.daten.plan['2026-10-05']['0:abend'].recipeId, 'a');
  assert.equal(m.daten.plan['2026-10-12']['1:mittag'].recipeId, 'c');
  assert.deepEqual(m.zeiten.plan, { '2026-10-05': 200, '2026-10-12': 300 });
});

test('Abgleich: Listen vereinigt, Gelöschtes bleibt weg', () => {
  const jetzt = 10_000_000;
  const a = stand({ vorrat: [{ name: 'Mehl' }, { name: 'Reis' }] }, { vorrat: 500 }, { vorrat: { salz: 600 } });
  const b = stand({ vorrat: [{ name: 'Mehl', menge: 1, einheit: 'kg' }, { name: 'Salz' }, { name: 'Zucker' }] }, { vorrat: 400 });
  const m = zusammenfuehren(a, b, { jetzt });
  // Mehl von der neueren Seite (a), Salz hat a nach b's letzter Änderung gelöscht, Zucker kommt dazu
  assert.deepEqual(m.daten.vorrat.map((p) => p.name).sort(), ['Mehl', 'Reis', 'Zucker']);
  assert.equal(m.daten.vorrat.find((p) => p.name === 'Mehl').menge, undefined);
  assert.equal(m.entfernt.vorrat.salz, 600);
  // Hat b Salz nach dem Löschen wieder eingetragen, bleibt es
  const b2 = stand({ vorrat: [{ name: 'Salz' }] }, { vorrat: 700 });
  assert.ok(zusammenfuehren(a, b2, { jetzt }).daten.vorrat.some((p) => p.name === 'Salz'));
});

test('Abgleich: Bewertungen, Vorgaben, Gleichheit, Datei', () => {
  const a = stand({ bewertungen: { x: { sterne: 4, notiz: 'a', gekocht: ['2026-10-01'] } }, planer: { gesund: true } },
    { bewertungen: 100, planer: 50 });
  const b = stand({ bewertungen: { x: { sterne: 2, notiz: 'b', gekocht: ['2026-10-03'] }, y: { sterne: 5, notiz: '', gekocht: [] } }, planer: { gesund: false } },
    { bewertungen: 200, planer: 10 });
  const m = zusammenfuehren(a, b);
  assert.deepEqual(m.daten.bewertungen.x, { sterne: 2, notiz: 'b', gekocht: ['2026-10-01', '2026-10-03'] });
  assert.ok(m.daten.bewertungen.y);
  assert.equal(m.daten.planer.gesund, true);
  assert.ok(gleicheDaten(m, zusammenfuehren(m, m)));
  assert.equal(stabil({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
  const text = standAlsText(m);
  assert.ok(gleicheDaten(standAusText(text), m));
  assert.throws(() => standAusText('{"format":"anders"}'), /nicht vom Kochbuch/);
  assert.throws(() => standAusText('kaputt'), /kein gültiges JSON/);
});

// ----------------------------------------------------------------- Barcode

test('Barcode: Prüfziffer und Produkt aus Open Food Facts', () => {
  assert.ok(istEan('4006381333931'));
  assert.ok(!istEan('4006381333932'));
  assert.ok(istEan('96385074'));
  assert.ok(!istEan('abc'));
  assert.deepEqual(mengeAus('6 x 1,5 l'), { menge: 9, einheit: 'l' });
  assert.deepEqual(mengeAus('33 cl'), { menge: 330, einheit: 'ml' });
  assert.equal(mengeAus('ein Stück'), null);
  const p = postenAusProdukt({
    status: 1,
    product: {
      code: '8076800195057', product_name_de: 'Barilla Spaghetti n.5 500g', brands: 'Barilla', quantity: '500 g',
      allergens_tags: ['en:gluten', 'en:unbekannt'],
    },
  });
  assert.deepEqual(p, { name: 'Spaghetti n.5', menge: 500, einheit: 'g', marke: 'Barilla', allergene: ['gluten'], ean: '8076800195057' });
  assert.equal(postenAusProdukt({ status: 0 }), null);
});

// ------------------------------------------------------- Teilen, Sicherung

test('Link und Sicherung tragen Vorgekochtes, Sammlungen und Haken', () => {
  const woche = {
    '0:abend': { recipeId: 'kochwiki-chili', servings: 4, kid: 'kab', extra: 2 },
    '1:mittag': { recipeId: 'kochwiki-chili', servings: 2, rest: 'kab' },
    '2:abend': { recipeId: 'eigen-x', servings: 2, kid: 'kcd', extra: 1 },
    '3:mittag': { recipeId: 'eigen-x', servings: 1, rest: 'kcd' },
  };
  const { hash } = planLink('2026-10-12', woche);
  const zurueck = ausLink(hash).eintraege;
  assert.deepEqual(zurueck['0:abend'], woche['0:abend']);
  assert.deepEqual(zurueck['1:mittag'], woche['1:mittag']);
  assert.equal(zurueck['2:abend'], undefined);
  assert.deepEqual(bereinigePlaene({ '2026-10-12': { '0:abend': { recipeId: 'a', servings: 2, kid: '<x>', extra: 2 } } })['2026-10-12']['0:abend'],
    { recipeId: 'a', servings: 2 });
  const datei = sicherung({ sammlungen: [{ id: 's-1', name: 'A', rezepte: ['x'] }], abgehakt: { '2026-10-12': { 'mehl|g': true } } });
  const { daten, zahlen } = wiederherstellen(JSON.stringify(datei));
  assert.equal(zahlen.sammlungen, 1);
  assert.deepEqual(daten.abgehakt, { '2026-10-12': { 'mehl|g': true } });
});
