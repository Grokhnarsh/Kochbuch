/**
 * Wikibooks-Kochbuch, CC BY-SA 4.0: rund 640 Seiten in der Sammelkategorie.
 */

import { readFileSync } from 'node:fs';
import { kategorieSeiten, seitenInhalte } from '../mediawiki.mjs';
import { rezeptAusSeite, API, SEITEN, CATEGORY } from '../../../src/sources/wikibooks.js';

// Wikimedia bittet um Zurueckhaltung; fuenf Sekunden zwischen Anfragen
const ABSTAND = 5000;

/** Titel der von Hand aufbereiteten Wikibooks-Rezepte, die schon im Bundle liegen */
function schonKuratiert() {
  const buch = JSON.parse(readFileSync('src/data/books/wikibooks-de.json', 'utf8'));
  return new Set(buch.recipes.map((r) => r.title.toLowerCase()));
}

export default {
  name: 'wikibooks',
  beschreibung: 'Wikibooks-Kochbuch, alle Rezeptseiten',
  async laden({ fortschritt }) {
    const titel = (await kategorieSeiten(API, CATEGORY, { abstand: ABSTAND })).sort((a, b) => a.localeCompare(b, 'de'));
    const inhalte = await seitenInhalte(API, titel, { abstand: ABSTAND, fortschritt });
    const kuratiert = schonKuratiert();

    const recipes = [];
    for (const t of titel) {
      const seite = inhalte.get(t);
      const r = seite && rezeptAusSeite(t, seite.wikitext, seite.kategorien);
      if (r && !kuratiert.has(r.title.toLowerCase())) recipes.push(r);
    }
    return {
      sourceId: 'wikibooks-de',
      vorgaben: { chapter: 'Wikibooks Kochbuch', tags: ['Wikibooks'], note: 'Aus dem Wikibooks-Kochbuch, CC BY-SA 4.0.' },
      urlBasis: SEITEN,
      recipes,
      gelesen: titel.length,
    };
  },
};
