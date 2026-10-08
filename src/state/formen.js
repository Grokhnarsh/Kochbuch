/**
 * Backformen umrechnen und Tassen in Gramm.
 *
 * Ein Rezept fuer die 26er Springform passt in eine 20er nur zu knapp
 * sechs Zehnteln: gerechnet wird ueber die Grundflaeche, bei gleicher
 * Fuellhoehe. Die Backzeit aendert sich weniger als die Menge; darauf
 * weist die Oberflaeche hin.
 *
 * Tassen und Cups sind Raummasse. Fuer Fluessiges werden sie Milliliter,
 * fuer alles andere Gramm, ueber die Dichte aus der Naehrwerttabelle:
 * eine Tasse Mehl wiegt etwa 80 g, eine Tasse Zucker 125 g.
 *
 * Reine Funktionen.
 */

import { TASSE_ML, CUP_ML } from './naehrwerte.js';
import { roundAmount, formatNumber } from './units.js';

const flaecheRund = (d) => Math.PI * (d / 2) ** 2;

/** Formen zur Auswahl, mit Grundflaeche in cm² */
export const FORMEN = [
  ...[18, 20, 22, 24, 26, 28, 30].map((d) => ({ id: `rund-${d}`, name: `Springform ${d} cm`, flaeche: flaecheRund(d) })),
  { id: 'kasten-25', name: 'Kastenform 25 cm', flaeche: 25 * 11 },
  { id: 'kasten-30', name: 'Kastenform 30 cm', flaeche: 30 * 11 },
  { id: 'eckig-20x30', name: 'Eckige Form 20 × 30 cm', flaeche: 20 * 30 },
  { id: 'eckig-24x24', name: 'Quadratische Form 24 cm', flaeche: 24 * 24 },
  { id: 'blech', name: 'Backblech (ca. 30 × 40 cm)', flaeche: 30 * 40 },
  { id: 'muffin-12', name: 'Muffinblech, 12 Mulden', flaeche: 12 * flaecheRund(7) },
];

const RUND = '(?:spring|torten|tarte|quiche|pie|kuchen|obstboden|ring|auflauf)?form|tortenring|backring';

/**
 * Welche Form nennt das Rezept? Gesucht wird in Zutaten, Schritten und der
 * Ertragsangabe: "Springform (Ø 26 cm)", "eine 24er Springform",
 * "Kastenform 30 cm", "ein Backblech", "Form 20 x 30 cm".
 *
 * @returns {{id:string|null, name:string, flaeche:number}|null}
 */
export function formIn(recipe) {
  const text = [
    recipe.yieldUnit || '',
    ...(recipe.ingredients || []).map((i) => i.name),
    ...(recipe.steps || []),
  ].join(' \n ').toLowerCase();

  const eckig = text.match(/(\d{2})\s*(?:cm)?\s*[x×]\s*(\d{2})\s*cm/);
  if (eckig && /form|blech/.test(text)) {
    const [a, b] = [Number(eckig[1]), Number(eckig[2])];
    return { id: null, name: `Form ${a} × ${b} cm`, flaeche: a * b };
  }
  const kasten = text.match(/kastenform[^.\n]{0,25}?(\d{2})\s*cm|(\d{2})\s*(?:cm|er)[- ]?kastenform/);
  if (kasten) {
    const l = Number(kasten[1] || kasten[2]);
    if (l >= 15 && l <= 40) return { id: [25, 30].includes(l) ? `kasten-${l}` : null, name: `Kastenform ${l} cm`, flaeche: l * 11 };
  }
  const rund = text.match(new RegExp(`(?:${RUND})[^.\\n]{0,25}?(?:ø|Ø|durchmesser)?\\s*(\\d{2})\\s*cm|(\\d{2})\\s*(?:cm|er)[- ]?(?:${RUND})`));
  if (rund) {
    const d = Number(rund[1] || rund[2]);
    if (d >= 14 && d <= 34) return { id: `rund-${d}`, name: `Springform ${d} cm`, flaeche: flaecheRund(d) };
  }
  if (/kastenform/.test(text)) return { id: 'kasten-30', name: 'Kastenform 30 cm', flaeche: 30 * 11 };
  if (/\b(back)?blech\b/.test(text) && !/muffin/.test(text)) return { id: 'blech', name: 'Backblech (ca. 30 × 40 cm)', flaeche: 30 * 40 };
  if (/springform/.test(text)) return { id: 'rund-26', name: 'Springform 26 cm', flaeche: flaecheRund(26), angenommen: true };
  return null;
}

/** Wie viel Teig die Zielform braucht, im Verhaeltnis */
export function formFaktor(von, nach) {
  if (!von?.flaeche || !nach?.flaeche) return 1;
  return nach.flaeche / von.flaeche;
}

/** Ein Hinweis zur Backzeit, je nachdem, wie sehr sich die Form aendert */
export function backzeitHinweis(faktor) {
  if (Math.abs(faktor - 1) < 0.08) return '';
  return faktor < 1
    ? 'Kleinere Form: Bei gleicher Füllhöhe etwa gleich lange backen, etwas früher die Stäbchenprobe machen.'
    : 'Größere Form: Bei gleicher Füllhöhe etwa gleich lange backen; ist der Teig höher, länger und etwas kühler backen.';
}

// ------------------------------------------------------- Tassen, Cups

/** Lebensmittel der Naehrwerttabelle, die man misst statt wiegt */
const FLUESSIG = new Set([
  'wasser', 'milch', 'fettarme_milch', 'buttermilch', 'sahne', 'kondensmilch', 'kondensmilch_ungezuckert',
  'olivenoel', 'rapsoel', 'frittieroel', 'erdnussoel', 'sesamoel', 'walnussoel',
  'gemuesebruehe', 'fleischbruehe', 'huehnerbruehe', 'fischfond', 'weisswein', 'rotwein', 'bier', 'spirituosen',
  'kaffee', 'zitronensaft', 'limettensaft', 'orangensaft', 'apfelsaft', 'essig', 'weinessig', 'apfelessig',
  'balsamico', 'sojasauce', 'sojamilch', 'mandeldrink', 'reisdrink', 'kokosmilch', 'pflanzensahne', 'kokossahne',
]);

const RAUM = { Tasse: TASSE_ML, Cup: CUP_ML };

/**
 * Rechnet eine Tassen- oder Cup-Angabe in Gramm oder Milliliter um.
 *
 * @param {{name:string, amount:number|null, unit:string}} zutat
 * @param {{zuordnen:(name:string)=>object|null, gramm:Function}} rechner Naehrwertrechner
 * @returns {{amount:number, unit:string, von:string}|null} null, wenn nichts umzurechnen ist
 */
export function inMetrisch(zutat, rechner) {
  const ml = RAUM[zutat.unit];
  if (!ml || !(zutat.amount > 0)) return null;
  const e = rechner?.zuordnen(zutat.name);
  const von = `${formatNumber(zutat.amount)} ${zutat.unit === 'Cup' ? 'Cup' : zutat.amount === 1 ? 'Tasse' : 'Tassen'}`;
  if (!e || FLUESSIG.has(e.id) || e.dichte == null) {
    return { amount: roundAmount(zutat.amount * ml), unit: 'ml', von };
  }
  const g = rechner.gramm(zutat.amount, zutat.unit, { ...e, verzehr: 1 });
  if (g == null) return null;
  // Auf 5 g gerundet: eine Tasse ist kein Laborgeraet
  return { amount: g >= 20 ? Math.round(g / 5) * 5 : Math.round(g), unit: 'g', von };
}
