/**
 * Wie ausgewogen ist ein Gericht — und welche passen in diese Woche?
 *
 * Die Bewertung ist absichtlich nachvollziehbar statt raffiniert: ein
 * Grundwert und eine Handvoll benannter Kriterien, jedes mit Punkten und
 * einem Satz, der sagt, warum. Grundlage sind die Empfehlungen der
 * Deutschen Gesellschaft fuer Ernaehrung (DGE) und der WHO:
 *
 *   - viel Gemuese, Obst und Huelsenfruechte ("5 am Tag")
 *   - Vollkorn statt Weissmehl
 *   - wenig gesaettigte Fettsaeuren, wenig Zucker, hoechstens 6 g Salz
 *     am Tag, rund 30 g Ballaststoffe
 *   - wenig rotes und besonders wenig verarbeitetes Fleisch, ein- bis
 *     zweimal Fisch in der Woche
 *   - eine niedrige Energiedichte macht satt, ohne viel Energie
 *
 * Eine Hauptmahlzeit wird dabei an einem Drittel der Tagesmenge gemessen.
 * Das ist eine Orientierung aus berechneten Werten, keine
 * Ernaehrungsberatung — und so steht es auch in der Oberflaeche.
 */

import { REFERENZ } from './naehrwerte.js';

export const HINWEIS_GESUNDHEIT =
  'Orientierung nach den Empfehlungen der DGE, berechnet aus den Zutaten. '
  + 'Keine Ernährungsberatung — bei besonderem Bedarf zählt der ärztliche Rat.';

/** Lebensmittel der Naehrwerttabelle, die als Gemuese, Obst oder Huelsenfrucht zaehlen. */
export const PFLANZLICH = new Set([
  'kartoffeln', 'suesskartoffel', 'zwiebel', 'schalotte', 'fruehlingszwiebel', 'knoblauch', 'moehren',
  'tomaten', 'dosentomaten', 'paprika', 'gruene_paprika', 'chili', 'zucchini', 'aubergine', 'gurke',
  'weisskohl', 'rotkohl', 'sauerkraut', 'lauch', 'sellerieknolle', 'staudensellerie', 'suppengruen',
  'spinat', 'champignons', 'erbsen', 'gruene_bohnen', 'weisse_bohnen', 'kidneybohnen', 'kichererbsen',
  'linsen', 'rote_linsen', 'mais', 'kuerbis', 'rote_bete', 'brokkoli', 'blumenkohl', 'kohlrabi',
  'rosenkohl', 'gruenkohl', 'spargel', 'fenchel', 'salat', 'radieschen', 'steckrueben', 'pastinaken',
  'avocado', 'ingwer', 'bambussprossen', 'kraeuter', 'aepfel', 'birnen', 'bananen', 'zitrone', 'limette',
  'orange', 'ananas', 'aprikosen', 'pflaumen', 'kirschen', 'erdbeeren', 'beeren', 'rhabarber', 'mango',
  'trauben', 'feigen', 'quitten', 'tofu',
]);

const HUELSENFRUECHTE = new Set(['weisse_bohnen', 'kidneybohnen', 'kichererbsen', 'linsen', 'rote_linsen', 'erbsen', 'tofu']);
const VOLLKORN = new Set(['vollkornmehl', 'roggenmehl', 'dinkelmehl', 'haferflocken', 'vollkornbrot', 'roggenbrot']);
const ROTES_FLEISCH = new Set(['rinderhack', 'rindfleisch', 'rindersteak', 'schweinehack', 'schweinefleisch',
  'schweinefilet', 'schweinebauch', 'lamm', 'kalb', 'wild']);
const VERARBEITET = new Set(['speck', 'kochschinken', 'rohschinken', 'bratwurst', 'salami']);
const FISCH = new Set(['kabeljau', 'lachs', 'raeucherlachs', 'forelle', 'thunfisch', 'hering', 'matjes',
  'makrele', 'sardellen', 'sardinen', 'stockfisch']);

