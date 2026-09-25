/**
 * Bindet die Live-Quellen und den URL-Import an den Rezeptindex an.
 */

import { registerRecipes, registerSource } from '../data/index.js';
import { bereinige } from '../state/rezeptform.js';
import { SourceError, getText } from './http.js';
import { parseRecipeFromHtml } from './schemaorg.js';
import * as themealdb from './themealdb.js';
import * as wikibooks from './wikibooks.js';
import * as kochwiki from './kochwiki.js';
import * as unitools from './unitools.js';
import * as gutendex from './gutendex.js';
import * as openfoodfacts from './openfoodfacts.js';

export { themealdb, wikibooks, kochwiki, unitools, gutendex, openfoodfacts, SourceError };

/**
 * Quellen, die sich in der App auf Knopfdruck nachladen lassen.
 * Bewusst nur deutschsprachige: TheMealDB und der UniTools-Datensatz
 * liefern ausschliesslich englische Texte und bleiben dem Import-Werkzeug
 * auf der Kommandozeile vorbehalten.
 */
export const liveSources = [
  {
    id: 'wikibooks-de',
    label: 'Wikibooks Kochbuch',
    hint: 'Rezepte unter CC BY-SA 3.0, bewusst gedrosselt geladen',
    run: (onProgress) => wikibooks.fetchBatch(30, onProgress),
  },
  {
    id: 'kochwiki',
    label: 'Koch-Wiki',
    hint: 'Deutschsprachige Rezepte unter CC BY-SA, gedrosselt geladen',
    run: (onProgress) => kochwiki.fetchBatch(40, onProgress),
  },
];

/** Laedt eine Live-Quelle und haengt die Treffer in den Index. */
/**
 * Laedt eine Live-Quelle und haengt die Treffer in den Index.
 * @param {string} sourceId
 * @param {(geladen:number, marke:string|number)=>void} [onProgress]
 */
export async function loadLiveSource(sourceId, onProgress) {
  const source = liveSources.find((s) => s.id === sourceId);
  if (!source) throw new SourceError(`Unbekannte Quelle: ${sourceId}`, { kind: 'config' });
  const list = await source.run(onProgress);
  return registerRecipes(list);
}

/** Legt fuer einen importierten Host eine Quelle an, falls noch keine existiert. */
export function ensureImportSource(host) {
  const id = `import-${host}`;
  registerSource({
    id,
    kind: 'import',
    title: host,
    author: host,
    year: new Date().getFullYear(),
    country: '—',
    license: 'Rechte beim Anbieter',
    licenseUrl: `https://${host}`,
    url: `https://${host}`,
    via: 'Per URL importiert, nur lokal gespeichert',
    accent: '#6b7280',
  });
  return id;
}

/**
 * Wandelt HTML einer Rezeptseite in ein Rezept und registriert es.
 * Funktioniert fuer alle Seiten mit schema.org/Recipe, darunter
 * Chefkoch.de und rewe.de.
 */
export function importFromHtml(html, url = '') {
  const raw = parseRecipeFromHtml(html, url);
  if (!raw) {
    throw new SourceError(
      'Auf dieser Seite wurde kein schema.org-Rezept gefunden.',
      { kind: 'parse' },
    );
  }
  raw.sourceId = ensureImportSource(raw.sourceHost);
  const [recipe] = registerRecipes([raw]);
  return recipe || null;
}

/**
 * Holt eine Rezeptseite und importiert sie. Im Browser scheitert das bei
 * den meisten Portalen an CORS — dann bleibt der Weg ueber eingefuegten
 * Seitenquelltext oder `npm run import -- --url <adresse>`.
 */
export async function importFromUrl(url) {
  const html = await getText(url);
  return importFromHtml(html, url);
}

/**
 * Liest eine Sammlung ein, wie `npm run import -- --urls datei.txt` sie
 * schreibt (data/importiert/sammlung.json): selbst ausgewaehlte Rezepte
 * von Chefkoch, Cookidoo und anderen Seiten. Jeder Datensatz wird
 * geprueft; was nicht passt, bleibt draussen.
 *
 * @param {string} text Inhalt der Datei
 * @returns {{neu:object[], gelesen:number}}
 */
export function importiereSammlung(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new SourceError('Die Datei ist kein gültiges JSON.', { kind: 'parse' });
  }
  const liste = Array.isArray(doc) ? doc : doc?.recipes;
  if (!Array.isArray(liste)) throw new SourceError('Die Datei enthält keine Rezeptliste.', { kind: 'parse' });

  const rezepte = [];
  for (const roh of liste) {
    let host = typeof roh?.sourceHost === 'string' ? roh.sourceHost : '';
    if (!host) {
      try { host = new URL(roh?.sourceUrl).hostname.replace(/^www\./, ''); } catch { host = ''; }
    }
    if (!/^[a-z0-9.-]+$/i.test(host)) continue;
    const sourceId = ensureImportSource(host);
    const r = bereinige({ ...roh, sourceId }, sourceId);
    if (!r) continue;
    // Importe tragen immer das Praefix; so bleiben sie von Korpus und eigenen Rezepten getrennt
    if (!r.id.startsWith('import-')) r.id = `import-${r.id}`;
    rezepte.push(r);
  }
  return { neu: registerRecipes(rezepte), gelesen: liste.length };
}
