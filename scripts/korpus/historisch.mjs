/**
 * Werkzeuge fuer historische Kochbuecher: alte Masse, alte Schreibung,
 * Zahlwoerter — und Zutaten, die nicht als Liste dastehen, sondern im
 * Fliesstext ("Man ruehrt ¼ Pfund Butter zu Sahne, gibt 4 Eidotter …").
 *
 * Die Zutatenliste eines solchen Rezepts ist erschlossen, nicht
 * abgeschrieben. Sie dient Suche, Allergenhinweis und Einkaufszettel; die
 * App kennzeichnet sie und rechnet daraus keine Naehrwerte.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { erstelleRechner } from '../../src/state/naehrwerte.js';
import { parseIngredientLine } from '../../src/sources/ingredients.js';

// ------------------------------------------------------------------ Masse

/**
 * Alte Masse je Buch, in Gramm oder Millilitern. Die Werte stammen aus
 * den Buechern selbst, wo sie es sagen, sonst aus der Landesordnung ihrer
 * Zeit und Gegend.
 */
export const MASSE = {
  // Preussen vor 1858: Pfund zu 32 Loth, Loth zu 4 Quentchen; Quart 1,145 l
  preussen: {
    pfund: 467.7, vierling: 116.9, loth: 14.6, quentchen: 3.65,
    quart: 1145, mass: 1145, schoppen: 286, noesel: 286, tasse: 150, obertasse: 150, untertasse: 100,
    glas: 200, weinglas: 125, flasche: 750, bouteille: 750,
  },
  // Bayern (Schiller nennt es ausdruecklich): Pfund 560 g, Mass 1,069 l
  bayern: {
    pfund: 560, vierling: 140, loth: 17.5, quentchen: 4.4,
    mass: 1069, quart: 267, schoppen: 356, seidel: 535, bouteille: 535, flasche: 535,
    tasse: 150, obertasse: 150, untertasse: 100, glas: 200, weinglas: 125,
  },
  // Kaiserreich ab 1872: metrisch, das Pfund zu 500 g
  metrisch: {
    pfund: 500, vierling: 125, loth: 16.7, quentchen: 1.67,
    mass: 1000, quart: 1000, schoppen: 500, tasse: 150, obertasse: 150, untertasse: 100,
    glas: 200, weinglas: 125, flasche: 700,
  },
};

/** Schreibweisen alter Einheiten → Schluessel in MASSE oder eine Einheit der App */
const EINHEIT = [
  [/^pfunde?s?$|^pfd\.?$|^℔$/i, 'pfund'],
  [/^vierlinge?$/i, 'vierling'],
  [/^lothe?s?$|^lth\.?$/i, 'loth'],
  [/^quentchen$|^quent\.?$/i, 'quentchen'],
  [/^ma(ß|ss|as)e?s?$/i, 'mass'],
  [/^quarte?s?$/i, 'quart'],
  [/^schoppens?$/i, 'schoppen'],
  [/^nösel$/i, 'noesel'],
  [/^seidel$/i, 'seidel'],
  [/^bouteillen?$/i, 'bouteille'],
  [/^flaschen?$/i, 'flasche'],
  [/^obertassen?$/i, 'obertasse'],
  [/^untertassen?$/i, 'untertasse'],
  [/^tassen?$|^kaffeetassen?$|^theetassen?$/i, 'tasse'],
  [/^weingläser$|^weinglas$/i, 'weinglas'],
  [/^gläser$|^glas$/i, 'glas'],
  [/^e(ß|ss)löffeln?$|^e(ß|ss)l\.?$|^löffeln?$/i, 'EL'],
  [/^th?eelöffeln?$|^th?eel\.?$/i, 'TL'],
  [/^messerspitzen?$|^msp\.?$/i, 'Msp'],
  [/^prisen?$/i, 'Prise'],
  [/^stücke?n?$|^stück$/i, 'Stk'],
  [/^scheiben?$|^schnitten?$/i, 'Scheibe'],
  [/^bunde?$|^büschel$/i, 'Bund'],
  [/^zehen?$/i, 'Zehe'],
  [/^blätter$|^blatt$/i, 'Blatt'],
  [/^zweige?$/i, 'Zweig'],
  [/^köpfe?$/i, 'Stk'],
  [/^stangen?$/i, 'Stk'],
];

