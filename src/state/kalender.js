/**
 * Der Wochenplan als Kalenderdatei (iCalendar, RFC 5545).
 *
 * Jedes Gericht wird ein Termin, der so beginnt, dass das Essen zur
 * ueblichen Zeit auf dem Tisch steht. Was am Vortag beginnen muss —
 * Einweichen, Auftauen, ueber Nacht gehen lassen, lange Marinieren —,
 * bekommt einen eigenen Termin am Vorabend mit Erinnerung.
 *
 * Die Zeiten sind "schwebend" (ohne Zeitzone): 12:30 Uhr bleibt 12:30 Uhr,
 * wo auch immer der Kalender gerade ist. So meint man es beim Essen.
 *
 * Reine Funktionen; die Oberflaeche laedt das Ergebnis herunter.
 */

import { dauernIn } from './zeiten.js';

/** Wann gegessen wird, als [Stunde, Minute] */
export const ESSENSZEITEN = {
  fruehstueck: [7, 30],
  mittag: [12, 30],
  snack: [15, 30],
  abend: [18, 30],
};

const LABEL = { fruehstueck: 'Frühstück', mittag: 'Mittagessen', abend: 'Abendessen', snack: 'Imbiss' };

/** Ab so langer Ruhe- oder Wartezeit beginnt die Arbeit am Vortag */
const LANGE_RUHE = 4 * 3600;

/** Hinweise im Text, dass etwas am Vortag beginnt */
const VORTAG = [
  [/über nacht|ueber nacht|am vortag|am vorabend|tags zuvor|vorabend/i, 'am Vorabend beginnen'],
  [/einweichen|eingeweicht|quellen lassen/i, 'einweichen'],
  [/auftauen|aufgetaut/i, 'auftauen'],
];
/** Tiefgekuehltes in der Zutatenliste: am Vorabend in den Kuehlschrank */
const TK = /\b(tiefgekühlte?[rsnm]?|tiefgefrorene?[rsnm]?|gefrorene?[rsnm]?|tk-|tk\s)/i;
/** Huelsenfruechte ohne Dose: die meisten wollen eingeweicht sein */
const TROCKEN = /^(getrocknete\s+)?(kichererbsen|weiße bohnen|weisse bohnen|kidneybohnen|bohnenkerne|erbsen, getrocknet)\b/i;

/**
 * Was fuer dieses Rezept am Vortag zu tun ist.
 * @returns {string[]} kurze Gruende, leer wenn nichts
 */
export function vortagsArbeit(recipe) {
  const gruende = new Set();
  const text = (recipe.steps || []).join(' ');
  for (const [re, grund] of VORTAG) if (re.test(text)) gruende.add(grund);
  for (const s of recipe.steps || []) {
    if (dauernIn(s).some((d) => d.sekunden >= LANGE_RUHE)) gruende.add('lange Ruhezeit');
  }
  for (const i of recipe.ingredients || []) {
    if (TK.test(i.name)) gruende.add(`${i.name.replace(TK, '').replace(/\s+/g, ' ').trim() || 'Tiefgekühltes'} auftauen`);
    else if (TROCKEN.test(i.name) && !/dose|glas|gegart|vorgegart/i.test(i.name)) gruende.add(`${i.name} einweichen`);
  }
  return [...gruende];
}

// --------------------------------------------------------------- Format

