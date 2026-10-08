import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EIGENE_QUELLE,
  ausFormular,
  istEigenes,
  pruefe,
  slug,
  zeilen,
} from '../src/state/rezeptform.js';

const FORMULAR = {
  title: 'Großmutters Kartoffelsuppe',
  category: 'Suppe',
  cuisine: 'Fränkisch',
  servings: '6',
  prep: '20',
  cook: '40',
  difficulty: '2',
  meals: ['mittag', 'abend'],
  diet: ['vegetarisch'],
  ingredients: '750 g Kartoffeln\n2 Möhren\n1 Stange Lauch\netwas Majoran\n',
  steps: 'Gemüse schälen und würfeln.\nIn Brühe 30 Minuten garen.\nGrob zerstampfen.',
  note: 'Aus dem Heft meiner Großmutter.',
};

test('macht aus Formulareingaben ein vollstaendiges Rezept', () => {
  const r = ausFormular(FORMULAR);

  assert.equal(r.title, 'Großmutters Kartoffelsuppe');
  assert.equal(r.sourceId, EIGENE_QUELLE.id);
  assert.equal(r.id, 'eigen-grossmutters-kartoffelsuppe');
  assert.equal(r.servings, 6);
  assert.equal(r.prep, 20);
  assert.equal(r.cook, 40);
  assert.equal(r.difficulty, 2);
  assert.deepEqual(r.meals, ['mittag', 'abend']);
  assert.deepEqual(r.diet, ['vegetarisch']);
  assert.equal(r.steps.length, 3);
  assert.ok(istEigenes(r));
});

test('zerlegt die Zutatenzeilen wie beim Import', () => {
  const r = ausFormular(FORMULAR);

  assert.deepEqual(r.ingredients[0], { a: 750, u: 'g', n: 'Kartoffeln' });
  assert.deepEqual(r.ingredients[1], { a: 2, u: '', n: 'Möhren' });
  // "Stange" ist eine Stueckangabe und wird wie beim Import vereinheitlicht.
  assert.deepEqual(r.ingredients[2], { a: 1, u: 'Stk', n: 'Lauch' });
  // "etwas" ist eine Menge ohne Zahl und bleibt eine.
  assert.deepEqual(r.ingredients[3], { a: null, u: '', n: 'Majoran' });
});

test('beim Bearbeiten bleibt die Id erhalten', () => {
  const r = ausFormular({ ...FORMULAR, title: 'Ganz anderer Titel' }, 'eigen-alt');
  assert.equal(r.id, 'eigen-alt');
});

test('setzt Vorgaben, statt Luecken zu erfinden', () => {
  const r = ausFormular({ title: 'Nur ein Titel', ingredients: '1 Ei', steps: 'Kochen.' });

  assert.equal(r.servings, 2);
  assert.equal(r.prep, 0);
  assert.equal(r.cook, 0);
  assert.equal(r.difficulty, 1);
  assert.equal(r.kcal, 0);
  assert.equal(r.yieldUnit, null);
  assert.equal(r.note, null);
  assert.deepEqual(r.meals, ['mittag']);
  assert.equal(r.category, 'Hauptgericht');
});

test('ein leeres Feld gilt als fehlend, nicht als null', () => {
  const r = ausFormular({ ...FORMULAR, servings: '', prep: '  ', difficulty: '' });
  assert.equal(r.servings, 2);
  assert.equal(r.prep, 0);
  assert.equal(r.difficulty, 1);
});

test('haelt Zahlen in ihren Grenzen', () => {
  const gross = ausFormular({ ...FORMULAR, servings: '9999', cook: '-30', difficulty: '7' });
  assert.equal(gross.servings, 400);
  assert.equal(gross.cook, 0);
  assert.equal(gross.difficulty, 3);

  const unsinn = ausFormular({ ...FORMULAR, servings: 'vier', kcal: '' });
  assert.equal(unsinn.servings, 2);
  assert.equal(unsinn.kcal, 0);
});

test('zeilen wirft Leeres und Aufzaehlungszeichen weg', () => {
  assert.deepEqual(zeilen('- Erstens\n\n* Zweitens\n   \n• Drittens'), ['Erstens', 'Zweitens', 'Drittens']);
  assert.deepEqual(zeilen(''), []);
  assert.deepEqual(zeilen(null), []);
});

test('slug macht aus Umlauten lesbare Kennungen', () => {
  assert.equal(slug('Käsespätzle mit Röstzwiebeln'), 'kaesespaetzle-mit-roestzwiebeln');
  assert.equal(slug('Weiße Soße, süß-sauer'), 'weisse-sosse-suess-sauer');
});

test('pruefe verlangt Titel, Zutaten und Zubereitung', () => {
  assert.deepEqual(pruefe(ausFormular(FORMULAR)), []);

  const ohneTitel = pruefe(ausFormular({ ...FORMULAR, title: '' }));
  assert.equal(ohneTitel.length, 1);
  assert.match(ohneTitel[0], /Titel/);

  const leer = pruefe(ausFormular({ title: 'Nichts drin' }));
  assert.equal(leer.length, 2, leer.join(' / '));
});

test('pruefe erkennt einen schon vergebenen Titel', () => {
  const r = ausFormular(FORMULAR);
  const fehler = pruefe(r, { bestehendeIds: new Set([r.id]) });
  assert.equal(fehler.length, 1);
  assert.match(fehler[0], /gibt es schon/);
});

test('haelt einen Titel aus, der keinen slug ergibt', () => {
  const r = ausFormular({ title: '???', ingredients: '1 Ei', steps: 'Kochen.' });
  assert.ok(r.id.startsWith('eigen-'), r.id);
  assert.ok(r.id.length > 'eigen-'.length);
});

test('nimmt die Quellenangabe eines abgeschriebenen Rezepts mit', () => {
  const r = ausFormular({
    ...FORMULAR,
    quelleTitel: '  Das große Kochbuch ',
    quelleAutor: 'Beispiel-Verlag',
    quelleJahr: '1998',
    quelleSeite: '214',
    quelleLink: 'https://example.org/buch',
  });

  assert.deepEqual(r.quelle, { titel: 'Das große Kochbuch', autor: 'Beispiel-Verlag', jahr: '1998', seite: '214' });
  assert.equal(r.sourceUrl, 'https://example.org/buch');
});

test('ohne Angaben bleibt die Quelle weg, statt leer mitzulaufen', () => {
  const r = ausFormular({ ...FORMULAR, quelleTitel: '   ', quelleSeite: '' });
  assert.equal('quelle' in r, false);
  assert.equal('sourceUrl' in r, false);

  const nurSeite = ausFormular({ ...FORMULAR, quelleSeite: '12' });
  assert.deepEqual(nurSeite.quelle, { seite: '12' });
});

test('kuerzt ueberlange Quellenangaben', () => {
  const r = ausFormular({ ...FORMULAR, quelleTitel: 'x'.repeat(500), quelleJahr: '1'.repeat(40) });
  assert.equal(r.quelle.titel.length, 160);
  assert.equal(r.quelle.jahr.length, 12);
});
