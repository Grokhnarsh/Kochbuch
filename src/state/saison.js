/**
 * Saisonkalender fuer Obst und Gemuese aus Deutschland: Freiland und
 * Lagerware aus heimischem Anbau, Monate 1–12. Gewaechshaus und Import
 * gibt es fast immer; gemeint ist, wann es hier waechst oder aus dem
 * Lager kommt — dann ist es reif, guenstig und hat kurze Wege.
 *
 * Die Angaben folgen den ueblichen Saisonkalendern (etwa des
 * Bundeszentrums fuer Ernaehrung) und sind auf ganze Monate gerundet.
 * Was ganzjaehrig aus dem Lager kommt (Kartoffeln, Zwiebeln, Moehren,
 * Aepfel), zaehlt nicht als Saisonzutat: es sagt ueber ein Rezept nichts.
 */

import { compile } from './matcher.js';

const SPANNE = (von, bis) => {
  const out = [];
  for (let m = von; ; m = (m % 12) + 1) {
    out.push(m);
    if (m === bis) return out;
  }
};

/** [Name, Monate, Stichwoerter] */
const KALENDER = [
  ['Spargel', SPANNE(4, 6), ['spargel']],
  ['Bärlauch', SPANNE(3, 5), ['bärlauch']],
  ['Rhabarber', SPANNE(4, 6), ['rhabarber']],
  ['Radieschen', SPANNE(4, 9), ['radieschen']],
  ['Erdbeeren', SPANNE(5, 7), ['erdbeer']],
  ['Kirschen', SPANNE(6, 8), ['kirsche', 'kirschen']],
  ['Stachelbeeren', SPANNE(6, 7), ['stachelbeer']],
  ['Johannisbeeren', SPANNE(6, 8), ['johannisbeer']],
  ['Himbeeren', SPANNE(6, 9), ['himbeer']],
  ['Heidelbeeren', SPANNE(7, 9), ['heidelbeer', 'blaubeer']],
  ['Brombeeren', SPANNE(7, 9), ['brombeer']],
  ['Aprikosen', SPANNE(7, 8), ['aprikose', 'marille']],
  ['Pfirsiche', SPANNE(7, 9), ['pfirsich']],
  ['Zwetschgen', SPANNE(7, 10), ['zwetschge', 'zwetschke', 'pflaume']],
  ['Birnen', SPANNE(8, 11), ['birne']],
  ['Quitten', SPANNE(9, 11), ['quitte']],
  ['Holunder', SPANNE(8, 9), ['holunder']],
  ['Trauben', SPANNE(9, 10), ['trauben', 'weintrauben']],
  ['Erbsen', SPANNE(6, 8), ['=erbsen', 'zuckerschoten']],
  ['Grüne Bohnen', SPANNE(7, 9), ['grüne bohnen', 'brechbohnen', 'stangenbohnen', 'buschbohnen']],
  ['Gurken', SPANNE(6, 9), ['=gurke', '=gurken', 'salatgurke', 'schlangengurke']],
  ['Zucchini', SPANNE(6, 9), ['zucchini']],
  ['Tomaten', SPANNE(7, 9), ['=tomate', '=tomaten', 'kirschtomaten', 'cocktailtomaten', 'fleischtomaten']],
  ['Paprika', SPANNE(7, 9), ['=paprika', 'paprikaschote']],
  ['Auberginen', SPANNE(7, 9), ['aubergine']],
  ['Mais', SPANNE(8, 9), ['maiskolben']],
  ['Blumenkohl', SPANNE(6, 10), ['blumenkohl']],
  ['Brokkoli', SPANNE(6, 10), ['brokkoli', 'broccoli']],
  ['Kohlrabi', SPANNE(5, 10), ['kohlrabi']],
  ['Fenchel', SPANNE(6, 10), ['fenchel']],
  ['Mangold', SPANNE(6, 10), ['mangold']],
  ['Kopfsalat', SPANNE(5, 10), ['kopfsalat', 'eisbergsalat', 'römersalat', 'lollo']],
  ['Spinat', [3, 4, 5, 9, 10, 11], ['spinat']],
  ['Pfifferlinge', SPANNE(7, 9), ['pfifferling']],
  ['Steinpilze', SPANNE(8, 10), ['steinpilz']],
  ['Kürbis', SPANNE(8, 11), ['kürbis']],
  ['Rote Bete', SPANNE(8, 3), ['rote bete', 'rote beete', 'rote rübe', 'randen']],
  ['Lauch', SPANNE(8, 3), ['lauch', 'porree']],
  ['Knollensellerie', SPANNE(9, 3), ['knollensellerie', 'sellerieknolle']],
  ['Rotkohl', SPANNE(9, 3), ['rotkohl', 'blaukraut', 'rotkraut']],
  ['Wirsing', SPANNE(9, 3), ['wirsing']],
  ['Rosenkohl', SPANNE(10, 2), ['rosenkohl']],
  ['Grünkohl', SPANNE(11, 2), ['grünkohl']],
  ['Feldsalat', SPANNE(10, 3), ['feldsalat', 'rapunzel']],
  ['Chicorée', SPANNE(10, 3), ['chicorée', 'chicoree']],
  ['Pastinaken', SPANNE(10, 3), ['pastinake']],
  ['Schwarzwurzeln', SPANNE(10, 3), ['schwarzwurzel']],
  ['Steckrüben', SPANNE(10, 3), ['steckrübe', 'kohlrübe']],
  ['Topinambur', SPANNE(10, 3), ['topinambur']],
  ['Maronen', SPANNE(10, 12), ['marone', 'esskastanie']],
];

