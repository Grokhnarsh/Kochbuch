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
  el: 'EL', esslöffel: 'EL', essloeffel: 'EL',
  tl: 'TL', teelöffel: 'TL', teeloeffel: 'TL',
  msp: 'Msp', messerspitze: 'Msp',
  prise: 'Prise', prisen: 'Prise',
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
  oz: { unit: 'g', factor: 28.35 },
  lb: { unit: 'g', factor: 453.59 },
  pint: { unit: 'ml', factor: 473.18 },
  quart: { unit: 'ml', factor: 946.35 },
}));

/** Wandelt "1 ½", "1/2", "2-3" oder "1,5" in eine Zahl. */
export function parseAmount(text) {
  if (!text) return null;
  let total = 0;
  let found = false;

  const range = text.match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)$/);
  if (range) {
    return (parseFloat(range[1].replace(',', '.')) + parseFloat(range[2].replace(',', '.'))) / 2;
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

/** Erkennt Tokens, die zu einer Mengenangabe gehoeren. */
function isAmountToken(token) {
  return (
    /^\d+(?:[.,]\d+)?$/.test(token) ||
    /^\d+\/\d+$/.test(token) ||
    /^[\u00bd\u2153\u2154\u00bc\u00be\u2155\u2156\u2157\u2158\u2159\u215b]$/.test(token) ||
    /^\d+[\u00bd\u2153\u2154\u00bc\u00be\u2155\u2156\u2157\u2158\u2159\u215b]$/.test(token) ||
    /^\d+(?:[.,]\d+)?\s*[-\u2013]\s*\d+(?:[.,]\d+)?$/.test(token)
  );
}

/**
 * Zerlegt eine vollstaendige Zutatenzeile.
 * Fuehrende Zahl-Tokens gehoeren zur Menge ("1 1/2"), danach folgt
 * optional eine bekannte Einheit, der Rest ist die Bezeichnung.
 * @returns {{amount:number|null, unit:string, name:string}}
 */
export function parseIngredientLine(line) {
  const raw = String(line).replace(/\s+/g, ' ').trim();
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
