/**
 * Kalenderrechnung fuer den Wochenplan, frei von App-Zustand.
 */

/** Montag der Woche, in der das Datum liegt. */
export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const shift = (d.getDay() + 6) % 7; // Montag = 0
  d.setDate(d.getDate() - shift);
  return d;
}

/** ISO-Datum des Wochenmontags, dient als Schluessel im Speicher. */
export function weekKey(date) {
  const d = startOfWeek(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Kalenderwoche nach ISO 8601. */
export function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}