function einheitVon(wort) {
  const w = wort.replace(/[.,;:]$/, '');
  for (const [re, e] of EINHEIT) if (re.test(w)) return e;
  return null;
}

/** Menge in einer alten Einheit → [Menge, Einheit der App] */
function umrechnen(menge, einheit, masse) {
  if (einheit in masse) {
    const wert = menge * masse[einheit];
    const inMl = ['mass', 'quart', 'schoppen', 'noesel', 'seidel', 'bouteille', 'flasche', 'glas', 'weinglas'].includes(einheit);
    if (['tasse', 'obertasse', 'untertasse'].includes(einheit)) return [runde(wert), 'ml'];
    return [runde(wert), inMl ? 'ml' : 'g'];
  }
  return [menge, einheit];
}

/** Auf eine Genauigkeit runden, die das Original hergibt */
function runde(x) {
  if (x >= 100) return Math.round(x / 5) * 5;
  if (x >= 10) return Math.round(x);
  return Math.round(x * 10) / 10;
}

// ------------------------------------------------------------- Zahlwoerter

const BRUCH = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅛': 0.125, '⅓': 1 / 3, '⅔': 2 / 3, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };

const ZAHLWORT = {
  ein: 1, eine: 1, einen: 1, einem: 1, einer: 1, eines: 1,
  zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  elf: 11, zwölf: 12, fünfzehn: 15, zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50, hundert: 100,
  // "halb" allein ist ein Verhaeltnis ("halb Sahne, halb Wein"), keine Menge
  halbe: 0.5, halben: 0.5, halbes: 0.5, halber: 0.5, anderthalb: 1.5, dritthalb: 2.5,
  viertel: 0.25, dreiviertel: 0.75, achtel: 0.125,
  paar: 2,
};

/** Liest eine Zahl aus einem Wort: "4", "1½", "½", "3/4", "zwei", "Viertel". */
export function zahlAus(wort) {
  const w = wort.toLowerCase();
  if (/^\d+$/.test(w)) return Number(w);
  const gemischt = w.match(/^(\d*)([½¼¾⅛⅓⅔⅜⅝⅞])$/);
  if (gemischt) return (gemischt[1] ? Number(gemischt[1]) : 0) + BRUCH[gemischt[2]];
  const bruch = w.match(/^(\d+)\/(\d+)$/);
  if (bruch && Number(bruch[2])) return Number(bruch[1]) / Number(bruch[2]);
  if (/^\d+[.,]\d+$/.test(w)) return Number(w.replace(',', '.'));
  return ZAHLWORT[w] ?? null;
}

/** "zu 12 Personen", "für sechs Personen": wo ein altes Buch es sagt, gilt seine Zahl */
export function personenAus(text) {
  const m = text.match(/\b(?:zu|für|fuer)\s+(\d+|[a-zäöüß]+)\s+(?:bis\s+\S+\s+)?Personen/i);
  const n = m && zahlAus(m[1]);
  return n >= 1 && n <= 24 ? n : null;
}

// ------------------------------------------------------------ Schreibung

/**
 * Alte Schreibung in Zutatennamen → heutige. Nur fuer die Zutatenliste:
 * der Text des Rezepts bleibt, wie er gedruckt wurde.
 */