const zwei = (n) => String(n).padStart(2, '0');
const lokal = (d) => `${d.getFullYear()}${zwei(d.getMonth() + 1)}${zwei(d.getDate())}T${zwei(d.getHours())}${zwei(d.getMinutes())}00`;
const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Text fuer ein Feld: Backslash, Komma, Semikolon und Zeilenumbruch maskiert */
export function feldText(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/**
 * Faltet eine Zeile nach 75 Bytes, wie RFC 5545 es verlangt. Umlaute
 * zaehlen doppelt; ein Zeichen wird nie zerteilt.
 */
export function falten(zeile) {
  const enc = new TextEncoder();
  const teile = [];
  let aktuell = '';
  let bytes = 0;
  for (const ch of zeile) {
    const b = enc.encode(ch).length;
    const grenze = teile.length ? 74 : 75;
    if (bytes + b > grenze) {
      teile.push(aktuell);
      aktuell = '';
      bytes = 0;
    }
    aktuell += ch;
    bytes += b;
  }
  teile.push(aktuell);
  return teile.join('\r\n ');
}

/**
 * @param {Date} wochenStart Montag der Woche
 * @param {Record<string,{recipeId:string, servings:number, rest?:string, extra?:number}>} eintraege
 * @param {{get:(id:string)=>object}} lookup
 * @param {{erinnerung?:number, jetzt?:Date, adresse?:string}} [opt]
 *        erinnerung: Minuten vor Kochbeginn, 0 fuer keine
 * @returns {{text:string, termine:number, vortag:number}}
 */
export function icsWoche(wochenStart, eintraege, lookup, { erinnerung = 15, jetzt = new Date(), adresse = '' } = {}) {
  const zeilen = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kochbuch//Wochenplan//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${feldText('Wochenplan')}`,
  ];
  const stamp = utc(jetzt);
  const woche = `${wochenStart.getFullYear()}${zwei(wochenStart.getMonth() + 1)}${zwei(wochenStart.getDate())}`;
  let termine = 0;
  let vortag = 0;

  const alarm = (minuten, text) => (minuten > 0 ? [
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${feldText(text)}`, `TRIGGER:-PT${minuten}M`, 'END:VALARM',
  ] : []);

  const sortiert = Object.entries(eintraege).sort(([a], [b]) => {
    const [da, ma] = a.split(':');
    const [db, mb] = b.split(':');
    return da - db || ESSENSZEITEN[ma][0] - ESSENSZEITEN[mb][0];
  });

  for (const [slot, e] of sortiert) {
    const r = lookup.get(e.recipeId);
    const [tag, mahlzeit] = slot.split(':');
    if (!r || !ESSENSZEITEN[mahlzeit]) continue;
    const [h, m] = ESSENSZEITEN[mahlzeit];
    const essen = new Date(wochenStart);
    essen.setDate(essen.getDate() + Number(tag));
    essen.setHours(h, m, 0, 0);

    // Reste werden nur aufgewaermt; gekocht wird sonst so, dass es zur Essenszeit fertig ist
    const dauer = e.rest ? 15 : Math.max(15, Math.min(r.totalTime || 30, 240));
    const beginn = new Date(essen.getTime() - dauer * 60000);
    const portionen = e.servings + (e.extra || 0);
    const beschreibung = [
      e.rest ? 'Rest vom Vortag, aufwärmen.' : `Für ${portionen} ${r.yieldUnit || 'Portionen'}${e.extra ? `, davon ${e.extra} zum Vorkochen` : ''}.`,
      '',
      ...(e.rest ? [] : ['Zutaten:', ...r.ingredients.map((i) => `- ${i.name}`)]),
      adresse ? `\n${adresse}` : '',
    ].join('\n').trim();

    zeilen.push(
      'BEGIN:VEVENT',
      `UID:${woche}-${slot.replace(':', '-')}-${String(e.recipeId).replace(/[^\w-]/g, '')}@kochbuch`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${lokal(beginn)}`,
      `DTEND:${lokal(essen)}`,
      `SUMMARY:${feldText(`${LABEL[mahlzeit]}: ${e.rest ? `Rest – ${r.title}` : r.title}`)}`,
      `DESCRIPTION:${feldText(beschreibung)}`,
      'CATEGORIES:Essen',
      ...alarm(erinnerung, e.rest ? `Rest aufwärmen: ${r.title}` : `Jetzt kochen: ${r.title}`),
      'END:VEVENT',
    );
    termine += 1;

    const arbeit = e.rest ? [] : vortagsArbeit(r);
    if (arbeit.length) {
      const abend = new Date(essen);
      abend.setDate(abend.getDate() - 1);
      abend.setHours(20, 0, 0, 0);
      const ende = new Date(abend.getTime() + 15 * 60000);
      zeilen.push(
        'BEGIN:VEVENT',
        `UID:${woche}-${slot.replace(':', '-')}-vortag@kochbuch`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${lokal(abend)}`,
        `DTEND:${lokal(ende)}`,
        `SUMMARY:${feldText(`Vorbereiten für morgen: ${r.title}`)}`,
        `DESCRIPTION:${feldText(`${arbeit.join(', ')}.`)}`,
        'CATEGORIES:Essen',
        ...alarm(5, `Für morgen vorbereiten: ${arbeit.join(', ')}`),
        'END:VEVENT',
      );
      vortag += 1;
    }
  }

  zeilen.push('END:VCALENDAR');
  return { text: `${zeilen.map(falten).join('\r\n')}\r\n`, termine, vortag };
}
