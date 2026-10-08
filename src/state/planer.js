/**
 * Wochenplan auf Knopfdruck, nach Vorgaben: welche Mahlzeiten, fuer wie
 * viele Personen, welche Ernaehrungsform, wie lange hoechstens, ohne
 * welche Allergene, wie oft Fisch — und auf Wunsch bevorzugt gesund
 * oder aus dem, was im Vorrat liegt.
 *
 * Der Zufall bleibt dabei: Zwei Klicks sollen zwei verschiedene Wochen
 * ergeben. Die Vorgaben verschieben nur die Gewichte, harte Grenzen
 * (Allergene, Zeit, Ernaehrung) gelten immer.
 *
 * Reine Funktionen; der Aufrufer legt das Ergebnis in den Store.
 */

import { deckt, vorratsName, baldAblaufend } from './vorrat.js';
import { erfuellt } from './profile.js';
import { saisonFuer, saisonZutat } from './saison.js';
import { lieblingsGewicht } from './bewertung.js';
import { packungFuer } from './reste.js';
import { neueKennung } from './vorkochen.js';

const SLOT = (day, meal) => `${day}:${meal}`;
const MAHLZEITEN = ['fruehstueck', 'mittag', 'abend', 'snack'];
const ERNAEHRUNG = ['vegetarisch', 'vegan', 'glutenfrei', 'laktosefrei', 'pescetarisch'];

export const VORGABEN_STANDARD = Object.freeze({
  mahlzeiten: ['fruehstueck', 'mittag', 'abend'],
  tage: [0, 1, 2, 3, 4, 5, 6],
  personen: 0,
  ernaehrung: '',
  maxZeit: 0,
  ohneAllergene: [],
  fischProWoche: 0,
  gesund: false,
  vorrat: false,
  saison: false,
  lieblinge: false,
  haushalt: false,
  buendeln: false,
  vorkochen: false,
  ablauf: false,
  ersetzen: false,
});

/** Nur bekannte Felder in erlaubten Grenzen — die Vorgaben liegen im localStorage. */
export function bereinigeVorgaben(eingabe) {
  const v = eingabe && typeof eingabe === 'object' ? eingabe : {};
  const liste = (x, erlaubt) => (Array.isArray(x) ? [...new Set(x.filter((y) => erlaubt(y)))] : null);
  const zahl = (x, max) => (Number.isFinite(Number(x)) ? Math.max(0, Math.min(max, Math.round(Number(x)))) : 0);
  return {
    mahlzeiten: liste(v.mahlzeiten, (m) => MAHLZEITEN.includes(m)) ?? [...VORGABEN_STANDARD.mahlzeiten],
    tage: (liste(v.tage, (t) => Number.isInteger(t) && t >= 0 && t <= 6) ?? [...VORGABEN_STANDARD.tage]).sort(),
    personen: zahl(v.personen, 24),
    ernaehrung: ERNAEHRUNG.includes(v.ernaehrung) ? v.ernaehrung : '',
    maxZeit: zahl(v.maxZeit, 600),
    ohneAllergene: liste(v.ohneAllergene, (a) => typeof a === 'string' && /^[a-z]+$/.test(a)) ?? [],
    fischProWoche: zahl(v.fischProWoche, 7),
    gesund: Boolean(v.gesund),
    vorrat: Boolean(v.vorrat),
    saison: Boolean(v.saison),
    lieblinge: Boolean(v.lieblinge),
    haushalt: Boolean(v.haushalt),
    buendeln: Boolean(v.buendeln),
    vorkochen: Boolean(v.vorkochen),
    ablauf: Boolean(v.ablauf),
    ersetzen: Boolean(v.ersetzen),
    // Aus den Haushaltsprofilen, nicht gespeichert: alle muessen gelten
    ernaehrungen: liste(v.ernaehrungen, (e) => ERNAEHRUNG.includes(e)) ?? [],
    meidet: (Array.isArray(v.meidet) ? v.meidet : []).map((m) => vorratsName(m)).filter(Boolean),
  };
}

/** Enthaelt das Gericht sicher Fisch? */
export const istFisch = (r) => (r.allergens || []).some((a) => a.id === 'fisch' && a.level === 'ja');

