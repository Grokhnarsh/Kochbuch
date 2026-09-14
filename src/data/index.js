/**
 * Laedt das gebuendelte Rezeptkorpus und das Quellenregister und
 * normalisiert beides zu einem durchsuchbaren Index.
 *
 * Die Buecher liegen als statisches JSON im Repository, damit die App
 * ohne Netzwerkzugriff funktioniert. Live-Quellen (TheMealDB, Wikibooks,
 * Open Food Facts, Gutendex) kommen ueber src/sources/ dazu.
 */

import sourcesDoc from './sources.json';
import davidis from './books/davidis-1845.json';
import prato from './books/prato-1858.json';
import artusi from './books/artusi-1891.json';
import farmer from './books/farmer-1896.json';
import beeton from './books/beeton-1861.json';
import glasse from './books/glasse-1747.json';
import wikibooks from './books/wikibooks-de.json';
import kochwiki from './books/kochwiki.json';

const BOOKS = [davidis, prato, artusi, farmer, beeton, glasse, wikibooks, kochwiki];

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

/**
 * Haengt Quellenangaben an ein Rohrezept und leitet Suchfeld und
 * Gesamtdauer ab.
 */
function normalise(raw, sourceId) {
  const source = sourceById.get(sourceId);
  const totalTime = (raw.prep || 0) + (raw.cook || 0);
  const ingredients = raw.ingredients.map((i) => ({
    amount: i.a ?? null,
    unit: i.u ?? '',
    name: i.n,
  }));

  const searchText = [
    raw.title,
    raw.cuisine,
    raw.category,
    source?.title,
    source?.author,
    ...(raw.tags || []),
    ...(raw.diet || []),
    ...ingredients.map((i) => i.name),
  ]
    .join(' ')
    .toLowerCase();

  return {
    ...raw,
    sourceId,
    source,
    ingredients,
    totalTime,
    searchText,
    live: false,
  };
}

/** Alle gebuendelten Rezepte, nach Titel sortiert. */
export const recipes = BOOKS.flatMap((book) =>
  book.recipes.map((r) => normalise(r, book.sourceId)),
).sort((a, b) => a.title.localeCompare(b.title, 'de'));

export const recipeById = new Map(recipes.map((r) => [r.id, r]));

/** Registriert eine zur Laufzeit entstandene Quelle, etwa fuer Importe. */
export function registerSource(source) {
  if (sourceById.has(source.id)) return sourceById.get(source.id);
  sources.push(source);
  sourceById.set(source.id, source);
  return source;
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
  recipes.sort((a, b) => a.title.localeCompare(b.title, 'de'));
  return added;
}

/** Alle in den Daten tatsaechlich vorkommenden Kategorien. */
export function categories() {
  return [...new Set(recipes.map((r) => r.category))].sort((a, b) => a.localeCompare(b, 'de'));
}

/** Alle vorkommenden Ernaehrungsformen. */
export function diets() {
  return [...new Set(recipes.flatMap((r) => r.diet || []))].sort((a, b) => a.localeCompare(b, 'de'));
}

/**
 * Filtert den Index.
 * @param {{query?:string, source?:string, category?:string, diet?:string, maxTime?:number, meal?:string}} f
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
    return terms.every((t) => r.searchText.includes(t));
  });
}
