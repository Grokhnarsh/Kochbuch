/**
 * Ein Produkt aus Open Food Facts (ODbL) wird zum Vorratsposten:
 * "Barilla Spaghetti n.5, 500 g" wird "500 g Spaghetti".
 *
 * Open Food Facts wird von Freiwilligen gepflegt; Namen und Mengen sind
 * oft, aber nicht immer vollstaendig. Was fehlt, ergaenzt man von Hand.
 *
 * Reine Funktionen; die Abfrage macht die Oberflaeche.
 */

import { ALLERGENS } from './allergens.js';

/** EAN-8, EAN-13, UPC-A — mit gueltiger Pruefziffer */
export function istEan(code) {
  const c = String(code ?? '').trim();
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(c)) return false;
  const ziffern = c.split('').map(Number);
  const pruef = ziffern.pop();
  const summe = ziffern.reverse().reduce((a, z, i) => a + z * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (summe % 10)) % 10 === pruef;
}

export const produktAdresse = (ean) => `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json`
  + '?fields=code,product_name,product_name_de,generic_name_de,brands,quantity,product_quantity,product_quantity_unit,allergens_tags,categories_tags';

/** OFF-Allergenschluessel → App-Allergene */
const OFF_ALLERGENE = {
  'en:gluten': 'gluten', 'en:crustaceans': 'krebstiere', 'en:eggs': 'eier', 'en:fish': 'fisch',
  'en:peanuts': 'erdnuesse', 'en:soybeans': 'soja', 'en:milk': 'milch', 'en:nuts': 'schalenfruechte',
  'en:celery': 'sellerie', 'en:mustard': 'senf', 'en:sesame-seeds': 'sesam',
  'en:sulphur-dioxide-and-sulphites': 'sulfite', 'en:lupin': 'lupinen', 'en:molluscs': 'weichtiere',
};

/** Marke und Fuellmenge aus dem Namen nehmen: "Barilla Spaghetti n.5 500g" → "Spaghetti n.5" */
function nameOhneBeiwerk(name, marke) {
  let n = String(name || '').replace(/\s+/g, ' ').trim();
  for (const m of String(marke || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    n = n.replace(new RegExp(`^${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-–:]?\\s*`, 'i'), '');
  }
  return n.replace(/\s*\d+([.,]\d+)?\s*(g|kg|ml|l|cl)\b\.?$/i, '').trim();
}

/** "500 g", "1,5 l", "6 x 1,5 l", "250g" → {menge, einheit} */
export function mengeAus(text) {
  const t = String(text ?? '').toLowerCase().replace(',', '.');
  const multi = t.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/);
  const einfach = t.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/);
  let menge;
  let einheit;
  if (multi) {
    menge = Number(multi[1]) * Number(multi[2]);
    [, , , einheit] = multi;
  } else if (einfach) {
    menge = Number(einfach[1]);
    [, , einheit] = einfach;
  } else {
    return null;
  }
  if (einheit === 'cl') {
    menge *= 10;
    einheit = 'ml';
  }
  return menge > 0 ? { menge: Math.round(menge * 1000) / 1000, einheit } : null;
}

/**
 * @param {object} antwort JSON der OFF-API v2
 * @returns {{name:string, menge:number|null, einheit:string, marke:string, allergene:string[], ean:string}|null}
 */
export function postenAusProdukt(antwort) {
  const p = antwort?.product;
  if (!p || antwort.status === 0) return null;
  const roh = p.product_name_de || p.product_name || p.generic_name_de || '';
  const marke = String(p.brands || '').split(',')[0].trim();
  const name = nameOhneBeiwerk(roh, p.brands) || roh.trim();
  if (!name) return null;
  const m = mengeAus(p.quantity) || (p.product_quantity > 0 && /^(g|ml)$/i.test(p.product_quantity_unit || 'g')
    ? { menge: Number(p.product_quantity), einheit: (p.product_quantity_unit || 'g').toLowerCase() } : null);
  const allergene = [...new Set((p.allergens_tags || []).map((t) => OFF_ALLERGENE[t]).filter(Boolean))]
    .filter((id) => ALLERGENS.some((a) => a.id === id));
  return {
    name: name.slice(0, 80),
    menge: m?.menge ?? null,
    einheit: m?.einheit ?? '',
    marke: marke.slice(0, 60),
    allergene,
    ean: String(p.code || antwort.code || ''),
  };
}
