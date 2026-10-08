/**
 * Der Vorrat: was schon in Kueche und Kammer liegt.
 *
 * Zwei Dinge haengen daran. Die Einkaufsliste zieht den Vorrat ab, damit
 * niemand das dritte Paket Mehl kauft. Und die Frage "Was kann ich mit
 * dem kochen, was da ist?" sortiert die Rezepte danach, wie wenig fehlt.
 *
 * Ob eine Vorratsangabe eine Zutat deckt, entscheidet der Name. "Mehl" im
 * Vorrat deckt "Weizenmehl Type 405", "Eier" deckt "Ei", aber "Ei" deckt
 * nicht "Eigelb", "Reis" nicht "Reisnudeln" und "Tomaten" nicht
 * "Tomatenmark". Das bleibt eine Naeherung:
 * Wer "Zucker" eintraegt, dem gilt auch Puderzucker als vorhanden — wer
 * es genauer will, traegt genauer ein.
 *
 * Reine Funktionen ohne App-Zustand.
 */

import { toBase, fromBase, roundAmount } from './units.js';
import { toSearchTerm, parseIngredientLine } from '../sources/ingredients.js';

/** Was in fast jeder Kueche steht. Ein Knopf traegt es auf einmal ein. */
export const GRUNDZUTATEN = ['Salz', 'Pfeffer', 'Zucker', 'Mehl', 'Öl', 'Olivenöl', 'Essig', 'Senf', 'Gemüsebrühe'];

/**
 * Zaehlt bei "Was kann ich kochen?" nicht als fehlend: Wasser hat jeder,
 * und an Salz und Pfeffer scheitert kein Abendessen.
 */
const IMMER_DA = /^(wasser|leitungswasser|salz|pfeffer|salz und pfeffer|salz, pfeffer|eiswasser|warmes wasser|kaltes wasser)$/;

const BUCHSTABE = '[a-zäöüß]';

/**
 * Zusammensetzungen, die etwas anderes sind als ihr Grundwort: Milch im
 * Vorrat ersetzt keine Kokosmilch, Sahne keine saure Sahne.
 */
const EIGENE_PRODUKTE = [
  'kokosmilch', 'sojamilch', 'mandelmilch', 'hafermilch', 'reismilch', 'buttermilch', 'dickmilch',
  'kondensmilch', 'saure sahne', 'sauerrahm', 'erdnussbutter', 'kakaobutter', 'pflanzenbutter',
  'kokosöl', 'sesamöl', 'trüffelöl', 'süßkartoffel', 'sojasahne', 'hafersahne', 'pflanzensahne',
  'kokossahne', 'sojajoghurt', 'kokosjoghurt', 'hafermilch',
];

/** Kleinbuchstaben, ohne Klammerzusatz, Zubereitungsart und Mehltyp */
const namen = new Map();
export function vorratsName(name) {
  const roh = String(name ?? '');
  let n = namen.get(roh);
  if (n === undefined) {
    n = toSearchTerm(roh).toLowerCase().replace(/\s+/g, ' ').trim();
    // Zehntausende Zutatennamen wiederholen sich; mehr als das braucht keiner
    if (namen.size > 50000) namen.clear();
    namen.set(roh, n);
  }
  return n;
}

/** "Eier" und "Ei", "Tomaten" und "Tomate" gelten als dasselbe. */
function stamm(name) {
  if (name === 'eier') return 'ei';
  return name.length > 4 ? name.replace(/(en|n|e|s)$/, '') : name;
}

/**
 * Muster fuer einen Namen. Im Deutschen sagt das Ende einer
 * Zusammensetzung, was etwas ist: Weizenmehl ist Mehl, Tomatenmark aber
 * keine Tomate. Deshalb zaehlt ein Treffer nur am Wortende, gebeugt oder
 * nicht. Kurze Namen muessen als eigenes Wort stehen, sonst steckte "ei"
 * in "Brei" — ausser Öl, das in Oliven- und Rapsöl steckt.
 */
