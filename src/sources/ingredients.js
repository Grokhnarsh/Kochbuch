/**
 * Zerlegt deutsche Zutatenzeilen ("500 g Mehl, gesiebt") in Menge,
 * Einheit und Bezeichnung. Wird vom URL-Import und von der
 * Supermarkt-Anbindung genutzt.
 */

const UNICODE_FRACTIONS = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅛': 0.125,
};

/** Bekannte Einheiten und ihre kanonische Schreibweise. */
const UNITS = new Map(Object.entries({
  g: 'g', gramm: 'g', kg: 'kg', kilogramm: 'kg', mg: 'mg',
  ml: 'ml', milliliter: 'ml', l: 'l', liter: 'l', cl: 'cl',
  el: 'EL', esslöffel: 'EL', essloeffel: 'EL', eßlöffel: 'EL', essl: 'EL', eßl: 'EL',
  tl: 'TL', teelöffel: 'TL', teeloeffel: 'TL', teel: 'TL', theelöffel: 'TL', theel: 'TL',
  msp: 'Msp', messerspitze: 'Msp', messersp: 'Msp',
  // Deziliter (Schweiz) und Pfund werden umgerechnet, siehe CONVERT
  dl: 'dl', deziliter: 'dl', pfund: 'pfund', pfd: 'pfund',
  prise: 'Prise', prisen: 'Prise', pr: 'Prise',
  do: 'Dose', sch: 'Scheibe', tr: 'Tropfen', tropfen: 'Tropfen',
  bund: 'Bund', bd: 'Bund',
  zehe: 'Zehe', zehen: 'Zehe',
  stk: 'Stk', stück: 'Stk', stueck: 'Stk', st: 'Stk',
  pck: 'Pck', päckchen: 'Pck', packung: 'Pck', paket: 'Pck',
  dose: 'Dose', dosen: 'Dose',
  scheibe: 'Scheibe', scheiben: 'Scheibe',
  blatt: 'Blatt', blätter: 'Blatt',
  zweig: 'Zweig', zweige: 'Zweig',
  tasse: 'Tasse', tassen: 'Tasse',
  becher: 'Becher', glas: 'Glas', gläser: 'Glas',
  kopf: 'Stk', köpfe: 'Stk', knolle: 'Stk', stange: 'Stk', stangen: 'Stk',

  // Angelsaechsische Einheiten, wie sie etwa TheMealDB verwendet.
  // Ohne diese Zuordnung klebt "tsp" am Zutatennamen und die
  // Einkaufsliste kann gleiche Zutaten nicht mehr zusammenfassen.
  tsp: 'TL', teaspoon: 'TL', teaspoons: 'TL',
  tbs: 'EL', tbsp: 'EL', tablespoon: 'EL', tablespoons: 'EL',
  cup: 'Tasse', cups: 'Tasse',
  dash: 'Prise', dashes: 'Prise', pinch: 'Prise', pinches: 'Prise',
  clove: 'Zehe', cloves: 'Zehe',
  slice: 'Scheibe', slices: 'Scheibe',
  sprig: 'Zweig', sprigs: 'Zweig',
  leaf: 'Blatt', leaves: 'Blatt',
  can: 'Dose', cans: 'Dose', tin: 'Dose', tins: 'Dose',
  bunch: 'Bund', bunches: 'Bund',
  piece: 'Stk', pieces: 'Stk', whole: 'Stk',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  pint: 'pint', pints: 'pint', quart: 'quart', quarts: 'quart',
  litre: 'l', litres: 'l', liter: 'l', liters: 'l',
}));

/**
 * Einheiten, die in eine metrische Groesse umgerechnet werden.
 * Rezeptquellen mischen beide Systeme; die App rechnet durchgaengig
 * metrisch, damit Mengen addierbar bleiben.
 */
