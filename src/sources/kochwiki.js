/**
 * Koch-Wiki (CC BY-SA 3.0), eine der größten freien deutschsprachigen
 * Rezeptsammlungen: rund 9200 Seiten auf MediaWiki-Basis.
 *
 * Der ganze Bestand liegt als nachgeladenes Korpus bei (npm run korpus --
 * kochwiki). Live nachgeladen werden nur die neuesten Seiten — alles
 * andere ist schon da.
 *
 * https://www.kochwiki.org/
 */

import { getJSON } from './http.js';
import {
  isGermanTitle, cleanMarkup, abschnitte, vorlage, zeiten, menge, ingredientsFrom, stepsFrom,
  SCHWIERIGKEIT, einordnen, wikiId, istWeiterleitung,
} from './wikitext.js';
import { seitenAdresse } from '../data/standard.js';

export const API = 'https://www.kochwiki.org/w/api.php';
export const SEITEN = 'https://www.kochwiki.org/wiki/';

/** Kategorien, aus denen Rezepte geholt werden. */
export const CATEGORIES = [
  'Kategorie:Rezepte ohne Alkohol',
  'Kategorie:Rezepte mit Alkohol',
];

export { isGermanTitle, einordnen };

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ruft die MediaWiki-API auf und wiederholt bei Drosselung. */
async function api(params, attempt = 0) {
  const q = new URLSearchParams({ format: 'json', origin: '*', ...params });
  try {
    return await getJSON(`${API}?${q}`);
  } catch (err) {
    if (/\b429\b/.test(err.message) && attempt < 3) {
      await pause(1200 * 2 ** attempt);
      return api(params, attempt + 1);
    }
    throw err;
  }
}

/**
 * Titel der Rezeptseiten einer Kategorie, die zuletzt aufgenommenen zuerst.
 * Aeltere Seiten liegen dem Korpus schon bei.
 */
export async function listTitles(category, limit = 50, cmcontinue) {
  const data = await api({
    action: 'query',
    list: 'categorymembers',
    cmtitle: category,
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

/** Id eines Koch-Wiki-Rezepts; bleibt stabil, damit gespeicherte Plaene gueltig bleiben. */
export const kochwikiId = (title) => wikiId('kochwiki', title);

/** Lädt eine Rezeptseite und wandelt sie um. */
export async function fetchRecipe(title) {
  const data = await api({ action: 'parse', page: title, prop: 'wikitext|categories' });
  const wikitext = data.parse?.wikitext?.['*'];
  if (!wikitext) return null;
  const kategorien = (data.parse?.categories || []).map((k) => k['*'] ?? k.category ?? '');
  return rezeptAusSeite(title, wikitext, kategorien);
}

/**
 * Wandelt den Wikitext einer Rezeptseite in ein Rezept — ohne Netz, damit
 * das Import-Werkzeug fuenfzig Seiten mit einer Anfrage holen kann.
 *
 * @param {string} title
 * @param {string} wikitext
 * @param {string[]} kategorien Namen ohne "Kategorie:"
 * @returns {object|null} null, wenn Zutaten oder Schritte fehlen
 */
export function rezeptAusSeite(title, wikitext, kategorien = []) {
  if (istWeiterleitung(wikitext)) return null;
  const ingredients = ingredientsFrom(abschnitte(wikitext, 'Zutaten'));
  const steps = stepsFrom(abschnitte(wikitext, 'Zubereitung'));
  if (ingredients.length < 3 || steps.length < 2) return null;

  // Die Infobox {{Rezept| Menge = … | Zeit = … }} traegt die einzigen
  // belastbaren Angaben zu Menge, Dauer und Schwierigkeit.
  const box = vorlage(wikitext, /Rezept\b/);
  const { prep, cook } = zeiten(box.zeit);
  const ausbeute = menge(cleanMarkup(box.menge || ''));

  return {
    id: kochwikiId(title),
    sourceId: 'kochwiki',
    title,
    chapter: 'Koch-Wiki',
    ...einordnen(kategorien, title),
    // Fehlt eine Angabe, bleibt sie leer statt geraten; die Oberflaeche
    // laesst sie dann weg.
    servings: ausbeute?.zahl || 4,
    yieldUnit: ausbeute?.einheit || null,
    prep,
    cook,
    difficulty: SCHWIERIGKEIT[(box.schwierigkeit || '').toLowerCase()] || 2,
    kcal: 0,
    tags: ['Koch-Wiki'],
    ingredients,
    steps,
    note: 'Aus dem Koch-Wiki, CC BY-SA 3.0.',
    sourceUrl: seitenAdresse(SEITEN, title),
  };
}

/**
 * Lädt die neuesten Rezepte seriell mit kurzer Pause; die Seite verträgt
 * keine Stoßlast.
 */
export async function fetchBatch(limit = 30, onProgress) {
  const titles = [];
  for (const category of CATEGORIES) {
    const page = await listTitles(category, Math.min(500, limit * 2));
    titles.push(...page.titles);
  }

  const out = [];
  for (const title of [...new Set(titles)].filter(isGermanTitle)) {
    if (out.length >= limit) break;
    const recipe = await fetchRecipe(title).catch(() => null);
    if (recipe) out.push(recipe);
    onProgress?.(out.length, limit);
    await pause(150);
  }
  return out;
}