const HEUTE = [
  // Grosse Umlaute setzte man als Ae, Oe, Ue: "Aepfel", "Oel"
  [/\bAe/g, 'Ä'],
  [/\bOe/g, 'Ö'],
  [/\bUe/g, 'Ü'],
  [/brod(?=[a-zäöü]|$)/gi, 'brot'],
  [/^Brod/g, 'Brot'],
  [/[Cc]itron/g, (m) => (m[0] === 'C' ? 'Zitron' : 'zitron')],
  [/[Zz]immt/g, (m) => `${m[0]}imt`],
  [/blüthe/g, 'blüte'],
  [/Blüthe/g, 'Blüte'],
  // "Thee" wird Tee — "Thymian" schreibt man bis heute so
  [/Th(ee)(?![a-zäöü]*ian)/g, 'T$1'],
  [/th(ee)/g, 't$1'],
  [/[Ww]all?nu(ß|ss)/g, (m) => `${m[0]}alnuss`],
  [/nuß/g, 'nuss'],
  [/Nuß/g, 'Nuss'],
  [/Ei(?:er)?dottern?|Dottern?/g, 'Eigelb'],
  [/[Cc]astanien/g, 'Kastanien'],
  [/Äpfelmus/g, 'Apfelmus'],
  [/[Cc]otelett(e)?s/g, 'Koteletts'],
  [/[Cc]ompot/g, 'Kompott'],
  [/[Cc]aviar/g, 'Kaviar'],
  [/[CK]an[eh]+l\b/g, 'Zimt'],
  [/[Cc]ichorie/g, 'Zichorie'],
  [/[Cc]orinthen/g, 'Korinthen'],
  [/[Cc]h?o[ck]olade/g, 'Schokolade'],
  [/[Cc]acao/g, 'Kakao'],
  [/[Cc]a(ff|f)ee/g, 'Kaffee'],
  [/[Cc]apern/g, 'Kapern'],
  [/[Cc]arotten/g, 'Karotten'],
  [/[Cc]ardamom/g, 'Kardamom'],
  [/[Kk]arviol|[Cc]arfiol/g, 'Blumenkohl'],
  [/Gries(?!s)/g, 'Grieß'],
  [/gries(?!s)/g, 'grieß'],
  [/Häring/g, 'Hering'],
  [/Oehl|Oel|Öhl/g, 'Öl'],
  [/[Mm]andel(n)?kerne/g, 'Mandeln'],
  [/Ochsenfleisch/g, 'Rindfleisch'],
  [/Erdäpfel/g, 'Kartoffeln'],
  [/gelbe Rüben/g, 'Möhren'],
  [/Muskatenblüte/g, 'Muskatblüte'],
  [/[Ss]affran/g, 'Safran'],
  [/Semmelmehl|geriebenes Weißbrot/g, 'Semmelbrösel'],
];

export function heutigeSchreibung(text) {
  let t = text;
  for (const [re, ersatz] of HEUTE) t = t.replace(re, ersatz);
  return t;
}

// ------------------------------------------------ Zutaten aus Fliesstext

/**
 * Hauptwoerter, die der Naehrwertabgleich zwar kennt, die im Fliesstext
 * alter Rezepte aber fast nie eine Zutat meinen.
 */
const KEINE_ZUTAT = new Set([
  'suppe', 'brühe', 'sauce', 'soße', 'masse', 'teig', 'schaum', 'form', 'feuer', 'topf', 'pfanne', 'schüssel',
  'kasserolle', 'casserolle', 'löffel', 'tasse', 'glas', 'minuten', 'minute', 'stunde', 'stunden', 'weiße',
  'weise', 'art', 'farbe', 'fleischbrühe', 'bouillon', 'speise', 'speisen', 'gericht', 'braten', 'sieb',
  'tuch', 'serviette', 'papier', 'ofen', 'kohlen', 'deckel', 'geschmack', 'kochen', 'klöße', 'klößchen',
  'mark', 'saft', 'wasser', 'kern', 'kerne', 'stück', 'stücke', 'stückchen', 'scheiben', 'schale', 'rand',
  // Allgemeine Rueckverweise ("das gehackte Fleisch", "zu Fischen") und Groessenvergleiche ("eine Nuß groß")
  'fleisch', 'fisch', 'fische', 'fischen', 'nuss', 'nuß', 'nüsse', 'welschnuss', 'welschnuß', 'glut',
]);

/** Geraet und Feuer, auch zusammengesetzt: "Kohlenfeuer", "Bratpfanne", "Haarsieb" */
const GERAET = /(feuer|ofen|topf|töpfchen|pfanne|schüssel|geschirr|tuch|sieb|löffel|brett|mörser|form|kessel|casserolle|kasserolle)$/i;

/** Wasser ist Zutat, zaehlt aber nicht fuer den Einkauf — mit Menge nehmen wir es trotzdem auf. */
const NUR_MIT_MENGE = new Set(['wasser', 'saft', 'brühe', 'fleischbrühe', 'bouillon', 'mark', 'schale']);

