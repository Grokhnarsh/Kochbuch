/**
 * Hedwig Heyl, "Volks-Kochbuch für Schule, Fortbildungsschule und Haus",
 * 1905 — gemeinfrei, nach Projekt Gutenberg (eBook 13921).
 *
 * Anders als die aelteren Buecher hat Heyl echte Zutatenlisten in Gramm
 * und Liter, gerechnet fuer zwei Personen. Diese Rezepte sind deshalb
 * keine Lesetexte: Naehrwerte, Vorschlaege und "Woche fuellen" gelten.
 *
 * Die Gutenberg-Fassung schreibt Umlaute als ae/oe/ue und Titel in
 * Grossbuchstaben; beides wird am Wortschatz des uebrigen Korpus wieder
 * richtig gesetzt ("AEPFEL" → "Äpfel").
 */

import { abruf } from '../abruf.mjs';
import { saetze, wikiId, einordnen } from '../../../src/sources/wikitext.js';
import { decodeEntities } from '../../../src/sources/schemaorg.js';
import { MASSE, wortschatz, umlauteSetzen, titelSchreibung, zutatenZeile, personenAus } from '../historisch.mjs';

const BUCH = 'https://www.gutenberg.org/cache/epub/13921/pg13921-images.html';

function text(html) {
  return decodeEntities(html.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Registerform "Bohnen, getrocknete" → "Getrocknete Bohnen";
 * "(Vorrat.)" am Ende ist ein Hinweis, kein Teil des Namens.
 */
function titelOrdnen(titel) {
  let t = titel.replace(/\s*\(Vorrat\.?\)\s*$/i, '').replace(/\.\s*\((.+?)\.?\)$/, ' ($1)').replace(/\.$/, '');
  const teile = t.split(/,\s*/);
  // Nur gebeugte Eigenschaftswoerter wandern nach vorn ("Bohnen, getrocknete");
  // "Hammelfleisch, geschnitten" bleibt, wie es ist
  if (teile.length >= 2 && /^[a-zäöüß]+(e|er|es)$/i.test(teile[1]) && !/\s/.test(teile[1])) {
    const beiwort = teile[1][0].toUpperCase() + teile[1].slice(1).toLowerCase();
    t = [`${beiwort} ${teile[0]}`, ...teile.slice(2)].join(', ');
  }
  return t;
}

/** Fische erkennt man am Namen; das Kapitel dazu ist in der Vorlage nicht sauber abgegrenzt */
const FISCH = /aal|hering|fisch|karpfen|hecht|dorsch|kabeljau|schellfisch|seelachs|zander|barsch|scholle|flunder|makrele|lachs|forelle|sprott|bückling|stint|muschel|krebs/i;

/** Kategorie aus Titel und den verlaesslichen Kapiteln der Vorlage */
function einordnenHeyl(titel, kapitel) {
  if (/^eingemachtes$/i.test(kapitel)) return { ...einordnen([], titel), category: 'Grundrezept', meals: ['snack'] };
  if (/^kompott/i.test(kapitel)) {
    const category = /kompott|mus\b|brei/i.test(titel) ? 'Dessert' : 'Grundrezept';
    return { ...einordnen([], titel), category, meals: ['snack'] };
  }
  const hinweis = /^(suppen|saucen)$/i.test(kapitel) || (/^fische$/i.test(kapitel) && FISCH.test(titel)) ? [kapitel] : [];
  return einordnen(hinweis, titel);
}

/** Eine Zeile sieht nach Zutat aus: beginnt mit Menge oder ist kurz und ohne Satzende */
const ZUTATENZEILE = /^(\d|½|¼|¾|etwas|einige|eine?|wenig|salz|pfeffer|zucker|fett)/i;

/** Absatz aus Zutatenzeilen: "100 g altes Brot\n1 Prise Salz\n…" */
function istZutatenliste(absatz) {
  const zeilen = absatz.split('\n').map((z) => z.trim()).filter(Boolean);
  if (zeilen.length < 2) return false;
  const passend = zeilen.filter((z) => ZUTATENZEILE.test(z) && z.length < 70);
  return passend.length >= zeilen.length * 0.6;
}

export default {
  name: 'heyl-1905',
  beschreibung: 'Hedwig Heyl, Volks-Kochbuch (1905), Projekt Gutenberg',
  async laden() {
    const html = await abruf(BUCH, { json: false, abstand: 5000 });
    const inhalt = html.slice(html.indexOf('*** START'), html.indexOf('*** END'));
    const schatz = wortschatz();
    const lesbar = (t) => umlauteSetzen(t, schatz);

    const recipes = [];
    let gelesen = 0;
    let kapitel = '';
    let offen = null;

    const abschliessen = () => {
      if (!offen) return;
      const [erster, ...rest] = offen.absaetze;
      if (erster && istZutatenliste(erster)) {
        const ingredients = erster
          .replace(/=/g, '-') // "Schweine= oder Gänsefett": der alte Doppelbindestrich
          // Alternativen ueber zwei Zeilen: "1 kleiner Kopf Kohl oder\n½ kg Sauerkohl"
          .replace(/\s+oder\s*\n\s*/g, ' oder ')
          .replace(/\n\s*oder\s+/g, ' oder ')
          .split('\n')
          // "3 Nelken 1 Prise Salz", "40 g Grieß, 30 g Graupen": zwei Zutaten in einer Zeile
          .flatMap((z) => z.split(/(?<=[a-zäöüß),])\s+(?=\d)/))
          .map((z) => lesbar(z.trim().replace(/[.,;]$/, '')))
          .filter((z) => z && !/\[\?\]/.test(z))
          .map((z) => zutatenZeile(z, MASSE.metrisch))
          .filter((z) => z.n && z.n.length > 1);

        const selbstkocher = rest.some((a) => /Selbstkocher|Sebstkocher/.test(a));
        const absaetze = rest
          .filter((a) => !/^Gericht f(ue|ü)r den Se(l)?bstkocher/i.test(a))
          .filter((a) => !/^[A-ZÄÖÜ ,.-]{4,}:\s*Siehe\b/.test(a))
          .map((a) => lesbar(a.replace(/\n/g, ' ')));
        let steps = absaetze.flatMap((a) => (absaetze.length < 2 ? saetze(a) : [a])).filter((s) => s.length > 10);
        if (steps.length < 2) steps = absaetze.flatMap((a) => saetze(a)).filter((s) => s.length > 10);

        const einordnung = einordnenHeyl(offen.titel, kapitel);
        recipes.push({
          id: wikiId('heyl1905', offen.titel),
          sourceId: 'heyl-1905',
          title: offen.titel,
          // Nur die Kapitel, die die Vorlage sauber abgrenzt
          chapter: /^(suppen|saucen|kompott|eingemachtes)$/i.test(kapitel) ? kapitel : '',
          ...einordnung,
          cuisine: 'Deutsch',
          servings: personenAus(absaetze.join(' ')) || 2,
          ...(selbstkocher ? { tags: ['Historisch', '1905', 'Kochkiste'] } : {}),
          ingredients,
          steps,
          sourceUrl: `${BUCH}#${offen.anker}`,
        });
      }
      offen = null;
    };

    // Die Kapitel stehen alphabetisch. Faengt das Alphabet von vorn an, beginnt
    // ein Kapitel, dessen Ueberschrift in der Vorlage fehlt (Fleisch, Gemuese).
    const KAPITELKOPF = /^(SUPPEN|FISCHE|SAUCEN|MILCH-, MEHL- UND EIERSPEISEN|KOMPOTT|VERSCHIEDENES)\.?$/;
    let letzterBuchstabe = '';

    const re = /<h5[^>]*?(?:id="([^"]+)")?[^>]*>([\s\S]*?)<\/h5>|<h3[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h3>|<p\b[^>]*>([\s\S]*?)<\/p>/g;
    let m;
    while ((m = re.exec(inhalt))) {
      const istH5 = m[2] != null;
      const h5text = istH5 ? text(m[2]).replace(/\s+/g, ' ') : '';

      if (istH5 && KAPITELKOPF.test(h5text)) {
        abschliessen();
        kapitel = titelSchreibung(h5text, schatz);
        letzterBuchstabe = '';
        continue;
      }
      if (istH5 && !/,/.test(h5text)) {
        // "I." und aehnliche Zwischenzeilen
        abschliessen();
        continue;
      }
      if (istH5 || m[4] != null) {
        // "ERBSEN, DICKE" steht als h5 da, ist aber ein Rezept wie die h3
        abschliessen();
        const kopf = istH5 ? h5text : text(m[4]).replace(/\s+/g, ' ');
        if (/^(VORWORT|INHALT|REGISTER)/i.test(kopf)) continue;
        const buchstabe = kopf[0];
        if (letzterBuchstabe && buchstabe < letzterBuchstabe) {
          // Nach dem Kompott folgt, wieder von A an, das Eingemachte
          kapitel = /^kompott$/i.test(kapitel) ? 'Eingemachtes' : '';
        }
        letzterBuchstabe = buchstabe;
        // "Verschiedenes" ist Hauskunde: Fett auslassen, Kaffee brennen, Seife kochen
        if (/^verschiedenes$/i.test(kapitel)) continue;
        gelesen += 1;
        offen = { titel: titelOrdnen(titelSchreibung(kopf, schatz)), anker: istH5 ? m[1] : m[3], absaetze: [] };
        continue;
      }
      if (m[5] != null && offen) {
        const absatz = text(m[5]);
        if (absatz) offen.absaetze.push(absatz);
      }
    }
    abschliessen();

    return {
      sourceId: 'heyl-1905',
      vorgaben: {
        tags: ['Historisch', '1905'],
        note: 'Hedwig Heyl, Volks-Kochbuch für Schule, Fortbildungsschule und Haus, 1905. '
          + 'Gemeinfrei, nach Projekt Gutenberg. Die Rezepte sind für zwei Personen gerechnet.',
      },
      recipes,
      gelesen,
    };
  },
};
