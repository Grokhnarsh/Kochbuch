/**
 * Abgleich zwischen Geraeten: zwei Staende werden zu einem.
 *
 * Ein Stand ist alles, was die App speichert, dazu wann jeder Teil
 * zuletzt geaendert wurde (`zeiten`) und was geloescht wurde (`entfernt`).
 * Ohne Server, der Buch fuehrt, entscheiden diese Zeiten:
 *
 * - Wochenplaene und Haken der Einkaufsliste je Woche: die neuere Woche gewinnt.
 *   Wer am Handy den Dienstag aendert und am Rechner die naechste Woche,
 *   behaelt beides.
 * - Listen mit Kennung (eigene Rezepte, Importe, Personen, Sammlungen,
 *   Vorrat): vereinigt. Bei gleicher Kennung gewinnt die neuere Liste.
 *   Was eine Seite geloescht hat, bleibt weg, wenn die andere die Liste
 *   seither nicht geaendert hat.
 * - Bewertungen: je Rezept die neueren Sterne und Notizen, der Kochverlauf
 *   beider Seiten zusammen.
 * - Vorgaben fuer "Woche füllen": die neueren.
 *
 * Fotos gehen nicht mit, sie sind zu gross fuer haeufiges Hin und Her.
 *
 * Reine Funktionen.
 */

import { vorratsName } from './vorrat.js';

export const FORMAT_ABGLEICH = 'kochbuch-abgleich';

/** Teile, die als Liste mit Kennung abgeglichen werden, und wie die Kennung lautet */
export const LISTEN = {
  eigene: (x) => x.id,
  importe: (x) => x.id,
  profile: (x) => x.id,
  sammlungen: (x) => x.id,
  vorrat: (x) => vorratsName(x.name),
};

/** Teile, die je Woche abgeglichen werden */
export const WOCHEN = ['plan', 'abgehakt'];

/** Geloeschtes merkt sich die App so lange */
const GRAB_TAGE = 60;

const zeitVon = (stand, teil) => Number(stand?.zeiten?.[teil]) || 0;