/**
 * Eigenschaftswoerter vor einer Zutat: gebeugte Mittelwoerter ("gehackte",
 * "abgeschältes", "gebratenen") und die ueblichen Adjektive. Unflektierte
 * Verben ("geben", "kochen") passen bewusst nicht.
 */
const ADJEKTIV = new RegExp('^(?:'
  + '(?:ab|an|auf|aus|durch|ein|klein|fein|weich|zer|durch)?ge[a-zäöüß]{3,}(?:t|en)(?:e|en|er|es|em)'
  + '|[a-zäöüß]+(?:ig|lich|isch)(?:e|en|er|es|em)'
  + '|(?:mager|frisch|fein|grob|süß|saur|weiß|roth?|braun|gelb|grün|schwarz|jung|alt|klein|groß|gut|ganz|halb'
  + '|reif|roh|trocken|kalt|warm|heiß|dick|dünn|hart|weich|zart|fett|mürb|neu|bitter|herb|mild|scharf|lang|kurz)'
  // Nur gebeugt: "braun Mehl" in "braun Mehl machen" ist ein Umstand, keine Eigenschaft
  + '(?:e|en|er|es|em)'
  + ')$');
const KEIN_ADJEKTIV = new Set([
  'eine', 'einen', 'einem', 'einer', 'eines', 'die', 'der', 'den', 'dem', 'des', 'diese', 'dieser', 'diesen',
  'jene', 'welche', 'welchen', 'welcher', 'solche', 'andere', 'anderen', 'alle', 'allen', 'jeder', 'jede',
  'unter', 'über', 'oder', 'aber', 'wieder', 'immer', 'nebst', 'sehr', 'mehr', 'eben', 'sodann', 'dann',
  'wenn', 'wenig', 'etwas', 'einige', 'einigen', 'mehrere', 'mehreren', 'sie', 'ihre', 'ihren', 'seine', 'seinen',
  'keine', 'keinen', 'gehäufte', 'gestrichene', 'volle', 'voll',
]);
const MENGEN_ADJEKTIV = /^(gehäufte[nrsm]?|gestrichene[nrsm]?|volle[nrsm]?|gute[nrsm]?|knappe[nrsm]?|starke[nrsm]?|kleine[nrsm]?|große[nrsm]?|reichliche[nrsm]?)$/i;

/** "½ Ei dick Butter", "eine Wallnuß groß Zucker": Groessen, wie alte Buecher sie angeben (Gramm) */
const GROESSE = {
  ei: 50, hühnerei: 50, taubenei: 20, wallnuß: 20, walnuß: 20, wallnuss: 20, walnuss: 20, welschnuß: 20, welschnuss: 20,
  haselnuß: 5, haselnuss: 5,
};

/** Stamm fuer den Abgleich doppelter Nennungen: "Kalbsbratens" = "Kalbsbraten", "Eiern" = "Eier" */
function stamm(wort) {
  let s = wort;
  for (const endung of ['s', 'n', 'e']) if (s.length > 4 && s.endsWith(endung)) s = s.slice(0, -1);
  return s;
}

/**
 * Zerlegt Text in Woerter mit ihrer Stellung; Satzzeichen trennen Gruppen.
 */
function woerter(text) {
  const out = [];
  const re = /([A-Za-zÄÖÜäöüßſ]+(?:-[A-Za-zÄÖÜäöüß]+)*|\d+(?:[.,/]\d+)?[½¼¾⅛⅓⅔⅜⅝⅞]?|[½¼¾⅛⅓⅔⅜⅝⅞])|([.,;:!?()]|—|–)/g;
  let m;
  while ((m = re.exec(text))) {
    // "Schweine- oder Gänseschmalz": das erste Glied ist kein eigenes Wort
    if (m[1]) out.push({ w: m[1], abgebrochen: text[m.index + m[0].length] === '-' });
    else out.push({ satzzeichen: m[2] });
  }
  return out;
}

/**
 * Sucht Zutaten im Fliesstext eines Rezepts.
 *
 * Ein Hauptwort gilt als Zutat, wenn der Naehrwertabgleich es als
 * Lebensmittel erkennt. Davor stehende Eigenschaftswoerter kommen mit
 * ("mageres Schweinefleisch"), davor stehende Mengen werden gelesen und
 * in heutige Einheiten umgerechnet ("¼ Pfund" → 115 g).
 *
 * @param {string} text
 * @param {{masse:object, rechner:{zuordnen:Function}}} optionen
 * @returns {{a:number|null, u:string, n:string}[]}
 */