const CONVERT = new Map(Object.entries({
  dl: { unit: 'ml', factor: 100 },
  // Das Pfund heutiger deutscher Rezepte: 500 g. Alte Pfunde rechnen die
  // Import-Werkzeuge je Buch selbst um.
  pfund: { unit: 'g', factor: 500 },
  oz: { unit: 'g', factor: 28.35 },
  lb: { unit: 'g', factor: 453.59 },
  pint: { unit: 'ml', factor: 473.18 },
  quart: { unit: 'ml', factor: 946.35 },
}));

/** Eine einzelne Zahl oder ein Bruch: "2", "1,5", "1/2". */
function einzelwert(text) {
  const frac = text.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) ? parseInt(frac[1], 10) / parseInt(frac[2], 10) : null;
  const num = text.match(/^\d+(?:[.,]\d+)?$/);
  return num ? parseFloat(text.replace(',', '.')) : null;
}

/** Wandelt "1 ½", "1/2", "2-3", "1/2-1" oder "1,5" in eine Zahl. */
export function parseAmount(text) {
  if (!text) return null;
  let total = 0;
  let found = false;

  // Spannen zaehlen mit ihrem Mittelwert, auch mit Bruechen: "1/2-1".
  const range = text.match(/^([\d.,/]+)\s*[-–]\s*([\d.,/]+)$/);
  if (range) {
    const von = einzelwert(range[1]);
    const bis = einzelwert(range[2]);
    if (von != null && bis != null) return (von + bis) / 2;
  }

  for (const token of text.split(/\s+/)) {
    if (!token) continue;

    if (UNICODE_FRACTIONS[token] != null) {
      total += UNICODE_FRACTIONS[token];
      found = true;
      continue;
    }

    const mixed = token.match(/^(\d+)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅛])$/);
    if (mixed) {
      total += parseInt(mixed[1], 10) + UNICODE_FRACTIONS[mixed[2]];
      found = true;
      continue;
    }

    const frac = token.match(/^(\d+)\/(\d+)$/);
    if (frac) {
      total += parseInt(frac[1], 10) / parseInt(frac[2], 10);
      found = true;
      continue;
    }

    const num = token.match(/^(\d+(?:[.,]\d+)?)$/);
    if (num) {
      total += parseFloat(num[1].replace(',', '.'));
      found = true;
      continue;
    }

    break;
  }

  return found ? total : null;
}

const BRUCH_TEXT = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4',
  '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅛': '1/8',
};

/** Erkennt Tokens, die zu einer Mengenangabe gehoeren. */
function isAmountToken(token) {
  return (
    /^\d+(?:[.,]\d+)?$/.test(token) ||
    /^\d+\/\d+$/.test(token) ||
    /^[\u00bd\u2153\u2154\u00bc\u00be\u2155\u2156\u2157\u2158\u2159\u215b]$/.test(token) ||
    /^\d+[\u00bd\u2153\u2154\u00bc\u00be\u2155\u2156\u2157\u2158\u2159\u215b]$/.test(token) ||
    /^[\d.,/]+-[\d.,/]+$/.test(token)
  );
}

/**
 * Bringt eine Zeile in die Form, die der Zerleger erwartet.
 *
 * Rezeptquellen schreiben Mengen erstaunlich verschieden: mit dem
 * Unicode-Bruchstrich ("1∕2"), mit Halbgeviertstrich und Leerzeichen
 * ("1 – 2"), offenen Spannen ("1–x"), ohne Abstand zur Einheit ("175ml",
 * "2Eier"), mit weichem Trennstrich statt Bindestrich oder einem
 * vorangestellten "ca.". Ohne diese Angleichung blieb die ganze Zeile
 * als Name stehen und die Menge fehlte — in Einkaufsliste und
 * Naehrwerten gleichermassen.
 */
