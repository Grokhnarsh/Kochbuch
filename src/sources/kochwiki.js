/**
 * Koch-Wiki (CC BY-SA), eine der größten freien deutschsprachigen
 * Rezeptsammlungen: rund 9000 Seiten auf MediaWiki-Basis.
 *
 * https://www.kochwiki.org/
 */

import { getJSON } from './http.js';
import { parseIngredientLine } from './ingredients.js';

const API = 'https://www.kochwiki.org/w/api.php';

/** Kategorien, aus denen Rezepte geholt werden. */
export const CATEGORIES = [
  'Kategorie:Rezepte ohne Alkohol',
  'Kategorie:Rezepte mit Alkohol',
];

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Das Koch-Wiki ist deutschsprachig, fuehrt aber vereinzelt Gerichte
 * unter ihrem englischen Namen. Die App soll durchgehend deutsch sein,
 * deshalb bleiben solche Seiten aussen vor.
 */
const ENGLISH = /(^|\s)(the|and|of|with|for|from|made|baked|roast|boiled|fried|style)(\s|$)/i;

export const isGermanTitle = (title) => !ENGLISH.test(title);

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

/** Titel der Rezeptseiten einer Kategorie. */
export async function listTitles(category, limit = 50, cmcontinue) {
  const data = await api({
    action: 'query',
    list: 'categorymembers',
    cmtitle: category,
    cmnamespace: '0',
    cmlimit: String(limit),
    ...(cmcontinue ? { cmcontinue } : {}),
  });
  return {
    titles: (data.query?.categorymembers || []).map((m) => m.title),
    next: data.continue?.cmcontinue || null,
  };
}

function cleanMarkup(text) {
  return text
    // Bruchvorlage {{B|1|2}} in eine lesbare Menge umwandeln, statt sie
    // wie die übrigen Vorlagen ersatzlos zu streichen.
    .replace(/\{\{\s*B\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\}\}/gi, '$1/$2')
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/<ref[\s\S]*?<\/ref>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Liest einen Abschnitt zwischen zwei Überschriften. */
function section(wikitext, heading) {
  const re = new RegExp(`==+\\s*${heading}[^=]*==+([\\s\\S]*?)(?=\\n==[^=]|$)`, 'i');
  return (wikitext.match(re) || [])[1] || '';
}

/**
 * Koch-Wiki listet Zutaten als Tabellenzeilen ("| 250 | g | Mehl") oder
 * als Aufzählung. Beide Formen werden berücksichtigt.
 */
function ingredientsFrom(block) {
  const out = [];

  for (const line of block.split('\n')) {
    const cells = line.startsWith('|') && !line.startsWith('|-')
      ? line.slice(1).split('||').map((c) => cleanMarkup(c))
      : null;

    if (cells && cells.length >= 2) {
      const [amount, unit, ...rest] = cells;
      const name = cleanMarkup(rest.join(' ')) || unit;
      const parsed = parseIngredientLine(`${amount} ${unit} ${name}`.trim());
      if (parsed.name) out.push({ a: parsed.amount, u: parsed.unit, n: parsed.name });
      continue;
    }

    if (/^[*#]\s*/.test(line)) {
      const parsed = parseIngredientLine(cleanMarkup(line.replace(/^[*#]+\s*/, '')));
      if (parsed.name) out.push({ a: parsed.amount, u: parsed.unit, n: parsed.name });
    }
  }
  return out;
}

/**
 * Sehr kurze Anweisungen ("Aufkochen.") sind im Koch-Wiki üblich. Sie
 * werden an den vorigen Schritt angehängt statt verworfen — sonst ginge
 * eine echte Anweisung verloren.
 */
function mergeShort(steps, minLength = 12) {
  const out = [];
  for (const step of steps) {
    if (step.length < minLength && out.length) out[out.length - 1] += ` ${step}`;
    else out.push(step);
  }
  return out.filter((s) => s.length >= minLength);
}

function stepsFrom(block) {
  const bullets = block
    .split('\n')
    .filter((l) => /^[*#]\s*/.test(l))
    .map((l) => cleanMarkup(l.replace(/^[*#]+\s*/, '')))
    .filter(Boolean);

  if (bullets.length) return mergeShort(bullets);

  return mergeShort(
    cleanMarkup(block)
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Lädt eine Rezeptseite und wandelt sie um. */
export async function fetchRecipe(title) {
  const data = await api({ action: 'parse', page: title, prop: 'wikitext' });
  const wikitext = data.parse?.wikitext?.['*'];
  if (!wikitext) return null;

  const ingredients = ingredientsFrom(section(wikitext, 'Zutaten'));
  const steps = stepsFrom(section(wikitext, 'Zubereitung'));
  if (ingredients.length < 3 || steps.length < 2) return null;

  return {
    id: `kochwiki-${title.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '')}`,
    sourceId: 'kochwiki',
    title,
    chapter: 'Koch-Wiki',
    cuisine: 'International',
    category: 'Hauptgericht',
    meals: ['mittag', 'abend'],
    diet: [],
    servings: 4,
    prep: 20,
    cook: 30,
    difficulty: 2,
    kcal: 0,
    tags: ['Koch-Wiki'],
    ingredients,
    steps,
    note: 'Aus dem Koch-Wiki, CC BY-SA.',
    sourceUrl: `https://www.kochwiki.org/wiki/${encodeURIComponent(title)}`,
  };
}

/**
 * Lädt mehrere Rezepte seriell mit kurzer Pause; die Seite verträgt
 * keine Stoßlast.
 */
export async function fetchBatch(limit = 30, onProgress) {
  // Die API gibt höchstens 500 Titel je Aufruf; für größere Mengen wird
  // über den Fortsetzungsschlüssel weitergeblättert.
  const titles = [];
  for (const category of CATEGORIES) {
    let cursor;
    do {
      const page = await listTitles(category, 500, cursor);
      titles.push(...page.titles);
      cursor = page.next;
    } while (cursor && titles.length < limit * 3);
    if (titles.length >= limit * 3) break;
  }

  const out = [];
  for (const title of titles.filter(isGermanTitle)) {
    if (out.length >= limit) break;
    const recipe = await fetchRecipe(title).catch(() => null);
    if (recipe) out.push(recipe);
    onProgress?.(out.length, limit);
    await pause(150);
  }
  return out;
}
