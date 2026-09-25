/**
 * Die Kochbücher von Köche-Nord.de (Marcus Petersen-Clausen): gut hundert
 * PDF-Bücher, urheberrechtlich geschützt und unter Creative Commons BY-SA
 * 3.0 freigegeben — nutzbar mit Namensnennung und unter gleichen
 * Bedingungen. Jedes Buch nennt die Lizenz auf der Titelseite; Bücher
 * ohne diesen Vermerk bleiben außen vor.
 *
 * Die Rezepte stehen in fester Form: Titel, "Menge: 4 Portionen",
 * Zutatenzeilen, dann die Zubereitung als Fließtext.
 *
 * Das Lesen der PDFs übernimmt scripts/korpus/pdftext.py (pypdf); nur der
 * Text wird gemerkt, die PDFs selbst werden nach dem Lesen gelöscht.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { abruf, weiterleitung, ladeDatei, gemerkt } from '../abruf.mjs';
import { saetze, einordnen, wikiId, menge } from '../../../src/sources/wikitext.js';
import { parseIngredientLine } from '../../../src/sources/ingredients.js';
import { decodeEntities } from '../../../src/sources/schemaorg.js';
import { allergensFor } from '../../../src/state/allergens.js';
import { lebensmittelRechner } from '../historisch.mjs';

const SEITE = 'https://xn--kche-nord-07a.de';
const AUTOR = 'Marcus Petersen-Clausen';
const UEBERSICHTEN = [`${SEITE}/kochbuecher.html`, `${SEITE}/Naehrstoffmangel-vegan.html`];
const LIZENZ = /Creative\s*Common|CC[\s-]*BY|BY[\s-­]*SA/i;
/** Bücher, die ihr Autor selbst als KI-erzeugt kennzeichnet: nicht erprobt, oft fehlerhaft */
const KI = /künstliche[rn]?\s+Intelligenz|\bKI[\s-](?:generiert|erstellt|gemacht)|ChatGPT/i;

// ------------------------------------------------------------ Bücher finden

/** Einträge einer Übersichtsseite: Titel und Ziel (Forum-Eintrag, Unterseite oder PDF). */
function eintraege(html) {
  const out = [];
  const re = /<a class="header" download href="([^"]+)">([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const titel = decodeEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (titel) out.push({ titel, ziel: m[1] });
  }
  return out;
}

