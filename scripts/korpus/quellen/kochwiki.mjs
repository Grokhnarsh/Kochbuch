/**
 * Koch-Wiki (kochwiki.org), CC BY-SA 3.0: rund 9200 Rezeptseiten.
 */

import { kategorieSeiten, seitenInhalte } from '../mediawiki.mjs';
import { rezeptAusSeite, isGermanTitle, API, SEITEN } from '../../../src/sources/kochwiki.js';

const KATEGORIEN = ['Kategorie:Rezepte ohne Alkohol', 'Kategorie:Rezepte mit Alkohol'];
const ABSTAND = 2000;

export default {
  name: 'kochwiki',
  beschreibung: 'Koch-Wiki, alle Rezeptseiten',
  async laden({ fortschritt }) {
    const titel = new Set();
    for (const k of KATEGORIEN) for (const t of await kategorieSeiten(API, k, { abstand: ABSTAND })) titel.add(t);

    // Nach Titel sortiert: bei gleicher Id behaelt die erste Seite die
    // kurze Form, und das bei jedem Lauf dieselbe.
    const liste = [...titel].filter(isGermanTitle).sort((a, b) => a.localeCompare(b, 'de'));
    const inhalte = await seitenInhalte(API, liste, { abstand: ABSTAND, fortschritt });

    const recipes = [];
    for (const t of liste) {
      const seite = inhalte.get(t);
      const r = seite && rezeptAusSeite(t, seite.wikitext, seite.kategorien);
      if (r) recipes.push(r);
    }
    return {
      sourceId: 'kochwiki',
      vorgaben: { chapter: 'Koch-Wiki', tags: ['Koch-Wiki'], note: 'Aus dem Koch-Wiki, CC BY-SA 3.0.' },
      urlBasis: SEITEN,
      recipes,
      gelesen: liste.length,
    };
  },
};
