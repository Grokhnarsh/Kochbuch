/**
 * Liest schema.org/Recipe aus einer beliebigen Rezeptseite.
 *
 * Chefkoch.de, rewe.de und die meisten anderen Rezeptportale betten ihre
 * Rezepte als JSON-LD ein. Dieser Parser arbeitet ohne DOM und laeuft
 * deshalb sowohl im Browser als auch im Import-Skript unter Node.
 *
 * Wichtig: importierte Rezepte bleiben Eigentum des jeweiligen Anbieters.
 * Sie werden nur lokal gespeichert und nicht mit dem Projekt ausgeliefert.
 */

import { parseIngredientLine } from './ingredients.js';
import { istThermomix } from './thermomix.js';

const LD_BLOCK = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** ISO-8601-Dauer (PT1H30M) in Minuten. */
export function isoDurationToMinutes(value) {
  if (!value || typeof value !== 'string') return 0;
  const m = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return 0;
  const [, d, h, min] = m;
  return (parseInt(d || 0, 10) * 1440) + (parseInt(h || 0, 10) * 60) + parseInt(min || 0, 10);
}

/** Erste Zahl aus "4 Portionen" oder ["4"]. */
export function parseYield(value) {
  if (value == null) return 4;
  const text = Array.isArray(value) ? value.join(' ') : String(value);
  const m = text.match(/\d+/);
  return m ? Math.max(1, Math.min(48, parseInt(m[0], 10))) : 4;
}

export function stripTags(text) {
  return String(text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Benannte Entitaeten, wie Rezeptseiten sie verwenden. Cookidoo schreibt
 * Mengen etwa als "1 &frac12; TL Salz" — ohne Aufloesung bliebe die Menge
 * im Namen stehen.
 */
const ENTITAETEN = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '', thinsp: ' ', ensp: ' ', emsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  frac12: '½', frac14: '¼', frac34: '¾', frac13: '⅓', frac23: '⅔', frac18: '⅛', frac38: '⅜', frac58: '⅝', frac78: '⅞',
  deg: '°', times: '×', ndash: '–', mdash: '—', hellip: '…', middot: '·', bull: '•',
  laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', sbquo: '‚',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', aacute: 'á', agrave: 'à', acirc: 'â', ccedil: 'ç',
  iacute: 'í', icirc: 'î', iuml: 'ï', oacute: 'ó', ocirc: 'ô', uacute: 'ú', ucirc: 'û', ntilde: 'ñ', oelig: 'œ',
  Eacute: 'É', copy: '©', reg: '®', trade: '™', euro: '€',
};

export function decodeEntities(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+[0-9]*);/gi, (all, name) => ENTITAETEN[name] ?? all);
}

/**
 * Arbeitsschritte aus dem Seitentext, wenn die schema.org-Daten keine
 * haben: erst Mikrodaten (itemprop="recipeInstructions"), dann die Liste
 * oder die Absaetze unter einer Ueberschrift "Zubereitung".
 */
export function schritteAusHtml(html) {
  const sauber = (t) => stripTags(decodeEntities(t)).replace(/\s+/g, ' ').trim();
  const brauchbar = (liste) => liste.map(sauber).filter((s) => s.length >= 15 && !/^\d+\s*(Min|Std)/i.test(s));

  const mikro = brauchbar([...html.matchAll(
    /<(li|p|div)[^>]*itemprop=["']recipeInstructions["'][^>]*>([\s\S]*?)<\/\1>/gi,
  )].map((m) => m[2]));
  if (mikro.length) return mikro;

  const kopf = html.search(/<h[1-4][^>]*>\s*(?:<[^>]+>\s*)*(?:Zubereitung|Anleitung|Arbeitsschritte|So wird's gemacht)\b/i);
  if (kopf < 0) return [];
  const rest = html.slice(kopf);
  const naechste = rest.slice(4).search(/<h[1-4][^>]*>/i);
  const block = naechste >= 0 ? rest.slice(0, naechste + 4) : rest.slice(0, 30000);
  const punkte = brauchbar([...block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]));
  if (punkte.length) return punkte;
  return brauchbar([...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1]));
}

/** Was statt der Schritte dasteht, wenn die Seite sie nicht hergibt */
function ohneSchritte(host) {
  return /cookidoo|thermomix|vorwerk/i.test(host)
    ? ['Die Arbeitsschritte zeigt Cookidoo nur angemeldeten Nutzern. Bitte auf der Originalseite nachsehen.']
    : ['Zubereitung siehe Originalseite.'];
}

/** Flacht Anweisungen aus allen von schema.org erlaubten Formen ab. */
export function flattenInstructions(value) {
  if (!value) return [];

  if (typeof value === 'string') {
    return stripTags(decodeEntities(value))
      .split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2);
  }

  if (Array.isArray(value)) return value.flatMap(flattenInstructions);

  if (typeof value === 'object') {
    if (value.itemListElement) return flattenInstructions(value.itemListElement);
    if (value.text) return flattenInstructions(value.text);
    if (value.name) return flattenInstructions(value.name);
  }

  return [];
}

