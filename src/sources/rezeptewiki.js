/**
 * Rezepte-Wiki (rezepte.fandom.com/de), CC BY-SA: rund 660 Artikel, ein
 * gutes Drittel davon Rezepte mit Zutatentabelle und Arbeitsschritten.
 *
 * Nur ueber das Import-Werkzeug (npm run korpus -- rezeptewiki); die
 * Fandom-API erlaubt keinen Abruf aus dem Browser.
 */

import { parseIngredientLine } from './ingredients.js';
import {
  isGermanTitle, cleanMarkup, abschnitte, ingredientsFrom, stepsFrom, einordnen, wikiId, istWeiterleitung,
} from './wikitext.js';
import { seitenAdresse } from '../data/standard.js';

export const API = 'https://rezepte.fandom.com/de/api.php';
export const SEITEN = 'https://rezepte.fandom.com/de/wiki/';

/** Kategorien, die keine Rezepte sammeln, sondern Warenkunde. */
export const KEINE_REZEPTE = new Set(['Zutaten', 'Kochbücher', 'Rezeptarten', 'Küchengeräte', 'Kochtechniken']);

/**
 * Die Zutatentabellen des Wikis sind aus einer Vorlage entstanden, deren
 * Reste im Text stehen: {{#if: Hefe|{{!}}-  {{!}} 2 Päckchen {{!}} Hefe }}.
 * Erst diese Reste aufloesen, dann die Tabelle lesen.
 */
function vorlagenResteAufloesen(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{!\}\}/g, '|')
    // Unbelegte Parameter der Vorlage: {{{Menge.13}}}
    .replace(/\{\{\{[^{}]*\}\}\}/g, '')
    .replace(/\{\{#if:\s*([^|}]*)\|([^{}]*?)\}\}/g, (_, bedingung, inhalt) => (bedingung.trim() ? inhalt : ''));
}

/** Zellen einer Tabellenzeile; Attribute ("style=… |") fallen weg. */
function zellen(zeile) {
  const out = [];
  for (const z of zeile) {
    for (const teil of z.split('||')) {
      const i = teil.lastIndexOf('|');
      out.push(cleanMarkup(i >= 0 && /=/.test(teil.slice(0, i)) ? teil.slice(i + 1) : teil));
    }
  }
  return out;
}

/**
 * Liest Wikitabellen mit den Spalten Menge und Zutat.
 * @returns {{a:number|null, u:string, n:string}[]}
 */
export function tabellenZutaten(block) {
  const text = vorlagenResteAufloesen(block);
  const out = [];
  for (const tabelle of text.match(/\{\|[\s\S]*?\n\|\}/g) || []) {
    const zeilen = tabelle.split(/\n\|-[^\n]*/);
    for (const roh of zeilen) {
      const cells = [];
      for (const zeile of roh.split('\n')) {
        if (/^\{\|/.test(zeile) || /^\|\}/.test(zeile) || /^\|\+/.test(zeile)) continue;
        if (/^!/.test(zeile)) { cells.length = 0; cells.push('!'); break; }
        if (/^\|/.test(zeile)) cells.push(zeile.slice(1));
        else if (cells.length && zeile.trim()) cells[cells.length - 1] += ` ${zeile}`;
      }
      if (cells[0] === '!' || cells.length < 1) continue;
      const [menge, ...rest] = zellen(cells);
      const name = rest.join(' ').trim();
      if (!name) continue;
      const p = parseIngredientLine(`${menge} ${name}`.trim());
      if (p.name && p.name.length > 1) out.push({ a: p.amount, u: p.unit, n: p.name });
    }
  }
  return out;
}

/**
 * Manche Seiten schreiben die Zutaten als schlichte Zeilen, ohne Tabelle
 * und ohne Aufzaehlungszeichen ("5 kg geschwellte Kartoffeln", "-2 große
 * Kartoffeln,"). Nur Zeilen, die nach einer Zutat aussehen: kurz, keine
 * Ueberschrift, kein Satz.
 */
function zeilenZutaten(block) {
  const out = [];
  for (const zeile of block.split('\n')) {
    const text = cleanMarkup(zeile).replace(/^[-–•·]\s*/, '').replace(/[,;]\s*$/, '').trim();
    if (!text || text.length > 80 || /[:.!?]$/.test(text) || /^(man|für|zutaten)\b/i.test(text)) continue;
    const p = parseIngredientLine(text);
    if (p.name && p.name.length > 1) out.push({ a: p.amount, u: p.unit, n: p.name });
  }
  return out;
}

/** Portionen aus "Zutaten für 4 Personen" oder "für 4 bis 6 Personen" */
function portionen(text) {
  const m = cleanMarkup(text).match(/für\s+(\d+)\s*(?:(?:-|–|bis)\s*\d+\s*)?(Personen|Portionen|Pers\.|Leute|Esser)/i);
  const n = m ? parseInt(m[1], 10) : 0;
  return n >= 1 && n <= 24 ? n : null;
}

/**
 * @param {string} title
 * @param {string} wikitext
 * @param {string[]} kategorien
 * @returns {object|null}
 */
export function rezeptAusSeite(title, wikitext, kategorien = []) {
  if (istWeiterleitung(wikitext) || !isGermanTitle(title)) return null;
  if (kategorien.some((k) => KEINE_REZEPTE.has(k)) && !kategorien.includes('Rezepte')) return null;

  const zutatenBlock = abschnitte(wikitext, 'Zutaten');
  const ohneTabellen = vorlagenResteAufloesen(zutatenBlock).replace(/\{\|[\s\S]*?\n\|\}/g, '');
  let ingredients = [...tabellenZutaten(zutatenBlock), ...ingredientsFrom(ohneTabellen)];
  if (ingredients.length < 3) ingredients = zeilenZutaten(ohneTabellen);
  const steps = stepsFrom(abschnitte(wikitext, 'Zubereitung'));
  if (ingredients.length < 3 || steps.length < 2) return null;

  const einleitung = wikitext.slice(0, wikitext.search(/^==/m) >>> 0);
  const anzahl = portionen(zutatenBlock) || portionen(einleitung);

  return {
    id: wikiId('rezeptewiki', title),
    sourceId: 'rezeptewiki',
    title,
    chapter: 'Rezepte-Wiki',
    ...einordnen(kategorien, title),
    servings: anzahl || 4,
    yieldUnit: null,
    prep: 0,
    cook: 0,
    difficulty: 2,
    kcal: 0,
    tags: ['Rezepte-Wiki'],
    ingredients,
    steps,
    note: 'Aus dem Rezepte-Wiki auf Fandom, CC BY-SA.',
    sourceUrl: seitenAdresse(SEITEN, title),
  };
}