/** Vom Eintrag zum PDF: Forum-Einträge und Kurzlinks leiten weiter, Unterseiten verlinken es. */
async function pdfAdresse(ziel) {
  let url = ziel.replace(/^http:/, 'https:');
  for (let i = 0; i < 3 && !/\.pdf(\?|#|$)/i.test(url); i += 1) {
    if (/viewforum|cutt\.ly/.test(url)) {
      const weiter = await weiterleitung(url.replace(/^https:\/\/forum/, 'http://forum'));
      if (!weiter) return null;
      url = weiter;
    } else if (/\.html?$/.test(url)) {
      const html = await abruf(url, { json: false, abstand: 3000 });
      const pdf = html.match(/href="([^"]+\.pdf)"/i);
      if (!pdf) return null;
      url = new URL(pdf[1], url).href;
    } else {
      return null;
    }
  }
  return /\.pdf(\?|#|$)/i.test(url) ? url : null;
}

/** Text eines PDFs, Seite für Seite — beim ersten Mal geladen und gelesen, danach gemerkt. */
async function pdfText(url) {
  return gemerkt(`pdftext:${url}`, async () => {
    const ordner = mkdtempSync(path.join(tmpdir(), 'koechenord-'));
    const datei = path.join(ordner, 'buch.pdf');
    try {
      await ladeDatei(url, datei, { abstand: 10000 });
      // Ein toter Link liefert eine HTML-Seite statt des Buchs
      if (readFileSync(datei).subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('kein PDF unter dieser Adresse');
      try {
        return JSON.parse(execFileSync('python3', ['scripts/korpus/pdftext.py', datei], {
          encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
        }));
      } catch (err) {
        const grund = String(err.stderr || '').trim().split('\n').pop();
        throw new Error(`PDF nicht lesbar: ${grund || err.message}`);
      }
    } finally {
      rmSync(ordner, { recursive: true, force: true });
    }
  });
}

// ------------------------------------------------------------ Text aufbereiten

/** Fett gesetzte Überschriften liegen doppelt im Text: "VVoorrssppeeiisseenn::" */
export function entdoppeln(zeile) {
  // "MMaannggoolldd:" — der Doppelpunkt steht nur einmal da
  if (zeile.length >= 5 && zeile.length % 2 === 1 && /[:.]$/.test(zeile)) {
    const ohne = entdoppeln(zeile.slice(0, -1));
    if (ohne.length < zeile.length - 1) return `${ohne}${zeile.slice(-1)}`;
  }
  if (zeile.length >= 4 && zeile.length % 2 === 0) {
    const a = zeile.slice(0).split('').filter((_, i) => i % 2 === 0).join('');
    const b = zeile.split('').filter((_, i) => i % 2 === 1).join('');
    if (a === b) return a;
  }
  return zeile;
}

/**
 * Auch nur teilweise fett: "FFoorrttsseettzzuunngg:: Tomatensalat", "32PPEETTAAss".
 * Drei doppelte Zeichen hintereinander kommen in deutschen Wörtern nicht vor.
 */
const sauber = (zeile) => entdoppeln(zeile.replace(/­/g, '-').replace(/[‐‑]/g, '-').replace(/\s+/g, ' ').trim())
  .replace(/(?:(.)\1){3,}/g, (lauf) => lauf.replace(/(.)\1/g, '$1'))
  // Kurze Wörter ganz doppelt: "Rinderbäckchen iimm Spätburgunder"
  .split(' ').map((wort) => (wort.length >= 4 ? entdoppeln(wort) : wort)).join(' ');

/**
 * Zeilen, die auf vielen Seiten wiederkehren, sind Kopfzeilen oder
 * Werbung des Herausgebers ("Was ist ein Sterbehospiz? …") und gehören zu
 * keinem Rezept.
 */
export function zeilenMitSeite(seiten) {
  const haeufigkeit = new Map();
  const amRand = new Map();
  const roh = seiten.map((text) => text.split('\n').map(sauber).filter(Boolean));
  for (const zeilen of roh) {
    for (const z of new Set(zeilen)) haeufigkeit.set(z, (haeufigkeit.get(z) || 0) + 1);
    // Kopf- und Fußzeilen eines Kapitels ("Feines zu Beginn (Vorspeisen)") stehen oben oder unten
    for (const z of new Set([...zeilen.slice(0, 2), ...zeilen.slice(-2)])) amRand.set(z, (amRand.get(z) || 0) + 1);
  }
  const grenze = Math.max(3, seiten.length * 0.3);
  const out = [];
  roh.forEach((zeilen, i) => {
    zeilen.forEach((z, j) => {
      const randzeile = (j < 2 || j >= zeilen.length - 2) && (amRand.get(z) || 0) >= 3 && !/^Menge\s*:/i.test(z);
      // Seitenzahlen, auch als "74 / 82" mit wechselnder Fußzeile dahinter
      if (randzeile || (haeufigkeit.get(z) || 0) >= grenze || /^\d{1,3}$/.test(z) || /^\d{1,3}\s*\/\s*\d{1,3}\b/.test(z)) return;
      out.push({ z, seite: i + 1 });
    });
  });
  return out;
}

// ------------------------------------------------------------ Rezepte lesen

const ABSCHNITT = [
  [/vorspeise|vorsuppe|antipast|fingerfood|snack|tapas/i, 'Vorspeise'],
  [/hauptspeise|hauptgericht|hauptgäng|hauptgang/i, 'Hauptgericht'],
  [/suppe|eintopf/i, 'Suppe'],
  [/salat/i, 'Salat'],
  [/beilage/i, 'Beilage'],
  [/sauce|soße|dip|dressing|aufstrich|grundrezept/i, 'Grundrezept'],
  [/dessert|nachspeise|nachtisch|süßspeise|eis\b/i, 'Dessert'],
  [/kuchen|torte|gebäck|backen|backwaren|brot|brötchen|kekse|plätzchen/i, 'Backen'],
  [/getränk|cocktail|drink|smoothie|likör/i, 'Getränk'],
  [/frühstück/i, 'Frühstück'],
];
const MAHLZEITEN = {
  Suppe: ['mittag', 'abend'], Hauptgericht: ['mittag', 'abend'], Beilage: ['mittag', 'abend'],
  Salat: ['mittag', 'abend'], Vorspeise: ['abend', 'snack'], Dessert: ['snack'], Backen: ['snack'],
  Grundrezept: ['snack'], Getränk: ['snack'], Frühstück: ['fruehstueck'],
};

/** Menge vorn: "250 Gramm …", "½ Teelöffel …", "etwas …", "1 Prise …" */
const MENGE_VORN = /^(\d|½|¼|¾|⅓|⅔|⅛|etwas\b|einige\b|eine?\b|ein paar\b|nach (eigenem )?(Belieben|Bedarf|Geschmack)|Saft\b|Schale\b|Prise\b|je\b|reichlich\b|wenig\b)/i;
/** "Das Rezept ergibt 3 Pizzen." unter der Menge: ein Hinweis, keine Zutat */
const ERGIBT = /^(Das Rezept|Der Teig|Die Menge)\s+(ergibt|reicht)\b/i;
/** Die Bücher sprechen ihre Leser an, "Schälen Sie …" — eine Zutat tut das nie */
const SATZ = /\b(Sie|wir|man|Ihnen)\b/;
/** Hinweise des Herausgebers auf Vereine und Seiten, die er unterstützt */
const WERBUNG = /https?:\/+|www\.|\.html?\b|\b[a-z-]{3,}\/[a-z0-9-]+\/[a-z0-9-]+|\b[\w-]+\.(de|at|ch|com|org|net|eu|DE|AT|CH|COM|ORG|NET|EU)\b|\bWerbung\b|\bPETA|Veganstart|WIR KÄMPFEN/;
/** Wahlkampf zwischen den Rezepten: "Fragen an unseren Direktkandidaten …" */
const POLITIK = /partei|kandidat|abgeordnete|bundestagswahl|wahlprogramm|grundsatzprogramm/i;
/** Rest eines umbrochenen Links: "partei/grundsatzprogramm" — klein geschrieben, anders als "Oberhitze/Unterhitze" */
const PFAD = /\b[a-z-]{4,}\/(?:[a-z0-9-]{4,}|\s|$)/;
/**
 * Bücher, die Rezepte mit Politik verweben — Wahlkampf, Widmungen an
 * Diktatoren. Die Gerichte darin wären unverfänglich, der Text drumherum
 * gehört nicht in einen Wochenplaner.
 */
const POLITISCH = /Bundestagswahl|Parlament|Bundestag|Autokraten|Despoten|Putin/i;
/** Zwischenüberschrift im Rezept: "Für den Teig:", "Außerdem:", "Salat:" */
const ZWISCHENKOPF = /^[A-ZÄÖÜ](?:[^.!?]|\.(?!\s)){0,50}:$/;
/** Dasselbe ohne Doppelpunkt: "Dressing" über seinen Zutaten */
const GRUPPE = /^(Dressing|Teig|Füllung|Soße|Sauce|Marinade|Belag|Garnitur|Topping|Streusel|Glasur|Deko(ration)?|Außerdem|Zum (Servieren|Garnieren|Bestreuen|Anrichten|Braten))$/i;
/** "Unser Tipp:", "Tipp: …", "Hinweis" — nicht aber "Tipp)." am Ende von "(siehe Tipp)." */
const TIPP = /^(Unser(e)?\s+)?(Tipps?|Hinweis|Info|Anmerkung)(\s*:.*)?$/i;
/** "1 Riegel = 96 kcal, 9 g Fett": Nährwerte des Buchs, keine Anleitung */
const NAEHRWERTZEILE = /\b\d+\s*kcal\b/i;
/**
 * Ein Abschnitt des Buchs, kein Gericht: "Salate", "Suppen und Eintöpfe",
 * "Desserts/Nachspeisen" — nicht "Tomatensalat" oder "Musiktipp1".
 */
const istAbschnitt = (z) => /^[A-ZÄÖÜ]/.test(z) && !/\d|tipp|empfehl/i.test(z)
  && (/(salate|suppen|eintöpfe|speisen|gerichte|beilagen|saucen|soßen|dips|desserts|nachtische|kuchen|torten|gebäck|getränke|drinks|cocktails|snacks|frühstück|brote|aufstriche|backwaren|tapas|antipasti|fingerfood)\b/i.test(z)
    // Gruppen aus einzelnen Wörtern: "Obst und Gemüse", "Kuchen, Gebäcke, Herzhaftes", "Gemüse/Kohl"
    || z.split(/\s*(?:,|\/\/?|\bund\b)\s*/).every((teil, _, alle) => alle.length > 1 && /^[A-ZÄÖÜ][\wäöüß-]*$/.test(teil)));
/** Was nach dem Rezept kommt: Nährwertkästen, Länderkunde, Anhang */
const ANHANG = /^(Nährwert(angaben|e|tabelle)?|Wissenswertes|Hintergrund|Geschichte|Herkunft|Hauptstadt|Einwohner(zahl)?|Neugierig geworden|Diverses|Quellen(angaben)?|Bildnachweis|Fotos?\b|Besuchen Sie|Weitere (Rezepte|Kochbücher)|Unsere Partner|Wir unterstützen|Unterstützen Sie)/i;
/** Spendenaufrufe zwischen den Schritten: "Animal Equality nutzt verschiedene Strategien …" */
const AUFRUF = /\b(Spenden?|spenden|gemeinnützig|Tierschutzorganisation|Gnadenhof|Tierheim|e\.\s?V\.|IBAN|BIC|Sparkasse|Bankverbindung|Kontonummer|Naturschutz\w*)(?=\W|$)|animal\s?equality|zum Download|Mitglied (im|in der)\b/i;
/** "(siehe Tipp auf Seite: 29)": in der App gibt es keine Seite 29 */
const SIEHE_SEITE = /\s*\((?:siehe|vgl\.)[^)]*Seite:?\s*\d+[^)]*\)/gi;
/** Zeilen aus dem Inhaltsverzeichnis: "Quark-Trauben-Creme (vegan) Seite: 55" */
const VERZEICHNIS = /\bSeite:?\s*\d+\s*$|^Index\b/i;
/** "Arbeitszeit: etwa 30 Minuten Backzeit: etwa 15 Minuten" */
const ZEITANGABE = /^(Arbeitszeit|Zubereitungszeit|Vorbereitungszeit|Kochzeit|Backzeit|Garzeit|Ruhezeit|Gesamtzeit)\s*:/i;
/** Die Bücher schreiben ihre Anleitungen in der Sie-Form */
const ANREDE = /\b(Sie|Ihnen|Ihr|Ihre|bitte)\b/;
const ENDE = /^(Index|Inhalt|Inhaltsverzeichnis|Register|Impressum|Imprint)\s*:?$/i;

