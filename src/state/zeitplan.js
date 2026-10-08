/**
 * Zeitplan fuer ein Menue: Wann muss was beginnen, damit alles zur
 * selben Zeit fertig ist?
 *
 * Gerechnet wird rueckwaerts vom Essen. Jeder Arbeitsschritt bekommt
 * eine Dauer: die Zeit, die im Schritt steht ("30 Minuten backen"), sonst
 * seinen Anteil an der Gesamtzeit des Rezepts, die nicht schon in den
 * genannten Zeiten steckt. Wer Backofen oder Temperatur nennt, bekommt
 * eine Viertelstunde vorher "Ofen vorheizen" dazu.
 *
 * Eine Naeherung: Wie schnell jemand Zwiebeln schneidet, weiss die App
 * nicht. Sie sagt aber, wenn zwei Arbeiten, die Haende brauchen, zur
 * selben Zeit faellig sind.
 *
 * Reine Funktionen ohne DOM.
 */

import { dauernIn } from './zeiten.js';

/** Schritte, bei denen der Topf arbeitet und nicht der Koch */
const PASSIV = /\b(back|gar|köchel|koechel|ruhen|ruht|ziehen lassen|zieh|kühl|kuehl|gehen lassen|geh|schmor|simmer|quellen|abkühlen|marinier|einweich|kochen lassen|dünsten lassen|im ofen)/i;
const OFEN = /(back)?ofen|°\s*c|grad|umluft|ober-? und unterhitze|grill/i;
const TEMPERATUR = /(\d{2,3})\s*(?:°|grad)/i;
const VORHEIZEN = /vorheiz|vorgeheizt/i;

const MIN = 60;
const VORHEIZDAUER = 15 * MIN;

/** Der erste Satz, gekuerzt — fuer die Liste */
export function kurzText(text, max = 90) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  const satz = s.match(/^.+?[.!?](\s|$)/)?.[0].trim() || s;
  return satz.length > max ? `${satz.slice(0, max - 1).trimEnd()}…` : satz;
}

/**
 * Dauer jedes Schritts eines Rezepts in Sekunden.
 * @returns {{text:string, sekunden:number, aktiv:boolean, genannt:boolean}[]}
 */
export function schrittDauern(recipe) {
  const schritte = (recipe.steps || []).map((s) => String(s).trim()).filter(Boolean);
  const genannt = schritte.map((s) => dauernIn(s).reduce((a, d) => a + d.sekunden, 0));
  const summe = genannt.reduce((a, b) => a + b, 0);
  const ohne = genannt.filter((g) => !g).length;
  const gesamt = (recipe.totalTime || 0) * MIN;
  // Der Rest der Gesamtzeit verteilt sich auf die Schritte ohne Zeitangabe
  const jeSchritt = ohne
    ? Math.max(2 * MIN, Math.min(20 * MIN, gesamt > summe ? (gesamt - summe) / ohne : 5 * MIN))
    : 0;
  return schritte.map((text, i) => ({
    text,
    sekunden: Math.round(genannt[i] || jeSchritt),
    genannt: genannt[i] > 0,
    // Mit genannter Zeit und passivem Verb wartet man; sonst arbeitet man
    aktiv: !(genannt[i] > 0 && PASSIV.test(text)),
  }));
}

/**
 * @param {object[]} rezepte
 * @param {Date} ziel Wann gegessen wird
 * @returns {{schritte:object[], beginn:Date|null, konflikte:number}}
 *          schritte sortiert nach Beginn: {zeit, ende, rezeptId, rezept, nr, text, voll, aktiv, art}
 */
export function zeitplan(rezepte, ziel) {
  const schritte = [];
  for (const r of rezepte) {
    const dauern = schrittDauern(r);
    let ende = ziel.getTime();
    const eigene = [];
    for (let i = dauern.length - 1; i >= 0; i -= 1) {
      const d = dauern[i];
      const zeit = ende - d.sekunden * 1000;
      eigene.unshift({
        zeit: new Date(zeit), ende: new Date(ende), rezeptId: r.id, rezept: r.title, nr: i + 1,
        text: kurzText(d.text), voll: d.text, aktiv: d.aktiv, art: 'schritt', sekunden: d.sekunden,
      });
      ende = zeit;
    }
    // Ofen vorheizen, wenn ein Schritt ihn braucht und keiner es schon sagt
    if (!dauern.some((d) => VORHEIZEN.test(d.text))) {
      const ofen = eigene.find((s) => OFEN.test(s.voll) && (TEMPERATUR.test(s.voll) || /backen|überbacken|ofen/i.test(s.voll)));
      if (ofen) {
        const grad = ofen.voll.match(TEMPERATUR)?.[1];
        const zeit = new Date(ofen.zeit.getTime() - VORHEIZDAUER * 1000);
        eigene.push({
          zeit, ende: ofen.zeit, rezeptId: r.id, rezept: r.title, nr: 0,
          text: `Backofen${grad ? ` auf ${grad} °C` : ''} vorheizen`, voll: '', aktiv: false, art: 'ofen', sekunden: VORHEIZDAUER,
        });
      }
    }
    schritte.push(...eigene);
  }

  schritte.sort((a, b) => a.zeit - b.zeit || (a.art === 'ofen' ? -1 : 0) || a.nr - b.nr);

  // Zwei aktive Schritte verschiedener Gerichte zur selben Zeit
  let konflikte = 0;
  const aktive = schritte.filter((s) => s.aktiv && s.sekunden > 0);
  for (let i = 0; i < aktive.length; i += 1) {
    for (let j = i + 1; j < aktive.length; j += 1) {
      const a = aktive[i];
      const b = aktive[j];
      if (a.rezeptId === b.rezeptId) continue;
      if (b.zeit < a.ende && a.zeit < b.ende) {
        a.konflikt = true;
        b.konflikt = true;
        konflikte += 1;
      }
    }
  }

  return { schritte, beginn: schritte[0]?.zeit || null, konflikte };
}

/** 18:05 */
export const uhrzeit = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
