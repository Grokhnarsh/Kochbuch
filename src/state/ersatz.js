/**
 * Ersatzzutaten: was man nimmt, wenn etwas fehlt oder nicht vertragen
 * wird. Buttermilch aus Milch und Zitronensaft, Leinsamen statt Ei beim
 * Backen, Agar-Agar statt Gelatine.
 *
 * Jede Alternative wird gegen den Haushalt geprueft: Allergene erkennt
 * dieselbe Stichwortsuche wie im Rezept, dazu "vegan" und "vegetarisch"
 * und was jemand nicht mag. Die Tabelle ist von Hand gepflegt und nennt
 * nur Ersatz, der in der Kueche wirklich funktioniert — mit Menge.
 *
 * Reine Funktionen.
 */

import { allergensFor, allergenById } from './allergens.js';
import { vorratsName, deckt } from './vorrat.js';

/**
 * [Stichwoerter der Zutat, [[Ersatz, Hinweis zur Menge, {vegan?}]…]]
 * Stichwoerter werden wie im Vorrat am Wortende gesucht: "Rinderhack" ist
 * Hack. Ein Muster steht fuer genau die Namen, auf die es passt.
 */
const TABELLE = [
  [['buttermilch'], [
    ['Milch mit Zitronensaft', '250 ml Milch mit 1 EL Zitronensaft verrühren, 10 Min. stehen lassen', {}],
    ['Joghurt mit Milch', 'halb Joghurt, halb Milch, glatt gerührt', {}],
    ['Hafer- oder Sojadrink mit Zitronensaft', '250 ml Drink, 1 EL Zitronensaft', { vegan: true }],
  ]],
  [['ei', 'eier'], [
    ['Geschrotete Leinsamen', 'je Ei 1 EL Leinsamen mit 3 EL Wasser, 10 Min. quellen lassen — zum Binden und Backen', { vegan: true }],
    ['Apfelmus', 'je Ei 60 g — für Rührteig und Muffins', { vegan: true }],
    ['Banane', 'je Ei eine halbe, zerdrückt — für süße Teige', { vegan: true }],
    ['Kichererbsenmehl', 'je Ei 2 EL mit 3 EL Wasser — für Pfannkuchen und Bratlinge', { vegan: true }],
  ]],
  [['sahne', 'schlagsahne'], [
    ['Milch und Butter', '3 Teile Milch, 1 Teil zerlassene Butter — zum Kochen, nicht zum Schlagen', {}],
    ['Kokosmilch', 'gleiche Menge — für Currys und Suppen', { vegan: true }],
    ['Hafer- oder Sojasahne', 'gleiche Menge — zum Kochen', { vegan: true }],
    ['Crème fraîche', 'gleiche Menge, mit etwas Milch verdünnt', {}],
  ]],
  [['milch', 'vollmilch'], [
    ['Haferdrink', 'gleiche Menge', { vegan: true }],
    ['Sojadrink', 'gleiche Menge — schäumt und backt wie Milch', { vegan: true }],
    ['Wasser mit etwas Sahne', '4 Teile Wasser, 1 Teil Sahne', {}],
  ]],
  [['butter'], [
    ['Margarine', 'gleiche Menge', { vegan: true }],
    ['Rapsöl', 'etwa 80 % der Menge — für Rührteig und zum Braten, nicht für Mürbeteig', { vegan: true }],
    ['Butterschmalz', 'gleiche Menge — zum Braten', {}],
  ]],
  [['schmand', 'saure sahne', 'sauerrahm', 'crème fraîche', 'creme fraiche'], [
    ['Griechischer Joghurt', 'gleiche Menge — bei Hitze nicht kochen lassen', {}],
    ['Schmand, saure Sahne oder Crème fraîche', 'untereinander austauschbar; Crème fraîche flockt beim Kochen am wenigsten', {}],
    ['Sojajoghurt', 'gleiche Menge', { vegan: true }],
  ]],
  [['mascarpone'], [
    ['Frischkäse mit Sahne', '200 g Frischkäse mit 50 ml Sahne glatt gerührt', {}],
    ['Quark mit Sahne', 'halb Quark, halb geschlagene Sahne — leichter', {}],
  ]],
  [['ricotta'], [
    ['Hüttenkäse', 'gleiche Menge, kurz püriert', {}],
    ['Magerquark', 'gleiche Menge, gut abgetropft', {}],
  ]],
  [['parmesan', 'pecorino', 'grana padano'], [
    ['Bergkäse oder Grana Padano', 'gleiche Menge, fein gerieben', {}],
    ['Hefeflocken', 'etwa die Hälfte — würzig, ohne Käse', { vegan: true }],
  ]],
  [['gelatine'], [
    ['Agar-Agar', '1 TL Agar-Agar je 6 Blatt Gelatine; muss kurz aufkochen', { vegan: true }],
  ]],
  [['honig'], [
    ['Ahornsirup', 'gleiche Menge', { vegan: true }],
    ['Agavendicksaft', 'etwas weniger — süßt stärker', { vegan: true }],
  ]],
  [['backpulver'], [
    ['Natron mit Säure', 'je TL Backpulver ¼ TL Natron und 1 TL Zitronensaft oder Essig', { vegan: true }],
  ]],
  [['hefe', 'frische hefe'], [
    ['Trockenhefe', '1 Würfel frische Hefe (42 g) entspricht 2 Päckchen Trockenhefe', { vegan: true }],
  ]],
  [['trockenhefe'], [
    ['Frische Hefe', '1 Päckchen Trockenhefe entspricht einem halben Würfel (21 g)', { vegan: true }],
  ]],
  [['semmelbrösel', 'paniermehl', 'brösel'], [
    ['Gemahlene Mandeln', 'gleiche Menge — glutenfrei', { vegan: true }],
    ['Zerdrückte Cornflakes', 'gleiche Menge — knusprig', { vegan: true }],
    ['Haferflocken, gemahlen', 'gleiche Menge', { vegan: true }],
  ]],
  [['speisestärke', 'stärke', 'maisstärke'], [
    ['Weizenmehl', 'doppelte Menge — bindet schwächer', { vegan: true }],
    ['Kartoffelmehl', 'gleiche Menge', { vegan: true }],
  ]],
  [[/^(weizen)?mehl( type \d+)?$/], [
    ['Dinkelmehl Type 630', 'gleiche Menge, etwas weniger Flüssigkeit', { vegan: true }],
    ['Glutenfreie Mehlmischung', 'gleiche Menge; bei Hefeteig nach Packung', { vegan: true, ohne: ['gluten'] }],
  ]],
  [['zitronensaft'], [
    ['Limettensaft', 'gleiche Menge', { vegan: true }],
    ['Weißweinessig', 'die Hälfte — für Dressings und Marinaden', { vegan: true }],
  ]],
  [['weißwein', 'weisswein'], [
    ['Gemüsebrühe mit Essig', 'gleiche Menge Brühe, je 100 ml 1 TL Weißweinessig', { vegan: true }],
    ['Heller Traubensaft', 'gleiche Menge, mit einem Spritzer Zitrone — für Süßes', { vegan: true }],
  ]],
  [['rotwein'], [
    ['Brühe mit Traubensaft', 'halb Brühe, halb roter Traubensaft, 1 TL Essig', { vegan: true }],
  ]],
  [['schalotte', 'schalotten'], [
    ['Zwiebel', 'eine kleine Zwiebel für zwei Schalotten', { vegan: true }],
  ]],
  [['frühlingszwiebel', 'lauchzwiebel'], [
    ['Lauch', 'ein Stück vom hellen Teil, fein geschnitten', { vegan: true }],
    ['Schnittlauch', 'eine Handvoll — roh zum Bestreuen', { vegan: true }],
  ]],
  [['pinienkerne'], [
    ['Sonnenblumenkerne', 'gleiche Menge, ohne Fett geröstet', { vegan: true }],
    ['Cashewkerne', 'gleiche Menge, gehackt', { vegan: true }],
  ]],
  [['hackfleisch', 'rinderhack', 'hack'], [
    ['Sojaschnetzel, fein', 'ein Drittel des Gewichts, in Brühe eingeweicht', { vegan: true }],
    ['Rote Linsen', 'ein Drittel des Gewichts, trocken — für Bolognese und Chili', { vegan: true }],
  ]],
  [['sojasauce', 'sojasoße'], [
    ['Tamari', 'gleiche Menge — meist ohne Weizen, Packung prüfen', { vegan: true }],
  ]],
  [['kokosmilch'], [
    ['Sahne mit Kokosraspeln', 'Sahne mit 2 EL Kokosraspeln aufkochen und abseihen', {}],
    ['Haferdrink und Kokosöl', '400 ml Drink, 2 EL Kokosöl', { vegan: true }],
  ]],
  [['petersilie', 'basilikum', 'koriander', 'dill', 'schnittlauch', 'thymian', 'rosmarin', 'oregano', 'majoran'], [
    ['Getrocknete Kräuter', 'ein Drittel der Menge, früh mitkochen statt zum Schluss', { vegan: true }],
  ]],
  [['brauner zucker', 'rohrzucker'], [
    ['Weißer Zucker mit etwas Honig', 'je 100 g Zucker 1 TL Honig', {}],
  ]],
  [['puderzucker'], [
    ['Zucker, fein gemahlen', 'im Mixer fein mahlen', { vegan: true }],
  ]],
];

