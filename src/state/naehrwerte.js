/**
 * Naehrwerte eines Rezepts, aus seinen Zutaten berechnet.
 *
 * Jede Zutat wird einem Lebensmittel der USDA-Datenbank zugeordnet
 * (Tabelle: src/data/naehrwerte.json, gebaut von scripts/naehrwerte/),
 * ihre Menge in Gramm umgerechnet und mit den Werten je 100 g
 * multipliziert. Die Summe geteilt durch die Portionen ergibt die Werte
 * je Portion — bei Rezepten, die Stueck zaehlen, je Stueck.
 *
 * Das ist eine Schaetzung, und sie sagt, wie gut sie ist: Zutaten ohne
 * Mengenangabe ("Salz nach Geschmack") und Zutaten, die sich nicht
 * zuordnen lassen, fliessen nicht ein und werden gezaehlt. Daraus ergibt
 * sich die Abdeckung, und aus ihr das Vertrauen in die Zahlen.
 *
 * Das Modul haengt nicht an der Tabelle selbst, sondern bekommt sie
 * uebergeben — so laesst es sich ohne Bundler pruefen.
 */

import { compile } from './matcher.js';

/** Die Naehrstoffe in der Reihenfolge der EU-Naehrwertdeklaration. */
export const NAEHRSTOFFE = [
  { id: 'kcal', label: 'Energie', einheit: 'kcal', stellen: 0 },
  { id: 'fett', label: 'Fett', einheit: 'g', stellen: 1 },
  { id: 'gesFett', label: 'davon gesättigte Fettsäuren', kurz: 'ges. Fett', einheit: 'g', stellen: 1, unter: true },
  { id: 'kh', label: 'Kohlenhydrate', einheit: 'g', stellen: 1 },
  { id: 'zucker', label: 'davon Zucker', kurz: 'Zucker', einheit: 'g', stellen: 1, unter: true },
  { id: 'ballast', label: 'Ballaststoffe', einheit: 'g', stellen: 1 },
  { id: 'eiweiss', label: 'Eiweiß', einheit: 'g', stellen: 1 },
  { id: 'salz', label: 'Salz', einheit: 'g', stellen: 2 },
];

/**
 * Referenzmengen fuer einen durchschnittlichen Erwachsenen, Anhang XIII
 * der EU-Lebensmittelinformationsverordnung (8400 kJ / 2000 kcal).
 * Ballaststoffe: Orientierungswert der DGE (30 g).
 */
export const REFERENZ = {
  kcal: 2000, fett: 70, gesFett: 20, kh: 260, zucker: 90, eiweiss: 50, salz: 6, ballast: 30,
};

const leer = () => Object.fromEntries(NAEHRSTOFFE.map((n) => [n.id, 0]));

/** Gewichte der Mengeneinheiten, wo das Lebensmittel keine eigenen hat. */
const VORGABE = {
  Msp: 0.3, Prise: 0.4, Tropfen: 0.05,
  Bund: 30, Scheibe: 30, Dose: 400, Becher: 200, Glas: 350,
  Blatt: 0.5, Zweig: 1, Zehe: 3, Handvoll: 30,
};

/** Fette, die in grosser Menge zum Frittieren dienen und nicht gegessen werden. */
const FETTE = new Set(['rapsoel', 'olivenoel', 'erdnussoel', 'sesamoel', 'kokosoel', 'schmalz', 'butterschmalz', 'frittieroel']);

/**
 * Fett, das zum Braten oder Frittieren dient, wird nur zum Teil gegessen.
 * Ueber 400 g im Rezept ist es Frittierfett, davon bleibt rund ein
 * Zehntel im Essen. Ueber 40 g je Portion ist es Bratfett — niemand isst
 * 75 g Butterschmalz zu einem Schnitzel —, davon rund ein Viertel.
 */
const FRITTIERGRENZE = 400;
const FRITTIERANTEIL = 0.1;
const BRATGRENZE_JE_PORTION = 40;
const BRATANTEIL = 0.25;
const FETTE_UND_BUTTER = new Set([...FETTE, 'butter', 'margarine']);

