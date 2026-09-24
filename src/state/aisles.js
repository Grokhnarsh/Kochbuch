/**
 * Ordnet Zutaten einer Supermarkt-Abteilung zu, damit die Einkaufsliste
 * in der Reihenfolge des Einkaufs sortiert ist.
 */

import { compile } from './matcher.js';

const RULES = [
  ['Obst & Gemüse', [
    'kartoffel', 'erdäpfel', 'zwiebel', 'schalotte', 'möhre', 'karotte', 'mohrrübe', 'lauch',
    'porree', 'sellerie', 'kohl', 'kraut', 'wirsing', 'rosenkohl', 'kohlrabi', 'apfel', 'äpfel',
    'zitrone', 'limette', 'orange', 'mandarine', 'grapefruit', 'tomate', 'paprika', 'zucchini',
    'aubergine', 'gurke', 'knoblauch', 'ingwer', 'petersilie', 'schnittlauch', 'basilikum',
    'minze', 'dill', 'salbei', 'rosmarin', 'thymian', 'estragon', 'kerbel', 'liebstöckel',
    'spinat', 'mangold', 'bohnen', 'erbsen', 'zuckerschoten', 'beere', 'beeren', 'erdbeer',
    'himbeer', 'heidelbeer', 'johannisbeer', 'brombeer', 'stachelbeer', 'preiselbeer',
    'zwetschgen', 'pflaumen', 'marillen', 'aprikose', 'pfirsich', 'nektarine', 'birne',
    'kirsche', 'kirschen', 'trauben', 'banane', 'ananas', 'mango', 'kiwi', 'melone',
    'avocado', 'feige', 'rhabarber', 'radieschen', 'rettich', 'fenchel', 'spargel',
    'artischocke', 'pilz', 'champignon', 'pfifferling', 'steinpilz', 'rote bete', 'randen',
    'steckrübe', 'pastinake', 'petersilienwurzel', 'schwarzwurzel', 'blumenkohl', 'brokkoli',
    'süßkartoffel', 'kürbis', 'salat', 'rucola', 'chicorée', 'endivie', 'feldsalat',
    'chili', 'chilischote', 'peperoni', 'koriandergrün', 'koriander', 'rotkohl', 'weißkohl',
    'grünkohl', 'spitzkohl', 'chinakohl', 'suppengrün', 'mais', 'lauchzwiebel', 'frühlingszwiebel',
    'kresse', 'sauerkraut', 'oliven', 'datteln', 'granatapfel', 'quitte', 'holunder',
  ]],
  ['Fleisch & Fisch', [
    'rind', 'schwein', 'lamm', 'kalb', 'hammel', 'hähnchen', 'hühner', 'huhn', 'pute',
    'truthahn', 'ente', 'gans', 'wild', 'reh', 'hirsch', 'hase', 'kaninchen', 'geflügel',
    'hack', 'faschiertes', 'wurst', 'würst', 'speck', 'pancetta', 'schinken', 'braten',
    'roulade', 'kotelett', 'schnitzel', 'ochsen', 'roastbeef', 'filet', 'gulasch',
    'leber', 'niere', 'steak', 'tafelspitz', 'beinscheibe', 'backhendl', 'bauchfleisch',
    'kasseler', 'mettwurst', 'bratwurst', 'salami', 'chorizo', 'bacon',
    'fisch', 'kabeljau', 'dorsch', 'schellfisch', 'seelachs', 'lachs', 'forelle', 'zander',
    'hecht', 'karpfen', 'thunfisch', 'makrele', 'hering', 'matjes', 'sardelle', 'sardine',
    'aal', 'scholle', 'seezunge', 'garnele', 'scampi', 'krabbe', 'muschel', 'tintenfisch',
    'jakobsmuschel', 'hummer', 'languste',
  ]],
  ['Molkerei & Eier', [
    'milch', 'butter', 'sahne', 'rahm', 'sauerrahm', 'schmand', 'crème fraîche', 'creme fraiche',
    'joghurt', 'quark', 'topfen', 'käse', 'parmesan', 'pecorino', 'cheddar', 'feta', 'gruyère',
    'bergkäse', 'ricotta', 'mozzarella', 'mascarpone', 'frischkäse', 'gouda', 'emmentaler',
    'camembert', 'brie', 'halloumi', 'hüttenkäse', 'kefir', 'buttermilch', 'dickmilch',
    'schlagobers', 'obers', 'clotted', '=ei', 'eier', 'eigelb', 'eiweiß', 'eidotter',
  ]],
  ['Vorrat & Trockenware', [
    'mehl', 'grieß', 'reis', 'nudel', 'spaghetti', 'makkaroni', 'fleckerl', 'spätzle',
    'couscous', 'quinoa', 'bulgur', 'polenta', 'haferflocken', 'milchreis', 'rundkornreis', 'basmatireis', 'linsen', 'kichererbsen',
    'graupen', 'semmelbrösel', 'brösel', 'knödelbrot', 'brot', 'brötchen', 'baguette',
    'toast', 'zwieback', 'löffelbiskuits', 'stärke', 'speisestärke', 'dose', 'tomatenmark',
    'kokosmilch', 'kokosraspel', 'brühe', 'brühwürfel', 'fond', 'passiert', 'kapern',
    'rosinen', 'sultaninen', 'korinthen', 'trockenfrüchte', 'nüsse', 'walnuss', 'mandel',
    'haselnuss', 'pinienkerne', 'cashew', 'pistazie', 'erdnuss', 'sonnenblumenkerne',
    'kürbiskerne', 'sesam', 'leinsamen', 'chiasamen', 'tahin', 'marmelade', 'konfitüre',
    'powidl', 'melasse', 'lebkuchen', 'printen', 'strudelteig', 'blätterteig', 'filoteig',
    'orangeat', 'zitronat', 'sojasauce', 'sojasoße', 'kecap manis', 'fischsauce',
    'worcestersauce', 'ketchup', 'mayonnaise', 'senfkörner', 'gelatine', 'agar',
    'backoblaten', 'vorteig', 'sauerteig', 'tofu', 'seitan', 'mie-nudeln', 'reisnudeln',
  ]],
  ['Backen & Süßes', [
    'zucker', 'puderzucker', 'hagelzucker', 'würfelzucker', 'staubzucker', 'honig', 'sirup',
    'ahornsirup', 'hefe', 'germ', 'backpulver', 'natron', 'hirschhornsalz', 'pottasche',
    'vanille', 'vanillezucker', 'kakao', 'schokolade', 'kuvertüre', 'schokoladenstreusel',
    'marzipan', 'nougat', 'zuckerrübensirup',
  ]],
  ['Gewürze & Öle', [
    'salz', 'pfeffer', 'paprikapulver', 'kümmel', 'kreuzkümmel', 'koriandersamen',
    'gemahlener koriander', 'kurkuma', 'curry', 'currypaste', 'muskat', 'zimt', 'nelken',
    'lorbeer', 'wacholder', 'majoran', 'oregano', 'bohnenkraut', 'senf', 'essig', 'öl',
    'olivenöl', 'schmalz', 'margarine', 'worcestershire', 'kräuter', 'safran', 'anis',
    'sternanis', 'fenchelsamen', 'kardamom', 'piment', 'cayenne', 'chilipulver',
    'chiliflocken', 'senfsamen', 'ras el-hanout', 'garam masala', 'harissa', 'sumach',
    'lebkuchengewürz', 'spekulatiusgewürz', 'vierge', 'bratfett', 'butterschmalz',
    'ingwer, gemahlen', 'gewürz',
  ]],
  ['Getränke', [
    'wein', 'bier', 'brandy', 'sherry', 'portwein', 'rum', 'wodka', 'likör', 'schnaps',
    'obstler', 'saft', 'alchermes', 'vin santo', 'wasser', 'tee', 'kaffee', 'espresso',
    'limonade', 'cidre', 'most',
  ]],
];

/** Vorgefertigte Muster, absteigend nach Stichwortlaenge. */
const PATTERNS = compile(RULES);

/**
 * Liefert die Abteilung fuer einen Zutatennamen. Es gewinnt das
 * laengste passende Stichwort, damit "Kokosmilch" im Vorrat landet
 * und nicht bei der Molkerei.
 */
export function aisleFor(name) {
  const n = String(name).toLowerCase();
  for (const p of PATTERNS) {
    if (p.trifft(n)) return p.value;
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