/** Kategorien, die als Mahlzeit gelten und fuer Vorschlaege in Frage kommen. */
export const MAHLZEIT_KATEGORIEN = new Set(['Hauptgericht', 'Suppe', 'Salat', 'Frühstück']);

/** Anteil einer Mahlzeit am Tag, an dem Portionswerte gemessen werden. */
const ANTEIL = 1 / 3;

/**
 * Bewertet ein Rezept.
 *
 * @returns {{punkte:number, stufe:string, gruende:{text:string, gut:boolean}[],
 *            anteilPflanzlich:number, kennzahlen:object}|null}
 *          null, wenn die Naehrwerte nicht belastbar sind
 */
export function bewerte(recipe) {
  const n = recipe?.naehrwerte;
  if (!n || n.vertrauen === 'gering' || !n.je100g || n.masse <= 0) return null;

  const p = n.jePortion;
  const gruende = [];
  let punkte = 30;
  const plus = (wert, text) => { punkte += wert; gruende.push({ text, gut: wert > 0, gewicht: Math.abs(wert) }); };

  // Mengenanteile nach Lebensmittelgruppe
  const anteil = (ids) => n.posten.filter((x) => ids.has(x.lebensmittel)).reduce((s, x) => s + x.gramm, 0) / n.masse;
  const pflanzlich = anteil(PFLANZLICH);
  const hat = (ids) => n.posten.some((x) => ids.has(x.lebensmittel));

  if (pflanzlich >= 0.5) plus(25, `Zur Hälfte und mehr Gemüse, Obst oder Hülsenfrüchte (${Math.round(pflanzlich * 100)} %)`);
  else if (pflanzlich >= 0.3) plus(15, `Reichlich Gemüse, Obst oder Hülsenfrüchte (${Math.round(pflanzlich * 100)} %)`);
  else if (pflanzlich >= 0.15) plus(5, `Etwas Gemüse oder Obst (${Math.round(pflanzlich * 100)} %)`);
  else plus(-5, 'Kaum Gemüse oder Obst');

  if (hat(HUELSENFRUECHTE)) plus(5, 'Mit Hülsenfrüchten');
  if (hat(VOLLKORN)) plus(5, 'Mit Vollkorn');

  // Energiedichte: unter 125 kcal je 100 g gilt als niedrig (WCRF). Ist
  // Fett ohne Menge angegeben, ist die Rechnung zu niedrig und die
  // Energiedichte kein Pluspunkt.
  const dichte = n.je100g.kcal;
  if (n.fettUngewiss) plus(-5, 'Bratfett ohne Mengenangabe — wie fett, bleibt offen');
  else if (dichte <= 100) plus(15, `Niedrige Energiedichte (${Math.round(dichte)} kcal je 100 g)`);
  else if (dichte <= 150) plus(8, `Mäßige Energiedichte (${Math.round(dichte)} kcal je 100 g)`);
  if (dichte > 300) plus(-12, `Hohe Energiedichte (${Math.round(dichte)} kcal je 100 g)`);
  else if (dichte > 225) plus(-5, `Eher energiedicht (${Math.round(dichte)} kcal je 100 g)`);

  // Je Portion, gemessen an einem Drittel der Tagesreferenz
  const anteilAm = (id) => p[id] / (REFERENZ[id] * ANTEIL);

  if (anteilAm('gesFett') <= 0.5 && !n.fettUngewiss) plus(10, `Wenig gesättigte Fettsäuren (${fmt(p.gesFett)} g)`);
  else if (anteilAm('gesFett') > 1.5) plus(-12, `Viele gesättigte Fettsäuren (${fmt(p.gesFett)} g)`);
  else if (anteilAm('gesFett') > 1) plus(-5, `Recht viele gesättigte Fettsäuren (${fmt(p.gesFett)} g)`);

  if (p.zucker <= 6) plus(8, `Wenig Zucker (${fmt(p.zucker)} g)`);
  else if (p.zucker > 30) plus(-12, `Viel Zucker (${fmt(p.zucker)} g)`);
  else if (p.zucker > 18) plus(-5, `Recht viel Zucker (${fmt(p.zucker)} g)`);

  const salzUngewiss = (n.ohneMenge || []).some((x) => /salz/i.test(x));
  if (anteilAm('salz') > 1.5) plus(-12, `Viel Salz (${fmt(p.salz, 1)} g)`);
  else if (anteilAm('salz') > 1) plus(-5, `Recht viel Salz (${fmt(p.salz, 1)} g)`);
  else if (!salzUngewiss && anteilAm('salz') <= 0.6) plus(8, `Wenig Salz (${fmt(p.salz, 1)} g)`);

  if (anteilAm('ballast') >= 0.8) plus(15, `Viele Ballaststoffe (${fmt(p.ballast)} g)`);
  else if (anteilAm('ballast') >= 0.5) plus(8, `Ballaststoffe (${fmt(p.ballast)} g)`);
  else if (anteilAm('ballast') < 0.2) plus(-5, `Kaum Ballaststoffe (${fmt(p.ballast)} g)`);

  if (p.eiweiss >= 15) plus(5, `Gute Eiweißquelle (${fmt(p.eiweiss)} g)`);
  else if (p.eiweiss < 8) plus(-5, `Wenig Eiweiß (${fmt(p.eiweiss)} g)`);

  // Eine Mahlzeit soll auch satt machen: ein Tomatensalat mit 60 kcal ist
  // gesund, aber kein Mittagessen.
  if (p.kcal < 150) plus(-20, `Sehr leicht (${Math.round(p.kcal)} kcal) — als Mahlzeit zu wenig`);
  else if (p.kcal < 250) plus(-8, `Leicht (${Math.round(p.kcal)} kcal) — eher mit Brot oder als Vorspeise`);

  if (hat(VERARBEITET)) plus(-10, 'Mit Wurst, Schinken oder Speck');
  else if (hat(ROTES_FLEISCH)) plus(-4, 'Mit rotem Fleisch');
  if (hat(FISCH)) plus(6, 'Mit Fisch');

  // Mehr als die Haelfte der Tagesenergie in einer Portion ist kein
  // Alltagsessen, wie gesund die Zutaten auch sein moegen.
  if (p.kcal > REFERENZ.kcal * 0.5) plus(-10, `Sehr gehaltvoll (${Math.round(p.kcal)} kcal je Portion)`);

  punkte = Math.max(0, Math.min(100, Math.round(punkte)));
  gruende.sort((a, b) => b.gewicht - a.gewicht);

  return {
    punkte,
    stufe: stufeFuer(punkte),
    gruende,
    anteilPflanzlich: pflanzlich,
  };
}

