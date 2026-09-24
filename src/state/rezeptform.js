/**
 * Aus Formulareingaben ein Rezept machen — und pruefen, ob es taugt.
 *
 * Bewusst frei von Speicher und Index: so laesst es sich ohne Browser
 * pruefen, und es ist die Stelle, an der entschieden wird, was ein
 * gueltiges eigenes Rezept ist.
 */

import { parseIngredientLine } from '../sources/ingredients.js';

/** Die Mahlzeiten des Plans, als Kennungen. */
export const MAHLZEITEN = ['fruehstueck', 'mittag', 'abend', 'snack'];

/**
 * Die Ernaehrungsformen, die die App kennt. Bewusst eine feste Liste:
 * ein freies Feld wuerde binnen kurzem "Vegetarisch", "vegetarisch"
 * und "veggie" nebeneinander fuehren.
 */
export const DIET_OPTIONS = ['vegetarisch', 'vegan', 'glutenfrei', 'laktosefrei', 'pescetarisch'];

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

const text = (x) => (typeof x === 'string' ? x.trim() : '');
const ganzzahl = (x, ersatz, min, max) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : ersatz;
};

/**
 * Macht aus gespeicherten oder eingelesenen Daten ein gueltiges Rezept —
 * oder gibt null zurueck.
 *
 * Alles, was nicht aus dem mitgelieferten Korpus kommt, ist unsicher:
 * der localStorage kann veraltet oder beschaedigt sein, eine gesicherte
 * Datei von Hand bearbeitet. Ein einziges kaputtes Rezept darf die App
 * nicht am Starten hindern, deshalb wird hier jedes Feld auf Typ und
 * Bereich geprueft und nur Bekanntes uebernommen.
 *
 * @param {unknown} roh
 * @param {string} [quelle] Quellen-Id, falls der Datensatz keine traegt
 */
export function bereinige(roh, quelle = EIGENE_QUELLE.id) {
  if (!roh || typeof roh !== 'object') return null;

  const titel = text(roh.title);
  if (titel.length < 2) return null;

  const zutaten = (Array.isArray(roh.ingredients) ? roh.ingredients : [])
    .map((z) => {
      const name = text(z?.n ?? z?.name);
      if (!name) return null;
      const menge = Number(z.a ?? z.amount);
      return {
        a: Number.isFinite(menge) && menge > 0 ? menge : null,
        u: text(z.u ?? z.unit),
        n: name,
      };
    })
    .filter(Boolean);
  if (!zutaten.length) return null;

  const meals = (Array.isArray(roh.meals) ? roh.meals : []).filter((m) => MAHLZEITEN.includes(m));
  const diet = (Array.isArray(roh.diet) ? roh.diet : []).filter((d) => DIET_OPTIONS.includes(d));
  const sourceId = text(roh.sourceId) || quelle;

  return {
    id: text(roh.id) || `eigen-${slug(titel) || Date.now()}`,
    sourceId,
    title: titel,
    chapter: text(roh.chapter) || null,
    cuisine: text(roh.cuisine) || 'Eigene Küche',
    category: text(roh.category) || 'Hauptgericht',
    meals: meals.length ? meals : ['mittag'],
    diet,
    servings: ganzzahl(roh.servings, 2, 1, 400),
    yieldUnit: text(roh.yieldUnit) || null,
    prep: ganzzahl(roh.prep, 0, 0, 1440),
    cook: ganzzahl(roh.cook, 0, 0, 1440),
    difficulty: ganzzahl(roh.difficulty, 1, 1, 3),
    kcal: ganzzahl(roh.kcal, 0, 0, 5000),
    tags: (Array.isArray(roh.tags) ? roh.tags : []).map(text).filter(Boolean),
    note: text(roh.note) || null,
    sourceUrl: text(roh.sourceUrl) || null,
    ingredients: zutaten,
    steps: (Array.isArray(roh.steps) ? roh.steps : []).map(text).filter(Boolean),
    ...(roh.erstellt ? { erstellt: text(roh.erstellt) } : {}),
    ...(roh.geaendert ? { geaendert: text(roh.geaendert) } : {}),
  };
}