/** Eine Zeile sieht nach Zutat aus: Menge vorn, oder kurz und ohne Satzbau */
function istZutat(z) {
  if (!z || WERBUNG.test(z) || ERGIBT.test(z)) return false;
  // Was in Klammern steht, darf die Leser ansprechen: "(… wenn Sie Vegetarier sind)"
  const ohneKlammern = z.replace(/\([^)]*\)?/g, '');
  if (MENGE_VORN.test(z)) {
    if (/[.!?]$/.test(z) && z.length >= 45) return false;
    return z.length <= 140 && (!SATZ.test(ohneKlammern) || z.length < 45);
  }
  return z.length <= 55 && !/[.!?:]$/.test(z) && !SATZ.test(ohneKlammern);
}

const kopf = (z) => (ZWISCHENKOPF.test(z) && !TIPP.test(z)) || GRUPPE.test(z);
const offeneKlammer = (z) => (z.match(/\(/g) || []).length > (z.match(/\)/g) || []).length;
/**
 * "1/2 Kopf Blattsalat, 1/2 Kopf Eisbergsalat": zwei Zutaten in einer Zeile.
 * "Kräutersalz, 1-2 Teelöffel" bleibt eine — dem zweiten Teil fehlt der Name.
 */
function einzeln(z) {
  const teile = [];
  for (const teil of z.split(/,\s+(?=(?:\d[\d,./-]*|½|¼|¾|⅓|⅔)\s)/)) {
    if (teile.length && !(parseIngredientLine(teil).name?.length > 1)) teile[teile.length - 1] += `, ${teil}`;
    else teile.push(teil);
  }
  return teile;
}
/** Ein Titel ist kurz und kein Satz — sonst steht vor "Menge:" ein Rest Fließtext */
const istTitel = (z) => Boolean(z) && z.length <= 90 && !/[.:!?,;]$/.test(z) && !werbungImTitel(z) && !SATZ.test(z);