export function stufeFuer(punkte) {
  if (punkte >= 75) return 'sehr ausgewogen';
  if (punkte >= 60) return 'ausgewogen';
  if (punkte >= 45) return 'mittel';
  return 'üppig';
}

function fmt(x, stellen = 0) {
  return (Math.round(x * 10 ** stellen) / 10 ** stellen).toLocaleString('de-DE');
}

/**
 * Was der geplanten Woche fehlt oder zu viel ist, gemessen je Person und
 * Tag an den Referenzmengen. Nur Tage mit belastbaren Werten zaehlen.
 *
 * @param {{werte:object, belastbar:number, mahlzeiten:number}[]} tage
 * @returns {{schwerpunkt:string|null, text:string|null, schnitt:object|null}}
 */
export function wochenLuecke(tage) {
  const gezaehlt = tage.filter((t) => t.belastbar > 0 && t.belastbar === t.mahlzeiten);
  if (!gezaehlt.length) return { schwerpunkt: null, text: null, schnitt: null };

  const schnitt = {};
  for (const id of Object.keys(REFERENZ)) {
    schnitt[id] = gezaehlt.reduce((s, t) => s + t.werte[id], 0) / gezaehlt.length;
  }

  // Hochgerechnet auf einen vollen Tag, falls nicht alle Mahlzeiten geplant sind
  const mahlzeitenSchnitt = gezaehlt.reduce((s, t) => s + t.mahlzeiten, 0) / gezaehlt.length;
  const faktor = 3 / Math.max(1, Math.min(3, mahlzeitenSchnitt));

  // Sind noch nicht alle drei Mahlzeiten geplant, wird hochgerechnet —
  // und das steht dann auch dabei.
  const tag = faktor > 1 ? 'am Tag, hochgerechnet auf drei Mahlzeiten' : 'am Tag';
  const kandidaten = [
    ['ballast', schnitt.ballast * faktor < REFERENZ.ballast * 0.7,
      `Bisher wenig Ballaststoffe: im Schnitt ${fmt(schnitt.ballast * faktor)} g ${tag}, empfohlen sind ${REFERENZ.ballast} g.`],
    ['salz', schnitt.salz * faktor > REFERENZ.salz,
      `Bisher recht salzig: im Schnitt ${fmt(schnitt.salz * faktor, 1)} g Salz ${tag}, empfohlen sind höchstens ${REFERENZ.salz} g.`],
    ['gesFett', schnitt.gesFett * faktor > REFERENZ.gesFett,
      `Bisher viele gesättigte Fettsäuren: im Schnitt ${fmt(schnitt.gesFett * faktor)} g ${tag}, Referenz ${REFERENZ.gesFett} g.`],
    ['zucker', schnitt.zucker * faktor > REFERENZ.zucker,
      `Bisher viel Zucker: im Schnitt ${fmt(schnitt.zucker * faktor)} g ${tag}, Referenz ${REFERENZ.zucker} g.`],
  ];
  const treffer = kandidaten.find(([, zutreffend]) => zutreffend);
  return {
    schwerpunkt: treffer ? treffer[0] : null,
    text: treffer ? treffer[2] : null,
    schnitt,
  };
}

