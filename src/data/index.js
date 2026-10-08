/**
 * Laedt das gebuendelte Rezeptkorpus und das Quellenregister und
 * normalisiert beides zu einem durchsuchbaren Index.
 *
 * Die von Hand aufbereiteten Buecher liegen im Bundle und sind sofort da.
 * Die grossen Sammlungen — Wikis, historische Kochbuecher, zusammen
 * zehntausend Rezepte und mehr — liegen als statische Dateien unter
 * public/korpus/ und kommen nach dem ersten Bild dazu (siehe korpus.js).
 * Live-Quellen (TheMealDB, Wikibooks, Open Food Facts, Gutendex) kommen
 * ueber src/sources/ dazu.
 */

import { DIET_OPTIONS } from '../state/rezeptform.js';
import { erstelleRechner } from '../state/naehrwerte.js';
import { berechne, ausKompakt } from '../state/anreicherung.js';
import { mitVorgaben, zutatenAusDatei, rechenGrundlage, seitenAdresse } from './standard.js';
import { istThermomix } from '../sources/thermomix.js';
import naehrwertTabelle from './naehrwerte.json';
import sourcesDoc from './sources.json';
import davidis from './books/davidis-1845.json';
import prato from './books/prato-1858.json';
import artusi from './books/artusi-1891.json';
import farmer from './books/farmer-1896.json';
import beeton from './books/beeton-1861.json';
import glasse from './books/glasse-1747.json';
import wikibooks from './books/wikibooks-de.json';

const BOOKS = [davidis, prato, artusi, farmer, beeton, glasse, wikibooks];

const sortierer = new Intl.Collator('de');
/** Nach Titel, wie ein Register. Ein Collator ist um ein Vielfaches schneller als localeCompare je Paar. */
export const nachTitel = (a, b) => sortierer.compare(a.title, b.title);

/** Naehrwertrechner auf Grundlage der USDA-Tabelle. */
export const naehrwertRechner = erstelleRechner(naehrwertTabelle);
export const naehrwertQuelle = naehrwertTabelle.meta;

/** Alle registrierten Quellen, Buecher wie APIs. */
export const sources = sourcesDoc.sources;

/** Quellen-Lookup nach id. */
export const sourceById = new Map(sources.map((s) => [s.id, s]));

/** Die vier Mahlzeiten eines Tages, in Reihenfolge des Plans. */
export const MEALS = [
  { id: 'fruehstueck', label: 'Frühstück', short: 'Früh' },
  { id: 'mittag', label: 'Mittag', short: 'Mittag' },
  { id: 'abend', label: 'Abend', short: 'Abend' },
  { id: 'snack', label: 'Imbiss', short: 'Imbiss' },
];

export const DAYS = [
  { id: 'mo', label: 'Montag', short: 'Mo' },
  { id: 'di', label: 'Dienstag', short: 'Di' },
  { id: 'mi', label: 'Mittwoch', short: 'Mi' },
  { id: 'do', label: 'Donnerstag', short: 'Do' },
  { id: 'fr', label: 'Freitag', short: 'Fr' },
  { id: 'sa', label: 'Samstag', short: 'Sa' },
  { id: 'so', label: 'Sonntag', short: 'So' },
];

export { DIET_OPTIONS };

/**
 * Haengt Quellenangaben an ein Rohrezept und leitet Suchfeld und
 * Gesamtdauer ab.
 *
 * @param {object} roh Rezept, wie es in der Buchdatei steht
 * @param {string} sourceId
 * @param {{vorgaben?:object, urlBasis?:string, art?:string}} [buch]
 *        Gemeinsames eines Buchs: Vorgabewerte, Adressstamm der Seiten und
 *        "originaltext" fuer historische Texte in ihrem Wortlaut
 */