const TIERISCH = new Set(['milch', 'eier']);
const FLEISCH_ODER_FISCH = new Set(['fisch', 'krebstiere', 'weichtiere']);
/** Vom Tier, aber kein Allergen: Gelatine, Schmalz, Brühe aus Fleisch oder Fisch */
const FLEISCHIG = new Set(['gelatine', 'schmalz', 'talg', 'fleischbruehe', 'huehnerbruehe', 'fischfond']);

/**
 * Was eine Zutat für die Ernährungsform bedeutet: 'fleisch' (auch Fisch),
 * 'tier' (Milch, Ei, Honig) oder nichts. "Vegane Butter" ist nichts davon.
 */
function herkunft(name) {
  const allergene = allergensFor(name).filter((a) => a.level === 'ja').map((a) => a.id);
  const e = lebensmittelRechner().zuordnen(name);
  if (allergene.some((a) => FLEISCH_ODER_FISCH.has(a)) || e?.ersatz === 'fleischersatz'
    || (FLEISCHIG.has(e?.id) && !/vegan/i.test(name))) return 'fleisch';
  if (allergene.some((a) => TIERISCH.has(a)) || e?.ersatz) return 'tier';
  return null;
}

/**
 * Vegan ist, was das Buch oder der Titel so nennt und die Zutaten bestätigen.
 * Steht in einem veganen Buch schlicht "Butter", gilt das Rezept nicht als vegan.
 */
