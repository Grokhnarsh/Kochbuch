/**
 * Schreibt eine Rezeptsammlung als Korpus-Teile nach public/korpus/.
 *
 * - Je Rezept eine Zeile: Aenderungen sind im Diff lesbar, und ein Teil
 *   laesst sich an jeder Zeilengrenze schneiden.
 * - Was alle Rezepte eines Buchs gemeinsam haben, steht einmal in den
 *   "vorgaben"; Felder mit dem Standardwert fallen weg.
 * - Allergene, Naehrwerte und Bewertung werden hier gerechnet und als
 *   knappe Zusammenfassung "z" mitgeschrieben — die App muss beim Start
 *   nichts rechnen.
 * - Kein Teil wird groesser als MAX_BYTES; das haelt auch schwache
 *   Handys aus und bleibt weit unter Hosting-Grenzen (16 MB je Datei).
 *
 * Das Verzeichnis public/korpus/index.json nennt die Teile in der
 * Reihenfolge, in der die App sie laedt.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { erstelleRechner } from '../../src/state/naehrwerte.js';
import { berechne, kompakt } from '../../src/state/anreicherung.js';
import { STANDARD, mitVorgaben, zutatenAusDatei, rechenGrundlage, seitenAdresse } from '../../src/data/standard.js';

export const ZIEL = 'public/korpus';
/**
 * Obergrenze je Teil. Kleine Teile halten den Browser beim Einlesen nur
 * kurz auf — ein Teil von 7,5 MB blockierte ein gedrosseltes Handy fast
 * eine Sekunde, einer von 2 MB etwa ein Viertel davon.
 */
export const MAX_BYTES = 2_000_000;

/**
 * Ladereihenfolge: Kleines und Alltagstaugliches zuerst, damit die
 * Bibliothek schnell waechst; die grossen Wiki-Teile danach, die
 * historischen Originaltexte zuletzt.
 */
const REIHENFOLGE = ['wikibooks', 'rezeptewiki', 'heyl-1905', 'kochwiki', 'davidis-1849', 'schiller-1843'];

let rechner;
function naehrwertRechner() {
  rechner ??= erstelleRechner(JSON.parse(readFileSync('src/data/naehrwerte.json', 'utf8')));
  return rechner;
}

const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Die Zusammenfassung, genau so, wie die App sie sonst selbst rechnen wuerde. */
export function zusammenfassung(roh, buch) {
  const { raw, lesetext } = mitVorgaben(roh, buch);
  const ingredients = zutatenAusDatei(raw.ingredients);
  return kompakt(berechne(rechenGrundlage(raw, ingredients, lesetext), naehrwertRechner()));
}

/** Laesst weg, was Standard oder Vorgabe schon sagen. */
function verdichten(rezept, buch) {
  const aus = {};
  const vorgabe = { ...STANDARD, ...buch.vorgaben };
  for (const [feld, wert] of Object.entries(rezept)) {
    if (wert === undefined || feld === 'sourceId' || feld === 'z') continue;
    if (feld in vorgabe && gleich(wert, vorgabe[feld])) continue;
    if (feld === 'sourceUrl' && buch.urlBasis && wert === seitenAdresse(buch.urlBasis, rezept.seite || rezept.title)) continue;
    aus[feld] = wert;
  }
  return aus;
}

/**
 * @param {{name:string, sourceId:string, vorgaben?:object, urlBasis?:string, art?:string, recipes:object[]}} buch
 * @returns {{datei:string, rezepte:number, bytes:number}[]} die geschriebenen Teile
 */