const EINTRAEGE = TABELLE.map(([woerter, alternativen]) => ({ woerter, alternativen }));

/** Fleisch und Fisch sind nicht vegetarisch, Milch, Ei und Honig nicht vegan */
const TIERISCH = /hack|fleisch|speck|schinken|gelatine|fisch/i;
const NICHT_VEGAN = /milch|butter|sahne|joghurt|quark|käse|ei\b|eier|honig|crème|creme|schmand|mascarpone/i;

/**
 * Gibt es Ersatz fuer diese Zutat? Ausgewertet wird nur der Kern des
 * Namens: "Sahne zum Verfeinern" sucht Ersatz fuer Sahne.
 *
 * @returns {{name:string, menge:string, allergene:{id:string, level:string}[], vegan:boolean, vegetarisch:boolean}[]}
 */
export function ersatzFuer(zutat) {
  const n = vorratsName(zutat);
  if (!n) return [];
  // Das laengste passende Stichwort gewinnt: "Buttermilch" ist nicht Butter
  let bester = null;
  let laenge = 0;
  for (const e of EINTRAEGE) {
    for (const w of e.woerter) {
      // Ein Muster steht fuer genau diese Namen: Mandelmehl ist kein Weizenmehl
      const l = w instanceof RegExp ? 4 : w.length;
      // Nur in einer Richtung: "Paniermehl" hat Ersatz, "Mehl" ist kein Paniermehl
      const passt = w instanceof RegExp ? w.test(n) : n.length >= w.length - 2 && deckt(w, n);
      if (l > laenge && passt) {
        bester = e;
        laenge = l;
      }
    }
  }
  if (!bester) return [];
  return bester.alternativen.map(([name, menge, art]) => ({
    name,
    menge,
    // Was die Tabelle ausdruecklich ausschliesst, zaehlt nicht ("glutenfreie Mischung")
    allergene: allergensFor(name).filter((a) => !(art.ohne || []).includes(a.id)),
    vegan: Boolean(art.vegan) || (!NICHT_VEGAN.test(name) && !TIERISCH.test(name)),
    vegetarisch: Boolean(art.vegan) || !TIERISCH.test(name),
  }));
}