function ernaehrung(behauptet, ingredients, ausTitel) {
  if (!behauptet) return ausTitel.filter((d) => d !== 'vegan');
  const arten = new Set(ingredients.map((z) => herkunft(z.n)));
  if (arten.has('fleisch')) return [];
  if (arten.has('tier')) return ['vegetarisch'];
  return ['vegan', 'vegetarisch'];
}

/**
 * "Béchamel-Lasagne (MIT BILD, vegan)" → "Béchamel-Lasagne (vegan)";
 * "3. Adolf Hitler -- Gefüllte Weintrauben" → "Gefüllte Weintrauben":
 * die Zählung und die Widmung des Buchs sind nicht Teil des Gerichts.
 */
export function titelAufraeumen(titel) {
  return titel
    .replace(/\s*\(.*?Seite.*?\)\s*$/i, '')
    .replace(/\bMIT BILD\b,?\s*/gi, '')
    .replace(/,\s*\)/g, ')')
    .replace(/\s*\(\s*\)/g, '')
    .replace(/^\d+\.\s+.+?\s+--\s+/, '')
    // Der Name des Autors steht in der Quellenangabe, nicht im Titel
    .replace(/\s*\(Köche-Nord\.de\)|\s+von Marcus Petersen-Clausen\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Vorbereitungs- und Garzeit in Minuten aus den Zeitangaben am Ende eines Rezepts */
export function zeitenAus(text) {
  const zeiten = {};
  const re = /(Arbeitszeit|Zubereitungszeit|Vorbereitungszeit|Kochzeit|Backzeit|Garzeit)\s*:\s*(?:etwa|ca\.?|circa)?\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*(Minuten|Min\.?|Stunden?|Std\.?)/gi;
  for (const m of text.matchAll(re)) {
    let minuten = m[3] ? (Number(m[2]) + Number(m[3])) / 2 : Number(m[2]);
    if (/^S/i.test(m[4])) minuten *= 60;
    const feld = /koch|back|gar/i.test(m[1]) ? 'cook' : 'prep';
    zeiten[feld] = Math.round((zeiten[feld] || 0) + minuten);
  }
  return zeiten;
}

/**
 * Beginnt bei `k` ein Rezept ohne "Menge:"-Zeile? Ein Titel, darunter
 * zwei Zutaten — oder erst eine Zwischenüberschrift wie "Für den Hefeteig:".
 */
function neuesRezept(zeilen, k, bis) {
  if (k >= bis || !istTitel(zeilen[k].z) || MENGE_VORN.test(zeilen[k].z)) return false;
  const d = k + 1 < bis && kopf(zeilen[k + 1].z) ? 2 : 1;
  return k + d + 1 < bis && [d, d + 1].every((x) => MENGE_VORN.test(zeilen[k + x].z) && istZutat(zeilen[k + x].z));
}

/** Eine Zeile, die zu einem mehrzeiligen Titel gehören kann: "mit Tomatensauce, Käse," */
const titelTeil = (z) => Boolean(z) && z.length <= 90 && !/[.:!?;]$/.test(z) && !werbungImTitel(z) && !SATZ.test(z)
  && !ZEITANGABE.test(z) && !VERZEICHNIS.test(z) && !/\bSeite\b/.test(z);
/** Ein Gericht "a la Köche-Nord.de" wirbt nicht */
const werbungImTitel = (z) => WERBUNG.test(z.replace(/Köche-Nord\.de/gi, ''));
/** Zweite Titelzeile: "mit Frischkäse, Paprika …", "Mit Hefe gebacken, schnell zubereitet" */
const FORTSETZUNG = /^([a-zäöüß]|(Mit|Und|Oder|An|Auf|In|Nach|Vom|Von|Zum|Zur|Dazu)\s)/;

/**
 * Schneidet ab, was nach der Anleitung kommt. Wo die ersten Schritte den
 * Leser ansprechen ("Schälen Sie …"), enden die Schritte, sobald drei Sätze
 * hintereinander das nicht mehr tun — dann folgt Wissenswertes über
 * Pinienkerne oder die Frauen-Bundesliga.
 */
function anleitung(saetze) {
  // "Besuchen Sie bitte auch: …" — ab hier folgt der Anhang des Buchs
  const anhang = saetze.findIndex((s, x) => x > 0 && ANHANG.test(s));
  let out = anhang > 0 ? saetze.slice(0, anhang) : saetze;
  if (out.length >= 4 && out.slice(0, 2).every((s) => ANREDE.test(s))) {
    const j = out.findIndex((_, x) => x >= 2 && x + 2 < out.length && ![x, x + 1, x + 2].some((y) => ANREDE.test(out[y])));
    if (j > 0) out = out.slice(0, j);
  }
  // Am Ende ohne Satzzeichen und ohne Anrede: der Titel des nächsten Rezepts, keine Anweisung
  while (out.length > 1 && !/[.!?)"“]$/.test(out[out.length - 1]) && !ANREDE.test(out[out.length - 1]) && out[out.length - 1].length < 90) {
    out = out.slice(0, -1);
  }
  return out;
}

/**
 * Liest die Rezepte eines Buchs.
 * @param {{z:string, seite:number}[]} zeilen
 * @param {{titel:string, pdf:string, vegan:boolean, jahr?:string}} buch
 */
export function rezepteAusBuch(zeilen, buch) {
  const recipes = [];
  const anker = [];
  zeilen.forEach((x, i) => { if (/^Menge\s*:/i.test(x.z)) anker.push(i); });

  // Der Abschnitt ("Hauptspeisen:") steht direkt über dem ersten Rezept
  // und gilt bis zum nächsten; Zwischenüberschriften im Rezept zählen nicht
  let abschnitt = '';

  // "Pizza Capricciosa" / "mit Tomatensauce, Käse, …" / "und Mozzarella":
  // der Titel reicht über mehrere Zeilen, die Fortsetzungen beginnen klein
  // "Angeregt von Christian Pander (…)" unter dem Gericht ist eine Widmung
  const WIDMUNG = /^(Angeregt|Inspiriert|Gewidmet|Empfohlen)\s+(von|durch)\b|^Nach einer Idee von\b/i;
  const titelBis = anker.map((i) => (zeilen[i - 1] && WIDMUNG.test(zeilen[i - 1].z) && titelTeil(zeilen[i - 2]?.z) ? i - 1 : i));
  const titelAb = anker.map((_, n) => {
    const i = titelBis[n];
    let von = i - 1;
    while (von > 0 && i - von < 4 && FORTSETZUNG.test(zeilen[von].z) && titelTeil(zeilen[von - 1].z)
      && !istAbschnitt(zeilen[von - 1].z)) von -= 1;
    return von;
  });

  anker.forEach((i, n) => {
    const bis = titelBis[n];
    if (!zeilen[bis - 1] || !istTitel(zeilen[bis - 1].z)) return;
    const von = titelAb[n];
    // "Mit Hefe gebacken" als zweite Zeile wird "… mit Hefe gebacken"
    const teile = zeilen.slice(von, bis).map((x, t) => (t > 0 ? x.z.replace(/^(Mit|Und|Oder|An|Auf|In|Nach|Vom|Von|Zum|Zur|Dazu)\s/, (w) => w.toLowerCase()) : x.z));
    const titelZeile = { z: teile.join(' '), seite: zeilen[von].seite };
    const kopfAb = von - 1;
    for (const k of [kopfAb, kopfAb - 1]) {
      const z = zeilen[k]?.z?.replace(/:$/, '');
      // Mit oder ohne Doppelpunkt: "Hauptspeisen:", "Suppen und Eintöpfe"
      if (z && z.length <= 50 && istTitel(z) && !/^(Für|Zum|Außerdem)\b/i.test(z) && istAbschnitt(z)) { abschnitt = z; break; }
    }
    const title = titelAufraeumen(titelZeile.z);
    // "Fortsetzung: …" setzt ein Rezept der Vorseite fort, das schon gelesen ist;
    // "mit Pommes Frites" allein ist die zweite Zeile eines Titels, der fehlt
    if (title.length > 150 || /^Fortsetzung\b/i.test(title) || /^(mit|und|oder|dazu)\b/.test(title)) return;

    const ertrag = menge(zeilen[i].z.replace(/^Menge\s*:\s*/i, ''));
    const naechster = n + 1 < anker.length ? titelAb[n + 1] : zeilen.length;

    // Zutaten bis zur ersten Zeile, die nach Satz aussieht
    const zutaten = [];
    let k = i + 1;
    while (k < naechster) {
      let z = zeilen[k].z;
      if (WERBUNG.test(z) || ERGIBT.test(z)) { k += 1; continue; }
      if (kopf(z)) {
        // Gehört zu den Zutaten, wenn eine folgt; sonst beginnt die Zubereitung
        if (MENGE_VORN.test(zeilen[k + 1]?.z || '') && istZutat(zeilen[k + 1].z)) { k += 1; continue; }
        break;
      }
      if (!istZutat(z)) break;
      k += 1;
      // Eine Klammer, die erst in einer der nächsten Zeilen schließt
      for (let mehr = 0; mehr < 3 && offeneKlammer(z) && k < naechster && zeilen[k].z.length < 110
        && !SATZ.test(zeilen[k].z) && !MENGE_VORN.test(zeilen[k].z); mehr += 1) {
        z = `${z} ${zeilen[k].z}`;
        k += 1;
      }
      zutaten.push(...einzeln(z));
    }

    // Zubereitung bis zum nächsten Rezept, einem Tipp, einem Anhang oder dem Register
    const text = [];
    let zeitangaben = '';
    for (; k < naechster; k += 1) {
      const z = zeilen[k].z;
      // Die Zeitangaben schließen ein Rezept ab
      if (ZEITANGABE.test(z)) { zeitangaben += ` ${z}`; continue; }
      if (zeitangaben || ENDE.test(z) || TIPP.test(z) || ANHANG.test(z) || NAEHRWERTZEILE.test(z)) break;
      // Großbuchstaben über einem Spendenaufruf: "DIE WELT FÜR TIERE VERÄNDERN"
      if (/^[A-ZÄÖÜ0-9 ,.!-]{12,}$/.test(z) && /[A-ZÄÖÜ]{3,}\s+[A-ZÄÖÜ]{3,}/.test(z)) continue;
      // Ein Rezept ohne "Menge:" — ein Titel, darunter Zutaten —, auch mit Abschnitt darüber
      if (text.length && (neuesRezept(zeilen, k, naechster) || (istTitel(z) && neuesRezept(zeilen, k + 1, naechster)))) break;
      // "Fortsetzung: Mohnstollen" über der Folgeseite, "Bild: …" unter einem Foto
      if (WERBUNG.test(z) || POLITIK.test(z) || PFAD.test(z) || AUFRUF.test(z) || VERZEICHNIS.test(z) || kopf(z) || ERGIBT.test(z) || /^(Fortsetzung\b|Bild(er)?:|Foto:|Abbildung:)/i.test(z)) continue;
      text.push(z);
    }
    // Eine kurze Zeile nach dem letzten Satz ist eine Überschrift des nächsten Abschnitts
    while (text.length > 1 && /[.!?)]$/.test(text[text.length - 2]) && /^[A-ZÄÖÜ]/.test(text[text.length - 1])
      && istTitel(text[text.length - 1]) && text[text.length - 1].length < 60) text.pop();
    const fliesstext = text.join(' ').replace(/(\w)- (?=[a-zäöüß])/g, '$1').replace(SIEHE_SEITE, '').replace(/\s+/g, ' ').trim();
    const steps = anleitung(saetze(fliesstext).filter((s) => s.length > 10 && !AUFRUF.test(s) && !POLITIK.test(s) && !PFAD.test(s) && !WERBUNG.test(s)));
    const zeiten = zeitenAus(zeitangaben);

    const ingredients = zutaten
      // "½ Teelöffel, gestrichen Salz" → "½ Teelöffel Salz (gestrichen)"
      .map((z) => z.replace(SIEHE_SEITE, '').replace(/^(\S+\s+(?:Teelöffel|Esslöffel|EL|TL)),\s*(gestrichen|gehäuft)\s+(.+)$/i, '$1 $3 ($2)'))
      .map((z) => parseIngredientLine(z.replace(/^(etwas|nach (eigenem )?(Belieben|Bedarf|Geschmack))\s+/i, 'etwas ')))
      .filter((p) => p.name && p.name.length > 1)
      .map((p) => ({ a: p.amount, u: p.unit, n: p.name }));

    const regel = ABSCHNITT.find(([re]) => re.test(abschnitt));
    const einordnung = regel
      ? { ...einordnen([], title), category: regel[1], meals: MAHLZEITEN[regel[1]] }
      : einordnen([], title);
    const ausTitel = einordnung.diet || [];

    recipes.push({
      id: wikiId('koechenord', title),
      sourceId: 'koeche-nord',
      title,
      chapter: abschnitt,
      ...einordnung,
      diet: ernaehrung(buch.vegan || ausTitel.includes('vegan'), ingredients, ausTitel),
      servings: ertrag?.zahl || 4,
      yieldUnit: ertrag?.einheit || null,
      ...zeiten,
      ingredients,
      steps,
      // Namensnennung, wie die Lizenz sie verlangt: Werk, Urheber, Jahr, Fundstelle
      quelle: { titel: buch.titel, autor: AUTOR, ...(buch.jahr ? { jahr: buch.jahr } : {}), seite: String(titelZeile.seite) },
      sourceUrl: `${buch.pdf}#page=${titelZeile.seite}`,
    });
  });
  return recipes;
}

