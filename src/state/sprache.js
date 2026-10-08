/**
 * Sprachbefehle fuer den Kochmodus: was die Spracherkennung gehoert hat,
 * wird zu einer Aktion. Bewusst wenige, kurze Woerter, die sich auch mit
 * laufender Dunstabzugshaube verstehen lassen.
 *
 * Reine Funktion; die Erkennung selbst macht der Browser.
 */

const WORTZAHLEN = {
  eine: 1, einen: 1, ein: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8,
  neun: 9, zehn: 10, elf: 11, zwölf: 12, fünfzehn: 15, zwanzig: 20, dreißig: 30, vierzig: 40,
  fünfundvierzig: 45, sechzig: 60, neunzig: 90,
};

const BEFEHLE = [
  ['weiter', /\b(weiter|nächster|nächste|naechster|vor|vorwärts|okay weiter|next)\b/],
  ['zurueck', /\b(zurück|zurueck|vorher|vorheriger|vorige|back)\b/],
  ['vorlesen', /\b(vorlesen|lies|lesen|wiederholen|nochmal|noch mal|was steht da)\b/],
  ['zutaten', /\b(zutaten|zutatenliste|was brauche ich)\b/],
  ['stopp', /\b(stopp|stop|ruhe|alarm aus|aus|ok|okay|danke)\b/],
  ['beenden', /\b(beenden|schließen|schliessen|kochmodus aus|fertig gekocht)\b/],
];

/**
 * @param {string} text erkannte Worte
 * @returns {{art:string, sekunden?:number}|null}
 *          art: weiter, zurueck, vorlesen, zutaten, timer, stopp, beenden
 */
export function befehlAus(text) {
  const t = String(text ?? '').toLowerCase().replace(/[!?]|[.,](?!\d)|(?<!\d)[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;

  // "Timer zehn Minuten", "Timer 5 Minuten", "Wecker auf 1 Stunde"
  const timer = t.match(/\b(timer|wecker|uhr|zeit)\b(?:\s+(?:auf|für|fuer|stellen auf))?\s*(\d+(?:[,.]\d+)?|[a-zäöüß]+)?\s*(sekunden?|minuten?|stunden?)?/);
  if (timer) {
    const zahl = timer[2] && (WORTZAHLEN[timer[2]] ?? Number(timer[2].replace(',', '.')));
    if (zahl > 0 && timer[3]) {
      const je = timer[3].startsWith('sek') ? 1 : timer[3].startsWith('min') ? 60 : 3600;
      return { art: 'timer', sekunden: Math.round(zahl * je) };
    }
    // "Timer starten": die Zeit aus dem Schritt
    if (/\b(start|starten|los|stellen)\b/.test(t) || !timer[2]) return { art: 'timer' };
  }

  for (const [art, re] of BEFEHLE) if (re.test(t)) return { art };
  return null;
}
