import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { mitVorgaben, zutatenAusDatei, rechenGrundlage } from '../src/data/standard.js';
import { erstelleRechner } from '../src/state/naehrwerte.js';
import { berechne, kompakt } from '../src/state/anreicherung.js';

/**
 * Prueft das Rezeptkorpus: die mitgelieferten Buecher (src/data/books)
 * und die nachgeladenen Sammlungen (public/korpus). Die Daten werden per
 * fs gelesen, weil Node JSON-Importe anders behandelt als der Bundler.
 */

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

const sources = read('../src/data/sources.json').sources;
const sourceIds = new Set(sources.map((s) => s.id));

const books = readdirSync(new URL('../src/data/books/', import.meta.url))
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: f, doc: read(`../src/data/books/${f}`) }));

const verzeichnis = read('../public/korpus/index.json');
const teile = verzeichnis.teile.map((t) => ({ ...t, doc: read(`../public/korpus/${t.datei}`) }));

/** Jedes Rezept so, wie die App es sieht: mit den Vorgaben seines Buchs. */
const alsRezept = (doc, datei) => (roh) => {
  const { raw, lesetext } = mitVorgaben(roh, doc);
  return { ...raw, sourceId: doc.sourceId, datei, lesetext, roh };
};

const recipes = [
  ...books.flatMap(({ file, doc }) => doc.recipes.map(alsRezept(doc, file))),
  ...teile.flatMap(({ datei, doc }) => doc.recipes.map(alsRezept(doc, datei))),
];
const korpusRezepte = recipes.filter((r) => teile.some((t) => t.datei === r.datei));

const MEALS = new Set(['fruehstueck', 'mittag', 'abend', 'snack']);

/** Buecher (Dateien in src/data/books), die von Hand aufbereitet wurden und vollstaendig sein muessen. */
const KURATIERT = new Set([
  'davidis-1845', 'prato-1858', 'artusi-1891',
  'farmer-1896', 'beeton-1861', 'glasse-1747', 'wikibooks-de',
]);
const DIETS = new Set(['vegetarisch', 'vegan', 'glutenfrei', 'laktosefrei', 'pescetarisch']);

