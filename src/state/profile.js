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

/**
 * Richtwerte je Altersgruppe nach den Referenzwerten der DGE fuer
 * geringe koerperliche Aktivitaet (PAL 1,4), gerundet. `faktor` ist der
 * Anteil einer Erwachsenenportion: Ein Kindergartenkind isst etwa eine
 * halbe. Richtwerte fuer Gesunde, keine Ernaehrungsberatung.
 */
export const VORLAGEN = [
  { id: 'kind-4', name: 'Kind, 4–6 Jahre', kcal: 1400, eiweiss: 18, faktor: 0.5 },
  { id: 'kind-7', name: 'Kind, 7–9 Jahre', kcal: 1600, eiweiss: 24, faktor: 0.75 },
  { id: 'kind-10', name: 'Kind, 10–12 Jahre', kcal: 1800, eiweiss: 34, faktor: 0.75 },
  { id: 'jugend', name: 'Jugendliche, 13–18 Jahre', kcal: 2200, eiweiss: 52, faktor: 1 },
  { id: 'frau', name: 'Frau, 19–64 Jahre', kcal: 1900, eiweiss: 48, faktor: 1 },
  { id: 'mann', name: 'Mann, 19–64 Jahre', kcal: 2400, eiweiss: 57, faktor: 1 },
  { id: 'frau-65', name: 'Frau, ab 65 Jahre', kcal: 1700, eiweiss: 50, faktor: 1 },
  { id: 'mann-65', name: 'Mann, ab 65 Jahre', kcal: 2100, eiweiss: 60, faktor: 1 },
];

export const HINWEIS_ZIELE = 'Richtwerte der DGE für Gesunde bei wenig Bewegung, gerundet. '
  + 'Keine Ernährungsberatung; bei Krankheit, Schwangerschaft oder Sport gelten andere Werte.';

const zahlIn = (x, min, max) => (Number.isFinite(Number(x)) && Number(x) >= min && Number(x) <= max ? Number(x) : null);
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
      // Anteil einer Erwachsenenportion und Tagesziele, alle freiwillig
      faktor: zahlIn(p.faktor, 0.25, 2) ?? 1,
      kcal: zahlIn(p.kcal, 500, 5000),
      eiweiss: zahlIn(p.eiweiss, 5, 300),
      vorlage: VORLAGEN.some((v) => v.id === p.vorlage) ? p.vorlage : '',
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
    personen: portionenFuer(aktiv),
  };
}

/**
 * Portionen fuer alle, die mitessen: zwei Erwachsene und ein kleines Kind
 * sind zweieinhalb, gekocht wird fuer drei.
 */
export function portionenFuer(profile) {
  const summe = profile.reduce((a, p) => a + (p.faktor ?? 1), 0);
  return summe > 0 ? Math.ceil(summe - 1e-9) : 0;
}

/**
 * Wie weit der Plan die Tagesziele jeder Person deckt.
 *
 * Gerechnet ueber die Tage, an denen etwas mit Naehrwerten geplant ist;
 * jede Person isst ihren Anteil einer Portion. Was nicht im Plan steht
 * (das Brot zum Abend, der Apfel), fehlt natuerlich.
 *
 * @param {{werte:object, mahlzeiten:number, belastbar:number}[]} tage aus store.naehrwerteProTag()
 * @param {object[]} profile
 * @returns {{name:string, faktor:number, tage:number, kcal:object|null, eiweiss:object|null}[]}
 */
export function zieleWoche(tage, profile) {
  const geplant = tage.filter((t) => t.belastbar > 0);
  const schnitt = (id) => (geplant.length ? geplant.reduce((a, t) => a + (t.werte[id] || 0), 0) / geplant.length : 0);
  const kcal = schnitt('kcal');
  const eiweiss = schnitt('eiweiss');
  return profile
    .filter((p) => p.aktiv && (p.kcal || p.eiweiss))
    .map((p) => {
      const f = p.faktor ?? 1;
      const wert = (ist, ziel) => (ziel ? { ist: Math.round(ist * f), ziel, anteil: (ist * f) / ziel } : null);
      return { name: p.name, faktor: f, tage: geplant.length, kcal: wert(kcal, p.kcal), eiweiss: wert(eiweiss, p.eiweiss) };
    });
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