function firstString(value) {
  if (!value) return '';
  // Tags erst nach dem Entschluesseln entfernen: aus "&lt;b&gt;" wird
  // sonst ein echtes Tag, das im Titel landet.
  if (typeof value === 'string') return stripTags(decodeEntities(value));
  if (Array.isArray(value)) return firstString(value[0]);
  if (typeof value === 'object') return firstString(value.name || value['@type']);
  return '';
}

function calories(nutrition) {
  if (!nutrition) return 0;
  const raw = nutrition.calories || nutrition.energyContent;
  if (!raw) return 0;
  const m = String(raw).match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Ordnet ein Rezept anhand von Kategorie und Titel Mahlzeiten zu. */
function guessMeals(category, title) {
  const t = `${category} ${title}`.toLowerCase();
  if (/frühstück|fruehstueck|müsli|muesli|porridge|brötchen|marmelade|pancake/.test(t)) {
    return ['fruehstueck'];
  }
  if (/kuchen|torte|dessert|nachtisch|plätzchen|gebäck|\bkeks|\beis\b|\bsnack\b/.test(t)) {
    return ['snack'];
  }
  if (/vorspeise|salat|suppe|dip|aufstrich/.test(t)) return ['mittag', 'abend'];
  return ['mittag', 'abend'];
}

/** Erkennt gaengige Ernaehrungshinweise in Kategorien und Schlagworten. */
function guessDiet(node) {
  const text = [node.recipeCategory, node.keywords, node.suitableForDiet]
    .flat()
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const diet = [];
  if (/vegan/.test(text)) diet.push('vegetarisch', 'vegan');
  else if (/vegetarisch|vegetarian/.test(text)) diet.push('vegetarisch');
  if (/glutenfrei|gluten.?free/.test(text)) diet.push('glutenfrei');
  return [...new Set(diet)];
}

/**
 * Wandelt einen schema.org-Recipe-Knoten in ein Rezept dieser App.
 * @param {object} node
 * @param {string} url Herkunfts-URL, liefert Host und Quellenangabe
 */
export function fromSchemaOrg(node, url = '', { html = '' } = {}) {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    host = 'import';
  }

  const title = firstString(node.name) || 'Importiertes Rezept';
  const prep = isoDurationToMinutes(node.prepTime);
  const cook = isoDurationToMinutes(node.cookTime);
  const total = isoDurationToMinutes(node.totalTime);

  const ingredients = (node.recipeIngredient || node.ingredients || [])
    .map((line) => parseIngredientLine(decodeEntities(stripTags(line))))
    .filter((i) => i.name)
    .map((i) => ({ a: i.amount, u: i.unit, n: i.name }));

  let steps = flattenInstructions(node.recipeInstructions);
  if (!steps.length && html) steps = schritteAusHtml(html);
  const thermomix = istThermomix({ steps, sourceHost: host });

  return {
    id: `import-${slug(host)}-${slug(title)}`,
    title,
    chapter: firstString(node.recipeCategory) || 'Import',
    cuisine: firstString(node.recipeCuisine) || 'International',
    category: firstString(node.recipeCategory) || 'Hauptgericht',
    meals: guessMeals(firstString(node.recipeCategory), title),
    diet: guessDiet(node),
    servings: parseYield(node.recipeYield),
    prep: prep || Math.max(0, total - cook),
    cook: cook || (prep ? Math.max(0, total - prep) : total),
    difficulty: 2,
    kcal: calories(node.nutrition),
    tags: ['Import', host, ...(thermomix ? ['Thermomix'] : [])],
    ingredients,
    steps: steps.length ? steps : ohneSchritte(host),
    note: `Importiert von ${host}. Rechte am Rezepttext liegen beim Anbieter; nur lokal gespeichert.`,
    sourceUrl: url,
    sourceHost: host,
  };
}

/** Findet den Recipe-Knoten in einem beliebig verschachtelten JSON-LD-Baum. */
export function findRecipeNode(data) {
  const seen = new Set();

  const walk = (node) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return null;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = walk(item);
        if (hit) return hit;
      }
      return null;
    }

    const type = node['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (types.includes('Recipe')) return node;

    for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement']) {
      if (node[key]) {
        const hit = walk(node[key]);
        if (hit) return hit;
      }
    }
    return null;
  };

  return walk(data);
}

/**
 * Zieht das Rezept aus dem HTML-Quelltext einer Seite.
 * @param {string} html
 * @param {string} url
 */
export function parseRecipeFromHtml(html, url = '') {
  LD_BLOCK.lastIndex = 0;
  let match;

  while ((match = LD_BLOCK.exec(html)) !== null) {
    let data;
    try {
      data = JSON.parse(match[1].trim());
    } catch {
      continue; // fehlerhafte Bloecke ueberspringen, es gibt oft mehrere
    }
    const node = findRecipeNode(data);
    if (node) return fromSchemaOrg(node, url, { html });
  }

  return null;
}