export function schreibeBuch(buch, { ziel = ZIEL, maxBytes = MAX_BYTES } = {}) {
  mkdirSync(ziel, { recursive: true });
  const kopf = {
    sourceId: buch.sourceId,
    ...(buch.vorgaben ? { vorgaben: buch.vorgaben } : {}),
    ...(buch.urlBasis ? { urlBasis: buch.urlBasis } : {}),
    ...(buch.art ? { art: buch.art } : {}),
  };

  // Stabil sortiert: ein zweiter Lauf mit denselben Daten ergibt dieselben Dateien.
  const rezepte = [...buch.recipes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const zeilen = rezepte.map((r) => {
    const knapp = verdichten(r, buch);
    return JSON.stringify({ ...knapp, z: zusammenfassung(knapp, buch) });
  });

  const anfang = `${JSON.stringify(kopf).slice(0, -1)},"recipes":[\n`;
  const ende = '\n]}\n';
  const teile = [];
  let aktuell = [];
  let groesse = 0;
  for (const zeile of zeilen) {
    const bytes = Buffer.byteLength(zeile, 'utf8') + 2;
    if (aktuell.length && groesse + bytes + anfang.length + ende.length > maxBytes) {
      teile.push(aktuell);
      aktuell = [];
      groesse = 0;
    }
    aktuell.push(zeile);
    groesse += bytes;
  }
  if (aktuell.length) teile.push(aktuell);

  // Alte Teile desselben Buchs entfernen, falls es geschrumpft ist
  const muster = new RegExp(`^${buch.name}-\\d+\\.json$`);
  for (const f of existsSync(ziel) ? readdirSync(ziel) : []) {
    if (muster.test(f)) rmSync(path.join(ziel, f));
  }

  const ergebnis = teile.map((liste, i) => {
    const datei = `${buch.name}-${i + 1}.json`;
    const inhalt = anfang + liste.join(',\n') + ende;
    writeFileSync(path.join(ziel, datei), inhalt);
    return { datei, rezepte: liste.length, bytes: Buffer.byteLength(inhalt, 'utf8') };
  });

  eintragen(buch, ergebnis, ziel);
  return ergebnis;
}

/** Traegt die Teile eines Buchs ins Verzeichnis ein. */
function eintragen(buch, teile, ziel) {
  const datei = path.join(ziel, 'index.json');
  const verzeichnis = existsSync(datei) ? JSON.parse(readFileSync(datei, 'utf8')) : { teile: [] };
  const uebrige = verzeichnis.teile.filter((t) => t.buch !== buch.name);
  const neu = teile.map((t) => ({ buch: buch.name, quelle: buch.sourceId, ...t }));
  const rang = (t) => {
    const i = REIHENFOLGE.indexOf(t.buch);
    return i < 0 ? REIHENFOLGE.length : i;
  };
  const alle = [...uebrige, ...neu].sort((a, b) => rang(a) - rang(b) || a.datei.localeCompare(b.datei, 'de', { numeric: true }));
  writeFileSync(datei, `${JSON.stringify({
    hinweis: 'Von scripts/korpus.mjs erzeugt. Rezepttexte unter der Lizenz ihrer Quelle, siehe src/data/sources.json.',
    rezepte: alle.reduce((s, t) => s + t.rezepte, 0),
    teile: alle,
  }, null, 2)}\n`);
}

/** Liest alle Teile eines Buchs wieder ein, etwa um nur neu zu rechnen. */
export function leseBuch(name, ziel = ZIEL) {
  const verzeichnis = JSON.parse(readFileSync(path.join(ziel, 'index.json'), 'utf8'));
  const teile = verzeichnis.teile.filter((t) => t.buch === name);
  if (!teile.length) return null;
  const docs = teile.map((t) => JSON.parse(readFileSync(path.join(ziel, t.datei), 'utf8')));
  const { recipes, ...kopf } = docs[0];
  return { name, ...kopf, recipes: docs.flatMap((d) => d.recipes) };
}

/** Alle Buecher im Verzeichnis. */
export function buecher(ziel = ZIEL) {
  const datei = path.join(ziel, 'index.json');
  if (!existsSync(datei)) return [];
  return [...new Set(JSON.parse(readFileSync(datei, 'utf8')).teile.map((t) => t.buch))];
}