function normalise(roh, sourceId, buch = {}) {
  const { raw, z, seite, lesetext } = mitVorgaben(roh, buch);
  const source = sourceById.get(sourceId);
  const totalTime = (raw.prep || 0) + (raw.cook || 0);
  const ingredients = zutatenAusDatei(raw.ingredients);

  // Wikis nennen ihre Seiten nach dem Titel; die Adresse steht dann nur
  // einmal im Buch statt zehntausendmal in den Rezepten.
  const sourceUrl = raw.sourceUrl || (buch.urlBasis ? seitenAdresse(buch.urlBasis, seite || raw.title) : undefined);

  // Eigene und importierte Rezepte mit Thermomix-Einstellungen findet die
  // Suche unter "Thermomix". Das grosse Korpus traegt das schon mit (z).
  if (!z && !(raw.tags || []).includes('Thermomix') && istThermomix({ steps: raw.steps || [], sourceUrl })) {
    raw.tags = [...(raw.tags || []), 'Thermomix'];
  }

  const searchText = [
    raw.title,
    raw.cuisine,
    raw.category,
    source?.title,
    source?.author,
    ...(raw.tags || []),
    ...(raw.diet || []),
    raw.quelle?.titel,
    raw.quelle?.autor,
    ...ingredients.map((i) => i.name),
  ]
    .join(' ')
    .toLowerCase();

  // Allergene, Naehrwerte und Bewertung einmal bestimmt statt bei jedem
  // Filterlauf. Bringt das Buch die Zusammenfassung schon mit, wird
  // nichts gerechnet — bei zehntausend Rezepten der Unterschied zwischen
  // sofort und mehreren Sekunden.
  const ergebnis = z ? ausKompakt(z) : berechne(rechenGrundlage(raw, ingredients, lesetext), naehrwertRechner);

  return {
    ...raw,
    sourceUrl,
    lesetext,
    sourceId,
    source,
    ingredients,
    totalTime,
    searchText,
    ...mitNaehrwerten(raw, ergebnis),
    live: false,
  };
}

/**
 * Haengt die berechneten Werte an. Die Kalorienzahl auf der Karte kommt
 * aus der Rechnung, wenn sie belastbar ist; sonst aus der Angabe des
 * Kochbuchs, falls es eine macht — und sonst gibt es keine.
 */
function mitNaehrwerten(raw, { allergens, naehrwerte, gesundheit }) {
  const belastbar = naehrwerte.vertrauen !== 'gering';
  return {
    allergens,
    naehrwerte,
    gesundheit,
    kcal: belastbar ? Math.round(naehrwerte.jePortion.kcal) : raw.kcal || 0,
    kcalBezug: belastbar ? naehrwerte.bezug : 'je Portion',
  };
}

/**
 * Ersetzt die mitgelieferte Zusammenfassung durch die volle Rechnung:
 * mit Gruenden der Bewertung, einzelnen Posten, Hinweisen und den
 * Zutaten, aus denen ein Allergen folgt. Gerechnet wird erst, wenn
 * jemand das Rezept wirklich ansieht — und nur einmal.
 */
export function vollstaendig(recipe) {
  if (!recipe || !(recipe.naehrwerte?.zusammenfassung || recipe.gesundheit?.zusammenfassung)) return recipe;
  const { allergens, naehrwerte, gesundheit } = berechne(recipe, naehrwertRechner);
  return Object.assign(recipe, { allergens, naehrwerte, gesundheit });
}

/** Alle gebuendelten Rezepte, nach Titel sortiert. */
export const recipes = BOOKS.flatMap((book) =>
  book.recipes.map((r) => normalise(r, book.sourceId, book)),
).sort(nachTitel);

export const recipeById = new Map(recipes.map((r) => [r.id, r]));

/**
 * Bereitet einen Ausschnitt eines Buchs vor, ohne ihn schon aufzunehmen.
 * So laesst sich ein grosser Teil in Scheiben verarbeiten, zwischen denen
 * der Browser zeichnen darf. Rezepte mit schon vergebener Id bleiben
 * aussen vor: das Mitgelieferte und das Eigene gehen vor.
 *
 * @param {{sourceId:string, vorgaben?:object, urlBasis?:string, art?:string, recipes:object[]}} buch
 */
export function vorbereiten(buch, von = 0, bis = buch.recipes.length) {
  const out = [];
  for (const raw of buch.recipes.slice(von, bis)) {
    if (!recipeById.has(raw.id)) out.push(normalise(raw, buch.sourceId, buch));
  }
  return out;
}

