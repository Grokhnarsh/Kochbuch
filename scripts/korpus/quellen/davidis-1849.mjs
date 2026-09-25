/**
 * Henriette Davidis, "Praktisches Kochbuch für die gewöhnliche und feinere
 * Küche", 4. Auflage, Bielefeld 1849 — im Wortlaut, wie das Deutsche
 * Textarchiv es transkribiert hat (CC BY-SA 4.0; der Text selbst ist
 * gemeinfrei).
 *
 * Davidis schreibt keine Zutatenlisten, sondern Anweisungen: "Ein Viertel
 * Pfund mageres Schweinefleisch … wird fein gehackt, dann 4 Loth Butter zu
 * Sahne gerührt". Die Zutaten werden daraus erschlossen (historisch.mjs),
 * die Masse preussisch umgerechnet.
 */

import { abruf } from '../abruf.mjs';
import { saetze } from '../../../src/sources/wikitext.js';
import { wikiId } from '../../../src/sources/wikitext.js';
import { MASSE, zutatenAusText, lebensmittelRechner, personenAus } from '../historisch.mjs';

const TEXT = 'davidis_kochbuch_1849';
const XML = `https://www.deutschestextarchiv.de/book/download_xml/${TEXT}`;
const SEITE = `https://www.deutschestextarchiv.de/book/view/${TEXT}?p=`;

/** Kapitel (Buchstabe) → Kategorie der App. Fehlt eins, ist es keine Rezeptsammlung. */
const KAPITEL = {
  B: 'Suppe', C: 'Hauptgericht', D: 'Beilage', E: 'Dessert', F: 'Dessert', G: 'Hauptgericht',
  H: 'Hauptgericht', I: 'Hauptgericht', K: 'Dessert', L: 'Beilage', M: 'Dessert', N: 'Dessert',
  O: 'Salat', P: 'Grundrezept', Q: 'Backen', R: 'Grundrezept', S: 'Grundrezept', T: 'Grundrezept',
  U: 'Getränk', V: 'Grundrezept', W: 'Grundrezept',
};
const MAHLZEITEN = {
  Suppe: ['mittag', 'abend'], Hauptgericht: ['mittag', 'abend'], Beilage: ['mittag', 'abend'],
  Salat: ['mittag', 'abend'], Vorspeise: ['abend', 'snack'], Dessert: ['snack'], Backen: ['snack'],
  Grundrezept: ['snack'], Getränk: ['snack'],
};

const ENTITAET = (text) => text
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

/** TEI-Auszug zu Lesetext: Seitenkoepfe raus, Silbentrennung am Zeilenende aufheben. */
function lesetext(xml) {
  return ENTITAET(xml
    .replace(/<fw\b[\s\S]*?<\/fw>/g, '')
    .replace(/<pb\b[^>]*\/>|<milestone\b[^>]*\/>/g, '')
    .replace(/<figure\b[\s\S]*?<\/figure>/g, '')
    .replace(/<choice>\s*<sic>[\s\S]*?<\/sic>\s*<corr>([\s\S]*?)<\/corr>\s*<\/choice>/g, '$1'))
    .replace(/ſ/g, 's')
    // "Kalb-<lb/>fleisch" → "Kalbfleisch"; "Kalb- oder Hühnerfleisch" bleibt
    .replace(/([A-Za-zÄÖÜäöüß])[-¬]\s*<lb\/>\s*(?=[a-zäöüß])/g, '$1')
    .replace(/<lb\/>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Baut den Baum der div-Elemente: Kapitel, Abschnitte, Rezepte,
 * Unterrezepte. Jeder Knoten kennt seinen eigenen Text ohne den seiner
 * Kinder und die Seite, auf der er beginnt.
 */
function baum(body) {
  const wurzel = { ebene: 0, kopf: '', teile: [], kinder: [], seite: null };
  const stapel = [wurzel];
  let seite = null;
  const re = /<div n="(\d)">|<\/div>|<head>([\s\S]*?)<\/head>|<pb\b[^>]*facs="#f(\d+)"[^>]*\/>/g;
  let zuletzt = 0;
  let m;
  const text = (bis) => {
    if (bis > zuletzt) stapel[stapel.length - 1].teile.push(body.slice(zuletzt, bis));
  };
  while ((m = re.exec(body))) {
    text(m.index);
    zuletzt = re.lastIndex;
    if (m[1]) {
      const knoten = { ebene: Number(m[1]), kopf: '', teile: [], kinder: [], seite };
      stapel[stapel.length - 1].kinder.push(knoten);
      stapel.push(knoten);
    } else if (m[0] === '</div>') {
      if (stapel.length > 1) stapel.pop();
    } else if (m[2] != null) {
      stapel[stapel.length - 1].kopf = lesetext(m[2]);
    } else if (m[3]) {
      seite = Number(m[3]);
    }
  }
  text(body.length);
  return wurzel;
}

/** Absaetze und Anmerkungen eines Rezepts */
function abschnitte(knoten) {
  const roh = knoten.teile.join(' ');
  const absaetze = [...roh.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) => lesetext(m[1])).filter(Boolean);
  const anmerkungen = [...roh.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)]
    .map((m) => lesetext(m[1]).replace(/^Anmerk(ung)?\.\s*/, ''))
    .filter(Boolean);
  return { absaetze, anmerkungen };
}

