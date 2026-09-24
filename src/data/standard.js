/**
 * Wie aus einer Zeile einer Buchdatei ein vollstaendiges Rohrezept wird.
 *
 * Gemeinsam genutzt von der App (data/index.js), dem Import-Werkzeug
 * (scripts/korpus/) und den Tests. Liefe das an zwei Stellen getrennt,
 * rechnete das Werkzeug die Zusammenfassung womoeglich aus anderen
 * Zutaten als die App — und niemand merkte es.
 */

/**
 * Felder, die ein Rezept weglassen darf. Die grossen Sammlungen sparen
 * sich so je Rezept die immer gleichen Angaben; was ein ganzes Buch
 * gemeinsam hat, steht in dessen "vorgaben".
 */
export const STANDARD = Object.freeze({
  chapter: '',
  cuisine: '',
  diet: Object.freeze([]),
  tags: Object.freeze([]),
  servings: 4,
  yieldUnit: null,
  prep: 0,
  cook: 0,
  difficulty: 2,
  kcal: 0,
});

/**
 * @param {object} roh Rezept, wie es in der Buchdatei steht
 * @param {{vorgaben?:object, art?:string}} [buch]
 * @returns {{raw:object, z:object|undefined, seite:string|undefined, lesetext:boolean}}
 */
export function mitVorgaben(roh, buch = {}) {
  const { z, seite, ...eigen } = roh;
  const raw = { ...STANDARD, ...buch.vorgaben, ...eigen };
  // Historische Texte im Wortlaut: die Zutaten sind aus dem Fliesstext
  // erschlossen. Lesen und nachkochen ja, Woche fuellen und Naehrwerte nein.
  const lesetext = Boolean(raw.lesetext ?? buch.art === 'originaltext');
  return { raw, z, seite, lesetext };
}

/** Zutaten von der knappen Dateiform {a,u,n} in die der App. */
export const zutatenAusDatei = (liste) => liste.map((i) => ({
  amount: i.a ?? null,
  unit: i.u ?? '',
  name: i.n,
}));

/** Was die Rechnung von einem Rezept braucht — nicht mehr und nicht weniger. */
export const rechenGrundlage = (raw, ingredients, lesetext) => ({
  ingredients,
  servings: raw.servings,
  yieldUnit: raw.yieldUnit,
  category: raw.category,
  lesetext,
});

/**
 * Adresse einer Wikiseite aus dem Seitennamen, so geschrieben wie
 * MediaWiki selbst: Unterstrich statt Leerzeichen, Schraegstrich und
 * Doppelpunkt bleiben stehen (ein kodierter Schraegstrich fuehrt auf
 * manchen Servern ins Leere).
 */
export const seitenAdresse = (basis, seite) => basis
  + encodeURIComponent(seite.replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':');