/**
 * Vorschlaege fuer eine Mahlzeit, die beste Bewertung zuerst. Was der
 * Woche fehlt, gibt Rezepten einen Vorsprung, die genau das mitbringen.
 *
 * @param {object[]} rezepte Vorrat, etwa die gefilterte Bibliothek
 * @param {{mahlzeit:string, ausschliessen?:Set<string>, schwerpunkt?:string|null}} optionen
 * @returns {{rezept:object, bewertung:object, passtZurWoche:boolean, rang:number}[]}
 */
export function vorschlaege(rezepte, { mahlzeit, ausschliessen = new Set(), schwerpunkt = null }) {
  const out = [];
  for (const r of rezepte) {
    if (ausschliessen.has(r.id)) continue;
    // Zum Fruehstueck zaehlen auch Brot, Muesli und Porridge; nur
    // Grundrezepte und Getraenke sind nie eine Mahlzeit.
    const passend = mahlzeit === 'fruehstueck'
      ? !['Grundrezept', 'Getränk'].includes(r.category)
      : MAHLZEIT_KATEGORIEN.has(r.category);
    if (!passend) continue;
    if (mahlzeit && !(r.meals || []).includes(mahlzeit)) continue;

    // Historische Originaltexte haben keine belastbaren Werte und damit
    // keine Bewertung; sie tauchen hier nicht auf.
    if (r.lesetext) continue;
    // Eine vorhandene Bewertung gilt, auch wenn sie "keine" lautet:
    // neu rechnen ginge ohnehin nur mit der vollen Rechnung.
    const bewertung = r.gesundheit !== undefined ? r.gesundheit : bewerte(r);
    if (!bewertung || bewertung.punkte < 45) continue;

    const p = r.naehrwerte.jePortion;
    const passtZurWoche = {
      ballast: p.ballast >= REFERENZ.ballast * ANTEIL * 0.8,
      salz: p.salz <= REFERENZ.salz * ANTEIL * 0.6,
      gesFett: p.gesFett <= REFERENZ.gesFett * ANTEIL * 0.5,
      zucker: p.zucker <= 6,
    }[schwerpunkt] ?? false;

    out.push({ rezept: r, bewertung, passtZurWoche, rang: bewertung.punkte + (passtZurWoche ? 10 : 0) });
  }
  return out.sort((a, b) => b.rang - a.rang || a.rezept.title.localeCompare(b.rezept.title, 'de'));
}
