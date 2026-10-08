/**
 * Findet Zeitangaben in Arbeitsschritten: "15 Minuten köcheln",
 * "1 Std. 30 Min. ruhen lassen", "eine halbe Stunde", "10 Sek./Stufe 5".
 *
 * Aus jeder Angabe wird im Kochmodus ein Knopf, der einen Timer stellt.
 * Bei einer Spanne ("20–25 Minuten") zaehlt die untere Grenze: Nach
 * zwanzig Minuten nachzusehen schadet nie, nach fuenfundzwanzig kann es
 * zu spaet sein.
 *
 * Reine Funktionen ohne DOM, damit sie sich in Node pruefen lassen.
 */

const WORTZAHLEN = {
  ein: 1, eine: 1, einen: 1, einem: 1, einer: 1,
  zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  elf: 11, zwölf: 12, fünfzehn: 15, zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50, sechzig: 60,
  anderthalb: 1.5, eineinhalb: 1.5, zweieinhalb: 2.5,
};
const BRUECHE = { '½': 0.5, '¼': 0.25, '¾': 0.75 };

const WORT = Object.keys(WORTZAHLEN).sort((a, b) => b.length - a.length).join('|');
const ZAHL = `(?:\\d+(?:[.,]\\d+)?(?:\\s*[½¼¾]|\\s+1\\/2)?|[½¼¾]|${WORT})`;
const EINHEIT = '(Sekunden|Sekunde|Sek\\.?|Minuten|Minute|Min\\.?|Stunden|Stunde|Std\\.?)';
// Davor darf kein Buchstabe und keine Ziffer stehen ("Frischkäse" ist keine
// Zeit), dahinter kein Buchstabe ("Minutensteak").
const VOR = '(?<![\\p{L}\\d])';
const NACH = '(?!\\p{L})';

const MUSTER = new RegExp([
  `${VOR}(?:eine[nr]?\\s+)?halben?\\s+Stunde${NACH}`,
  `${VOR}(?:Dreiviertel|Viertel)stunde${NACH}`,
  `${VOR}(${ZAHL})(?:\\s*(?:[-–—]|bis)\\s*(${ZAHL}))?\\s*${EINHEIT}${NACH}`,
].join('|'), 'giu');

function zahl(text) {
  const t = text.trim().toLowerCase();
  if (t in WORTZAHLEN) return WORTZAHLEN[t];
  if (t in BRUECHE) return BRUECHE[t];
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(?:([½¼¾])|1\/2)?$/);
  if (!m) return NaN;
  const ganz = Number(m[1].replace(',', '.'));
  if (m[2]) return ganz + BRUECHE[m[2]];
  return /1\/2$/.test(t) ? ganz + 0.5 : ganz;
}

function sekundenJe(einheit) {
  const e = einheit.toLowerCase();
  if (e.startsWith('sek')) return 1;
  if (e.startsWith('min')) return 60;
  return 3600;
}

/** Ein einzelner Treffer, noch ohne Zusammenfassung. */
function treffer(m) {
  const text = m[0];
  if (/halbe/i.test(text)) return { sekunden: 1800, stufe: 3600 };
  if (/^dreiviertel/i.test(text)) return { sekunden: 2700, stufe: 3600 };
  if (/^viertel/i.test(text)) return { sekunden: 900, stufe: 3600 };
  const je = sekundenJe(m[3]);
  const von = zahl(m[1]);
  if (!Number.isFinite(von)) return null;
  return { sekunden: Math.round(von * je), stufe: je, bis: m[2] ? Math.round(zahl(m[2]) * je) : null };
}

/**
 * @param {string} text Ein Arbeitsschritt
 * @returns {{start:number, ende:number, text:string, sekunden:number, bis:number|null}[]}
 */
export function dauernIn(text) {
  const s = String(text ?? '');
  const roh = [];
  MUSTER.lastIndex = 0;
  for (const m of s.matchAll(MUSTER)) {
    const t = treffer(m);
    if (!t) continue;
    roh.push({ start: m.index, ende: m.index + m[0].length, ...t });
  }

  // "1 Std. 30 Min." und "1 Stunde und 15 Minuten" sind eine Angabe
  const out = [];
  for (const t of roh) {
    const vorher = out[out.length - 1];
    const dazwischen = vorher ? s.slice(vorher.ende, t.start) : null;
    if (vorher && /^\s*(?:und\s*)?$/i.test(dazwischen) && vorher.stufe > t.stufe && !vorher.bis && !t.bis) {
      vorher.sekunden += t.sekunden;
      vorher.ende = t.ende;
      vorher.stufe = t.stufe;
      continue;
    }
    out.push({ ...t });
  }

  return out
    .filter((t) => t.sekunden > 0 && t.sekunden <= 24 * 3600)
    .map(({ start, ende, sekunden, bis }) => ({
      start, ende, sekunden, bis: bis && bis > sekunden ? bis : null, text: s.slice(start, ende),
    }));
}

/** 75 -> "1:15", 3725 -> "1:02:05" */
export function uhr(sekunden) {
  const s = Math.max(0, Math.ceil(sekunden));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sek = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sek}` : `${m}:${sek}`;
}

/** 45 -> "45 Sek.", 600 -> "10 Min.", 5400 -> "1 Std. 30 Min." — fuer Beschriftungen */
export function dauerText(sekunden) {
  if (sekunden < 60) return `${sekunden} Sek.`;
  const h = Math.floor(sekunden / 3600);
  const m = Math.round((sekunden % 3600) / 60);
  if (!h) return `${m} Min.`;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}