const muster = new Map();
function musterFuer(name) {
  let m = muster.get(name);
  if (!m) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const vorn = name.length < 4 && name !== 'öl' ? `(^|(?!${BUCHSTABE}).)` : '';
    m = new RegExp(`${vorn}${esc}(e|en|n|er|es|s)?($|(?!${BUCHSTABE}))`);
    muster.set(name, m);
  }
  return m;
}

/**
 * Deckt der Vorratsposten die Zutat? In beide Richtungen: "Mehl" deckt
 * "Weizenmehl", und "Weizenmehl" im Vorrat deckt ein Rezept, das nur
 * "Mehl" verlangt.
 *
 * @param {string} vorrat bereits mit vorratsName() vereinfacht
 * @param {string} zutat bereits mit vorratsName() vereinfacht
 */
export function deckt(vorrat, zutat) {
  if (!vorrat || !zutat) return false;
  const a = stamm(vorrat);
  const b = stamm(zutat);
  if (vorrat === zutat || a === b) return true;
  const eigen = EIGENE_PRODUKTE.find((p) => zutat.includes(p) || vorrat.includes(p));
  if (eigen && !(zutat.includes(eigen) && vorrat.includes(eigen))) return false;
  return (zutat.includes(a) && musterFuer(a).test(zutat))
    || (vorrat.includes(b) && musterFuer(b).test(vorrat));
}

/**
 * Macht aus einer Eingabe wie "500 g Mehl" einen Vorratsposten.
 * @returns {{name:string, menge:number|null, einheit:string}|null}
 */
export function postenAus(eingabe) {
  const { amount, unit, name } = parseIngredientLine(String(eingabe ?? '').trim());
  const n = String(name || '').trim();
  if (!n) return null;
  return { name: n.slice(0, 80), menge: amount ?? null, einheit: unit || '' };
}

/**
 * Bereinigt eine gespeicherte oder importierte Liste: nur bekannte
 * Felder, jeder Name einmal.
 */
export function bereinigeVorrat(liste) {
  if (!Array.isArray(liste)) return [];
  const gesehen = new Set();
  const out = [];
  for (const p of liste) {
    const name = typeof p?.name === 'string' ? p.name.trim().slice(0, 80) : '';
    const key = vorratsName(name);
    if (!key || gesehen.has(key)) continue;
    gesehen.add(key);
    const menge = Number.isFinite(p.menge) && p.menge > 0 ? p.menge : null;
    out.push({ name, menge, einheit: menge != null && typeof p.einheit === 'string' ? p.einheit.slice(0, 12) : '' });
  }
  return out;
}

/** Fuegt einen Posten hinzu; ein gleichnamiger wird ersetzt. */
export function fuegeHinzu(liste, posten) {
  const key = vorratsName(posten.name);
  return [...liste.filter((p) => vorratsName(p.name) !== key), posten];
}

/**
 * Zieht den Vorrat von der Einkaufsliste ab.
 *
 * - Vorratsposten ohne Menge decken die Zutat ganz ("Salz ist da").
 * - Mit Menge in derselben Masseinheit wird gerechnet: 1 kg Mehl im
 *   Vorrat, 1,2 kg im Plan, bleiben 200 g zu kaufen. Was der Vorrat
 *   dabei hergibt, steht danach anderen Positionen nicht mehr zur
 *   Verfuegung.
 * - Passen die Einheiten nicht zusammen (Stueck gegen Gramm), gilt die
 *   Position als vorhanden, mit dem Vermerk, die Menge zu pruefen.
 *
 * @param {{aisle:string, items:object[]}[]} groups Ergebnis von aggregate()
 * @param {{name:string, menge:number|null, einheit:string}[]} vorrat
 * @returns {{groups:object[], gedeckt:object[]}}
 */
