/**
 * Ordnet Zutaten einer Supermarkt-Abteilung zu, damit die Einkaufsliste
 * in der Reihenfolge des Einkaufs sortiert ist.
 */

const RULES = [
  ['Obst & Gemüse', [
    'kartoffel', 'zwiebel', 'möhre', 'karotte', 'lauch', 'sellerie', 'kohl', 'apfel', 'äpfel',
    'zitrone', 'limette', 'orange', 'tomate', 'paprika', 'zucchini', 'aubergine', 'gurke',
    'knoblauch', 'ingwer', 'petersilie', 'schnittlauch', 'basilikum', 'minze', 'dill', 'salbei',
    'rosmarin', 'thymian', 'spinat', 'bohnen', 'erbsen', 'beere', 'beeren', 'zwetschgen',
    'marillen', 'stachelbeeren', 'trauben', 'pilz', 'champignon', 'rote bete', 'steckrübe',
    'blumenkohl', 'süßkartoffel', 'avocado', 'salat', 'chili', 'koriandergrün', 'rotkohl',
    'weißkohl', 'grünkohl', 'suppengrün', 'mais',
  ]],
  ['Fleisch & Fisch', [
    'rind', 'schwein', 'lamm', 'kalb', 'hähnchen', 'hühner', 'geflügel', 'hack', 'wurst',
    'würst', 'roastbeef',
    'speck', 'pancetta', 'schinken', 'braten', 'roulade', 'kotelett', 'schnitzel', 'ochsen',
    'fisch', 'kabeljau', 'schellfisch', 'lachs', 'matjes', 'sardellen', 'muschel', 'tintenfisch',
    'leber', 'steak', 'tafelspitz', 'beinscheibe', 'backhendl',
  ]],
  ['Molkerei & Eier', [
    'milch', 'butter', 'sahne', 'schmand', 'joghurt', 'quark', 'topfen', 'käse', 'parmesan',
    'pecorino', 'cheddar', 'feta', 'gruyère', 'bergkäse', 'ricotta', '=ei', 'eier', 'eigelb',
    'eiweiß', 'buttermilch', 'clotted',
  ]],
  ['Vorrat & Trockenware', [
    'mehl', 'grieß', 'reis', 'nudel', 'spaghetti', 'makkaroni', 'fleckerl', 'couscous', 'quinoa',
    'haferflocken', 'linsen', 'kichererbsen', 'graupen', 'semmelbrösel', 'knödelbrot', 'brot',
    'brösel', 'milchreis', 'mayonnaise',
    'brötchen', 'baguette', 'toast', 'löffelbiskuits', 'stärke', 'dose', 'tomatenmark',
    'kokosmilch', 'brühe', 'fond', 'passiert', 'oliven', 'kapern', 'rosinen', 'korinthen',
    'trockenfrüchte', 'nüsse', 'walnüsse', 'mandel', 'haselnüsse', 'pinienkerne', 'tahin',
    'marmelade', 'powidl', 'melasse', 'honig', 'sirup', 'lebkuchen', 'printen', 'strudelteig',
    'chiasamen', 'orangeat', 'zitronat',
  ]],
  ['Backen & Süßes', [
    'zucker', 'puderzucker', 'hagelzucker', 'würfelzucker', 'hefe', 'backpulver', 'natron',
    'vanille', 'kakao', 'schokolade',
  ]],
  ['Gewürze & Öle', [
    'salz', 'pfeffer', 'paprikapulver', 'kümmel', 'kreuzkümmel', 'koriandersamen', 'kurkuma',
    'curry', 'muskat', 'zimt', 'nelken', 'lorbeer', 'wacholder', 'majoran', 'oregano',
    'bohnenkraut', 'senf', 'essig', 'öl', 'olivenöl', 'schmalz', 'worcestershire', 'kräuter',
    'safran',
    'ingwer, gemahlen', 'chilipulver', 'senfsamen', 'currypaste',
  ]],
  ['Getränke', ['wein', 'bier', 'brandy', 'sherry', 'saft', 'alchermes', 'vin santo', 'wasser']],
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LETTER = '[a-zäöüß]';

/**
 * Baut das Suchmuster fuer ein Stichwort.
 *
 * Deutsche Zusammensetzungen tragen das Grundwort mal vorn
 * ("Paprikaschoten"), mal hinten ("Weizenmehl"). Deshalb zaehlt ein
 * Treffer am Wortanfang oder am Wortende, jeweils mit moeglicher
 * Beugung ("Tomaten"). Ein blosser Teilstring reicht nicht: sonst
 * faende "ei" auch Reis, Weizenmehl und Eiswasser.
 *
 * Ein vorangestelltes "=" verlangt ein eigenstaendiges Wort.
 */
function patternFor(keyword) {
  const exact = keyword.startsWith('=');
  const word = escape(exact ? keyword.slice(1) : keyword);

  if (exact) return new RegExp(`(^|(?!${LETTER}).)${word}($|(?!${LETTER}))`);
  return new RegExp(`(^|(?!${LETTER}).)${word}|${word}(e|en|n|er|es|s)?($|(?!${LETTER}))`);
}

/** Vorgefertigte Muster, absteigend nach Stichwortlaenge. */
const PATTERNS = RULES.flatMap(([aisle, keywords]) =>
  keywords.map((k) => ({
    aisle,
    weight: k.replace('=', '').length,
    test: patternFor(k),
  })),
).sort((a, b) => b.weight - a.weight);

/**
 * Liefert die Abteilung fuer einen Zutatennamen. Es gewinnt das
 * laengste passende Stichwort, damit "Kokosmilch" im Vorrat landet
 * und nicht bei der Molkerei.
 */
export function aisleFor(name) {
  const n = String(name).toLowerCase();
  for (const p of PATTERNS) {
    if (p.test.test(n)) return p.aisle;
  }
  return 'Sonstiges';
}

/** Die Abteilungen in Einkaufsreihenfolge. */
export const AISLE_ORDER = [
  'Obst & Gemüse',
  'Fleisch & Fisch',
  'Molkerei & Eier',
  'Vorrat & Trockenware',
  'Backen & Süßes',
  'Gewürze & Öle',
  'Getränke',
  'Sonstiges',
];