export function zutatenAusText(text, { masse, rechner }) {
  const w = woerter(text.replace(/ſ/g, 's'));
  const gefunden = new Map();

  for (let i = 0; i < w.length; i += 1) {
    const t = w[i].w;
    if (!t || !/^[A-ZÄÖÜ]/.test(t) || t.length < 3 || w[i].abgebrochen) continue;
    // Masseinheiten sind keine Zutaten, auch wenn "Weinglas" nach Wein klingt
    if (einheitVon(t)) continue;

    const heute = heutigeSchreibung(t);
    // Gebeugte Formen fallen zusammen: "Kalbsbratens" und "Kalbsbraten", "Eiern" und "Eier"
    const wort = heute.toLowerCase();
    const schluessel = stamm(wort);
    if (KEINE_ZUTAT.has(wort) && !NUR_MIT_MENGE.has(wort)) continue;
    if (GERAET.test(wort)) continue;

    // "eine Wallnuß dick Butter", "ein Ei groß Zucker": ein Groessenvergleich, keine Zutat
    const naechstes = w[i + 1]?.w?.toLowerCase();
    if (naechstes === 'dick' || naechstes === 'groß') continue;
    // "Butter zu Sahne ruehren", "zu Schaum schlagen": ein Ergebnis, keine Zutat
    if (w[i - 1]?.w === 'zu') continue;

    const lebensmittel = rechner.zuordnen(heute);
    if (!lebensmittel) continue;

    // "½ Ei dick Butter": die Menge steckt im Vergleich
    if (w[i - 1]?.w === 'dick' || w[i - 1]?.w === 'groß') {
      const vergleich = w[i - 2]?.w?.toLowerCase();
      const zahl = w[i - 3]?.w && zahlAus(w[i - 3].w);
      const name = heutigeSchreibung(t);
      if (GROESSE[vergleich] && !gefunden.has(schluessel)) {
        gefunden.set(schluessel, { a: runde((zahl ?? 1) * GROESSE[vergleich]), u: 'g', n: name });
      } else if (!gefunden.has(schluessel)) {
        gefunden.set(schluessel, { a: null, u: '', n: name });
      }
      continue;
    }

    // Eigenschaftswoerter davor, hoechstens zwei. Im Dativ ("mit feinem
    // Zwieback") beschreiben sie die Zubereitung, nicht die Zutat.
    let anfang = i;
    const beiwoerter = [];
    for (let k = i - 1; k >= 0 && beiwoerter.length < 2; k -= 1) {
      const b = w[k].w;
      if (!b || KEIN_ADJEKTIV.has(b.toLowerCase()) || !ADJEKTIV.test(b) || MENGEN_ADJEKTIV.test(b)) break;
      if (!/em$/.test(b)) beiwoerter.unshift(b);
      anfang = k;
    }

    // Menge und Einheit davor: "¼ Pfund", "Ein Viertel Pfund", "2 gehäufte Eßlöffel voll", "4"
    let menge = null;
    let einheit = '';
    let k = anfang - 1;
    if (w[k]?.w?.toLowerCase() === 'voll') k -= 1;
    const e = w[k]?.w && einheitVon(w[k].w);
    if (e) k -= 1;
    while (w[k]?.w && MENGEN_ADJEKTIV.test(w[k].w)) k -= 1;
    let z1 = w[k]?.w && zahlAus(w[k].w);
    // Spanne "3—4 Eidotter": zaehlt mit ihrer Mitte
    if (z1 != null && /^[-—–]$/.test(w[k - 1]?.satzzeichen || '') && w[k - 2]?.w && zahlAus(w[k - 2].w) != null) {
      z1 = (zahlAus(w[k - 2].w) + z1) / 2;
      k -= 2;
    }
    if (z1 != null) {
      menge = z1;
      // "Ein Viertel", "ein halbes", "1 ½"
      const z0 = w[k - 1]?.w && zahlAus(w[k - 1].w);
      if (z0 != null && z1 < 1) menge = z0 >= 1 && /^\d/.test(w[k - 1].w) ? z0 + z1 : z0 * z1;
      if (e) {
        [menge, einheit] = umrechnen(menge, e, masse);
      } else if (/^[a-zäöüß]/.test(w[k].w) && menge === 1 && !e) {
        // "einen Apfel": ein Artikel, keine gezaehlte Menge — gilt trotzdem als eins
        menge = 1;
      }
    } else if (e && !['EL', 'TL', 'Msp', 'Prise', 'Stk', 'Scheibe', 'Bund'].includes(e)) {
      // "Pfund Butter" ohne Zahl: kommt vor, ist aber nicht zu deuten
      menge = null;
    } else if (e) {
      menge = 1;
      einheit = e;
    }

    if (NUR_MIT_MENGE.has(wort) && menge == null) continue;

    const name = heutigeSchreibung([...beiwoerter, t].join(' '));
    const bisher = gefunden.get(schluessel);
    if (!bisher) gefunden.set(schluessel, { a: menge, u: einheit, n: name });
    else if (bisher.a == null && menge != null) gefunden.set(schluessel, { a: menge, u: einheit, n: name });
  }

  return [...gefunden.values()];
}