/** Erfuellt ein Rezept die harten Vorgaben fuer diese Mahlzeit? */
export function passt(r, meal, v) {
  // Historische Originaltexte liest man; ungefragt auf den Plan gehoeren sie nicht.
  if (r.lesetext || !(r.meals || []).includes(meal)) return false;
  // Vegan ist auch vegetarisch
  if (!erfuellt(r, v.ernaehrung)) return false;
  if (v.ernaehrungen?.length && !v.ernaehrungen.every((e) => erfuellt(r, e))) return false;
  if (v.meidet?.length && r.ingredients.some((i) => {
    const n = vorratsName(i.name);
    return v.meidet.some((m) => deckt(m, n));
  })) return false;
  // Mit Zeitgrenze nur Rezepte, deren Dauer bekannt ist
  if (v.maxZeit && !(r.totalTime > 0 && r.totalTime <= v.maxZeit)) return false;
  // "Kann enthalten" zaehlt wie beim Filter als enthalten.
  if (v.ohneAllergene.length && (r.allergens || []).some((a) => v.ohneAllergene.includes(a.id))) return false;
  return true;
}

/** Erstes kennzeichnendes Wort des Titels: zwei Kartoffelsuppen in einer Woche sind eine zu viel. */
function titelWort(r) {
  const w = String(r.title || '').toLowerCase().match(/[a-zäöüß]{5,}/);
  return w ? w[0] : '';
}

const aehnlich = (woerter, r) => {
  const w = titelWort(r);
  return Boolean(w) && woerter.has(w);
};

/**
 * Baut die Gewichtung. Der Vorratsanteil wird je Rezept nur einmal
 * gerechnet, und nur, wenn er gefragt ist.
 */
function gewichter(v, vorrat, { monat = new Date().getMonth() + 1, bewertungen = {}, jetzt = new Date() } = {}) {
  const keys = v.vorrat ? vorrat.map((p) => vorratsName(p.name)).filter(Boolean) : [];
  // Was bald ablaeuft, zieht kraeftig: es soll weg, bevor es verdirbt
  const bald = v.ablauf ? baldAblaufend(vorrat, { jetzt }).map((x) => vorratsName(x.posten.name)) : [];
  const baldAnteile = new Map();
  const baldTreffer = (r) => {
    let n = baldAnteile.get(r.id);
    if (n === undefined) {
      n = bald.filter((k) => (r.ingredients || []).some((i) => deckt(k, vorratsName(i.name)))).length;
      baldAnteile.set(r.id, n);
    }
    return n;
  };
  const namen = new Map();
  const imVorrat = (name) => {
    let x = namen.get(name);
    if (x === undefined) {
      const n = vorratsName(name);
      x = keys.some((k) => deckt(k, n));
      namen.set(name, x);
    }
    return x;
  };
  const anteile = new Map();
  const vorratsAnteil = (r) => {
    if (!keys.length || !r.ingredients?.length) return 0;
    let a = anteile.get(r.id);
    if (a === undefined) {
      a = r.ingredients.filter((i) => imVorrat(i.name)).length / r.ingredients.length;
      anteile.set(r.id, a);
    }
    return a;
  };
  return (r) => {
    let g = 1;
    if (v.gesund) g += Math.max(0, (r.gesundheit?.punkte || 0) - 40) / 10;
    if (keys.length) g += vorratsAnteil(r) * 6;
    if (bald.length) g += baldTreffer(r) * 12;
    if (v.saison) {
      const s = saisonFuer(r, monat);
      g += s.passend.length * 3;
      if (s.ausser.length) g *= 0.2;
    }
    if (v.lieblinge) g *= lieblingsGewicht(bewertungen[r.id]);
    return g;
  };
}

/** Kraeuter und Blattgruenes, das im Bund kommt und schnell welkt */
const FRISCHES = /^(petersilie|schnittlauch|basilikum|koriander|dill|minze|thymian|rosmarin|salbei|zitronenmelisse|frühlingszwiebel|lauchzwiebel|ingwer|zitrone|limette)/;

const frischCache = new Map();
/**
 * Zutaten, von denen man mehr kauft, als ein Rezept braucht: Packungen
 * wie Sahne oder Kokosmilch, frisches Gemuese, Kraeuter im Bund. Teilen
 * sich zwei Gerichte der Woche so etwas, bleibt weniger uebrig.
 */
export function frischZutaten(r) {
  let out = frischCache.get(r.id);
  if (out === undefined) {
    const s = new Set();
    for (const i of r.ingredients || []) {
      const n = vorratsName(i.name);
      if (!n) continue;
      const p = packungFuer(i.name);
      if (p) s.add(p.key);
      else if (saisonZutat(i.name)) s.add(saisonZutat(i.name).toLowerCase());
      else if (FRISCHES.test(n)) s.add(n.match(FRISCHES)[1]);
    }
    out = [...s];
    if (frischCache.size > 20000) frischCache.clear();
    frischCache.set(r.id, out);
  }
  return out;
}

