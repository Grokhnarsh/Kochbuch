/**
 * Eigene Bewertungen, Notizen und der Kochverlauf: was schon gekocht
 * wurde, wie es war und was beim naechsten Mal anders sein soll
 * ("weniger Salz"). Alles bleibt im Browser.
 *
 * Gespeichert je Rezept-Id: { sterne: 0–5, notiz: "", gekocht: ["2026-10-08", …] }
 */

const TAG = /^\d{4}-\d{2}-\d{2}$/;

/** Bereinigt eine gespeicherte oder importierte Sammlung. */
export function bereinigeBewertungen(roh) {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return {};
  const out = {};
  for (const [id, b] of Object.entries(roh)) {
    if (!/^[\w.:-]{1,200}$/.test(id) || !b || typeof b !== 'object') continue;
    const sterne = Number.isInteger(b.sterne) && b.sterne >= 0 && b.sterne <= 5 ? b.sterne : 0;
    const notiz = typeof b.notiz === 'string' ? b.notiz.slice(0, 1000) : '';
    const gekocht = (Array.isArray(b.gekocht) ? b.gekocht : []).filter((d) => typeof d === 'string' && TAG.test(d))
      .sort().slice(-50);
    if (sterne || notiz || gekocht.length) out[id] = { sterne, notiz, gekocht };
  }
  return out;
}

/** Heute als "JJJJ-MM-TT" in Ortszeit */
export function heute(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Vermerkt "heute gekocht"; zweimal am selben Tag zaehlt einmal. */
export function alsGekocht(sammlung, id, tag = heute()) {
  const b = sammlung[id] || { sterne: 0, notiz: '', gekocht: [] };
  if (b.gekocht.includes(tag)) return sammlung;
  return { ...sammlung, [id]: { ...b, gekocht: [...b.gekocht, tag].sort().slice(-50) } };
}

export function mitSternen(sammlung, id, sterne) {
  const b = sammlung[id] || { sterne: 0, notiz: '', gekocht: [] };
  return bereinigeBewertungen({ ...sammlung, [id]: { ...b, sterne } });
}

export function mitNotiz(sammlung, id, notiz) {
  const b = sammlung[id] || { sterne: 0, notiz: '', gekocht: [] };
  return bereinigeBewertungen({ ...sammlung, [id]: { ...b, notiz } });
}

/** Tage seit dem letzten Kochen, oder null */
export function tageSeit(b, jetzt = new Date()) {
  const letzter = b?.gekocht?.[b.gekocht.length - 1];
  if (!letzter) return null;
  const [j, m, t] = letzter.split('-').map(Number);
  const dann = new Date(j, m - 1, t);
  const heuteMitternacht = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
  return Math.round((heuteMitternacht - dann) / 86400000);
}

/**
 * Der Kochverlauf, neueste zuerst.
 * @returns {{id:string, tag:string}[]}
 */
export function verlauf(sammlung) {
  return Object.entries(sammlung)
    .flatMap(([id, b]) => b.gekocht.map((tag) => ({ id, tag })))
    .sort((a, b) => (a.tag < b.tag ? 1 : a.tag > b.tag ? -1 : 0));
}

/**
 * Gewicht fuer "Woche füllen" mit Lieblingen: gut bewertete Gerichte
 * oefter, schlecht bewertete selten, gerade Gekochtes erst einmal nicht.
 */
export function lieblingsGewicht(b, jetzt = new Date()) {
  if (!b) return 1;
  let g = 1;
  if (b.sterne >= 4) g *= b.sterne === 5 ? 6 : 4;
  else if (b.sterne && b.sterne <= 2) g *= 0.2;
  const seit = tageSeit(b, jetzt);
  if (seit != null && seit < 10) g *= 0.15;
  return g;
}
