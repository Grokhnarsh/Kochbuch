/**
 * Sichern, Wiederherstellen und Teilen.
 *
 * Alles liegt im Browser; eine Sicherungsdatei nimmt es mit auf ein
 * anderes Geraet. Fuer eine Datei, die an andere geht, bleiben auf Wunsch
 * draussen: Abschriften aus eigenen Kochbuechern und Rezepte, die von
 * Seiten wie Chefkoch importiert wurden. Die eigene Kopie ist erlaubt,
 * das Weitergeben nicht.
 *
 * Ein Wochenplan laesst sich als Link teilen. Der Link traegt nur Ids
 * aus dem gemeinsamen Korpus; eigene und importierte Rezepte kennt der
 * Empfaenger nicht und sie fehlen deshalb, mit Hinweis.
 *
 * Reine Funktionen: was hereinkommt, wird geprueft und bereinigt, denn
 * eine Datei oder ein Link kann von irgendwem stammen.
 */

import { bereinige } from './rezeptform.js';
import { bereinigeVorrat } from './vorrat.js';
import { bereinigeProfile } from './profile.js';
import { bereinigeBewertungen } from './bewertung.js';
import { bereinigeVorgaben } from './planer.js';

export const FORMAT = 'kochbuch-sicherung';

const WOCHE = /^\d{4}-\d{2}-\d{2}$/;
const SLOT = /^[0-6]:(fruehstueck|mittag|abend|snack)$/;
const ID = /^[\w.:-]{1,200}$/;

/** Ist ein eigenes Rezept die Abschrift aus einem Buch? */
export const istAbschrift = (r) => Boolean(r?.quelle?.titel);

/** Prueft einen gespeicherten Plan: {woche: {slot: {recipeId, servings}}} */
export function bereinigePlaene(roh) {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return {};
  const out = {};
  for (const [woche, eintraege] of Object.entries(roh)) {
    if (!WOCHE.test(woche) || !eintraege || typeof eintraege !== 'object') continue;
    const w = {};
    for (const [slot, e] of Object.entries(eintraege)) {
      if (!SLOT.test(slot) || typeof e?.recipeId !== 'string' || !ID.test(e.recipeId)) continue;
      const servings = Number.isInteger(e.servings) && e.servings > 0 && e.servings <= 400 ? e.servings : 2;
      w[slot] = { recipeId: e.recipeId, servings };
    }
    out[woche] = w;
  }
  return out;
}

/**
 * Baut die Sicherung.
 * @param {object} daten {plan, eigene, importe, vorrat, planer, profile, bewertungen, fotos?}
 * @param {{fuerAndere?:boolean}} [opt]
 */
export function sicherung(daten, { fuerAndere = false } = {}) {
  const eigene = (daten.eigene || []).filter((r) => !(fuerAndere && istAbschrift(r)));
  const weg = new Set((daten.eigene || []).filter((r) => fuerAndere && istAbschrift(r)).map((r) => r.id));
  const fotos = Object.fromEntries(Object.entries(daten.fotos || {}).filter(([id]) => !weg.has(id)));
  return {
    format: FORMAT,
    version: 1,
    erstellt: new Date().toISOString(),
    fuerAndere,
    daten: {
      plan: daten.plan || {},
      eigene,
      importe: fuerAndere ? [] : daten.importe || [],
      vorrat: daten.vorrat || [],
      planer: daten.planer || {},
      profile: daten.profile || [],
      bewertungen: daten.bewertungen || {},
      fotos,
    },
  };
}

/** Ein Foto als data:-Adresse; nur JPEG, PNG und WebP, hoechstens 3 MB */
const FOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * Liest eine Sicherung und bereinigt jeden Teil.
 * @returns {{daten:object, zahlen:object}}
 * @throws {Error} mit lesbarer Meldung, wenn es keine Sicherung ist
 */
export function wiederherstellen(text) {
  let roh;
  try {
    roh = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  if (roh?.format !== FORMAT || typeof roh.daten !== 'object') {
    throw new Error('Das ist keine Sicherung des Kochbuchs.');
  }
  const d = roh.daten;
  const eigene = (Array.isArray(d.eigene) ? d.eigene : []).map((r) => bereinige(r, 'eigene')).filter(Boolean);
  const importe = (Array.isArray(d.importe) ? d.importe : []).filter((r) => typeof r?.id === 'string' && r.id.startsWith('import-'));
  const fotos = Object.fromEntries(Object.entries(d.fotos && typeof d.fotos === 'object' ? d.fotos : {})
    .filter(([id, url]) => ID.test(id) && typeof url === 'string' && url.length < 4e6 && FOTO.test(url)));
  const daten = {
    plan: bereinigePlaene(d.plan),
    eigene,
    importe,
    vorrat: bereinigeVorrat(d.vorrat),
    planer: bereinigeVorgaben(d.planer),
    profile: bereinigeProfile(d.profile),
    bewertungen: bereinigeBewertungen(d.bewertungen),
    fotos,
  };
  return {
    daten,
    zahlen: {
      wochen: Object.values(daten.plan).filter((w) => Object.keys(w).length).length,
      eigene: eigene.length,
      importe: importe.length,
      vorrat: daten.vorrat.length,
      profile: daten.profile.length,
      bewertungen: Object.keys(daten.bewertungen).length,
      fotos: Object.keys(fotos).length,
    },
  };
}

// ------------------------------------------------------------- Link

const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ausB64url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

/** Kann ein Empfaenger dieses Rezept kennen? */
export const istGemeinsam = (id) => !/^(eigen|import)-/.test(id);

/**
 * Wochenplan als Teil einer Adresse: "#plan=…"
 * @returns {{hash:string, ausgelassen:number}}
 */
export function planLink(woche, eintraege) {
  const e = Object.entries(eintraege)
    .filter(([slot, x]) => SLOT.test(slot) && istGemeinsam(x.recipeId))
    .map(([slot, x]) => [slot, x.recipeId, x.servings]);
  return {
    hash: `#plan=${b64url(JSON.stringify({ w: woche, e }))}`,
    ausgelassen: Object.keys(eintraege).length - e.length,
  };
}

/**
 * Liest einen geteilten Plan aus der Adresse.
 * @returns {{woche:string, eintraege:object}|null}
 */
export function ausLink(hash) {
  const m = String(hash || '').match(/^#plan=([A-Za-z0-9_-]{1,8000})$/);
  if (!m) return null;
  try {
    const roh = JSON.parse(ausB64url(m[1]));
    if (!WOCHE.test(roh?.w) || !Array.isArray(roh.e)) return null;
    const eintraege = {};
    for (const x of roh.e.slice(0, 28)) {
      if (!Array.isArray(x)) continue;
      const [slot, recipeId, servings] = x;
      if (!SLOT.test(slot) || typeof recipeId !== 'string' || !ID.test(recipeId) || !istGemeinsam(recipeId)) continue;
      eintraege[slot] = { recipeId, servings: Number.isInteger(servings) && servings > 0 && servings <= 400 ? servings : 2 };
    }
    return { woche: roh.w, eintraege };
  } catch {
    return null;
  }
}
