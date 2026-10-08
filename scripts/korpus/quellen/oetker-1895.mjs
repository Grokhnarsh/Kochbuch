/**
 * August Oetker, "Dr. A. Oetkers Grundlehren der Kochkunst sowie
 * preisgekrönte Rezepte für Haus und Küche" — Nachdruck des ersten
 * Oetker-Kochbuchs von 1895, gemeinfrei (der Verfasser starb 1918), im
 * Wortlaut nach Projekt Gutenberg (eBook 31537).
 *
 * Das Buch ist vor allem Hauswirtschaftslehre; Rezepte stehen nur im
 * Kapitel "Dr. Oetker's Recepte": Kuchen und Gebäck mit dem damals neuen
 * Backpulver. Der Werbeton des Originals bleibt im Wortlaut, wie bei den
 * anderen historischen Büchern. Das Kaiserreich rechnet metrisch, das
 * Pfund zu 500 g.
 *
 * Nicht zu verwechseln mit den heutigen Dr.-Oetker-Kochbüchern: die sind
 * urheberrechtlich geschützt und bleiben draussen.
 */

import { abruf } from '../abruf.mjs';
import { saetze, wikiId } from '../../../src/sources/wikitext.js';
import { decodeEntities } from '../../../src/sources/schemaorg.js';
import { MASSE, zutatenAusText, lebensmittelRechner, personenAus } from '../historisch.mjs';

const BUCH = 'https://www.gutenberg.org/cache/epub/31537/pg31537-images.html';

/**
 * Was der Leser im Fliesstext faelschlich fuer eine Zutat haelt: "für
 * Zuckerkranke", "zum Thee und Wein", "Feinster Kaffeekuchen", "Butter
 * zur Sahne rühren" und die "50% Eiweiß" der Trockensubstanz.
 */
const KEINE_ZUTAT = /^(zuckerkranke|kaffeekuchen|kaffee|tee|wein|sahne)$/i;
const unsinnig = (z) => KEINE_ZUTAT.test(z.n) || (z.n === 'Eiweiß' && z.a === 50);

function text(html) {
  return decodeEntities(html
    .replace(/<span class="pagenum">[\s\S]*?<\/span>/g, '')
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

export default {
  name: 'oetker-1895',
  beschreibung: 'August Oetker, Grundlehren der Kochkunst (1895), Projekt Gutenberg',
  async laden() {
    const html = await abruf(BUCH, { json: false, abstand: 5000 });
    const start = html.indexOf('id="Dr_Oetkers_Recepte"');
    if (start < 0) throw new Error('Rezeptkapitel nicht gefunden');
    // Das Kapitel endet mit der Abbildung des Backpulver-Paeckchens
    const ende = html.indexOf('So sehen die', start);
    const kapitel = html.slice(start, ende > start ? ende : undefined);
    const rechner = lebensmittelRechner();

    const recipes = [];
    let seite = (html.slice(0, start).match(/id="Page_(\d+)"/g) || []).pop()?.match(/\d+/)[0] || '68';
    let offen = null;

    const abschliessen = () => {
      if (!offen || !offen.absaetze.length) { offen = null; return; }
      const wortlaut = offen.absaetze.join(' ');
      const steps = offen.absaetze.flatMap((a) => saetze(a)).filter((s) => s.length > 10);
      const personen = personenAus(wortlaut);
      recipes.push({
        id: wikiId('oetker1895', offen.titel),
        sourceId: 'oetker-1895',
        title: offen.titel,
        chapter: "Dr. Oetker's Recepte",
        category: 'Backen',
        meals: ['snack'],
        ...(personen ? { servings: personen, servingsGeschaetzt: false } : {}),
        ingredients: zutatenAusText(wortlaut, { masse: MASSE.metrisch, rechner }).filter((z) => !unsinnig(z)),
        steps,
        quelle: { titel: "Dr. A. Oetkers Grundlehren der Kochkunst", autor: 'August Oetker', jahr: '1895', seite: offen.seite },
        sourceUrl: `${BUCH}#Page_${offen.seite}`,
      });
      offen = null;
    };

    const re = /id="Page_(\d+)"|<h4[^>]*>([\s\S]*?)<\/h4>|<p\b[^>]*>([\s\S]*?)<\/p>/g;
    let m;
    while ((m = re.exec(kapitel))) {
      if (m[1]) {
        seite = m[1];
      } else if (m[2] != null) {
        abschliessen();
        const titel = text(m[2]).replace(/\.$/, '').replace(/^Chokolade/, 'Schokoladen');
        if (titel) offen = { titel, seite, absaetze: [] };
      } else if (m[3] != null && offen) {
        const absatz = text(m[3]);
        if (absatz) offen.absaetze.push(absatz);
      }
    }
    abschliessen();

    return {
      sourceId: 'oetker-1895',
      art: 'originaltext',
      vorgaben: {
        cuisine: 'Deutsch',
        tags: ['Historisch', '1895', 'Backpulver'],
        servingsGeschaetzt: true,
        note: 'August Oetker, Dr. A. Oetkers Grundlehren der Kochkunst, Bielefeld 1895. '
          + 'Gemeinfrei, Wortlaut nach Projekt Gutenberg. Zutaten aus dem Text erschlossen, das Pfund zu 500 g.',
      },
      recipes,
      gelesen: recipes.length,
      gelesenAls: 'Rezepten',
    };
  },
};
