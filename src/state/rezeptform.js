/**
 * Aus Formulareingaben ein Rezept machen — und pruefen, ob es taugt.
 *
 * Bewusst frei von Speicher und Index: so laesst es sich ohne Browser
 * pruefen, und es ist die Stelle, an der entschieden wird, was ein
 * gueltiges eigenes Rezept ist.
 */

import { parseIngredientLine } from '../sources/ingredients.js';

/** Die eigenen Rezepte stehen als eigene Quelle neben den Kochbuechern. */
export const EIGENE_QUELLE = {
  id: 'eigene',
  kind: 'eigene',
  title: 'Eigene Rezepte',
  author: 'Selbst geschrieben',
  year: null,
  country: null,
  license: 'privat',
  url: '',
  via: 'In diesem Browser gespeichert',
  accent: '#2f6f4f',
};

export const slug = (text) =>
  String(text)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export const istEigenes = (recipe) => recipe?.sourceId === EIGENE_QUELLE.id;

/**
 * Macht aus den Eingaben des Formulars ein Rezept in der Form, die der
 * Index erwartet. Fehlendes wird weggelassen, nicht geraten.
 *
 * @param {object} eingabe Rohwerte aus dem Formular
 * @param {string} [id] Beim Bearbeiten die bestehende Id
 */
export function ausFormular(eingabe, id = null) {
  const titel = String(eingabe.title || '').trim();
  const zutaten = zeilen(eingabe.ingredients)
    .map((z) => parseIngredientLine(z))
    .filter((z) => z.name);

  return {
    id: id || `eigen-${slug(titel) || Date.now()}`,
    sourceId: EIGENE_QUELLE.id,
    title: titel,
    chapter: 'Eigene Rezepte',
    cuisine: String(eingabe.cuisine || '').trim() || 'Eigene Küche',
    category: String(eingabe.category || '').trim() || 'Hauptgericht',
    meals: eingabe.meals?.length ? eingabe.meals : ['mittag'],
    diet: eingabe.diet || [],
    servings: zahl(eingabe.servings, 2, 1, 400),
    yieldUnit: String(eingabe.yieldUnit || '').trim() || null,
    prep: zahl(eingabe.prep, 0, 0, 1440),
    cook: zahl(eingabe.cook, 0, 0, 1440),
    difficulty: zahl(eingabe.difficulty, 1, 1, 3),
    kcal: zahl(eingabe.kcal, 0, 0, 5000),
    tags: ['Eigenes Rezept'],
    note: String(eingabe.note || '').trim() || null,
    ingredients: zutaten.map((z) => ({ a: z.amount, u: z.unit, n: z.name })),
    steps: zeilen(eingabe.steps),
    erstellt: eingabe.erstellt || new Date().toISOString(),
    geaendert: new Date().toISOString(),
  };
}

/** Zerlegt ein Textfeld in Zeilen und wirft Leeres weg. */
export function zeilen(text) {
  return String(text || '')
    .split('\n')
    .map((z) => z.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean);
}

function zahl(wert, ersatz, min, max) {
  const text = String(wert ?? '').trim().replace(',', '.');
  // Ein leeres Feld ist keine Null: dann gilt die Vorgabe, sonst wuerde
  // ein geleertes Portionsfeld stillschweigend zu einer Portion.
  if (!text) return ersatz;
  const n = Number(text);
  if (!Number.isFinite(n)) return ersatz;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Prueft ein Rezept, bevor es gespeichert wird.
 * @returns {string[]} leere Liste heisst: in Ordnung
 */
export function pruefe(rezept, { bestehendeIds = new Set() } = {}) {
  const fehler = [];
  if (rezept.title.length < 2) fehler.push('Das Rezept braucht einen Titel.');
  if (!rezept.ingredients.length) fehler.push('Mindestens eine Zutat fehlt.');
  if (!rezept.steps.length) fehler.push('Mindestens ein Zubereitungsschritt fehlt.');
  if (bestehendeIds.has(rezept.id)) {
    fehler.push(`„${rezept.title}“ gibt es schon. Bitte einen anderen Titel wählen.`);
  }
  return fehler;
}