/** Objekt mit sortierten Schluesseln als Text — fuer Vergleiche */
export function stabil(wert) {
  if (Array.isArray(wert)) return `[${wert.map(stabil).join(',')}]`;
  if (wert && typeof wert === 'object') {
    return `{${Object.keys(wert).sort().filter((k) => wert[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stabil(wert[k])}`).join(',')}}`;
  }
  return JSON.stringify(wert ?? null);
}

function wochenMischen(a, b, teil) {
  const da = a.daten[teil] || {};
  const db = b.daten[teil] || {};
  const za = a.zeiten?.[teil] || {};
  const zb = b.zeiten?.[teil] || {};
  const daten = {};
  const zeiten = {};
  for (const w of new Set([...Object.keys(da), ...Object.keys(db)])) {
    const ta = Number(za[w]) || 0;
    const tb = Number(zb[w]) || 0;
    const nimmB = !(w in da) || (w in db && tb > ta);
    daten[w] = nimmB ? db[w] : da[w];
    zeiten[w] = Math.max(ta, tb);
  }
  return { daten, zeiten };
}

function listeMischen(a, b, teil, jetzt) {
  const key = LISTEN[teil];
  const la = Array.isArray(a.daten[teil]) ? a.daten[teil] : [];
  const lb = Array.isArray(b.daten[teil]) ? b.daten[teil] : [];
  const ta = zeitVon(a, teil);
  const tb = zeitVon(b, teil);
  const ga = a.entfernt?.[teil] || {};
  const gb = b.entfernt?.[teil] || {};
  const ma = new Map(la.map((x) => [key(x), x]));
  const mb = new Map(lb.map((x) => [key(x), x]));
  const bNeuer = tb > ta;

  // Gegraeber vereinigen, alte vergessen
  const graeber = {};
  for (const [k, t] of [...Object.entries(ga), ...Object.entries(gb)]) {
    if (jetzt - t > GRAB_TAGE * 86400000) continue;
    graeber[k] = Math.max(graeber[k] || 0, t);
  }

  const out = [];
  const reihenfolge = bNeuer ? [...lb, ...la] : [...la, ...lb];
  const gesehen = new Set();
  for (const x of reihenfolge) {
    const k = key(x);
    if (!k || gesehen.has(k)) continue;
    gesehen.add(k);
    const inA = ma.has(k);
    const inB = mb.has(k);
    if (inA && inB) {
      out.push(bNeuer ? mb.get(k) : ma.get(k));
      delete graeber[k];
      continue;
    }
    // Nur auf einer Seite: hat die andere es geloescht, nachdem diese Seite die Liste zuletzt aenderte?
    const eigeneZeit = inA ? ta : tb;
    const grab = (inA ? gb : ga)[k];
    if (grab && grab >= eigeneZeit) continue;
    out.push(inA ? ma.get(k) : mb.get(k));
    delete graeber[k];
  }
  return { daten: out, zeit: Math.max(ta, tb), graeber };
}

function bewertungenMischen(a, b) {
  const da = a.daten.bewertungen || {};
  const db = b.daten.bewertungen || {};
  const bNeuer = zeitVon(b, 'bewertungen') > zeitVon(a, 'bewertungen');
  const out = {};
  for (const id of new Set([...Object.keys(da), ...Object.keys(db)])) {
    const x = da[id];
    const y = db[id];
    if (!x || !y) {
      out[id] = x || y;
      continue;
    }
    const neuer = bNeuer ? y : x;
    out[id] = {
      sterne: neuer.sterne,
      notiz: neuer.notiz,
      gekocht: [...new Set([...(x.gekocht || []), ...(y.gekocht || [])])].sort().slice(-50),
    };
  }
  return out;
}

/**
 * Fuehrt zwei Staende zusammen. Bei Gleichstand gewinnt `a`, der eigene.
 *
 * @param {{daten:object, zeiten:object, entfernt?:object}} a lokal
 * @param {{daten:object, zeiten:object, entfernt?:object}} b entfernt
 * @returns {{daten:object, zeiten:object, entfernt:object}}
 */
export function zusammenfuehren(a, b, { jetzt = Date.now() } = {}) {
  if (!b?.daten) return a;
  const daten = {};
  const zeiten = {};
  const entfernt = {};

  for (const teil of WOCHEN) {
    const m = wochenMischen(a, b, teil);
    daten[teil] = m.daten;
    zeiten[teil] = m.zeiten;
  }
  for (const teil of Object.keys(LISTEN)) {
    const m = listeMischen(a, b, teil, jetzt);
    daten[teil] = m.daten;
    zeiten[teil] = m.zeit;
    entfernt[teil] = m.graeber;
  }
  daten.bewertungen = bewertungenMischen(a, b);
  zeiten.bewertungen = Math.max(zeitVon(a, 'bewertungen'), zeitVon(b, 'bewertungen'));
  daten.planer = zeitVon(b, 'planer') > zeitVon(a, 'planer') ? b.daten.planer : a.daten.planer;
  zeiten.planer = Math.max(zeitVon(a, 'planer'), zeitVon(b, 'planer'));

  return { daten, zeiten, entfernt };
}

/** Sind zwei Staende inhaltlich gleich? Zeiten zaehlen nicht. */
export const gleicheDaten = (a, b) => stabil(a?.daten) === stabil(b?.daten);

/**
 * Prueft eine Datei vom Server. Was nicht passt, wird zu einem leeren
 * Stand; die Daten selbst bereinigt der Aufrufer wie bei einer Sicherung.
 */
export function standAusText(text) {
  let roh;
  try {
    roh = JSON.parse(text);
  } catch {
    throw new Error('Die Datei auf dem Server ist kein gültiges JSON.');
  }
  if (roh?.format !== FORMAT_ABGLEICH || typeof roh.daten !== 'object' || !roh.daten) {
    throw new Error('Die Datei auf dem Server stammt nicht vom Kochbuch.');
  }
  const zeiten = roh.zeiten && typeof roh.zeiten === 'object' ? roh.zeiten : {};
  const entfernt = roh.entfernt && typeof roh.entfernt === 'object' ? roh.entfernt : {};
  return { daten: roh.daten, zeiten, entfernt };
}

export const standAlsText = (stand) => JSON.stringify({ format: FORMAT_ABGLEICH, version: 1, ...stand });
