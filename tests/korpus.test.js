import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * Prueft das mitgelieferte Rezeptkorpus. Die Daten werden per fs gelesen,
 * weil Node JSON-Importe anders behandelt als der Bundler.
 */

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

const sources = read('../src/data/sources.json').sources;
const sourceIds = new Set(sources.map((s) => s.id));

const books = readdirSync(new URL('../src/data/books/', import.meta.url))
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: f, doc: read(`../src/data/books/${f}`) }));

const recipes = books.flatMap(({ doc }) =>
  doc.recipes.map((r) => ({ ...r, sourceId: doc.sourceId })),
);

const MEALS = new Set(['fruehstueck', 'mittag', 'abend', 'snack']);
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
  for (const { file, doc } of books) {
    assert.ok(sourceIds.has(doc.sourceId), `${file}: unbekannte Quelle ${doc.sourceId}`);
  }
});

test('Rezept-Ids sind eindeutig', () => {
  const ids = recipes.map((r) => r.id);
  const doppelt = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(doppelt, [], `doppelte Ids: ${doppelt.join(', ')}`);
});

test('jedes Rezept ist vollstaendig und plausibel', () => {
  assert.ok(recipes.length >= 100, `nur ${recipes.length} Rezepte im Korpus`);

  for (const r of recipes) {
    const wo = `${r.sourceId}/${r.id}`;

    assert.ok(r.title?.length > 2, `${wo}: Titel fehlt`);
    assert.ok(r.category?.length, `${wo}: Kategorie fehlt`);
    assert.ok(r.servings >= 1 && r.servings <= 24, `${wo}: Portionszahl ${r.servings}`);
    assert.ok(r.prep >= 0 && r.cook >= 0, `${wo}: negative Zeitangabe`);
    assert.ok(r.prep + r.cook > 0, `${wo}: Gesamtzeit ist null`);
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
    assert.ok(r.steps.length >= 2, `${wo}: zu wenige Zubereitungsschritte`);
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
