/**
 * Sicheres Einsetzen von Daten in HTML.
 *
 * Rezepte kommen nicht nur aus dem mitgelieferten Korpus, sondern auch
 * von fremden Webseiten (schema.org-Import), aus Wikis, aus gesicherten
 * Dateien und aus dem eigenen Formular. Ein Titel wie
 * `Kuchen <img src=x onerror=…>` darf deshalb nie als Markup in der
 * Seite landen: jede Angabe aus einem Rezept geht durch esc(), jede
 * Adresse durch safeUrl().
 */

const ZEICHEN = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Maskiert Text fuer Elementinhalt und Attributwerte in Anfuehrungszeichen. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ZEICHEN[c]);
}

/**
 * Laesst nur http- und https-Adressen durch. Eine Adresse wie
 * `javascript:…` aus einer importierten Datei wird zu "#".
 */
export function safeUrl(value) {
  try {
    const url = new URL(String(value ?? ''), 'https://example.invalid/');
    if (url.origin === 'https://example.invalid') return '#';
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '#';
  } catch {
    return '#';
  }
}
