/**
 * Wikibooks-Kochbuch (CC BY-SA 3.0). Die MediaWiki-API erlaubt
 * CORS per origin=*, daher funktioniert der Abruf auch im Browser.
 * https://de.wikibooks.org/wiki/Kochbuch
 */

import { getJSON } from './http.js';
import { parseIngredientLine } from './ingredients.js';

const API = 'https://de.wikibooks.org/w/api.php';
const CATEGORY = 'Kategorie:Kochbuch/ Alle Rezepte';

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

/** Titel der Rezeptseiten in der Sammelkategorie. */
export async function listTitles(limit = 40, cmcontinue) {
  const data = await api({
    action: 'query',
    list: 'categorymembers',
    cmtitle: CATEGORY,
    cmlimit: String(limit),
    ...(cmcontinue ? { cmcontinue } : {}),
  });
  return {
    titles: (data.query?.categorymembers || []).map((m) => m.title),
    next: data.continue?.cmcontinue || null,
  };
}

/** Liest den Abschnitt zwischen zwei Ueberschriften aus dem Wikitext. */
function section(wikitext, heading) {
  const re = new RegExp(`==+\\s*${heading}[^=]*==+([\\s\\S]*?)(?=\\n==[^=]|$)`, 'i');
  return (wikitext.match(re) || [])[1] || '';
}

function cleanMarkup(text) {
  return text
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
    .replace(/'''?/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<ref[\s\S]*?<\/ref>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function bullets(block) {
  return block
    .split('\n')
    .filter((l) => /^[*#]\s*/.test(l))
    .map((l) => cleanMarkup(l.replace(/^[*#]+\s*/, '')))
    .filter(Boolean);
}

/** Laedt eine Rezeptseite und wandelt sie in das App-Format. */
export async function fetchRecipe(title) {
  const data = await api({ action: 'parse', page: title, prop: 'wikitext' });
  const wikitext = data.parse?.wikitext?.['*'];
  if (!wikitext) return null;

  const ingredientLines = bullets(section(wikitext, 'Zutaten'));
  const stepLines = bullets(section(wikitext, 'Zubereitung'));

  if (!ingredientLines.length) return null;

  const steps = stepLines.length
    ? stepLines
    : cleanMarkup(section(wikitext, 'Zubereitung'))
        .split(/(?<=[.!?])\s+/)
        .filter((s) => s.length > 8);

  const name = title.replace(/^Kochbuch\/\s*/, '').trim();

  return {
    id: `wikibooks-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    sourceId: 'wikibooks-de',
    title: name,
    chapter: 'Wikibooks Kochbuch',
    cuisine: 'International',
    category: 'Hauptgericht',
    meals: ['mittag', 'abend'],
    diet: [],
    servings: 4,
    prep: 20,
    cook: 30,
    difficulty: 2,
    kcal: 0,
    tags: ['Wikibooks'],
    ingredients: ingredientLines.map((line) => {
      const p = parseIngredientLine(line);
      return { a: p.amount, u: p.unit, n: p.name };
    }),
    steps: steps.length ? steps : ['Zubereitung siehe Originalseite.'],
    note: 'Aus dem Wikibooks-Kochbuch, CC BY-SA 3.0.',
    sourceUrl: `https://de.wikibooks.org/wiki/${encodeURIComponent(title)}`,
  };
}

/**
 * Laedt mehrere Rezepte nacheinander. Bewusst seriell und mit kurzer
 * Pause: parallele Abrufe laufen sofort in die Drosselung.
 *
 * @param {number} limit
 * @param {(geladen:number, gesamt:number)=>void} [onProgress]
 */
export async function fetchBatch(limit = 12, onProgress) {
  const { titles } = await listTitles(Math.min(limit * 2, 500));
  const picked = titles.filter((t) => !/^Kategorie:|Zutaten/.test(t)).slice(0, limit);

  const out = [];
  for (const [i, title] of picked.entries()) {
    const recipe = await fetchRecipe(title).catch(() => null);
    if (recipe) out.push(recipe);
    onProgress?.(i + 1, picked.length);
    await pause(250);
  }
  return out;
}
