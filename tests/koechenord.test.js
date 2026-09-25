import { test } from 'node:test';
import assert from 'node:assert/strict';

import { entdoppeln, zeilenMitSeite, rezepteAusBuch } from '../scripts/korpus/quellen/koeche-nord.mjs';

const BUCH = { titel: 'Zucchini Kochbuch', pdf: 'https://example.org/zucchini.pdf', vegan: true, jahr: '2023' };

/** Drei Seiten wie aus dem PDF: Kopfzeile auf jeder Seite, Seitenzahl unten */
const SEITEN = [
  'Köche-Nord.de – Kochbücher\nInhalt\nZucchini-Puffer 2\n1',
  [
    'Köche-Nord.de – Kochbücher',
    'HHaauuppttssppeeiisseenn::',
    'Zucchini-Puffer',
    'Menge: 4 Portionen',
    '500 Gramm Zucchini',
    '2 Esslöffel Kichererbsenmehl',
    '½ Teelöffel, gestrichen Salz',
    'etwas Öl zum Braten',
    'Die Zucchini grob raspeln, salzen und zehn Minuten ziehen lassen. Danach kräftig aus-',
    'drücken. Mit dem Mehl verrühren und in heißem Öl von beiden Seiten goldbraun braten.',
    '2',
  ].join('\n'),
  [
    'Köche-Nord.de – Kochbücher',
    'Desserts:',
    'Zucchini-Schokokuchen',
    'Menge: 1 Kuchen',
    '300 Gramm Zucchini',
    '200 Gramm Mehl',
    'Alles verrühren und bei 180 Grad 45 Minuten backen. In der Form auskühlen lassen.',
    '3',
  ].join('\n'),
];

test('entdoppeln macht fett gesetzte Zeilen wieder lesbar', () => {
  assert.equal(entdoppeln('HHaauuppttssppeeiisseenn::'), 'Hauptspeisen:');
  assert.equal(entdoppeln('Hauptspeisen:'), 'Hauptspeisen:');
  assert.equal(entdoppeln('Tee'), 'Tee');
  assert.equal(entdoppeln('MMaannggoolldd:'), 'Mangold:');
});

test('Kopfzeilen und Seitenzahlen gehoeren zu keinem Rezept', () => {
  const zeilen = zeilenMitSeite(SEITEN);
  assert.ok(!zeilen.some((x) => /Köche-Nord\.de – Kochbücher/.test(x.z)), 'Kopfzeile');
  assert.ok(!zeilen.some((x) => /^\d+$/.test(x.z)), 'Seitenzahl');
  assert.equal(zeilen.find((x) => x.z === 'Zucchini-Puffer').seite, 2);
});

test('liest Titel, Menge, Zutaten und Zubereitung eines Rezepts', () => {
  const [puffer, kuchen] = rezepteAusBuch(zeilenMitSeite(SEITEN), BUCH);

  assert.equal(puffer.title, 'Zucchini-Puffer');
  assert.equal(puffer.chapter, 'Hauptspeisen');
  assert.equal(puffer.category, 'Hauptgericht');
  assert.equal(puffer.servings, 4);
  assert.deepEqual(puffer.ingredients[0], { a: 500, u: 'g', n: 'Zucchini' });
  assert.equal(puffer.ingredients[2].n, 'Salz (gestrichen)');
  assert.equal(puffer.ingredients.length, 4);
  // Die Silbentrennung am Zeilenende ist aufgehoben
  assert.ok(puffer.steps.some((s) => s.includes('ausdrücken')), puffer.steps.join(' | '));
  assert.deepEqual(puffer.diet, ['vegan', 'vegetarisch']);

  assert.equal(kuchen.category, 'Dessert');
  assert.equal(kuchen.servings, 1);
  assert.equal(kuchen.yieldUnit, 'Kuchen');
});

test('jedes Rezept nennt Werk, Urheber, Jahr und Seite', () => {
  const [puffer] = rezepteAusBuch(zeilenMitSeite(SEITEN), BUCH);
  assert.deepEqual(puffer.quelle, { titel: 'Zucchini Kochbuch', autor: 'Marcus Petersen-Clausen', jahr: '2023', seite: '2' });
  assert.equal(puffer.sourceUrl, 'https://example.org/zucchini.pdf#page=2');
});