/**
 * Zieht ein Rezept: aus einer Stichprobe der Kandidaten die acht mit dem
 * hoechsten Gewicht, und unter denen gewichtet. Ohne Vorlieben sind alle
 * Gewichte gleich und die Wahl ist reiner Zufall; mit Vorlieben setzen
 * sie sich durch, ohne dass jede Woche gleich aussieht. Die Stichprobe
 * haelt das bei zehntausend Kandidaten schnell.
 */
function ziehe(kandidaten, gewicht, zufall, frei) {
  const stichprobe = [];
  const n = kandidaten.length;
  const versuche = Math.min(n * 2, 400);
  for (let i = 0; i < versuche && stichprobe.length < 80; i += 1) {
    const r = kandidaten[Math.floor(zufall() * n)];
    if (frei(r)) stichprobe.push(r);
  }
  // Bei wenigen Kandidaten kann die Stichprobe leer bleiben, obwohl einer frei ist
  if (!stichprobe.length) stichprobe.push(...kandidaten.filter(frei).slice(0, 80));
  if (!stichprobe.length) return null;

  const beste = [...new Set(stichprobe)]
    .map((r) => ({ r, g: gewicht(r), los: zufall() }))
    .sort((a, b) => b.g - a.g || a.los - b.los)
    .slice(0, 8);
  let wurf = zufall() * beste.reduce((a, b) => a + b.g, 0);
  for (const b of beste) {
    wurf -= b.g;
    if (wurf <= 0) return b.r;
  }
  return beste[beste.length - 1].r;
}

function portionen(r, v) {
  // Wer "Stueck" zaehlt (Brötchen, Printen), backt die angegebene Menge
  if (!v.personen || (r.yieldUnit && !/portion/i.test(r.yieldUnit))) return r.servings || 2;
  return v.personen;
}

/**
 * Plant die Woche.
 *
 * @param {object[]} pool Rezepte, aus denen gezogen wird
 * @param {Record<string,{recipeId:string, servings:number}>} woche bisherige Eintraege
 * @param {object} vorgaben siehe VORGABEN_STANDARD
 * @param {{zufall?:()=>number, vorrat?:object[], lookup?:{get:Function}}} [opt]
 * @returns {{eintraege:Record<string,object>, ohneTreffer:string[], fisch:number,
 *            geteilt:string[], reste:number}}
 *          geteilt: frische Zutaten, die mehr als ein Gericht verwendet;
 *          reste: Felder, die mit Vorgekochtem vom Vortag belegt sind
 */
