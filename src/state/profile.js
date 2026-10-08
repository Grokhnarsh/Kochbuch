/**
 * Haushaltsprofile: wer mitisst, was er nicht vertraegt und was er nicht
 * mag. Ein Rezept wird markiert, wenn es fuer jemanden nicht passt, und
 * "Woche füllen" beruecksichtigt auf Wunsch alle, die gerade mitessen.
 *
 * Allergene kommen aus der Erkennung in allergens.js und tragen deren
 * Vorbehalt: "kann enthalten" zaehlt wie enthalten, und die Packung bleibt
 * massgeblich.
 */

import { ALLERGENS } from './allergens.js';
import { vorratsName, deckt } from './vorrat.js';

const ERNAEHRUNG = ['vegetarisch', 'vegan', 'glutenfrei', 'laktosefrei', 'pescetarisch'];
const ALLERGEN_IDS = new Set(ALLERGENS.map((a) => a.id));

/**
 * Was eine Ernaehrungsform alles erfuellt: Vegan ist auch vegetarisch,
 * vegetarisch auch pescetarisch.
 */
const ERFUELLT_DURCH = {
  vegetarisch: ['vegetarisch', 'vegan'],
  pescetarisch: ['pescetarisch', 'vegetarisch', 'vegan'],
  vegan: ['vegan'],
  glutenfrei: ['glutenfrei'],
  laktosefrei: ['laktosefrei', 'vegan'],
};

/** Erfuellt ein Rezept eine Ernaehrungsform? */
export function erfuellt(recipe, form) {
  if (!form) return true;
  const diet = recipe?.diet || [];
  return (ERFUELLT_DURCH[form] || [form]).some((d) => diet.includes(d));
}

/** Nur bekannte Felder, Namen gekuerzt, jede Person einmal. */
export function bereinigeProfile(liste) {
  if (!Array.isArray(liste)) return [];
  const ids = new Set();
  const out = [];
  for (const p of liste) {
    const name = typeof p?.name === 'string' ? p.name.trim().slice(0, 40) : '';
    if (!name) continue;
    let id = typeof p.id === 'string' && /^[a-z0-9-]{1,40}$/.test(p.id) ? p.id : `p-${out.length + 1}`;
    while (ids.has(id)) id = `${id}-x`;
    ids.add(id);
    out.push({
      id,
      name,
      aktiv: p.aktiv !== false,
      ernaehrung: (Array.isArray(p.ernaehrung) ? p.ernaehrung : [p.ernaehrung]).filter((e) => ERNAEHRUNG.includes(e)),
      allergene: (Array.isArray(p.allergene) ? p.allergene : []).filter((a) => ALLERGEN_IDS.has(a)),
      meidet: (Array.isArray(p.meidet) ? p.meidet : [])
        .map((m) => String(m).trim().slice(0, 40)).filter(Boolean).slice(0, 30),
    });
  }
  return out;
}

/**
 * Was spricht fuer diese Person gegen das Rezept?
 * @returns {string[]} Gruende, leer wenn es passt
 */
export function gruendeGegen(recipe, profil) {
  const gruende = [];
  for (const form of profil.ernaehrung) {
    if (!erfuellt(recipe, form)) gruende.push(`nicht ${form}`);
  }
  for (const a of recipe.allergens || []) {
    if (!profil.allergene.includes(a.id)) continue;
    const info = ALLERGENS.find((x) => x.id === a.id);
    gruende.push(a.level === 'ja' ? `enthält ${info.short}` : `kann ${info.short} enthalten`);
  }
  const meidet = profil.meidet.map(vorratsName);
  for (const i of recipe.ingredients || []) {
    const n = vorratsName(i.name);
    const treffer = profil.meidet.find((_, k) => deckt(meidet[k], n));
    if (treffer && !gruende.includes(`mag kein ${treffer}`)) gruende.push(`mag kein ${treffer}`);
  }
  return gruende;
}

/**
 * Wer am Tisch kann das Rezept nicht essen, und warum?
 * @returns {{name:string, gruende:string[]}[]}
 */
export function konflikte(recipe, profile) {
  return profile
    .filter((p) => p.aktiv)
    .map((p) => ({ name: p.name, gruende: gruendeGegen(recipe, p) }))
    .filter((k) => k.gruende.length);
}

/**
 * Die Vorgaben, die sich aus allen aktiven Profilen ergeben, fuer "Woche füllen".
 * @returns {{ohneAllergene:string[], ernaehrungen:string[], meidet:string[], personen:number}}
 */
export function haushaltsVorgaben(profile) {
  const aktiv = profile.filter((p) => p.aktiv);
  return {
    ohneAllergene: [...new Set(aktiv.flatMap((p) => p.allergene))],
    ernaehrungen: [...new Set(aktiv.flatMap((p) => p.ernaehrung))],
    meidet: [...new Set(aktiv.flatMap((p) => p.meidet))],
    personen: aktiv.length,
  };
}

/**
 * Vorgaben fuer "Woche füllen" um den Haushalt ergaenzt, wenn er gefragt
 * ist. Ohne eigene Personenzahl kocht der Plan fuer alle, die mitessen.
 */
export function mitHaushalt(vorgaben, profile) {
  if (!vorgaben.haushalt || !profile.some((p) => p.aktiv)) return vorgaben;
  const h = haushaltsVorgaben(profile);
  return {
    ...vorgaben,
    ohneAllergene: [...new Set([...(vorgaben.ohneAllergene || []), ...h.ohneAllergene])],
    ernaehrungen: h.ernaehrungen,
    meidet: h.meidet,
    personen: vorgaben.personen || h.personen,
  };
}