/**
 * Buchtitel, wie ihn die Übersichtsseite nennt, ohne Formatangaben:
 * "Zucchini Kochbuch (PDF-Buch, vegan)" → "Zucchini Kochbuch"
 */
export function buchtitel(eintrag) {
  const titel = String(eintrag)
    .replace(/\s*\((?:[^()]*\bPDF\b[^()]*|vegan|NICHT vegan!?)\)\s*$/i, '')
    .replace(/\s*\(PDF[\s-]*(?:Buch|Datei)[^)]*\)/gi, '')
    // Eine Klammer, die nicht mehr schließt: "Sodbrennen Kochbuch (Kochbuch gegen Sodbrennen"
    .replace(/\s*\([^)]*$/, '')
    .replace(/\s+/g, ' ')
    .trim() || String(eintrag);
  // "deutsches Kochbuch" steht als Werktitel groß
  return titel.charAt(0).toUpperCase() + titel.slice(1);
}

/** Das Buch nennt sich vegan — "NICHT vegan!" heißt das Gegenteil */
export const istVeganesBuch = (eintrag) => /vegan/i.test(eintrag) && !/nicht\s+vegan/i.test(eintrag);

export default {
  name: 'koeche-nord',
  beschreibung: 'Köche-Nord.de, PDF-Kochbücher unter CC BY-SA 3.0',
  async laden({ fortschritt }) {
    // Alle Einträge der Übersichtsseiten, je Ziel einmal
    const ziele = new Map();
    for (const seite of UEBERSICHTEN) {
      const html = await abruf(seite, { json: false, abstand: 3000 });
      for (const e of eintraege(html)) if (!ziele.has(e.ziel)) ziele.set(e.ziel, e.titel);
    }

    // Zu jedem Eintrag das PDF; mehrere Einträge können auf dasselbe führen
    const pdfs = new Map();
    for (const [ziel, titel] of ziele) {
      const pdf = await pdfAdresse(ziel).catch(() => null);
      if (pdf && !pdfs.has(pdf)) pdfs.set(pdf, titel);
    }

    const recipes = [];
    const ohneLizenz = [];
    const mitKi = [];
    const politisch = [];
    const gesehen = new Set();
    let n = 0;
    for (const [pdf, eintrag] of pdfs) {
      n += 1;
      fortschritt?.(n, pdfs.size, 'Bücher');
      let text;
      try {
        text = await pdfText(pdf);
      } catch (err) {
        process.stderr.write(`\n  ${eintrag}: ${err.message} (${pdf})\n`);
        continue;
      }
      const anfang = text.seiten.slice(0, 3).join('\n');
      // Nur Bücher, die die freie Lizenz selbst nennen
      if (!LIZENZ.test(anfang)) {
        ohneLizenz.push(eintrag);
        continue;
      }
      // Und keine, die laut Titelseite eine KI geschrieben hat
      if (KI.test(anfang.replace(/\s+/g, ' '))) {
        mitKi.push(eintrag);
        continue;
      }
      if (POLITISCH.test(`${eintrag} ${text.meta?.Title || ''}`)) {
        politisch.push(eintrag);
        continue;
      }
      const buch = {
        titel: buchtitel(eintrag),
        pdf,
        vegan: istVeganesBuch(eintrag),
        // "(c) 2023 Marcus Petersen-Clausen" im Lizenzvermerk
        jahr: anfang.match(/(?:\(c\)|©)\s*((?:19|20)\d\d)/i)?.[1],
      };
      for (const r of rezepteAusBuch(zeilenMitSeite(text.seiten), buch)) {
        // Dasselbe Rezept steht oft in mehreren Büchern; es zählt das erste
        const schluessel = `${r.title.toLowerCase()}|${r.ingredients.slice(0, 3).map((z) => z.n.toLowerCase()).join(',')}`;
        if (gesehen.has(schluessel)) continue;
        gesehen.add(schluessel);
        recipes.push(r);
      }
    }
    if (ohneLizenz.length) {
      process.stderr.write(`\n  ohne Lizenzvermerk, nicht übernommen (${ohneLizenz.length}): ${ohneLizenz.join('; ')}\n`);
    }
    if (mitKi.length) {
      process.stderr.write(`\n  laut Titelseite KI-erzeugt, nicht übernommen (${mitKi.length}): ${mitKi.join('; ')}\n`);
    }
    if (politisch.length) {
      process.stderr.write(`\n  Politik zwischen den Rezepten, nicht übernommen (${politisch.length}): ${politisch.join('; ')}\n`);
    }

    return {
      sourceId: 'koeche-nord',
      vorgaben: {
        cuisine: 'International',
        tags: ['Köche-Nord'],
        note: 'Köche-Nord.de, lizenziert unter CC BY-SA 3.0. Für die App in Zutaten und Arbeitsschritte gegliedert, '
          + 'Tipps, Werbe- und Spendenhinweise weggelassen.',
      },
      recipes,
      gelesen: pdfs.size,
      gelesenAls: 'PDF-Büchern',
    };
  },
};