/**
 * Einheiten, die im Namen stecken, wenn der Zerleger sie nicht erkannt hat:
 * "6 klein geschnittene Scheiben Ananas" sind sechs Scheiben, nicht sechs
 * Ananas.
 */
const EINHEIT_IM_NAMEN = [
  [/\bscheiben?\b/, 'Scheibe'],
  [/\bdosen?\b/, 'Dose'],
  [/\bbecher\b/, 'Becher'],
  [/\bbund(e)?\b/, 'Bund'],
  [/\btassen?\b/, 'Tasse'],
  [/\b(glas|gläser)\b/, 'Glas'],
  [/\bzehen?\b/, 'Zehe'],
  [/\b(stängel|stiele?|zweige?)\b/, 'Zweig'],
  [/\b(blatt|blätter)\b/, 'Blatt'],
  [/\b(hand|hände) ?voll\b/, 'Handvoll'],
];

/**
 * Was eine "Portion" bei diesem Rezept ist.
 *
 *   portion  Portionen oder Personen — Werte je Portion
 *   stueck   gezaehlte Stuecke: Muffins, Plaetzchen, Tapas — je Stueck
 *   masse    ganze Kuchen und Brote, Glaeser, Liter, Kilo — je 100 g
 *
 * Ein Blech Butterkuchen "je Portion" waeren sechstausend Kalorien; je
 * 100 g — etwa ein Stueck — ist die ehrliche Angabe.
 */
const GANZES = /^(blech|backblech|springform|kuchen|rührkuchen|torte|tarte|pie|brot|brote|laib|laibe|fladen|form|kastenform|auflaufform|baguettes?|stollen|zopf|kranz|schüssel|topf)$/i;
const MASS = /^(g|kg|ml|l|liter|cl|gläser|glas|flaschen?)$/i;
const PORTION = /^(portionen?|personen?|pprtiomen|port\.?)$/i;

/** Gebaeck, Grundrezepte und Getraenke misst man je 100 g, nicht je Teller. */
const JE_100G = new Set(['Backen', 'Grundrezept', 'Getränk']);

export function ertragsart(recipe) {
  const u = String(recipe?.yieldUnit || '').trim();
  if (!u && JE_100G.has(recipe?.category)) return 'masse';
  if (!u || PORTION.test(u)) return 'portion';
  if (GANZES.test(u) || MASS.test(u)) return 'masse';
  return 'stueck';
}

/** Mehr als so viel Gramm sind keine Portion und kein Stueck mehr. */
const HOECHSTENS_JE_PORTION = 1200;

/**
 * Der Kern eines Zutatennamens: ohne Klammerzusatz, und bei Alternativen
 * nur die erste. "Butter oder Margarine" ist Butter, "Mehl (Type 405),
 * gesiebt" ist Mehl.
 */