test('der Buchtitel kommt ohne Formatangaben aus', async () => {
  const { buchtitel, istVeganesBuch } = await import('../scripts/korpus/quellen/koeche-nord.mjs');
  assert.equal(buchtitel('Zucchini Kochbuch (PDF-Buch, vegan)'), 'Zucchini Kochbuch');
  assert.equal(buchtitel('Sauerland Kochbuch (PDF-Buch, NICHT vegan!)'), 'Sauerland Kochbuch');
  assert.equal(buchtitel('Sodbrennen Kochbuch (Kochbuch gegen Sodbrennen (PDF-Buch, vegan)'), 'Sodbrennen Kochbuch');
  assert.equal(buchtitel('Eisenkochbuch Teil 1'), 'Eisenkochbuch Teil 1');
  assert.equal(buchtitel('deutsches Kochbuch (PDF-Buch, vegan)'), 'Deutsches Kochbuch');
  // "NICHT vegan!" ist kein veganes Buch
  assert.equal(istVeganesBuch('Zucchini Kochbuch (PDF-Buch, vegan)'), true);
  assert.equal(istVeganesBuch('Sauerland Kochbuch (PDF-Buch, NICHT vegan!)'), false);
});

test('vegan ist nur, was auch die Zutaten hergeben', () => {
  const seiten = ['Kopf\n1', 'Kopf\nSchnitzel\nMenge: 2 Portionen\n2 Schweineschnitzel\n2 Eier\nKlopfen Sie die Schnitzel flach und braten Sie sie.\n2',
    'Kopf\nKuchen\nMenge: 1 Kuchen\n200 Gramm Mehl\n100 Gramm Butter\nVerkneten Sie alles und backen Sie den Teig.\n3', 'Kopf\n4'];
  const [schnitzel, kuchen] = rezepteAusBuch(zeilenMitSeite(seiten), { ...BUCH, vegan: true });
  assert.deepEqual(schnitzel.diet, []);
  assert.deepEqual(kuchen.diet, ['vegetarisch']);
});

test('Zwischenueberschriften, Hinweise und Werbung gehoeren nicht in die Schritte', () => {
  const seiten = ['Kopf\n1', [
    'Kopf', 'Pizza Bali', 'mit Spitzpaprika und Oliven', 'Menge: 3 Portionen', 'Das Rezept ergibt 3 Pizzen.',
    'Für den Teig:', '500 Gramm Weizenmehl', '20 Gramm Hefe, 250 Milliliter Wasser', 'Außerdem:', 'etwas Olivenöl',
    'Kneten Sie den Teig und lassen Sie ihn gehen.', 'Belegen Sie die Pizza und backen Sie sie.',
    'Veganstart.de: https://www.veganstart.de (unbezahlte Werbung)', 'UUnnsseerr TTiipppp::', 'Dazu passt ein Salat.', '2',
  ].join('\n'), 'Kopf\n3', 'Kopf\n4'];
  const [pizza] = rezepteAusBuch(zeilenMitSeite(seiten), BUCH);
  assert.equal(pizza.title, 'Pizza Bali mit Spitzpaprika und Oliven');
  assert.deepEqual(pizza.ingredients.map((z) => z.n), ['Weizenmehl', 'Hefe', 'Wasser', 'Olivenöl']);
  assert.equal(pizza.steps.length, 2, pizza.steps.join(' | '));
  assert.ok(!pizza.steps.join(' ').includes('Werbung'));
});

test('Zeitangaben werden Vorbereitungs- und Garzeit', async () => {
  const { zeitenAus } = await import('../scripts/korpus/quellen/koeche-nord.mjs');
  assert.deepEqual(zeitenAus('Arbeitszeit: etwa 30 Minuten Ruhezeit: etwa 60 Minuten Backzeit: etwa 15 Minuten'), { prep: 30, cook: 15 });
  assert.deepEqual(zeitenAus('Zubereitungszeit: 1 Stunde'), { prep: 60 });
  assert.deepEqual(zeitenAus('Garzeit: 20-30 Minuten'), { cook: 25 });
  assert.deepEqual(zeitenAus(''), {});
});

test('Titel ohne Bildvermerk, Zählung und Widmung', async () => {
  const { titelAufraeumen } = await import('../scripts/korpus/quellen/koeche-nord.mjs');
  assert.equal(titelAufraeumen('Béchamel-Hackfleisch-Lasagne (MIT BILD, vegan)'), 'Béchamel-Hackfleisch-Lasagne (vegan)');
  assert.equal(titelAufraeumen('Belgisches Luikse Wafels (MIT BILD, vegan, MIT BILD)'), 'Belgisches Luikse Wafels (vegan)');
  assert.equal(titelAufraeumen('Pizza 4 Ever (MIT BILD) mit Broccoli'), 'Pizza 4 Ever mit Broccoli');
  assert.equal(titelAufraeumen('9. Mao Zedong -- Hong Shao Rou'), 'Hong Shao Rou');
  assert.equal(titelAufraeumen('10. Kim Jong-Il -- Haifischsuppe'), 'Haifischsuppe');
  assert.equal(titelAufraeumen('After eight -- Bowle'), 'After eight -- Bowle');
  assert.equal(titelAufraeumen('Ein Dessert für Hannover96 Fans von Marcus Petersen-Clausen (Köche-Nord.de)'), 'Ein Dessert für Hannover96 Fans');
});
