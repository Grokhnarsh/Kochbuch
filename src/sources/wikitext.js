/**
 * Gemeinsame Werkzeuge fuer Rezeptseiten aus MediaWiki-Wikis: Koch-Wiki,
 * Wikibooks-Kochbuch und Rezepte-Wiki schreiben alle Wikitext, nur jedes
 * mit eigenen Vorlagen. Was sie teilen — Abschnitte, Aufzaehlungen,
 * Zutatentabellen, Zeit- und Mengenangaben, die Einordnung nach
 * Kategorien —, steht hier.
 */

import { parseIngredientLine } from './ingredients.js';
import { decodeEntities } from './schemaorg.js';

/**
 * Die Wikis sind deutschsprachig, fuehren aber vereinzelt Gerichte unter
 * ihrem englischen Namen. Die App soll durchgehend deutsch sein, deshalb
 * bleiben solche Seiten aussen vor.
 */
const ENGLISH = /(^|\s)(the|and|of|with|for|from|made|baked|roast|boiled|fried|style)(\s|$)/i;

export const isGermanTitle = (title) => !ENGLISH.test(title);

/** Wikitext zu Lesetext: Verweise, Vorlagen, Hervorhebungen und Tags entfernt. */
export function cleanMarkup(text) {
  return text
    .replace(/<!--[\s\S]*?(-->|$)/g, '')
    // Bruchvorlage {{B|1|2}} in eine lesbare Menge umwandeln, statt sie
    // wie die übrigen Vorlagen ersatzlos zu streichen.
    .replace(/\{\{\s*B\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\}\}/gi, '$1/$2')
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/\[\[(?:Datei|Bild|File|Image|Kategorie|Category):[^\]]*\]\]/gi, ' ')
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1')
    // Externe Verweise [https://… Text] behalten nur ihren Text
    .replace(/\[https?:\/\/[^\s\]]+\s*([^\]]*)\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/<ref[\s\S]*?<\/ref>/g, '')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<[^>]+>/g, '')
    // Wikitext enthaelt Entitaeten wie "z.&#8239;B."; roh stuenden sie
    // sonst als Zeichensalat in der Oberflaeche.
    .replace(/&[#a-zA-Z0-9]+;/g, (e) => decodeEntities(e))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Alle Abschnitte, deren Ueberschrift mit dem Wort beginnt, aneinander
 * gehaengt: "Zutaten", "Zutaten für den Teig", "Zutaten für den Guss".
 * Unterabschnitte gehoeren dazu, der naechste gleich hohe nicht.
 */
export function abschnitte(wikitext, wort) {
  const kopf = new RegExp(`^(==+)\\s*${wort}[^=\\n]*?\\1\\s*$`, 'gim');
  const teile = [];
  let m;
  while ((m = kopf.exec(wikitext))) {
    const ebene = m[1].length;
    const rest = wikitext.slice(m.index + m[0].length);
    // Endet am naechsten Abschnitt derselben oder einer hoeheren Ebene
    const ende = rest.search(new RegExp(`^={2,${ebene}}[^=]`, 'm'));
    teile.push(ende < 0 ? rest : rest.slice(0, ende));
    kopf.lastIndex = m.index + m[0].length + (ende < 0 ? rest.length : ende);
  }
  return teile.join('\n');
}

/**
 * Felder einer Vorlage wie {{Rezept | Menge = … | Zeit = … }}, klein
 * geschrieben. Verschachtelte Vorlagen werden mitgezaehlt.
 *
 * @param {string} wikitext
 * @param {RegExp} name Muster fuer den Vorlagennamen
 */
export function vorlage(wikitext, name) {
  const re = new RegExp(`\\{\\{\\s*${name.source}`, 'i');
  const m = wikitext.match(re);
  if (!m) return {};
  const start = m.index;

  let tiefe = 0;
  let ende = wikitext.length;
  for (let i = start; i < wikitext.length - 1; i += 1) {
    if (wikitext.startsWith('{{', i)) { tiefe += 1; i += 1; } else if (wikitext.startsWith('}}', i)) {
      tiefe -= 1;
      i += 1;
      if (tiefe === 0) { ende = i - 1; break; }
    }
  }

  const felder = {};
  const inhalt = wikitext.slice(start, ende).replace(/<!--[\s\S]*?-->/g, '');
  for (const zeile of inhalt.split('\n')) {
    const f = zeile.match(/^\s*\|\s*([A-Za-zÄÖÜäöüß ]+?)\s*=\s*(.*?)\s*$/);
    if (f) felder[f[1].toLowerCase()] = f[2];
  }
  return felder;
}

/**
 * Wandelt eine Zeitangabe wie "25 Minuten Vorbereitung, 45 Minuten
 * Fertigstellung" oder "1 - 1,5 h" in Vorbereitungs- und Garzeit.
 * Ruhezeiten ("1 Nacht") bleiben aussen vor: sie sind keine Arbeitszeit.
 * Spannen zaehlen mit ihrer unteren Zahl.
 */
export function zeiten(text) {
  if (!text) return { prep: 0, cook: 0 };

  let prep = 0;
  let cook = 0;

  for (const teil of String(text).split(/,|;|\bund\b|\+/)) {
    const m = teil.match(/(\d+(?:[.,]\d+)?)\s*(?:(?:[-–]|bis)\s*\d+(?:[.,]\d+)?\s*)?(min|minuten|std|stunden?|h)\b/i);
    if (!m) continue;
    const zahl = parseFloat(m[1].replace(',', '.'));
    const minuten = /^(std|stunde|stunden|h)$/i.test(m[2]) ? zahl * 60 : zahl;

    if (/vorbereitung|arbeitszeit|vorbereiten/i.test(teil)) prep += minuten;
    else cook += minuten;
  }

  return { prep: Math.round(prep), cook: Math.round(cook) };
}

/** Masseinheiten bleiben klein geschrieben, gezaehlte Dinge nicht. */
const MASSE = new Set(['g', 'kg', 'ml', 'l', 'liter', 'cl', 'dl']);

/**
 * Liest eine Ertragsangabe: "4 Personen", "ca. 50 Backoblaten",
 * "20 Gläser", "3 - 4 Portionen".
 *
 * Was hinter der Zahl steht, ist die Ertragseinheit und wird uebernommen —
 * nur bei Personen und Portionen bleibt sie leer, das ist der Normalfall.
 *
 * @returns {{zahl:number, einheit:string|null}|null}
 */
export function menge(text) {
  if (!text) return null;

  // Spannen sind die Regel: "40–50 Stück", "4 bis 6 Personen". Es zaehlt
  // die untere Zahl; die Einheit steht dahinter, nicht dazwischen.
  const m = String(text).match(/(\d+)\s*(?:[-–—/]|bis|oder)?\s*\d*\s*([A-Za-zÄÖÜäöüß.]*)/i);
  if (!m) return null;

  const zahl = parseInt(m[1], 10);
  if (!(zahl > 0 && zahl <= 400)) return null;

  const roh = m[2].toLowerCase().replace(/\.$/, '');
  if (!roh || /^(person|personen|pers|portion|portionen|port|stk|leute|esser)$/.test(roh)) {
    return { zahl, einheit: null };
  }

  const bekannt = {
    stck: 'Stück', stück: 'Stück', stuecke: 'Stück', stücke: 'Stück', sück: 'Stück',
    glas: 'Gläser', gläser: 'Gläser',
  }[roh];
  if (bekannt) return { zahl, einheit: bekannt };
  if (MASSE.has(roh)) return { zahl, einheit: roh };

  return { zahl, einheit: m[2][0].toUpperCase() + m[2].slice(1) };
}

/**
 * Zutaten als Tabellenzeilen ("| 250 || g || Mehl") oder als Aufzaehlung.
 * Beide Formen werden beruecksichtigt.
 */
export function ingredientsFrom(block) {
  const out = [];

  for (const line of block.split('\n')) {
    const cells = line.startsWith('|') && !/^\|[-}+]/.test(line)
      ? line.slice(1).split('||').map((c) => cleanMarkup(c))
      : null;

    if (cells && cells.length >= 2) {
      const [amount, unit, ...rest] = cells;
      const name = cleanMarkup(rest.join(' ')) || unit;
      const parsed = parseIngredientLine(`${amount} ${rest.length ? unit : ''} ${name}`.trim());
      if (parsed.name) out.push({ a: parsed.amount, u: parsed.unit, n: parsed.name });
      continue;
    }

    if (/^[*#]\s*/.test(line)) {
      const text = cleanMarkup(line.replace(/^[*#:]+\s*/, ''));
      // Zwischenueberschriften als Aufzaehlungspunkt ("Für den Teig:")
      if (!text || /:$/.test(text)) continue;
      const parsed = parseIngredientLine(text);
      if (parsed.name) out.push({ a: parsed.amount, u: parsed.unit, n: parsed.name });
    }
  }
  return out;
}

/**
 * Sehr kurze Anweisungen ("Aufkochen.") sind in den Wikis ueblich. Sie
 * werden an den vorigen Schritt angehaengt statt verworfen — sonst ginge
 * eine echte Anweisung verloren.
 */
export function mergeShort(steps, minLength = 12) {
  const out = [];
  for (const step of steps) {
    if (step.length < minLength && out.length) out[out.length - 1] += ` ${step}`;
    else out.push(step);
  }
  return out.filter((s) => s.length >= minLength);
}

/**
 * Arbeitsschritte eines Abschnitts: Aufzaehlungspunkte sind Schritte,
 * Fliesstext wird in Saetze geteilt — in der Reihenfolge der Seite.
 * Frueher galt: gibt es Aufzaehlungspunkte, zaehlt nur die Aufzaehlung.
 * Dann blieb von einer Seite mit drei Absaetzen Anleitung und dem Punkt
 * "Mit Apfelmus servieren" nur dieser eine Schritt uebrig.
 */
export function stepsFrom(block) {
  const schritte = [];
  let absatz = [];
  const absatzEnde = () => {
    if (absatz.length) schritte.push(...saetze(cleanMarkup(absatz.join(' '))));
    absatz = [];
  };

  for (const zeile of block.split('\n')) {
    if (/^=+[^=]*=+\s*$/.test(zeile) || !zeile.trim()) {
      absatzEnde();
    } else if (/^[*#]/.test(zeile)) {
      absatzEnde();
      const text = cleanMarkup(zeile.replace(/^[*#:]+\s*/, ''));
      if (text) schritte.push(text);
    } else {
      absatz.push(zeile);
    }
  }
  absatzEnde();

  // Ueberleitungen ("Die Zubereitung ist einfach:") sind keine Schritte
  return mergeShort(schritte.filter((s) => !/:$/.test(s)));
}

/**
 * Teilt Fliesstext in Saetze. Nach Abkuerzungen wie "ca." oder "z. B."
 * endet kein Satz, auch wenn eine Zahl folgt ("ca. 30 Minuten").
 */
const SATZGRENZE = /(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9])/;
const ABKUERZUNG = /(?:^|[\s(])(?:[A-Za-zÄÖÜäöüß]|[Cc]a|[Bb]zw|[Ee]vtl?|[Gg]gf|[Ee]tc|[Uu]sw|[Vv]gl|[Mm]in|[Ss]td|Pc?kg?|Pckg|Stk|Msp|EL|TL|[Kk]l|[Gg]r|Nr|No|[Mm]ax|[Mm]ind|[Gg]eh|[Gg]estr|[Vv]erg|[Ss]iehe)\.$/;

export function saetze(text) {
  const out = [];
  for (const teil of text.split(SATZGRENZE)) {
    if (out.length && ABKUERZUNG.test(out[out.length - 1])) out[out.length - 1] += ` ${teil}`;
    else out.push(teil);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

export const SCHWIERIGKEIT = { leicht: 1, einfach: 1, mittel: 2, normal: 2, schwer: 3, anspruchsvoll: 3 };

/**
 * Regeln von den Wiki-Kategorien zur Einordnung in der App, die erste
 * zutreffende gilt. Frueher stand jedes Wiki-Rezept als Hauptgericht
 * fuer Mittag und Abend da — auch Amaretti, Kraeuterbutter und eine
 * Gewuerzmischung, die "Woche fuellen" dann zum Abendessen machte.
 */
const EINORDNUNG = [
  // Pfannkuchen und herzhafte Kuchen sind Mahlzeiten, kein Gebaeck
  [/pfannkuchen|eierkuchen|reibekuchen|kartoffelpuffer|flammkuchen|zwiebelkuchen|quiche/, 'Hauptgericht', ['mittag', 'abend']],
  [/gewürzmischung|garam.masala|gewürzpaste|würzpaste|currypaste|marinade|dressing|vinaigrette|\bdips?\b|pesto|soßen?\b|saucen?\b|kräuterbutter|\bfond\b|chutney|konfitüre|marmelade|gelee|sirup|essig|würzöl|grundrezept/,
    'Grundrezept', ['snack']],
  [/getränk|cocktail|bowle|punsch|smoothie|limonade|milchshake|likör/, 'Getränk', ['snack']],
  [/\bbrot\b|brote\b|brötchen|semmeln|baguette|brotrezept/, 'Backen', ['fruehstueck']],
  [/gebäck|kuchen|torten?\b|plätzchen|kekse|backwaren|muffins?|waffeln|stollen|lebkuchen|\bpies?\b|tarte|strudel|konfekt|pralinen|makronen|printen|spekulatius|baiser/,
    'Backen', ['snack']],
  [/frühstück|müsli|porridge|aufstrich/, 'Frühstück', ['fruehstueck']],
  [/dessert|nachspeise|nachtisch|speiseeis|\beis\b|pudding|mousse|kompott|süßspeise|parfait|grütze|creme\b/, 'Dessert', ['snack']],
  [/suppe|eintopf|eintöpfe/, 'Suppe', ['mittag', 'abend']],
  [/salat/, 'Salat', ['mittag', 'abend']],
  [/vorspeise|tapas|antipasti|fingerfood|häppchen|snack/, 'Vorspeise', ['abend', 'snack']],
  [/beilage|knödel|klöße|spätzle/, 'Beilage', ['mittag', 'abend']],
];

/**
 * Hauptgerichte stehen oft zusaetzlich unter "Saucen" oder "Vorspeisen" —
 * das Schnitzel mit Rahmsauce, die Quiche, die auch als Vorspeise geht.
 * Sagt eine Kategorie ausdruecklich Hauptgericht, zaehlt das mehr.
 */
const HAUPTGERICHT = /hauptspeise|hauptgericht|\p{L}+gerichte?\b|aufl(?:a|ä)uf/u;
const VOM_HAUPTGERICHT_UEBERSTIMMT = new Set(['Grundrezept', 'Vorspeise', 'Beilage']);

/** Keine Laenderkuechen, sondern Anlaesse und Techniken */
const KEINE_KUECHE = /^(Deutsche|Internationale|Kalte|Warme|Schnelle|Vegetarische|Vegane|Festliche|Leichte|Einfache|Gesunde|Preiswerte|Geschenke|Halloween|Wok|Tajine|Oster|Weihnachts|Kinder|Single|Reste)/i;

/**
 * Der Kern eines Gerichtnamens: was vor "mit", "in", "an" steht.
 * "Bandnudeln mit Sahnesauce" ist ein Nudelgericht, keine Sauce; die
 * "Tomatensauce mit Basilikum" dagegen ist eine.
 */
export function titelKopf(titel) {
  return String(titel)
    .split(/\s+(?:mit|in|an|auf|und|nach|vom|von|zum|zur|im|für|aus|ohne|à|al|alla|alle)\s+|\s*[(,:–]\s*/i)[0]
    .trim();
}

/**
 * Kategorie, Mahlzeiten, Kueche und Ernaehrungsform aus den Kategorien
 * einer Wikiseite und ihrem Titel. Zuerst entscheidet der Kern des
 * Titels, dann die Kategorien. Was sich nicht erschliessen laesst, bleibt
 * beim Hauptgericht — der haeufigste Fall.
 *
 * @param {string[]} kategorien Namen ohne Namensraum, gern mit Praefix
 *        wie "Kochbuch/ " — der wird ignoriert
 */
export function einordnen(kategorien, titel = '') {
  const namen = kategorien.map((k) => String(k).replace(/_/g, ' ').replace(/^.*\/\s*/, ''));
  const katText = namen.join(' | ').toLowerCase();
  const kopf = titelKopf(titel).toLowerCase();

  let regel = EINORDNUNG.find(([re]) => re.test(kopf));
  if (!regel) {
    regel = EINORDNUNG.find(([re]) => re.test(katText));
    if (regel && VOM_HAUPTGERICHT_UEBERSTIMMT.has(regel[1]) && HAUPTGERICHT.test(katText)) regel = null;
  }

  const kueche = namen.find((k) => /\bKüche$/.test(k) && !KEINE_KUECHE.test(k));

  // "Leicht veganisierbar" heisst: so, wie es dasteht, nicht vegan.
  const text = `${katText} | ${String(titel).toLowerCase()}`.replace(/veganisierbar/g, '');
  const diet = [];
  if (/vegan/.test(text)) diet.push('vegan', 'vegetarisch');
  else if (/vegetarisch/.test(text)) diet.push('vegetarisch');

  return {
    category: regel ? regel[1] : 'Hauptgericht',
    meals: regel ? regel[2] : ['mittag', 'abend'],
    cuisine: kueche ? kueche[0].toUpperCase() + kueche.slice(1) : 'International',
    diet,
  };
}

/** Id aus Praefix und Titel; bleibt stabil, damit gespeicherte Plaene gueltig bleiben. */
export const wikiId = (praefix, title) =>
  `${praefix}-${title.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '')}`;

export const istWeiterleitung = (wikitext) => /^\s*#(weiterleitung|redirect)/i.test(wikitext);