const KEIN_REZEPT = /^(vom|von dem|von der|von den|über|etwas über|allgemeine|anweisung|regeln?)\b/i;

const ANDERE_ART = /^(auf|noch)\s+(eine\s+)?andere\s+(art|weise)|^eine\s+andere\s+art|^noch\s+eine\s+art|^dasselbe|^dieselben?\b|^desgleichen|^auf\s+gewöhnliche\s+art$/i;

export default {
  name: 'davidis-1849',
  beschreibung: 'Henriette Davidis, Praktisches Kochbuch (1849), Deutsches Textarchiv',
  async laden() {
    const xml = await abruf(XML, { json: false, abstand: 5000, headers: { cookie: 'verified=1' } });
    const body = xml.slice(xml.indexOf('<body>'), xml.indexOf('</body>'));
    const rechner = lebensmittelRechner();
    const recipes = [];
    let gelesen = 0;

    for (const kapitel of baum(body).kinder) {
      const buchstabe = (kapitel.kopf.match(/^([A-Z])\./) || [])[1];
      const kategorie = KAPITEL[buchstabe];
      if (!kategorie) continue;
      const kapitelName = kapitel.kopf.replace(/^[A-Z]\.\s*/, '').replace(/\.$/, '');

      let vorheriger = '';
      const besuche = (knoten, abschnitt) => {
        const kopf = knoten.kopf;
        const nummer = kopf.match(/^(\d+)\s*([a-z])?\.\s*/);
        if (!nummer) {
          // Abschnitt "I. Fleischsuppen": gibt seinen Namen an die Rezepte weiter
          const name = kopf.replace(/^[IVX]+\.\s*/, '').replace(/\.$/, '');
          for (const kind of knoten.kinder) besuche(kind, name || abschnitt);
          return;
        }

        gelesen += 1;
        // "Kalte Sahnen-Sauce … Zu Milchspeisen passend": der Zusatz ist eine Bemerkung
        let titel = kopf.slice(nummer[0].length).replace(/\.$/, '').split(/\.\s+(?=[A-ZÄÖÜ])/)[0].trim();
        // "Vom Aufbewahren des Wildprets", "Etwas über …": Hauskunde, kein Rezept
        if (KEIN_REZEPT.test(titel)) {
          for (const kind of knoten.kinder) besuche(kind, abschnitt);
          return;
        }
        if (ANDERE_ART.test(titel) && vorheriger) titel = `${vorheriger} (${titel.charAt(0).toLowerCase()}${titel.slice(1)})`;
        else vorheriger = titel.replace(/\s*\(.*\)$/, '');

        const { absaetze, anmerkungen } = abschnitte(knoten);
        let steps = absaetze.flatMap((a) => saetze(a));
        // Ein einziger langer Satz: an den Semikolons teilen, wie Davidis ihn gliedert
        if (steps.length < 2) steps = steps.flatMap((a) => a.split(/;\s+/));
        steps = [...steps, ...anmerkungen.map((a) => `Anmerkung: ${a}`)].filter((s) => s.length > 10);

        // Saure Gelees sind Sulzen zum Fleisch, keine Nachspeise
        let category = kategorie;
        if (buchstabe === 'K' && /saure/i.test(abschnitt || '')) category = 'Vorspeise';

        // "zu 12 Personen": wo Davidis es sagt, gilt ihre Zahl
        const personen = personenAus(absaetze.join(' '));

        recipes.push({
          id: `${wikiId('davidis1849', `${buchstabe}${nummer[1]}${nummer[2] || ''}`)}-${wikiId('', titel).slice(1)}`,
          ...(personen ? { servings: personen, servingsGeschaetzt: false } : {}),
          sourceId: 'davidis-1849',
          title: titel,
          chapter: abschnitt ? `${kapitelName} · ${abschnitt}` : kapitelName,
          category,
          meals: MAHLZEITEN[category],
          ingredients: zutatenAusText(absaetze.join(' '), { masse: MASSE.preussen, rechner }),
          steps,
          sourceUrl: knoten.seite ? SEITE + knoten.seite : undefined,
        });

        for (const kind of knoten.kinder) besuche(kind, abschnitt);
      };
      for (const kind of kapitel.kinder) besuche(kind, '');
    }

    return {
      sourceId: 'davidis-1849',
      art: 'originaltext',
      vorgaben: {
        cuisine: 'Deutsch',
        tags: ['Historisch', '1849'],
        servingsGeschaetzt: true,
        note: 'Henriette Davidis, Praktisches Kochbuch für die gewöhnliche und feinere Küche, Bielefeld 1849. '
          + 'Wortlaut nach dem Deutschen Textarchiv (CC BY-SA 4.0). Zutaten aus dem Text erschlossen, preußische Maße umgerechnet.',
      },
      recipes,
      gelesen,
    };
  },
};