export function normalizeLine(line) {
  return String(line)
    .replace(/(\d)\u00ad(\d)/g, '$1-$2')          // weicher Trennstrich zwischen Zahlen
    .replace(/\u00ad/g, '')
    .replace(/[\u2215\u2044]/g, '/')               // Bruchstriche
    .replace(/[\u2012\u2013\u2014\u2212]/g, '-')     // Striche aller Art
    // Unicode-Brueche als a/b schreiben, damit Spannen wie "½-1" gehen;
    // bei gemischten Zahlen ("1½") erst einen Abstand einfuegen.
    .replace(/(\d)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅛])/g, '$1 $2')
    .replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅛]/g, (c) => BRUCH_TEXT[c])
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:ca\.?|circa|etwa|ungefähr|gut|knapp|je)\s+(?=\d|[½⅓⅔¼¾])/i, '')
    .replace(/^([\d.,/]+)\s*-\s*([\d.,/]+)(?=\s|$|[A-Za-zÄÖÜäöüß])/, '$1-$2')
    .replace(/^([\d.,/]+)-(?:x|\.\.\.|…)(?=\s|$)/i, '$1')
    .replace(/^([\d.,/]+(?:-[\d.,/]+)?)([A-Za-zÄÖÜäöüß])/, '$1 $2');
}

/**
 * Zerlegt eine vollstaendige Zutatenzeile.
 * Fuehrende Zahl-Tokens gehoeren zur Menge ("1 1/2"), danach folgt
 * optional eine bekannte Einheit, der Rest ist die Bezeichnung.
 * @returns {{amount:number|null, unit:string, name:string}}
 */
export function parseIngredientLine(line) {
  const raw = normalizeLine(line);
  if (!raw) return { amount: null, unit: '', name: '' };

  // Unbestimmte Mengen wie "n. B." oder "etwas"
  const vague = raw.replace(/^(n\.?\s*b\.?|nach belieben|etwas|evtl\.?)\s+/i, '');
  if (vague !== raw) return { amount: null, unit: '', name: vague.trim() };

  const tokens = raw.split(' ');
  let i = 0;
  const numeric = [];
  while (i < tokens.length && isAmountToken(tokens[i])) {
    numeric.push(tokens[i]);
    i += 1;
  }

  const amount = numeric.length ? parseAmount(numeric.join(' ')) : null;
  if (amount == null) return { amount: null, unit: '', name: raw };

  let unit = '';
  let value = amount;

  if (i < tokens.length) {
    const key = tokens[i].toLowerCase().replace(/\.$/, '');
    if (UNITS.has(key)) {
      unit = UNITS.get(key);
      i += 1;

      const conversion = CONVERT.get(unit);
      if (conversion) {
        value = Math.round(amount * conversion.factor);
        unit = conversion.unit;
      }
    }
  }

  const name = tokens.slice(i).join(' ').trim();
  return { amount: value, unit, name: name || raw };
}

/**
 * Reduziert eine Zutat auf einen Suchbegriff, der im Supermarkt-Sortiment
 * trifft: Zusaetze, Klammern und Verarbeitungshinweise fallen weg.
 */
export function toSearchTerm(name) {
  let t = String(name);

  t = t.replace(/\([^)]*\)/g, ' ');           // Klammerzusaetze
  t = t.split(',')[0];                         // alles nach dem ersten Komma
  t = t.replace(/\b(Type|Typ)\s*\d+\b/gi, ' '); // Mehltypen
  t = t.replace(
    /\b(frisch|frische[rn]?|getrocknet|getrocknete[rn]?|gehackt|gehackte[rn]?|gemahlen|gemahlene[rn]?|gerieben|geriebene[rn]?|gekocht|gekochte[rn]?|gegart|gegarte[rn]?|passiert|tiefgekühlt|vom Vortag|nach Wahl|edelsüß|ganz|ganze[rn]?|klein|groß)\b/gi,
    ' ',
  );
  t = t.replace(/\s+/g, ' ').trim();

  return t || String(name).trim();
}