test('jede Quelle nennt Lizenz und Fundstelle', () => {
  assert.ok(sources.length >= 10, 'zu wenige Quellen registriert');
  for (const s of sources) {
    for (const field of ['id', 'title', 'author', 'license', 'url', 'accent']) {
      assert.ok(s[field], `Quelle ${s.id}: ${field} fehlt`);
    }
    assert.match(s.url, /^https:\/\//, `Quelle ${s.id}: Adresse ist kein https-Link`);
    assert.match(s.accent, /^#[0-9a-f]{6}$/i, `Quelle ${s.id}: Farbe ungültig`);
  }
});

test('jedes Buch verweist auf eine registrierte Quelle', () => {
  for (const { file, doc } of [...books, ...teile.map((t) => ({ file: t.datei, doc: t.doc }))]) {
    assert.ok(sourceIds.has(doc.sourceId), `${file}: unbekannte Quelle ${doc.sourceId}`);
  }
});

test('Rezept-Ids sind eindeutig', () => {
  const gesehen = new Set();
  const doppelt = [];
  for (const r of recipes) {
    if (gesehen.has(r.id)) doppelt.push(r.id);
    gesehen.add(r.id);
  }
  assert.deepEqual(doppelt, [], `doppelte Ids: ${doppelt.join(', ')}`);
});

test('das Verzeichnis der nachgeladenen Teile stimmt', () => {
  let summe = 0;
  for (const t of teile) {
    assert.equal(t.doc.recipes.length, t.rezepte, `${t.datei}: Rezeptzahl im Verzeichnis veraltet`);
    assert.equal(t.doc.sourceId, t.quelle, `${t.datei}: Quelle im Verzeichnis weicht ab`);
    const bytes = statSync(new URL(`../public/korpus/${t.datei}`, import.meta.url)).size;
    assert.equal(bytes, t.bytes, `${t.datei}: Groesse im Verzeichnis veraltet`);
    // Kleine Teile: ein grosser blockierte ein schwaches Handy beim Einlesen
    assert.ok(bytes <= 2_500_000, `${t.datei}: ${bytes} Bytes, zu gross fuer einen Teil`);
    summe += t.rezepte;
  }
  assert.equal(verzeichnis.rezepte, summe);
  assert.ok(summe >= 5000, `nur ${summe} nachgeladene Rezepte`);
});

/**
 * Nur offene Quellen: Wikis unter CC BY-SA und gemeinfreie Buecher. Die
 * Rechte an Rezepten kommerzieller Portale liegen beim Anbieter; ihre
 * Texte gehoeren nicht ins Repository.
 */
test('das Korpus enthaelt nur offen lizenzierte Quellen', () => {
  const offen = /^(CC BY|CC0|Gemeinfrei|Public Domain)/;
  for (const t of teile) {
    const quelle = sources.find((s) => s.id === t.doc.sourceId);
    assert.match(quelle.license, offen, `${t.datei}: Lizenz "${quelle.license}"`);
  }
  const kommerziell = /chefkoch|cookidoo|rezeptwelt|thermomix|rewe|lecker\.de|eatsmarter|kitchenstories/i;
  for (const r of recipes) {
    assert.ok(!kommerziell.test(r.sourceUrl || ''), `${r.id}: Adresse eines kommerziellen Portals`);
  }
});

/**
 * Die Zusammenfassung "z" wird beim Import gerechnet. Aendern sich
 * Naehrwerttabelle, Zuordnung oder Bewertung, ist sie veraltet — dann
 * zeigte die Karte etwas anderes als die Rezeptansicht. Abhilfe:
 * npm run korpus -- --neu-rechnen
 */
test('die vorberechneten Zusammenfassungen sind aktuell', () => {
  const rechner = erstelleRechner(read('../src/data/naehrwerte.json'));
  const veraltet = [];
  for (const r of korpusRezepte) {
    const frisch = kompakt(berechne(rechenGrundlage(r, zutatenAusDatei(r.ingredients), r.lesetext), rechner));
    if (JSON.stringify(frisch) !== JSON.stringify(r.roh.z)) veraltet.push(r.id);
  }
  assert.deepEqual(veraltet.slice(0, 10), [], `${veraltet.length} veraltete Zusammenfassungen — npm run korpus -- --neu-rechnen`);
});

test('jedes Rezept ist vollstaendig und plausibel', () => {
  assert.ok(recipes.length >= 100, `nur ${recipes.length} Rezepte im Korpus`);

  for (const r of recipes) {
    const wo = `${r.sourceId}/${r.id}`;

    assert.ok(r.title?.length > 2, `${wo}: Titel fehlt`);
    assert.ok(r.category?.length, `${wo}: Kategorie fehlt`);
    // Portionen bleiben im Haushaltsrahmen. Zaehlt ein Rezept dagegen
    // Stueck oder Glaeser ("75 Printen"), ist eine hohe Zahl richtig.
    const maxErtrag = r.yieldUnit ? 400 : 24;
    assert.ok(
      r.servings >= 1 && r.servings <= maxErtrag,
      `${wo}: Ertrag ${r.servings} ${r.yieldUnit || 'Portionen'}`,
    );
    assert.ok(r.prep >= 0 && r.cook >= 0, `${wo}: negative Zeitangabe`);

    // Bei den selbst aufbereiteten Buechern ist eine Zeitangabe Pflicht.
    // Wiki-Importe duerfen sie weglassen — geraten wird nichts. Das
    // Wikibooks-Kochbuch gibt es in beiden Formen; es zaehlt die Datei.
    if (KURATIERT.has(r.datei.replace(/\.json$/, ''))) {
      assert.ok(r.prep + r.cook > 0, `${wo}: Gesamtzeit ist null`);
    }
    assert.ok(r.difficulty >= 1 && r.difficulty <= 3, `${wo}: Schwierigkeit ${r.difficulty}`);
    assert.ok(r.kcal >= 0 && r.kcal < 2000, `${wo}: kcal ${r.kcal} unplausibel`);

    assert.ok(Array.isArray(r.meals) && r.meals.length, `${wo}: keine Mahlzeit zugeordnet`);
    for (const m of r.meals) assert.ok(MEALS.has(m), `${wo}: unbekannte Mahlzeit ${m}`);
    for (const d of r.diet || []) assert.ok(DIETS.has(d), `${wo}: unbekannte Ernährungsform ${d}`);

    assert.ok(r.ingredients.length >= 3, `${wo}: zu wenige Zutaten`);
    for (const i of r.ingredients) {
      assert.ok(i.n?.length > 1, `${wo}: Zutat ohne Bezeichnung`);
      assert.ok(i.a == null || i.a > 0, `${wo}: Menge ${i.a} bei ${i.n}`);
      assert.ok(typeof i.u === 'string', `${wo}: Einheit fehlt bei ${i.n}`);
    }

    // Zwei Schritte reichen: ein Pesto ist mit "alles mixen, abschmecken"
    // vollständig beschrieben. Die Schwelle soll kaputte Importe fangen,
    // keine knapp gefassten Rezepte.
    // Historische Texte im Wortlaut sind oft ein einziger langer Absatz.
    const wortlaut = r.lesetext && r.steps.length === 1 && r.steps[0].length >= 80;
    assert.ok(r.steps.length >= 2 || wortlaut, `${wo}: zu wenige Zubereitungsschritte`);
    for (const s of r.steps) assert.ok(s.length > 10, `${wo}: Schritt zu kurz: "${s}"`);
  }
});

test('vegane Rezepte sind auch als vegetarisch gefuehrt', () => {
  for (const r of recipes) {
    if ((r.diet || []).includes('vegan')) {
      assert.ok((r.diet || []).includes('vegetarisch'), `${r.id}: vegan, aber nicht vegetarisch`);
    }
  }
});

/**
 * Die App ist durchgehend deutschsprachig. Englische Funktionswörter in
 * Titeln, Kapiteln oder Schlagwörtern sind ein verlässliches Zeichen
 * dafür, dass unübersetzter Text hereingerutscht ist.
 */
test('Titel, Kapitel und Schlagwoerter sind deutsch', () => {
  const marker = /(^|\s)(the|and|of|with|for|from|made|baked|roast|boiled|fried)(\s|$)/i;

  for (const r of recipes) {
    for (const [feld, wert] of [['Titel', r.title], ['Kapitel', r.chapter]]) {
      assert.ok(!marker.test(wert), `${r.id}: englisches Wort im ${feld} — "${wert}"`);
    }
    for (const tag of r.tags || []) {
      assert.ok(!marker.test(tag), `${r.id}: englisches Schlagwort — "${tag}"`);
    }
  }
});

test('jede Mahlzeit hat genug Auswahl fuers Auffuellen der Woche', () => {
  for (const meal of ['fruehstueck', 'mittag', 'abend']) {
    const n = recipes.filter((r) => r.meals.includes(meal)).length;
    assert.ok(n >= 7, `nur ${n} Rezepte für ${meal}, zu wenig für eine ganze Woche`);
  }
});
