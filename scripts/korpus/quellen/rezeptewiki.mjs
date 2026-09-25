/**
 * Rezepte-Wiki auf Fandom (rezepte.fandom.com/de), CC BY-SA: alle Artikel,
 * davon die mit Zutaten und Zubereitung.
 */

import { abruf, apiAdresse } from '../abruf.mjs';
import { seitenInhalte } from '../mediawiki.mjs';
import { rezeptAusSeite, API, SEITEN } from '../../../src/sources/rezeptewiki.js';

const ABSTAND = 3000;

/** Alle Artikel ohne Weiterleitungen; Rezepte haengen dort in vielen Kategorien. */
async function alleArtikel() {
  const titel = [];
  let weiter = {};
  do {
    const antwort = await abruf(apiAdresse(API, {
      action: 'query', list: 'allpages', apnamespace: '0', aplimit: '500', apfilterredir: 'nonredirects', ...weiter,
    }), { abstand: ABSTAND });
    titel.push(...antwort.query.allpages.map((p) => p.title));
    weiter = antwort.continue || null;
  } while (weiter);
  return titel.sort((a, b) => a.localeCompare(b, 'de'));
}

export default {
  name: 'rezeptewiki',
  beschreibung: 'Rezepte-Wiki (Fandom), alle Artikel',
  async laden({ fortschritt }) {
    const titel = await alleArtikel();
    const inhalte = await seitenInhalte(API, titel, { abstand: ABSTAND, fortschritt });
    const recipes = [];
    for (const t of titel) {
      const seite = inhalte.get(t);
      const r = seite && rezeptAusSeite(t, seite.wikitext, seite.kategorien);
      if (r) recipes.push(r);
    }
    return {
      sourceId: 'rezeptewiki',
      vorgaben: { chapter: 'Rezepte-Wiki', tags: ['Rezepte-Wiki'], note: 'Aus dem Rezepte-Wiki auf Fandom, CC BY-SA.' },
      urlBasis: SEITEN,
      recipes,
      gelesen: titel.length,
    };
  },
};