/**
 * Was spricht im Haushalt gegen eine Alternative?
 * @param {object} alternative aus ersatzFuer()
 * @param {object[]} profile aktive Haushaltsprofile
 * @returns {string[]} z. B. ["Anna: enthält Milch"]
 */
export function ersatzKonflikte(alternative, profile) {
  const out = [];
  for (const p of profile.filter((x) => x.aktiv)) {
    const gruende = [];
    for (const a of alternative.allergene) {
      if (!p.allergene.includes(a.id)) continue;
      const kurz = allergenById.get(a.id)?.short || a.id;
      gruende.push(a.level === 'ja' ? `enthält ${kurz}` : `kann ${kurz} enthalten`);
    }
    if (p.ernaehrung.includes('vegan') && !alternative.vegan) gruende.push('nicht vegan');
    else if ((p.ernaehrung.includes('vegetarisch') || p.ernaehrung.includes('pescetarisch')) && !alternative.vegetarisch) {
      gruende.push('nicht vegetarisch');
    }
    const hat = (id) => alternative.allergene.some((a) => a.id === id);
    if (p.ernaehrung.includes('laktosefrei') && hat('milch')) gruende.push('nicht laktosefrei');
    if (p.ernaehrung.includes('glutenfrei') && hat('gluten')) gruende.push('nicht glutenfrei');
    const name = vorratsName(alternative.name);
    for (const m of p.meidet) if (deckt(vorratsName(m), name)) gruende.push(`mag kein ${m}`);
    if (gruende.length) out.push(`${p.name}: ${[...new Set(gruende)].join(', ')}`);
  }
  return out;
}