// ---------------------------------------------- Umlaute und Grossschreibung

/**
 * Wortschatz aus dem heutigen Korpus: welche Schreibung ein Wort hat,
 * mit Umlaut oder ohne, gross oder klein. Daran werden Texte ohne Umlaute
 * ("Aepfel", "Huelsenfruechte") und Ueberschriften in Grossbuchstaben
 * wieder richtig geschrieben — nur, wo der Wortschatz die Form kennt.
 */
export function wortschatz(ziel = 'public/korpus') {
  const zaehlung = new Map();
  const zaehle = (text) => {
    for (const m of String(text).matchAll(/[A-Za-zÄÖÜäöüß]+/g)) {
      const wort = m[0];
      if (wort.length < 3) continue;
      const k = wort.toLowerCase();
      let formen = zaehlung.get(k);
      if (!formen) zaehlung.set(k, (formen = new Map()));
      formen.set(wort, (formen.get(wort) || 0) + 1);
    }
  };

  const datei = path.join(ziel, 'index.json');
  if (existsSync(datei)) {
    for (const t of JSON.parse(readFileSync(datei, 'utf8')).teile) {
      if (/^(davidis|schiller|heyl)/.test(t.buch)) continue;
      for (const r of JSON.parse(readFileSync(path.join(ziel, t.datei), 'utf8')).recipes) {
        zaehle(r.title);
        for (const z of r.ingredients) zaehle(z.n);
        for (const s of r.steps) zaehle(s);
      }
    }
  }

  const ascii = (s) => s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  const summe = (k) => [...(zaehlung.get(k)?.values() || [])].reduce((a, b) => a + b, 0);
  // Schweizer Rezepte schreiben "Klösse", "Griess"; die alten Buecher sind
  // aus Deutschland. Formen mit ß zaehlen deshalb fuenffach.
  const gewicht = (k) => summe(k) * (k.includes('ß') ? 5 : 1);
  const umlaut = new Map();
  for (const k of zaehlung.keys()) {
    if (!/[äöüß]/.test(k)) continue;
    const a = ascii(k);
    // Gibt es die Form ohne Umlaut haeufiger ("Masse" gegen "Maße"), bleibt sie.
    if (summe(a) >= gewicht(k)) continue;
    const bisher = umlaut.get(a);
    if (!bisher || gewicht(k) > gewicht(bisher)) umlaut.set(a, k);
  }

  const schreibung = (k) => {
    const formen = zaehlung.get(k);
    if (!formen) return null;
    return [...formen].sort((x, y) => y[1] - x[1])[0][0];
  };

  return { zaehlung, umlaut, schreibung };
}

/** Uebernimmt die Grossschreibung des Vorbilds */
function wieVorbild(vorbild, wort) {
  if (vorbild === vorbild.toUpperCase() && vorbild.length > 1) return wort.toUpperCase();
  if (/^[A-ZÄÖÜ]/.test(vorbild)) return wort[0].toUpperCase() + wort.slice(1);
  return wort;
}