export function kern(name) {
  return String(name)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .split(/,|;| oder | bzw\.? | alternativ | ersatzweise | und /)[0]
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ob die gemeinte Zutat vegan ist: "vegane Butter", "Joghurt (vegan)",
 * "Butter, vegan" — nur die erste Wahl zaehlt, "Butter oder vegane
 * Butter" ist Butter.
 */
function istVegan(name) {
  const erste = String(name).toLowerCase().split(/ oder | bzw\.? | alternativ | ersatzweise |\//)[0];
  return /\bvegan\w*\b(?!\s*:)/.test(erste);
}

/**
 * @param {{eintraege: object[]}} tabelle Inhalt von naehrwerte.json
 */
export function erstelleRechner(tabelle) {
  const eintraege = new Map(tabelle.eintraege.map((e) => [e.id, e]));
  const muster = compile(tabelle.eintraege.map((e) => [e.id, e.schluessel]));

  const suche = (text) => {
    for (const p of muster) if (p.trifft(text)) return eintraege.get(p.value);
    return null;
  };

  // Viele Zutatennamen kehren wieder ("Salz", "Zwiebeln"); einmal gesucht genuegt.
  const gemerkt = new Map();

  /** Das Lebensmittel zu einem Zutatennamen, oder null. */
  function zuordnen(name) {
    const schluessel = String(name);
    if (gemerkt.has(schluessel)) return gemerkt.get(schluessel);
    const k = kern(schluessel);
    let e = (k && suche(k)) || suche(schluessel.toLowerCase());
    // "Vegane Butter" ist Margarine, "veganes Hack" kein Rindfleisch
    if (e?.ersatz && istVegan(schluessel)) e = eintraege.get(e.ersatz) ?? e;
    gemerkt.set(schluessel, e);
    return e;
  }

  /**
   * Menge in Gramm, oder null, wenn sich die Einheit fuer dieses
   * Lebensmittel nicht umrechnen laesst ("2 Stück Mehl").
   */
  function gramm(menge, einheit, e) {
    if (!(menge > 0) || !e) return null;
    const dichte = e.dichte ?? 1;
    let g;
    switch (einheit) {
      case 'g': g = menge; break;
      case 'kg': g = menge * 1000; break;
      case 'mg': g = menge / 1000; break;
      case 'ml': g = menge * dichte; break;
      case 'cl': g = menge * 10 * dichte; break;
      case 'l': g = menge * 1000 * dichte; break;
      case 'EL': g = menge * (e.el ?? 15 * dichte); break;
      case 'TL': g = menge * (e.tl ?? 5 * dichte); break;
      case 'Tasse': g = menge * 150 * dichte; break;
      case '':
      case 'Stk': g = e.stueck ? menge * e.stueck : null; break;
      case 'Pck': g = e.pck ? menge * e.pck : null; break;
      case 'Zehe': g = menge * (e.zehe ?? e.stueck ?? VORGABE.Zehe); break;
      default: {
        const eigen = {
          Bund: e.bund, Scheibe: e.scheibe, Dose: e.dose, Becher: e.becher, Blatt: e.blatt, Zweig: e.zweig,
        }[einheit];
        g = VORGABE[einheit] != null ? menge * (eigen ?? VORGABE[einheit]) : null;
      }
    }
    return g == null ? null : g * (e.verzehr ?? 1);
  }

  /**
   * Naehrwerte eines Rezepts.
   *
   * @param {{ingredients: object[], servings?: number}} rezept
   */
  function fuerRezept(rezept) {
    const gesamt = leer();
    const posten = [];
    const unbekannt = [];
    const ohneMenge = [];
    const hinweise = [];
    let masse = 0;
    let fettUngewiss = false;

    for (const z of rezept?.ingredients || []) {
      const name = z.name ?? z.n ?? '';
      const menge = z.amount ?? z.a;
      let einheit = z.unit ?? z.u ?? '';

      if (!(menge > 0)) {
        ohneMenge.push(name);
        // Oel "nach Bedarf" macht aus Frittiertem auf dem Papier Rohkost.
        if (FETTE_UND_BUTTER.has(zuordnen(name)?.id)) fettUngewiss = true;
        continue;
      }

      const e = zuordnen(name);
      if (!einheit || einheit === 'Stk') {
        const k = kern(name);
        const treffer = EINHEIT_IM_NAMEN.find(([re]) => re.test(k));
        if (treffer) einheit = treffer[1];
      }

      let g = gramm(menge, einheit, e);
      if (g == null) { unbekannt.push(name); continue; }

      // Ein halber Liter Oel landet nicht im Essen, sondern bleibt in der
      // Friteuse. Gerechnet wird der Anteil, den Gebratenes aufnimmt.
      const portionenRoh = Math.max(1, rezept?.servings || 1);
      if (FETTE.has(e.id) && !e.verzehr && g > FRITTIERGRENZE) {
        g *= FRITTIERANTEIL;
        hinweise.push(`${name}: als Frittierfett gerechnet, ein Zehntel verzehrt`);
      } else if (FETTE.has(e.id) && !e.verzehr && g / portionenRoh > BRATGRENZE_JE_PORTION
        && ertragsart(rezept) === 'portion') {
        g *= BRATANTEIL;
        hinweise.push(`${name}: als Bratfett gerechnet, ein Viertel verzehrt`);
      }

      for (const n of NAEHRSTOFFE) gesamt[n.id] += ((e.je100g[n.id] ?? 0) * g) / 100;
      masse += g;
      posten.push({ name, lebensmittel: e.id, gramm: g });
    }

    const je100g = masse > 0
      ? Object.fromEntries(NAEHRSTOFFE.map((n) => [n.id, (gesamt[n.id] / masse) * 100]))
      : null;

    // Bezugsgroesse: je Portion, je Stueck oder je 100 g.
    let art = ertragsart(rezept);
    const anzahl = Math.max(1, rezept?.servings || 1);
    if (art !== 'masse' && (masse / anzahl > HOECHSTENS_JE_PORTION || gesamt.kcal / anzahl > 2000)) {
      // "1 Portion" mit 2 kg Zutaten ist ein ganzer Kuchen, keine Portion.
      art = 'masse';
      hinweise.push('Die angegebene Portionszahl passt nicht zur Menge; Werte je 100 g');
    }
    const teiler = art === 'masse' ? masse / 100 : anzahl;
    const jePortion = Object.fromEntries(
      NAEHRSTOFFE.map((n) => [n.id, teiler > 0 ? gesamt[n.id] / teiler : 0]),
    );
    const bezug = { portion: 'je Portion', stueck: 'je Stück', masse: 'je 100 g' }[art];

    if (fettUngewiss) hinweise.push('Fett ohne Mengenangabe ist nicht eingerechnet; die Energie liegt höher');

    const bewertet = posten.length + unbekannt.length;
    const abdeckung = bewertet ? posten.length / bewertet : 0;

    // Mehr als 2500 kcal in einer Portion ist fast immer ein Datenfehler.
    const unplausibel = jePortion.kcal > 2500;

    // Unter 40 g je Portion ist kein Essen, sondern ein Rezept, dessen
    // Hauptbestandteil woanders steht ("1 Portion Rührei").
    const zuLeicht = art === 'portion' && masse / anzahl < 40;
    if (zuLeicht) hinweise.push('Zu wenig Masse für eine Portion; wohl ein Teilrezept');

    let vertrauen = 'gering';
    if (!unplausibel && !zuLeicht && posten.length >= 2) {
      if (abdeckung >= 0.9) vertrauen = 'gut';
      else if (abdeckung >= 0.7) vertrauen = 'mittel';
    }

    return {
      jePortion,
      je100g,
      gesamt,
      masse,
      art,
      bezug,
      fettUngewiss,
      gramProPortion: art === 'masse' ? 100 : masse / anzahl,
      hinweise,
      abdeckung,
      vertrauen,
      unplausibel,
      posten,
      unbekannt,
      ohneMenge,
    };
  }

  return { zuordnen, gramm, fuerRezept, eintraege };
}

/** Rundet einen Wert fuer die Anzeige, nach den Stellen des Naehrstoffs. */
export function anzeige(wert, naehrstoff) {
  const n = typeof naehrstoff === 'string' ? NAEHRSTOFFE.find((x) => x.id === naehrstoff) : naehrstoff;
  if (wert == null || !Number.isFinite(wert)) return '—';
  const stellen = n?.stellen ?? 1;
  // Kleine Werte nicht auf eine Null runden, die "gar nichts" behauptet.
  if (wert > 0 && wert < 10 ** -stellen) return `< ${(10 ** -stellen).toLocaleString('de-DE')}`;
  return wert.toLocaleString('de-DE', { maximumFractionDigits: stellen, minimumFractionDigits: 0 });
}

/** "480 kcal", bei Gebaeck und Glaesern "320 kcal/100 g", bei Stueckzahlen "90 kcal/Stk". */
export function kcalText(recipe) {
  const bezug = recipe.kcalBezug;
  const zusatz = bezug === 'je 100 g' ? '/100 g' : bezug === 'je Stück' ? '/Stk' : '';
  return `${recipe.kcal} kcal${zusatz}`;
}
