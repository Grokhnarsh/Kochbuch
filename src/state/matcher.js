/**
 * Stichwortsuche in Zutatennamen.
 *
 * Abteilungen und Allergene werden beide aus dem Zutatennamen
 * erschlossen und brauchen dieselbe Art zu suchen, deshalb liegt sie
 * hier und nicht doppelt.
 */

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LETTER = '[a-zäöüß]';

/**
 * Baut das Suchmuster fuer ein Stichwort.
 *
 * Deutsche Zusammensetzungen tragen das Grundwort mal vorn
 * ("Paprikaschoten"), mal hinten ("Weizenmehl"). Deshalb zaehlt ein
 * Treffer am Wortanfang oder am Wortende, jeweils mit moeglicher
 * Beugung ("Tomaten"). Ein blosser Teilstring reicht nicht: sonst
 * faende "ei" auch Reis, Weizenmehl und Eiswasser.
 *
 * Zwei Vorzeichen aendern das:
 *   "=" verlangt ein eigenstaendiges Wort ("=ei" trifft nicht "Eiswasser").
 *   "~" laesst das Stichwort auch mitten im Wort zu. Das ist fuer lange,
 *       eindeutige Grundwoerter noetig, die in Dreifachzusammensetzungen
 *       nach innen rutschen: "Ziegenkaeserolle", "Milchschokolade". Bei
 *       kurzen Stichwoertern waere es fatal, deshalb nicht als Standard.
 */
export function patternFor(keyword) {
  const exact = keyword.startsWith('=');
  const anywhere = keyword.startsWith('~');
  const word = escape(exact || anywhere ? keyword.slice(1) : keyword);

  if (exact) return new RegExp(`(^|(?!${LETTER}).)${word}($|(?!${LETTER}))`);
  if (anywhere) return new RegExp(word);
  return new RegExp(`(^|(?!${LETTER}).)${word}|${word}(e|en|n|er|es|s)?($|(?!${LETTER}))`);
}

/**
 * Vorgefertigte Muster aus Regeln der Form [wert, stichwoerter],
 * absteigend nach Stichwortlaenge — so gewinnt das laengste Stichwort.
 */
export function compile(rules, extra = () => ({})) {
  return rules
    .flatMap(([value, keywords]) =>
      keywords.map((k) => ({
        value,
        keyword: k.replace(/^[=~]/, ''),
        weight: k.replace(/^[=~]/, '').length,
        test: patternFor(k),
        ...extra(value, k),
      })),
    )
    .sort((a, b) => b.weight - a.weight);
}