export function planeWoche(pool, woche, vorgaben, {
  zufall = Math.random, vorrat = [], lookup = null, monat, bewertungen, jetzt,
} = {}) {
  const v = bereinigeVorgaben(vorgaben);
  const ziele = [];
  for (const day of v.tage) {
    for (const meal of MAHLZEITEN) {
      if (!v.mahlzeiten.includes(meal)) continue;
      if (woche[SLOT(day, meal)] && !v.ersetzen) continue;
      ziele.push({ day, meal, id: SLOT(day, meal) });
    }
  }

  const bleibt = Object.entries(woche).filter(([id]) => !ziele.some((z) => z.id === id));
  const benutzt = new Set(bleibt.map(([, e]) => e.recipeId));
  const woerter = new Set();
  let fisch = 0;
  // Frische Zutaten der Woche und wie viele Gerichte sie nutzen
  const korb = new Map();
  const inDenKorb = (r) => {
    for (const k of frischZutaten(r)) korb.set(k, (korb.get(k) || 0) + 1);
  };
  for (const [, e] of bleibt) {
    const r = lookup?.get(e.recipeId);
    if (!r || e.rest) continue;
    woerter.add(titelWort(r));
    if (istFisch(r)) fisch += 1;
    inDenKorb(r);
  }

  const kandidaten = new Map();
  const fuer = (meal) => {
    if (!kandidaten.has(meal)) kandidaten.set(meal, pool.filter((r) => passt(r, meal, v)));
    return kandidaten.get(meal);
  };
  const grundgewicht = gewichter(v, vorrat, { monat, bewertungen, jetzt });
  // Gebuendelt: je geteilter frischer Zutat deutlich mehr Gewicht, gedeckelt
  const gewicht = v.buendeln
    ? (r) => grundgewicht(r) * (1 + 1.5 * Math.min(3, frischZutaten(r).filter((k) => korb.has(k)).length))
    : grundgewicht;

  // Fischtage gleichmaessig ueber die Hauptmahlzeiten verteilen
  const hauptziele = ziele.filter((z) => z.meal === 'mittag' || z.meal === 'abend');
  const fischFehlt = v.ernaehrung === 'vegetarisch' || v.ernaehrung === 'vegan'
    ? 0 : Math.max(0, Math.min(hauptziele.length, v.fischProWoche - fisch));
  const fischZiele = new Set();
  for (let i = 0; i < fischFehlt; i += 1) {
    fischZiele.add(hauptziele[Math.floor(((i + 0.5) * hauptziele.length) / fischFehlt)].id);
  }

  const eintraege = {};
  const ohneTreffer = [];
  let reste = 0;

  /** Das Abendessen des Vortags, ob eben geplant oder schon im Plan */
  const vortagAbend = (day) => {
    const id = SLOT(day - 1, 'abend');
    if (eintraege[id]) return { id, e: eintraege[id] };
    if (woche[id] && !ziele.some((z) => z.id === id)) return { id, e: woche[id] };
    return null;
  };

  for (const z of ziele) {
    // Vorkochen: abends mehr, am naechsten Mittag den Rest
    if (v.vorkochen && z.meal === 'mittag' && z.day > 0) {
      const q = vortagAbend(z.day);
      const qr = q && !q.e.rest && lookup?.get(q.e.recipeId);
      if (qr && (qr.meals || []).includes('mittag') && !istFisch(qr)) {
        const kid = q.e.kid || neueKennung(zufall);
        const n = q.e.servings;
        eintraege[q.id] = { ...q.e, kid, extra: (q.e.extra || 0) + n };
        eintraege[z.id] = { recipeId: q.e.recipeId, servings: n, rest: kid };
        reste += 1;
        continue;
      }
    }
    const alle = fuer(z.meal);
    const frei = (r) => !benutzt.has(r.id) && !aehnlich(woerter, r);
    const freiLocker = (r) => !benutzt.has(r.id);
    let liste = alle;
    if (fischZiele.has(z.id)) {
      const mitFisch = alle.filter(istFisch);
      if (mitFisch.some(freiLocker)) liste = mitFisch;
    } else if (v.fischProWoche) {
      // Wer zweimal Fisch will, meint zweimal, nicht viermal
      const ohneFisch = alle.filter((r) => !istFisch(r));
      if (ohneFisch.some(freiLocker)) liste = ohneFisch;
    }
    // Gesund heisst: die schwachen gar nicht erst, solange genug uebrig bleibt
    if (v.gesund) {
      const gute = liste.filter((r) => (r.gesundheit?.punkte || 0) >= 55);
      if (gute.length >= 10) liste = gute;
    }

    const r = ziehe(liste, gewicht, zufall, frei) || ziehe(liste, gewicht, zufall, freiLocker);
    if (!r) {
      ohneTreffer.push(z.id);
      continue;
    }
    eintraege[z.id] = { recipeId: r.id, servings: portionen(r, v) };
    benutzt.add(r.id);
    woerter.add(titelWort(r));
    if (istFisch(r)) fisch += 1;
    inDenKorb(r);
  }

  const geteilt = [...korb].filter(([, n]) => n > 1).map(([k]) => k);
  return { eintraege, ohneTreffer, fisch, geteilt, reste };
}

/**
 * Wuerfelt ein einzelnes Feld neu, nach denselben Vorgaben. Mit Fischsoll
 * wird ein Fischgericht wieder eines und ein anderes keines, sonst
 * stimmte die Woche nicht mehr.
 *
 * @returns {{recipeId:string, servings:number}|null}
 */
export function wuerfleFeld(pool, woche, slot, vorgaben, {
  zufall = Math.random, vorrat = [], lookup = null, monat, bewertungen, jetzt,
} = {}) {
  const v = bereinigeVorgaben(vorgaben);
  const id = SLOT(slot.day, slot.meal);
  const bisher = woche[id] && lookup?.get(woche[id].recipeId);
  const benutzt = new Set(Object.values(woche).map((e) => e.recipeId));
  const woerter = new Set(Object.entries(woche)
    .filter(([k]) => k !== id)
    .map(([, e]) => lookup?.get(e.recipeId))
    .filter(Boolean)
    .map(titelWort));

  let liste = pool.filter((r) => passt(r, slot.meal, v));
  if (v.fischProWoche && bisher) {
    const gleich = liste.filter((r) => istFisch(r) === istFisch(bisher));
    if (gleich.length > 1) liste = gleich;
  }
  const gewicht = gewichter(v, vorrat, { monat, bewertungen, jetzt });
  const r = ziehe(liste, gewicht, zufall, (x) => !benutzt.has(x.id) && !aehnlich(woerter, x))
    || ziehe(liste, gewicht, zufall, (x) => !benutzt.has(x.id));
  if (!r) return null;
  return { recipeId: r.id, servings: woche[id]?.servings && !v.personen ? woche[id].servings : portionen(r, v) };
}