export const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
  'September', 'Oktober', 'November', 'Dezember'];

const REGELN = compile(KALENDER.map(([name, , woerter]) => [name, woerter]));
const MONATE_JE = new Map(KALENDER.map(([name, monate]) => [name, new Set(monate)]));

/** Haltbar Gemachtes kennt keine Saison: Erdbeermarmelade gibt es im Dezember. */
const HALTBAR = /marmelade|konfitüre|gelee|saft|sirup|getrocknet|dörr|backpflaume|dose|glas|tiefgekühlt|\btk\b|eingemacht|eingelegt|kompott|mark\b|pulver|chips/;

const cache = new Map();
/** Welche Saisonzutat steckt in diesem Namen? */
export function saisonZutat(name) {
  const n = String(name ?? '').toLowerCase();
  if (!cache.has(n)) cache.set(n, HALTBAR.test(n) ? null : REGELN.find((r) => r.trifft(n))?.value ?? null);
  return cache.get(n);
}

/** Was in einem Monat Saison hat, nach Name sortiert. */
export function imMonat(monat) {
  return KALENDER.filter(([, monate]) => monate.includes(monat)).map(([name]) => name);
}

/** Wann eine Saisonzutat zu haben ist, als Text: "Juni bis September" */
export function zeitraum(name) {
  const m = KALENDER.find(([n]) => n === name)?.[1];
  if (!m) return '';
  return m.length === 1 ? MONATE[m[0] - 1] : `${MONATE[m[0] - 1]} bis ${MONATE[m[m.length - 1] - 1]}`;
}

/**
 * Saisonzutaten eines Rezepts im gegebenen Monat.
 * @returns {{passend:string[], ausser:string[], saisonal:boolean}}
 *          saisonal, wenn mindestens eine Zutat Saison hat und keine
 *          ausserhalb ihrer Saison liegt
 */
export function saisonFuer(recipe, monat) {
  const passend = new Set();
  const ausser = new Set();
  for (const i of recipe?.ingredients || []) {
    const z = saisonZutat(i.name);
    if (!z) continue;
    (MONATE_JE.get(z).has(monat) ? passend : ausser).add(z);
  }
  return { passend: [...passend], ausser: [...ausser], saisonal: passend.size > 0 && ausser.size === 0 };
}
