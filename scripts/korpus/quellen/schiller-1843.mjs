/**
 * Viktorine Schiller, "Neuestes Süddeutsches Kochbuch für alle Stände",
 * Stuttgart 1843 — gemeinfrei, im Wortlaut nach Projekt Gutenberg (eBook
 * 52879). Über 800 Rezepte der feinen und bürgerlichen Küche.
 *
 * Schiller rechnet nach eigener Angabe mit bairischem Gewicht und
 * bairischer Schenkmaß; danach werden die Mengen umgerechnet.
 */

import { abruf } from '../abruf.mjs';
import { saetze, wikiId } from '../../../src/sources/wikitext.js';
import { decodeEntities } from '../../../src/sources/schemaorg.js';
import { MASSE, zutatenAusText, lebensmittelRechner, personenAus } from '../historisch.mjs';

const BUCH = 'https://www.gutenberg.org/cache/epub/52879/pg52879-images.html';

/** Kapitel → Kategorie; was hier fehlt, ist kein Rezeptteil (Vorwort, Tranchiren, Register …) */
const KAPITEL = [
  [/^suppen\b/i, 'Suppe'],
  [/suppenknöpflein|beilagen zur suppe/i, 'Beilage'],
  [/^saucen/i, 'Grundrezept'],
  [/^ochsenfleisch|^pasteten|^fische|^ragouts|^braten/i, 'Hauptgericht'],
  [/^pastetchen|^sulzen/i, 'Vorspeise'],
  [/^gemüse|^beilagen zu gemüsen/i, 'Beilage'],
  [/^gelées|^gefrorenes/i, 'Dessert'],
  [/^salat/i, 'Salat'],
  [/^torten|^kuchen|backwerk/i, 'Backen'],
  [/^eingemachtes|^verschiedenes/i, 'Grundrezept'],
  [/^getränke/i, 'Getränk'],
];
const MAHLZEITEN = {
  Suppe: ['mittag', 'abend'], Hauptgericht: ['mittag', 'abend'], Beilage: ['mittag', 'abend'],
  Salat: ['mittag', 'abend'], Vorspeise: ['abend', 'snack'], Dessert: ['snack'], Backen: ['snack'],
  Grundrezept: ['snack'], Getränk: ['snack'],
};

/** HTML-Auszug zu Lesetext; Seitenzahlen und Fussnotenzeichen fallen weg */
function text(html) {
  return decodeEntities(html
    .replace(/<span class="pagenum">[\s\S]*?<\/span>/g, '')
    .replace(/<a[^>]*class="fnanchor"[^>]*>[\s\S]*?<\/a>/g, '')
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

const ANDERE_ART = /^(auf|noch)\s+(eine\s+)?andere\s+(art|weise)|^eine\s+andere\s+art|^noch\s+eine\s+art|^dasselbe|^dieselben?\b|^desgleichen/i;

export default {
  name: 'schiller-1843',
  beschreibung: 'Viktorine Schiller, Neuestes Süddeutsches Kochbuch (1843), Projekt Gutenberg',
  async laden() {
    const html = await abruf(BUCH, { json: false, abstand: 5000 });
    const inhalt = html.slice(html.indexOf('*** START'), html.indexOf('*** END'));
    const rechner = lebensmittelRechner();

    const recipes = [];
    let gelesen = 0;
    let kategorie = null;
    let kapitelName = '';
    let seite = null;
    let offen = null;
    let vorheriger = '';

    const abschliessen = () => {
      if (!offen) return;
      const absaetze = offen.absaetze.filter((a) => !/^Anmerkung\b/i.test(a));
      const anmerkungen = offen.absaetze.filter((a) => /^Anmerkung\b/i.test(a))
        .map((a) => `Anmerkung: ${a.replace(/^Anmerkung[.:]?\s*/i, '')}`);
      let steps = absaetze.flatMap((a) => saetze(a));
      if (steps.length < 2) steps = steps.flatMap((a) => a.split(/;\s+/));
      steps = [...steps, ...anmerkungen].filter((s) => s.length > 10);
      const personen = personenAus(absaetze.join(' '));
      recipes.push({
        id: `${wikiId('schiller1843', offen.nummer)}-${wikiId('', offen.titel).slice(1)}`,
        sourceId: 'schiller-1843',
        title: offen.titel,
        chapter: kapitelName,
        category: offen.kategorie,
        meals: MAHLZEITEN[offen.kategorie],
        ...(personen ? { servings: personen, servingsGeschaetzt: false } : {}),
        ingredients: zutatenAusText(absaetze.join(' '), { masse: MASSE.bayern, rechner }),
        steps,
        sourceUrl: offen.seite ? `${BUCH}#${offen.seite}` : BUCH,
      });
      offen = null;
    };

    const re = /<a id="(page\d+)"><\/a>|<h2[^>]*>([\s\S]*?)<\/h2>|<h3[^>]*>([\s\S]*?)<\/h3>|<p\b[^>]*>([\s\S]*?)<\/p>/g;
    let m;
    while ((m = re.exec(inhalt))) {
      if (m[1]) {
        seite = m[1];
      } else if (m[2] != null) {
        abschliessen();
        kapitelName = text(m[2]).replace(/^Seite \S+\s*/, '').replace(/\.$/, '');
        kategorie = KAPITEL.find(([k]) => k.test(kapitelName))?.[1] || null;
        vorheriger = '';
      } else if (m[3] != null) {
        abschliessen();
        const kopf = text(m[3]).replace(/^Seite \S+\s*/, '');
        const nummer = kopf.match(/^(\d+)\.\s*/);
        if (!kategorie || !nummer) continue;
        gelesen += 1;
        let titel = kopf.slice(nummer[0].length).replace(/\.$/, '').split(/\.\s+(?=[A-ZÄÖÜ])/)[0].trim();
        if (ANDERE_ART.test(titel) && vorheriger) titel = `${vorheriger} (${titel.charAt(0).toLowerCase()}${titel.slice(1)})`;
        else vorheriger = titel.replace(/\s*\(.*\)$/, '');
        offen = { nummer: nummer[1], titel, kategorie, seite, absaetze: [] };
      } else if (m[4] != null && offen) {
        const absatz = text(m[4]);
        if (absatz) offen.absaetze.push(absatz);
      }
    }
    abschliessen();

    return {
      sourceId: 'schiller-1843',
      art: 'originaltext',
      vorgaben: {
        cuisine: 'Süddeutsch',
        tags: ['Historisch', '1843'],
        servingsGeschaetzt: true,
        note: 'Viktorine Schiller, Neuestes Süddeutsches Kochbuch für alle Stände, Stuttgart 1843. '
          + 'Gemeinfrei, Wortlaut nach Projekt Gutenberg. Zutaten aus dem Text erschlossen, bairische Maße umgerechnet.',
      },
      recipes,
      gelesen,
    };
  },
};
