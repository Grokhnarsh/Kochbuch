/**
 * Wikibooks-Kochbuch (CC BY-SA 4.0), rund 640 Rezeptseiten. Die
 * MediaWiki-API erlaubt CORS per origin=*, daher funktioniert der Abruf
 * auch im Browser.
 *
 * Der ganze Bestand liegt als nachgeladenes Korpus bei (npm run korpus --
 * wikibooks). Live nachgeladen werden nur die neuesten Seiten.
 *
 * https://de.wikibooks.org/wiki/Kochbuch
 */

import { getJSON } from './http.js';
import {
  isGermanTitle, cleanMarkup, abschnitte, vorlage, zeiten, menge, ingredientsFrom, stepsFrom,
  einordnen, wikiId, istWeiterleitung,
} from './wikitext.js';
import { seitenAdresse } from '../data/standard.js';

export const API = 'https://de.wikibooks.org/w/api.php';
export const SEITEN = 'https://de.wikibooks.org/wiki/';
export const CATEGORY = 'Kategorie:Kochbuch/ Alle Rezepte';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ruft die MediaWiki-API auf. Wikimedia drosselt haeufige Zugriffe, daher
 * wird bei 429 mit wachsendem Abstand erneut versucht.
 */
async function api(params, attempt = 0) {
  const q = new URLSearchParams({ format: 'json', origin: '*', ...params });
  try {
    return await getJSON(`${API}?${q}`);
  } catch (err) {
    const throttled = /\b429\b/.test(err.message);
    if (throttled && attempt < 3) {
      await pause(1500 * 2 ** attempt);
      return api(params, attempt + 1);
    }
    throw err;
  }
}

/** Titel der Rezeptseiten, die zuletzt aufgenommenen zuerst. */
export async function listTitles(limit = 40, cmcontinue) {
  const data = await api({
    action: 'query',
    list: 'categorymembers',
    cmtitle: CATEGORY,
    cmnamespace: '0',
    cmsort: 'timestamp',
    cmdir: 'desc',
    cmlimit: String(limit),
    ...(cmcontinue ? { cmcontinue } : {}),
  });
  return {
    titles: (data.query?.categorymembers || []).map((m) => m.title),
    next: data.continue?.cmcontinue || null,
  };
}

/** Seiten im Kochbuch, die keine Rezepte sind */
const KEIN_REZEPT = /^(Druckversion|Vorlage|Navigationsleiste|Zutaten|Techniken|Küchengeräte|Glossar|Inhaltsverzeichnis|Kategorie)\b/i;

/** Schwierigkeitsgrad 1–5 des Wikibooks auf die drei Stufen der App */
function schwierigkeit(text) {
  const grad = parseInt(cleanMarkup(text || ''), 10);
  if (!(grad >= 1)) return 2;
  if (grad <= 2) return 1;
  return grad === 3 ? 2 : 3;
}

/**
 * Wandelt den Wikitext einer Rezeptseite in ein Rezept, ohne Netz.
 *
 * Portionen, Arbeitszeit, Schwierigkeit und "vegetarisch" stehen in der
 * RezeptBox. Fehlt dort etwas, bleibt es leer — frueher standen hier fuer
 * jedes Rezept erfundene 20 + 30 Minuten und "Hauptgericht".
 *
 * @returns {object|null}
 */
export function rezeptAusSeite(title, wikitext, kategorien = []) {
  if (istWeiterleitung(wikitext) || !/^Kochbuch\/\s*/.test(title)) return null;
  const name = title.replace(/^Kochbuch\/\s*/, '').replace(/_/g, ' ').trim();
  if (!name || KEIN_REZEPT.test(name) || name.includes('/') || !isGermanTitle(name)) return null;

  const ingredients = ingredientsFrom(abschnitte(wikitext, 'Zutaten'));
  const steps = stepsFrom(abschnitte(wikitext, 'Zubereitung'));
  if (ingredients.length < 3 || steps.length < 2) return null;

  const box = vorlage(wikitext, /:?Kochbuch\/[_ ]?Vorlage\/[_ ]?RezeptBox/);
  const ausbeute = menge(cleanMarkup(box.portionen || '')) || menge(cleanMarkup(box.menge || ''));
  const { prep, cook } = zeiten(cleanMarkup(box.zubereitungszeit || ''));

  const einordnung = einordnen([...kategorien, cleanMarkup(box.kategorie || '')], name);
  const veg = cleanMarkup(box.vegetarisch || '').toLowerCase();
  let diet = einordnung.diet;
  if (veg.startsWith('vegan')) diet = ['vegan', 'vegetarisch'];
  else if (veg.startsWith('ja')) diet = ['vegetarisch'];

  return {
    id: wikiId('wikibooks', name),
    sourceId: 'wikibooks-de',
    title: name,
    chapter: 'Wikibooks Kochbuch',
    ...einordnung,
    diet,
    servings: ausbeute?.zahl || 4,
    yieldUnit: ausbeute?.einheit || null,
    prep,
    cook,
    difficulty: schwierigkeit(box.schwierigkeitsgrad),
    kcal: 0,
    tags: ['Wikibooks'],
    ingredients,
    steps,
    note: 'Aus dem Wikibooks-Kochbuch, CC BY-SA 4.0.',
    sourceUrl: seitenAdresse(SEITEN, title),
  };
}

/** Laedt eine Rezeptseite und wandelt sie in das App-Format. */
export async function fetchRecipe(title) {
  const data = await api({ action: 'parse', page: title, prop: 'wikitext|categories' });
  const wikitext = data.parse?.wikitext?.['*'];
  if (!wikitext) return null;
  const kategorien = (data.parse?.categories || []).map((k) => k['*'] ?? k.category ?? '');
  return rezeptAusSeite(title, wikitext, kategorien);
}

/**
 * Laedt die neuesten Rezepte nacheinander. Bewusst seriell und mit kurzer
 * Pause: parallele Abrufe laufen sofort in die Drosselung.
 *
 * @param {number} limit
 * @param {(geladen:number, gesamt:number)=>void} [onProgress]
 */
export async function fetchBatch(limit = 12, onProgress) {
  const { titles } = await listTitles(Math.min(limit * 2, 500));

  const out = [];
  for (const [i, title] of titles.entries()) {
    if (out.length >= limit) break;
    const recipe = await fetchRecipe(title).catch(() => null);
    if (recipe) out.push(recipe);
    onProgress?.(i + 1, titles.length);
    await pause(250);
  }
  return out;
}
