/**
 * Vorkochen: einmal mehr kochen, am naechsten Tag den Rest essen.
 *
 * Ein Eintrag, von dem etwas uebrig bleiben soll, traegt `extra` (so viele
 * Portionen mehr werden gekocht) und eine Kennung `kid`. Der Rest liegt als
 * eigener Eintrag im Plan, mit `rest: <kid>`. Die Einkaufsliste kauft fuer
 * `servings + extra` ein und fuer den Rest gar nicht, denn der steht
 * schon im Kuehlschrank.
 *
 * Die Kennung statt eines Feldes haelt die Verbindung, wenn einer der
 * beiden Eintraege im Plan verschoben wird.
 *
 * Reine Funktionen auf einer Woche {slot: eintrag}.
 */

const MAHLZEITEN = ['fruehstueck', 'mittag', 'abend', 'snack'];

/** Eine neue Kennung, kurz und ohne Sonderzeichen */
export const neueKennung = (zufall = Math.random) => `k${Math.floor(zufall() * 36 ** 6).toString(36)}`;

/** Der Eintrag, der fuer diesen Rest gekocht wird, mit seinem Feld */
export function quelleVon(woche, rest) {
  if (!rest?.rest) return null;
  const treffer = Object.entries(woche).find(([, e]) => e.kid === rest.rest && !e.rest);
  return treffer ? { id: treffer[0], eintrag: treffer[1] } : null;
}

/** Alle Reste eines gekochten Eintrags */
export function resteVon(woche, eintrag) {
  if (!eintrag?.kid) return [];
  return Object.entries(woche).filter(([, e]) => e.rest === eintrag.kid).map(([id, e]) => ({ id, eintrag: e }));
}

/**
 * Nimmt Felder aus der Woche und haelt die Verbindungen stimmig:
 * Wer das gekochte Gericht entfernt, entfernt seine Reste mit; wer einen
 * Rest entfernt, kocht dafuer weniger.
 *
 * @returns {object} neue Woche
 */
export function ohneFelder(woche, ids) {
  const neu = { ...woche };
  const weg = new Set(ids);
  for (const id of ids) {
    const e = woche[id];
    if (!e) continue;
    if (e.kid && !e.rest) {
      for (const r of resteVon(woche, e)) {
        delete neu[r.id];
        weg.add(r.id);
      }
    }
  }
  for (const id of weg) {
    const e = woche[id];
    delete neu[id];
    if (!e?.rest) continue;
    const q = quelleVon(neu, e);
    if (!q) continue;
    const extra = Math.max(0, (q.eintrag.extra || 0) - e.servings);
    neu[q.id] = extra ? { ...q.eintrag, extra } : ohneKette(q.eintrag);
  }
  return neu;
}

function ohneKette(e) {
  const { extra, kid, ...rest } = e;
  return rest;
}

/**
 * Das erste freie Feld nach dem gekochten: am Folgetag mittags, dann
 * abends, dann am Tag darauf. Nur innerhalb der Woche.
 *
 * @returns {string|null}
 */
export function restPlatz(woche, quelleId) {
  const [tag, mahlzeit] = quelleId.split(':');
  const start = Number(tag);
  const ab = MAHLZEITEN.indexOf(mahlzeit);
  // Vom Fruehstueck bleibt mittags etwas, vom Mittag abends
  const kandidaten = [];
  if (ab >= 0 && ab < 2) kandidaten.push(`${start}:${MAHLZEITEN[ab + 1] === 'mittag' ? 'mittag' : 'abend'}`);
  for (let d = start + 1; d <= Math.min(6, start + 2); d += 1) kandidaten.push(`${d}:mittag`, `${d}:abend`);
  return kandidaten.find((id) => id !== quelleId && !woche[id]) || null;
}

/**
 * Plant von einem Eintrag Reste fuer ein anderes Feld ein.
 *
 * @returns {object|null} neue Woche, oder null, wenn es nicht geht
 */
export function vorkochenIn(woche, quelleId, zielId, portionen, kid = neueKennung()) {
  const q = woche[quelleId];
  if (!q || q.rest || !zielId || zielId === quelleId || !(portionen > 0)) return null;
  const neu = woche[zielId] ? ohneFelder(woche, [zielId]) : { ...woche };
  const quelle = neu[quelleId];
  if (!quelle) return null;
  const k = quelle.kid || kid;
  neu[quelleId] = { ...quelle, kid: k, extra: (quelle.extra || 0) + portionen };
  neu[zielId] = { recipeId: quelle.recipeId, servings: portionen, rest: k };
  return neu;
}

/**
 * Was wirklich gekocht und eingekauft wird: Reste fallen weg, vorgekochte
 * Gerichte zaehlen mit ihren Extraportionen.
 *
 * @returns {{recipeId:string, servings:number}[]}
 */
export function kochEintraege(woche) {
  return Object.values(woche)
    .filter((e) => !e.rest)
    .map((e) => ({ recipeId: e.recipeId, servings: e.servings + (e.extra || 0) }));
}