/**
 * Nimmt vorbereitete Rezepte in den Index auf. Sie werden fuer sich
 * sortiert und dann eingefaedelt — bei zehntausend vorhandenen Rezepten
 * viel schneller, als alles neu zu sortieren.
 *
 * @returns {object[]} die tatsaechlich aufgenommenen
 */
export function aufnehmen(liste) {
  const neu = liste.filter((r) => !recipeById.has(r.id)).sort(nachTitel);
  if (!neu.length) return neu;
  for (const r of neu) recipeById.set(r.id, r);

  const alt = recipes.slice();
  recipes.length = alt.length + neu.length;
  let i = 0;
  let j = 0;
  for (let k = 0; k < recipes.length; k += 1) {
    recipes[k] = j >= neu.length || (i < alt.length && nachTitel(alt[i], neu[j]) <= 0) ? alt[i++] : neu[j++];
  }
  return neu;
}

/**
 * Nimmt ein ganzes Buch auf einmal auf.
 * @returns {object[]} die neu aufgenommenen Rezepte
 */
export function registerBook(buch) {
  return aufnehmen(vorbereiten(buch));
}

/** Registriert eine zur Laufzeit entstandene Quelle, etwa fuer Importe. */
export function registerSource(source) {
  if (sourceById.has(source.id)) return sourceById.get(source.id);
  sources.push(source);
  sourceById.set(source.id, source);
  return source;
}

/**
 * Legt ein Rezept an oder ersetzt es. Anders als registerRecipes ueberschreibt
 * dies ein vorhandenes — gedacht fuer die eigenen Rezepte, die sich aendern.
 */
export function upsertRecipe(raw) {
  const r = { ...normalise(raw, raw.sourceId), live: true };
  const i = recipes.findIndex((x) => x.id === r.id);
  if (i >= 0) recipes[i] = r;
  else recipes.push(r);
  recipeById.set(r.id, r);
  recipes.sort(nachTitel);
  return r;
}

/** Nimmt ein Rezept wieder aus dem Index. */
export function removeRecipe(id) {
  const i = recipes.findIndex((x) => x.id === id);
  if (i >= 0) recipes.splice(i, 1);
  return recipeById.delete(id);
}

/** Fuegt zur Laufzeit geladene Rezepte (Live-Quellen) dem Index hinzu. */
export function registerRecipes(list) {
  const added = [];
  for (const raw of list) {
    if (recipeById.has(raw.id)) continue;
    const r = { ...normalise(raw, raw.sourceId), live: true };
    recipes.push(r);
    recipeById.set(r.id, r);
    added.push(r);
  }
  recipes.sort(nachTitel);
  return added;
}

/** Alle in den Daten tatsaechlich vorkommenden Kategorien. */
export function categories() {
  return [...new Set(recipes.map((r) => r.category))].sort(sortierer.compare);
}

/** Alle vorkommenden Ernaehrungsformen. */
export function diets() {
  return [...new Set(recipes.flatMap((r) => r.diet || []))].sort(sortierer.compare);
}

/**
 * Filtert den Index.
 * @param {{query?:string, source?:string, category?:string, diet?:string,
 *           maxTime?:number, meal?:string, ohneAllergen?:string}} f
 */
export function filterRecipes(f = {}) {
  const q = (f.query || '').trim().toLowerCase();
  const terms = q ? q.split(/\s+/) : [];

  return recipes.filter((r) => {
    if (f.source && r.sourceId !== f.source) return false;
    if (f.category && r.category !== f.category) return false;
    if (f.diet && !(r.diet || []).includes(f.diet)) return false;
    if (f.maxTime && r.totalTime > f.maxTime) return false;
    if (f.meal && !(r.meals || []).includes(f.meal)) return false;
    // "Kann enthalten" zaehlt beim Filtern als enthalten.
    if (f.ohneAllergen && r.allergens.some((a) => a.id === f.ohneAllergen)) return false;
    return terms.every((t) => r.searchText.includes(t));
  });
}