/**
 * Setzt Umlaute und ß wieder ein, wo der Text sie durch ae/oe/ue/ss
 * ersetzt hat. Zusammengesetzte Woerter werden vom Ende her zerlegt:
 * "Selleriewuerfel" → "Sellerie" + "würfel".
 */
export function umlautWort(k, { umlaut, zaehlung }) {
  const ersetze = (k) => {
    if (umlaut.has(k)) return umlaut.get(k);
    if (zaehlung.has(k)) return k;
    // Zusammensetzungen vom Ende her ("selleriewuerfel" → "sellerie" + "würfel") …
    for (let n = Math.min(k.length - 2, 14); n >= 4; n -= 1) {
      const ende = k.slice(-n);
      if (!umlaut.has(ende)) continue;
      const kopf = k.slice(0, -n);
      return (/(ae|oe|ue|ss)/.test(kopf) ? ersetze(kopf) : kopf) + umlaut.get(ende);
    }
    // … und vom Anfang her ("gewuerzdosis" → "gewürz" + "dosis")
    for (let n = Math.min(k.length - 2, 14); n >= 4; n -= 1) {
      const anfang = k.slice(0, n);
      if (umlaut.has(anfang)) return umlaut.get(anfang) + k.slice(n);
    }
    return k;
  };
  return /(ae|oe|ue|ss)/.test(k) ? ersetze(k) : k;
}

export function umlauteSetzen(text, schatz) {
  return text.replace(/[A-Za-z]+/g, (wort) => {
    if (!/(ae|oe|ue|ss|Ae|Oe|Ue|AE|OE|UE|SS)/.test(wort)) return wort;
    const neu = umlautWort(wort.toLowerCase(), schatz);
    return neu === wort.toLowerCase() ? wort : wieVorbild(wort, neu);
  });
}

const KLEIN = new Set(['und', 'oder', 'mit', 'ohne', 'von', 'vom', 'zum', 'zur', 'in', 'im', 'auf', 'nach', 'aus',
  'für', 'als', 'an', 'am', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'zu', 'bei',
  'à', 'la', 'le', 'wie', 'auch', 'art', 'so']);

/** "BOHNEN-, LINSEN- ODER ERBSENSUPPE." → "Bohnen-, Linsen- oder Erbsensuppe" */
export function titelSchreibung(text, schatz) {
  const roh = text.trim().replace(/\.$/, '');
  if (roh !== roh.toUpperCase()) return umlauteSetzen(roh, schatz);
  let erstes = true;
  // Wort fuer Wort: erst Umlaute und ß ("WEISSKOHL" → "weißkohl"), dann die
  // uebliche Schreibung — in Grossbuchstaben gaebe es kein ß.
  return roh.replace(/[A-ZÄÖÜ]+/g, (wort) => {
    const k = umlautWort(wort.toLowerCase(), schatz);
    // Unbekannt: Hauptwort vermuten — ausser bei "zurechtzumachen", "aufzubewahren"
    let aus = schatz.schreibung(k) || (/^[a-zäöü]+zu[a-zäöü]+en$/.test(k) ? k : k[0].toUpperCase() + k.slice(1));
    if (KLEIN.has(k) && !erstes) aus = k;
    if (erstes) aus = aus[0].toUpperCase() + aus.slice(1);
    erstes = false;
    return aus;
  });
}

// ------------------------------------------------------------- Rechner

let rechnerCache;
/** Der Naehrwertabgleich der App, fuer die Frage "ist das ein Lebensmittel?" */
export function lebensmittelRechner() {
  rechnerCache ??= erstelleRechner(JSON.parse(readFileSync('src/data/naehrwerte.json', 'utf8')));
  return rechnerCache;
}

/** Zutatenzeile eines Buchs mit Liste (Heyl), alte Einheiten schon umgerechnet */
export function zutatenZeile(zeile, masse) {
  const m = zeile.match(/^(\S+)\s+(\S+)\s+(.*)$/);
  if (m) {
    const menge = zahlAus(m[1]);
    const e = einheitVon(m[2]);
    if (menge != null && e && e in masse) {
      const [a, u] = umrechnen(menge, e, masse);
      return { a, u, n: m[3] };
    }
  }
  const p = parseIngredientLine(zeile);
  return { a: p.amount, u: p.unit, n: p.name };
}
