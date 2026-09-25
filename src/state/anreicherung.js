/**
 * Allergene, Naehrwerte und Bewertung eines Rezepts — einmal gerechnet.
 *
 * Bei ein paar hundert Rezepten rechnete die App das beim Start selbst.
 * Bei zehntausend waeren das Sekunden, auf dem Handy mehr. Deshalb
 * rechnet das Import-Werkzeug beim Bauen und legt eine knappe
 * Zusammenfassung je Rezept ab: welche Allergene, die Naehrwerte je
 * Portion und je 100 g, die Punktzahl. Das reicht fuer Karten, Filter,
 * Wochensummen und Vorschlaege. Wer ein Rezept oeffnet, bekommt die
 * volle Rechnung — mit Gruenden, Hinweisen und nicht zugeordneten
 * Zutaten — fuer genau dieses eine, im Moment des Oeffnens.
 *
 * Beide Wege laufen durch berechne(): so kann die Zusammenfassung nie
 * etwas anderes sagen als die volle Rechnung, und ein Test prueft das.
 */

import { allergensForRecipe, allergenById } from './allergens.js';
import { bewerte, stufeFuer } from './gesundheit.js';
import { NAEHRSTOFFE } from './naehrwerte.js';

const ARTEN = ['portion', 'stueck', 'masse'];
const BEZUG = { portion: 'je Portion', stueck: 'je Stück', masse: 'je 100 g' };
const VERTRAUEN = ['gut', 'mittel', 'gering'];

export const HINWEIS_LESETEXT =
  'Zutaten aus dem Originaltext erschlossen; daraus lassen sich keine belastbaren Nährwerte rechnen';

/**
 * Die volle Rechnung.
 *
 * @param {{ingredients:{amount:number|null, unit:string, name:string}[],
 *          servings?:number, yieldUnit?:string|null, category?:string,
 *          lesetext?:boolean}} rezept
 * @param {{fuerRezept:Function}} rechner
 */
export function berechne(rezept, rechner) {
  const allergens = allergensForRecipe({ ingredients: rezept.ingredients });
  let naehrwerte = rechner.fuerRezept(rezept);

  // Ein historischer Text nennt nicht jede Zutat und selten jede Menge.
  // Aus einer erschlossenen, unvollstaendigen Liste Kalorien zu rechnen,
  // hiesse Genauigkeit vorzutaeuschen.
  if (rezept.lesetext) {
    naehrwerte = { ...naehrwerte, vertrauen: 'gering', hinweise: [...naehrwerte.hinweise, HINWEIS_LESETEXT] };
  }

  return { allergens, naehrwerte, gesundheit: bewerte({ naehrwerte }) };
}

const runde = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

/** Die knappe Form fuer die Rezeptdateien. */
export function kompakt({ allergens, naehrwerte, gesundheit }) {
  const v = VERTRAUEN.indexOf(naehrwerte.vertrauen);
  return {
    al: allergens.map((a) => `${a.id}${a.level === 'ja' ? '' : '?'}`).join(','),
    nw: v === 2
      ? { v }
      : {
        v,
        a: ARTEN.indexOf(naehrwerte.art),
        d: runde(naehrwerte.abdeckung),
        ...(naehrwerte.fettUngewiss ? { f: 1 } : {}),
        p: NAEHRSTOFFE.map((n) => runde(naehrwerte.jePortion[n.id])),
        h: naehrwerte.je100g ? NAEHRSTOFFE.map((n) => runde(naehrwerte.je100g[n.id])) : null,
      },
    ...(gesundheit ? { gp: gesundheit.punkte } : {}),
  };
}

const alsObjekt = (werte) => (werte ? Object.fromEntries(NAEHRSTOFFE.map((n, i) => [n.id, werte[i]])) : null);

/**
 * Macht aus der knappen Form wieder Objekte in der Gestalt der vollen
 * Rechnung. Was nur die volle Rechnung weiss — Posten, Gruende, Hinweise
 * —, bleibt leer und ist mit `zusammenfassung: true` markiert.
 */
export function ausKompakt(z) {
  const allergens = String(z.al || '')
    .split(',')
    .filter(Boolean)
    .map((eintrag) => {
      const moeglich = eintrag.endsWith('?');
      const a = allergenById.get(moeglich ? eintrag.slice(0, -1) : eintrag);
      return a && { ...a, level: moeglich ? 'moeglich' : 'ja', quellen: [] };
    })
    .filter(Boolean);

  const nw = z.nw || { v: 2 };
  const art = ARTEN[nw.a] || 'portion';
  const naehrwerte = {
    zusammenfassung: true,
    vertrauen: VERTRAUEN[nw.v] || 'gering',
    art,
    bezug: BEZUG[art],
    abdeckung: nw.d ?? 0,
    fettUngewiss: Boolean(nw.f),
    jePortion: alsObjekt(nw.p) || Object.fromEntries(NAEHRSTOFFE.map((n) => [n.id, 0])),
    je100g: alsObjekt(nw.h),
    posten: [],
    unbekannt: [],
    ohneMenge: [],
    hinweise: [],
  };

  const gesundheit = z.gp == null
    ? null
    : { zusammenfassung: true, punkte: z.gp, stufe: stufeFuer(z.gp), gruende: [] };

  return { allergens, naehrwerte, gesundheit };
}
