/**
 * Sammlungen: eigene Ordner fuer Rezepte, etwa "Weihnachten",
 * "Kindergeburtstag" oder "Schnell unter der Woche". Ein Rezept kann in
 * mehreren liegen. Eine Sammlung laesst sich als Link teilen; der Link
 * traegt nur Rezepte, die der Empfaenger auch hat.
 *
 * Reine Funktionen.
 */

import { istGemeinsam } from './teilen.js';

const ID = /^[\w.:-]{1,200}$/;

/** Nur bekannte Felder; Namen gekuerzt, jede Sammlung und jedes Rezept einmal. */
export function bereinigeSammlungen(liste) {
  if (!Array.isArray(liste)) return [];
  const ids = new Set();
  const out = [];
  for (const s of liste) {
    const name = typeof s?.name === 'string' ? s.name.trim().slice(0, 60) : '';
    if (!name) continue;
    let id = typeof s.id === 'string' && /^[a-z0-9-]{1,40}$/.test(s.id) ? s.id : `s-${out.length + 1}`;
    while (ids.has(id)) id = `${id}-x`;
    ids.add(id);
    const rezepte = [...new Set((Array.isArray(s.rezepte) ? s.rezepte : []).filter((r) => typeof r === 'string' && ID.test(r)))]
      .slice(0, 500);
    out.push({ id, name, rezepte });
  }
  return out.slice(0, 100);
}

export const neueSammlung = (name, jetzt = Date.now()) => ({ id: `s-${jetzt.toString(36)}`, name: String(name).trim().slice(0, 60), rezepte: [] });

/** Legt ein Rezept in eine Sammlung oder nimmt es heraus */
export function umschalten(sammlungen, sammlungId, rezeptId) {
  return sammlungen.map((s) => {
    if (s.id !== sammlungId) return s;
    const drin = s.rezepte.includes(rezeptId);
    return { ...s, rezepte: drin ? s.rezepte.filter((r) => r !== rezeptId) : [...s.rezepte, rezeptId] };
  });
}

/** In welchen Sammlungen liegt ein Rezept? */
export const sammlungenMit = (sammlungen, rezeptId) => sammlungen.filter((s) => s.rezepte.includes(rezeptId));

// ------------------------------------------------------------- Link

const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ausB64url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

/**
 * Eine Sammlung als Teil einer Adresse: "#sammlung=…"
 * @returns {{hash:string, ausgelassen:number}}
 */
export function sammlungsLink(sammlung) {
  const rezepte = sammlung.rezepte.filter(istGemeinsam);
  return {
    hash: `#sammlung=${b64url(JSON.stringify({ n: sammlung.name, r: rezepte }))}`,
    ausgelassen: sammlung.rezepte.length - rezepte.length,
  };
}

/** @returns {{name:string, rezepte:string[]}|null} */
export function sammlungAusLink(hash) {
  const m = String(hash || '').match(/^#sammlung=([A-Za-z0-9_-]{1,20000})$/);
  if (!m) return null;
  try {
    const roh = JSON.parse(ausB64url(m[1]));
    const [s] = bereinigeSammlungen([{ name: roh?.n, rezepte: Array.isArray(roh?.r) ? roh.r.filter(istGemeinsam) : [] }]);
    return s ? { name: s.name, rezepte: s.rezepte } : null;
  } catch {
    return null;
  }
}
