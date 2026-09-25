/**
 * Thermomix-Einstellungen in Arbeitsschritten erkennen.
 *
 * Rezepte fuer den Thermomix schreiben Zeit, Temperatur und Stufe in einer
 * festen Kurzform: "10 Sek./Stufe 5", "5 Min./100°C/Stufe 1",
 * "3 Min./Varoma/Linkslauf/Stufe 1", "Turbo/0,5 Sek./2-3 Mal". Die App
 * hebt sie in der Rezeptansicht hervor und fuehrt solche Rezepte unter dem
 * Schlagwort "Thermomix", damit die Suche sie findet.
 */

const ZEIT = String.raw`\d+(?:[.,]\d+)?\s*(?:Sek|Min)\.?`;
const TEMPERATUR = String.raw`(?:\d{2,3}\s*°\s*C?|Varoma)`;
const STUFE = String.raw`(?:Stufe\s*\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?|Sanftrührstufe|Teigknetstufe|Knetstufe|Turbo)`;
const LINKSLAUF = 'Linkslauf';

/**
 * Eine Einstellung: Zeit mit mindestens einer weiteren Angabe, oder die
 * Kurzformen fuer Turbo und Linkslauf. Eine blosse Zeitangabe ("10 Min.")
 * zaehlt nicht — die steht in jedem Rezept.
 */
export const EINSTELLUNG = new RegExp(
  `${ZEIT}(?:\\s*\\/\\s*(?:${TEMPERATUR}|${LINKSLAUF}|${STUFE}))+`
  + `|Turbo\\s*\\/\\s*${ZEIT}(?:\\s*\\/\\s*\\d+(?:\\s*[-–]\\s*\\d+)?\\s*Mal)?`
  + `|${LINKSLAUF}\\s*\\/\\s*${STUFE}`,
  'g',
);

const PORTALE = /(^|\.)(cookidoo\.[a-z.]+|rezeptwelt\.de|thermomix\.[a-z.]+|vorwerk\.[a-z.]+)$/i;

/** Enthaelt ein Text mindestens eine Thermomix-Einstellung? */
export function hatEinstellung(text) {
  EINSTELLUNG.lastIndex = 0;
  return EINSTELLUNG.test(String(text));
}

/** Ist ein Rezept fuer den Thermomix geschrieben — nach Herkunft oder Schritten? */
export function istThermomix({ steps = [], sourceHost = '', sourceUrl = '' } = {}) {
  let host = sourceHost;
  if (!host && sourceUrl) {
    try { host = new URL(sourceUrl).hostname; } catch { host = ''; }
  }
  return PORTALE.test(host.replace(/^www\./, '')) || steps.some(hatEinstellung);
}

/**
 * Hebt Einstellungen in bereits maskiertem Text hervor. Das Muster trifft
 * nur Ziffern, Buchstaben, Schraegstriche und °, im maskierten Text also
 * nie ein Stueck einer Entitaet.
 */
export function markiereEinstellungen(maskiert) {
  return String(maskiert).replace(EINSTELLUNG, (m) => `<span class="tm-set" title="Thermomix-Einstellung">${m}</span>`);
}
