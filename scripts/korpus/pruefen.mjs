/**
 * Mindestanforderungen an ein importiertes Rezept — dieselben, die der
 * Korpus-Test stellt. Was sie nicht erfuellt, kommt gar nicht erst in
 * die Dateien; das Werkzeug meldet, wie viel es verworfen hat.
 */

const MAHLZEITEN = new Set(['fruehstueck', 'mittag', 'abend', 'snack']);
const ERNAEHRUNG = new Set(['vegetarisch', 'vegan', 'glutenfrei', 'laktosefrei', 'pescetarisch']);
export const ENGLISCH = /(^|\s)(the|and|of|with|for|from|made|baked|roast|boiled|fried)(\s|$)/i;

/** @returns {string|null} der erste Mangel oder null */
export function mangel(r) {
  if (!(r.title?.length > 2)) return 'Titel';
  if (ENGLISCH.test(r.title)) return 'englischer Titel';
  if (!r.category) return 'Kategorie';
  if (!Array.isArray(r.meals) || !r.meals.length || r.meals.some((m) => !MAHLZEITEN.has(m))) return 'Mahlzeiten';
  if ((r.diet || []).some((d) => !ERNAEHRUNG.has(d))) return 'Ernährungsform';
  const maxErtrag = r.yieldUnit ? 400 : 24;
  if (!(r.servings >= 1 && r.servings <= maxErtrag)) return 'Ertrag';
  if (!(r.difficulty >= 1 && r.difficulty <= 3)) return 'Schwierigkeit';
  if (!(r.ingredients?.length >= 3)) return 'zu wenige Zutaten';
  for (const i of r.ingredients) {
    if (!(i.n?.length > 1)) return 'Zutat ohne Namen';
    if (!(i.a == null || i.a > 0)) return 'Menge';
    if (typeof i.u !== 'string') return 'Einheit';
  }
  if (!(r.steps?.length >= 2)) return 'zu wenige Schritte';
  if (r.steps.some((s) => !(s.length > 10))) return 'Schritt zu kurz';
  return null;
}

/**
 * Filtert eine Liste und macht Ids eindeutig: Seiten, deren Titel sich
 * nur in Satzzeichen unterscheiden, ergaeben sonst dieselbe Id.
 */
export function aussieben(liste, { vergeben = new Set() } = {}) {
  const gut = [];
  const verworfen = {};
  const ids = new Set(vergeben);
  for (const r of liste) {
    const m = mangel(r);
    if (m) {
      verworfen[m] = (verworfen[m] || 0) + 1;
      continue;
    }
    let id = r.id;
    for (let n = 2; ids.has(id); n += 1) id = `${r.id}-${n}`;
    ids.add(id);
    gut.push(id === r.id ? r : { ...r, id });
  }
  return { gut, verworfen };
}
