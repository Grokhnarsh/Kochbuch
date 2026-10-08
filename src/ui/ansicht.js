/**
 * Farbschema und Schriftgroesse anwenden. Das Schema folgt dem System
 * ("auto") oder ist fest hell oder dunkel; html[data-dunkel] sagt allen,
 * auch der WebGL-Buehne, was gerade gilt.
 *
 * Ein kleines Skript im Kopf von index.html setzt das schon vor dem
 * ersten Bild, damit nichts hell aufblitzt.
 */

const SYSTEM_DUNKEL = window.matchMedia?.('(prefers-color-scheme: dark)');

let zuletzt = null;
const beobachter = new Set();

/** Ruft fn(dunkel) bei jedem Wechsel des wirksamen Schemas */
export function beiFarbwechsel(fn) {
  beobachter.add(fn);
  return () => beobachter.delete(fn);
}

/**
 * @param {{thema:'auto'|'hell'|'dunkel', schrift:number}} ansicht
 */
export function ansichtAnwenden(ansicht) {
  const root = document.documentElement;
  if (ansicht.thema === 'hell') root.dataset.theme = 'light';
  else if (ansicht.thema === 'dunkel') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  const dunkel = ansicht.thema === 'dunkel' || (ansicht.thema === 'auto' && Boolean(SYSTEM_DUNKEL?.matches));
  root.dataset.dunkel = dunkel ? '1' : '';
  root.style.setProperty('--schrift', String(ansicht.schrift || 1));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dunkel ? '#121418' : '#f0653a');
  if (zuletzt !== null && zuletzt !== dunkel) for (const fn of beobachter) fn(dunkel);
  zuletzt = dunkel;
}

/** Folgt dem System, wenn das Schema auf "auto" steht */
export function systemFolgen(lesen) {
  SYSTEM_DUNKEL?.addEventListener?.('change', () => ansichtAnwenden(lesen()));
}
