/**
 * Mengen-Arithmetik fuer die Einkaufsliste: Einheiten normalisieren,
 * zusammenfassen und wieder lesbar formatieren.
 */

/** Einheiten, die sich in eine Basiseinheit umrechnen lassen. */
const SCALE = {
  kg: { base: 'g', factor: 1000 },
  g: { base: 'g', factor: 1 },
  l: { base: 'ml', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
};

/** Rechnet eine Menge in ihre Basiseinheit um. */
export function toBase(amount, unit) {
  const s = SCALE[unit];
  if (!s || amount == null) return { amount, unit };
  return { amount: amount * s.factor, unit: s.base };
}

/** Formatiert eine Basismenge wieder gross-lesbar (1200 g -> 1,2 kg). */
export function fromBase(amount, unit) {
  if (amount == null) return { amount: null, unit };
  if (unit === 'g' && amount >= 1000) return { amount: amount / 1000, unit: 'kg' };
  if (unit === 'ml' && amount >= 1000) return { amount: amount / 1000, unit: 'l' };
  return { amount, unit };
}

/**
 * Rundet auf eine Genauigkeit, die zur Groessenordnung passt.
 * Keine Viertelschritte: aus 1200 g wuerden sonst 1,25 kg statt 1,2 kg.
 */
export function roundAmount(n) {
  if (n == null) return null;
  if (n >= 100) return Math.round(n);
  if (n >= 10) return Math.round(n * 10) / 10;
  return Math.round(n * 100) / 100;
}

/** Deutsche Zahlformatierung ohne unnoetige Nullen. */
export function formatNumber(n) {
  if (n == null) return '';
  return Number(n)
    .toLocaleString('de-DE', { maximumFractionDigits: 2 })
    .replace(/,00$/, '');
}

/** Setzt Menge und Einheit zu einem Label zusammen. */
export function formatAmount(amount, unit) {
  const rounded = roundAmount(amount);
  if (rounded == null) return unit || '';
  const num = formatNumber(rounded);
  return unit ? `${num} ${unit}` : num;
}

/** Skaliert eine Zutat auf eine abweichende Portionszahl. */
export function scaleIngredient(ing, factor) {
  return {
    ...ing,
    amount: ing.amount == null ? null : ing.amount * factor,
  };
}