export function vorratAbziehen(groups, vorrat) {
  if (!vorrat?.length) return { groups, gedeckt: [] };

  const rest = vorrat.map((p) => {
    const basis = toBase(p.menge, p.einheit);
    return { name: p.name, key: vorratsName(p.name), menge: p.menge == null ? null : basis.amount, einheit: basis.unit };
  });
  const gedeckt = [];

  const neu = groups.map((g) => ({
    aisle: g.aisle,
    items: g.items.flatMap((item) => {
      const name = vorratsName(item.name);
      const passende = rest.filter((r) => deckt(r.key, name));
      if (!passende.length) return [item];

      const ohneMenge = passende.find((p) => p.menge == null);
      if (ohneMenge) {
        gedeckt.push({ ...item, aus: ohneMenge.name });
        return [];
      }
      const bedarf = toBase(item.amount, item.unit);
      const vergleichbar = passende.filter((p) => (p.einheit || '') === (bedarf.unit || ''));
      if (bedarf.amount == null || !vergleichbar.length) {
        gedeckt.push({ ...item, aus: passende[0].name, pruefen: true });
        return [];
      }
      // Mehrere Posten koennen zusammen reichen: 1 kg Mehl und 500 g Weizenmehl
      let offen = bedarf.amount;
      const aus = [];
      for (const p of vergleichbar) {
        if (offen <= 1e-9 || p.menge <= 0) continue;
        const genommen = Math.min(p.menge, offen);
        p.menge -= genommen;
        offen -= genommen;
        aus.push(p.name);
      }
      if (!aus.length) return [item];
      if (offen <= 1e-9) {
        gedeckt.push({ ...item, aus: aus.join(', ') });
        return [];
      }
      const nimm = fromBase(bedarf.amount - offen, bedarf.unit);
      const zeige = fromBase(offen, bedarf.unit);
      gedeckt.push({ ...item, aus: aus.join(', '), teil: true, amount: roundAmount(nimm.amount), unit: nimm.unit });
      return [{ ...item, amount: roundAmount(zeige.amount), unit: zeige.unit, abzug: aus.join(', ') }];
    }),
  })).filter((g) => g.items.length);

  return { groups: neu, gedeckt };
}

/**
 * Welche Rezepte lassen sich mit dem Vorrat kochen — oder fast?
 *
 * @param {object[]} rezepte
 * @param {{name:string}[]} vorrat
 * @param {{limit?:number, maxFehlend?:number}} [opt]
 * @returns {{recipe:object, vorhanden:string[], fehlt:string[], anteil:number}[]}
 *          zuerst die mit den wenigsten fehlenden Zutaten
 */
export function kochbarMitVorrat(rezepte, vorrat, { limit = 40, maxFehlend = 3 } = {}) {
  const keys = vorrat.map((p) => vorratsName(p.name)).filter(Boolean);
  if (!keys.length) return [];
  const cache = new Map();
  const istDa = (name) => {
    let v = cache.get(name);
    if (v === undefined) {
      const n = vorratsName(name);
      v = IMMER_DA.test(n) ? null : keys.some((k) => deckt(k, n));
      cache.set(name, v);
    }
    return v;
  };

  const out = [];
  for (const r of rezepte) {
    // Historische Originaltexte und Rezepte ohne richtige Zutatenliste
    // kocht man nicht aus dem Vorrat nach.
    if (r.lesetext || !r.ingredients || r.ingredients.length < 3) continue;
    const vorhanden = [];
    const fehlt = [];
    for (const i of r.ingredients) {
      const da = istDa(i.name);
      if (da === null) continue;
      (da ? vorhanden : fehlt).push(i.name);
      if (fehlt.length > maxFehlend) break;
    }
    if (fehlt.length > maxFehlend || vorhanden.length < 2) continue;
    out.push({ recipe: r, vorhanden, fehlt, anteil: vorhanden.length / (vorhanden.length + fehlt.length) });
  }

  return out
    .sort((a, b) => a.fehlt.length - b.fehlt.length
      || b.anteil - a.anteil
      || (b.recipe.gesundheit?.punkte || 0) - (a.recipe.gesundheit?.punkte || 0))
    .slice(0, limit);
}
