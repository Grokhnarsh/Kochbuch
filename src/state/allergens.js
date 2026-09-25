/**
 * Erkennt die vierzehn kennzeichnungspflichtigen Allergene aus Anhang II
 * der EU-Lebensmittelinformationsverordnung (LMIV, 1169/2011) in den
 * Zutaten eines Rezepts.
 *
 * Das geschieht ueber Stichwoerter im Zutatennamen. Dieses Verfahren hat
 * eine harte Grenze, die in der Oberflaeche auch so benannt wird: es
 * kennt nur, was dasteht. Was ein Fertigprodukt enthaelt — Lecithin in
 * der Schokolade, Sellerie in der Bruehe, Weizen in der Sojasauce —,
 * steht nicht im Rezept. Solche Faelle sind deshalb als "kann enthalten"
 * gefuehrt und nicht als sichere Angabe.
 *
 * Fuer Menschen mit einer Allergie ist und bleibt die Zutatenliste auf
 * der Packung massgeblich.
 */

import { compile } from './matcher.js';

/** Der Warnhinweis, wortgleich in Rezeptansicht und Einkaufsliste. */
export const HINWEIS =
  'Automatisch aus den Zutatennamen erschlossen, ohne Gewähr. '
  + 'Verarbeitete Zutaten können Allergene enthalten, die im Rezept nicht '
  + 'genannt sind. Bei einer Allergie zählt allein die Zutatenliste auf der '
  + 'Verpackung.';

/** Die vierzehn Allergene in der Reihenfolge des Anhangs II. */
export const ALLERGENS = [
  { id: 'gluten', label: 'Glutenhaltiges Getreide', short: 'Gluten', icon: '🌾' },
  { id: 'krebstiere', label: 'Krebstiere', short: 'Krebstiere', icon: '🦐' },
  { id: 'eier', label: 'Eier', short: 'Eier', icon: '🥚' },
  { id: 'fisch', label: 'Fische', short: 'Fisch', icon: '🐟' },
  { id: 'erdnuesse', label: 'Erdnüsse', short: 'Erdnüsse', icon: '🥜' },
  { id: 'soja', label: 'Sojabohnen', short: 'Soja', icon: '🫘' },
  { id: 'milch', label: 'Milch und Laktose', short: 'Milch', icon: '🥛' },
  { id: 'schalenfruechte', label: 'Schalenfrüchte (Nüsse)', short: 'Nüsse', icon: '🌰' },
  { id: 'sellerie', label: 'Sellerie', short: 'Sellerie', icon: '🥬' },
  { id: 'senf', label: 'Senf', short: 'Senf', icon: '🌭' },
  { id: 'sesam', label: 'Sesamsamen', short: 'Sesam', icon: '🫓' },
  { id: 'sulfite', label: 'Schwefeldioxid und Sulfite', short: 'Sulfite', icon: '🍷' },
  { id: 'lupinen', label: 'Lupinen', short: 'Lupinen', icon: '🌱' },
  { id: 'weichtiere', label: 'Weichtiere', short: 'Weichtiere', icon: '🦑' },
];

export const allergenById = new Map(ALLERGENS.map((a) => [a.id, a]));

/**
 * Stichwoerter je Allergen, getrennt nach Sicherheit.
 *
 * `ja`       — die Zutat ist das Allergen oder enthaelt es zwingend.
 * `moeglich` — sie enthaelt es haeufig, aber nicht notwendig.
 * `nein`     — Gegenbeispiele, die ein kuerzeres Stichwort sonst faengt:
 *              "Sojamilch" ist keine Milch, "Muskatnuss" keine Nuss.
 *
 * Es gewinnt immer das laengste zutreffende Stichwort, deshalb schlaegt
 * `nein` ein allgemeineres `ja`.
 */
const RULES = {
  gluten: {
    ja: [
      '~weizen', 'hartweizen', '~roggen', '~gerste', '~dinkel', 'grünkern', 'emmer', 'einkorn',
      'kamut', 'hafer', 'haferflocken', 'mehl', 'grieß', 'couscous', 'bulgur', 'seitan',
      'nudel', 'spaghetti', 'makkaroni', 'tagliatelle', 'penne', 'farfalle', 'lasagne',
      'cannelloni', 'ravioli', 'tortellini', 'fleckerl', 'spätzle', 'knöpfle', 'graupen',
      'brot', 'brötchen', 'semmel', 'baguette', 'toast', 'zwieback', 'brösel', 'paniermehl',
      'panade', 'croutons', 'knödelbrot', 'pumpernickel', 'laugenbrezel', 'brezel',
      'blätterteig', 'strudelteig', 'filoteig', 'mürbeteig', 'hefeteig', 'pizzateig',
      'biskuit', 'löffelbiskuit', 'keks', 'plätzchen', 'waffel', 'cracker', 'lebkuchen',
      'printen', '=malz', 'malzbier', 'malzextrakt', 'gerstenmalz', 'bier', 'weizenbier',
      'weizenstärke', 'oblate',
      'backoblate', 'grahambrot', 'knäckebrot', 'baiserboden', 'kuchenmehl', 'tortenboden',
    ],
    moeglich: ['sojasauce', 'sojasoße', 'brühe', 'brühwürfel', 'bouillon', 'gemüsebrühe', 'backpulver'],
    nein: [
      'mandelmehl', 'kokosmehl', 'kichererbsenmehl', 'reismehl', 'maismehl', 'buchweizenmehl',
      'sojamehl', 'kastanienmehl', 'johannisbrotkernmehl', 'maisgrieß', 'maisstärke',
      'kartoffelmehl', 'speisestärke', 'reisnudeln', 'glasnudeln', 'glutenfrei', 'maisbrot',
      'buchweizen',
      'lupinenmehl', 'hirsemehl', 'quinoamehl', 'traubenkernmehl', 'guarkernmehl',
      'flohsamenschalen', 'mandelgrieß',
      // "mehligkochende Kartoffeln" ist kein Mehl, "Lebkuchengewürz" kein Gebäck.
      'mehlig', 'lebkuchengewürz', 'spekulatiusgewürz', 'printengewürz',
    ],
  },
  krebstiere: {
    ja: ['garnele', 'shrimp', 'gambas', 'krabbe', 'krebs', 'flusskrebs', 'hummer', 'languste', 'scampi', 'krill'],
    moeglich: ['meeresfrüchte', 'fischfond', 'fischsuppe'],
    nein: [],
  },
  eier: {
    ja: [
      '=ei', 'eier', 'eigelb', 'eidotter', 'eiweiß', 'eiklar', 'eischnee', 'volleipulver',
      'mayonnaise', 'majonäse', 'aioli', 'baiser', 'meringue', 'eierlikör', 'eiernudel',
      'spätzle', 'remoulade',
    ],
    moeglich: ['nudel', 'panade', 'brioche', 'blätterteig', 'löffelbiskuit', 'speiseeis', 'eiscreme'],
    nein: [
      'eierschwammerl', 'eierfrucht', 'eiertomate', 'eiswasser', 'eiswürfel',
      'reisnudeln', 'glasnudeln',
    ],
  },
  fisch: {
    ja: [
      'fisch', 'fischsauce', 'fischfond', 'lachs', 'thunfisch', 'kabeljau', 'dorsch',
      'seelachs', 'schellfisch', 'forelle', 'zander', 'hecht', 'karpfen', 'makrele',
      'hering', 'matjes', 'rollmops', 'sardelle', 'anchovis', 'sardine', 'aal', 'scholle',
      'seezunge', 'rotbarsch', 'wolfsbarsch', 'heilbutt', 'dorade', 'wels', 'surimi',
      'kaviar', 'rogen', 'worcestersauce', 'worcestershiresauce', 'bottarga', 'stockfisch',
    ],
    moeglich: ['meeresfrüchte', 'gemischter fisch'],
    nein: ['tintenfisch'],
  },
  erdnuesse: {
    ja: ['~erdnuss', '~erdnüsse', 'erdnussbutter', 'erdnussöl', 'erdnussmus', 'satay', 'saté'],
    moeglich: ['studentenfutter', 'nussmischung'],
    nein: [],
  },
  soja: {
    ja: ['~soja', 'sojasauce', 'sojasoße', 'sojamilch', 'sojaöl', 'sojamehl', 'sojalecithin',
      'tofu', 'edamame', 'miso', 'tempeh', 'okara', 'ponzu'],
    moeglich: ['schokolade', 'kuvertüre', 'nougat', 'margarine', 'kecap manis', 'hoisin'],
    nein: [],
  },
  milch: {
    ja: [
      '~milch', 'vollmilch', 'magermilch', 'buttermilch', 'kondensmilch', 'milchpulver',
      '~butter', '~sahne', '~joghurt', '~quark', 'schlagsahne', 'rahm', 'obers', 'schlagobers', 'schmand',
      'sauerrahm', 'crème fraîche', 'creme fraiche', 'topfen', '~käse',
      'parmesan', 'pecorino', 'cheddar', 'feta', 'gruyère', 'bergkäse', 'ricotta',
      'mozzarella', 'mascarpone', 'frischkäse', 'gouda', 'emmentaler', 'camembert', 'brie',
      'halloumi', 'hüttenkäse', 'kefir', 'dickmilch', 'molke', 'kasein', 'laktose',
      'clotted cream', 'crème double', 'milchreis', 'kakaogetränk', 'speiseeis', 'eiscreme',
      'milchschokolade', 'vollmilchschokolade', 'sahneschokolade',
      'sahneeis', 'vanilleeis',
    ],
    moeglich: ['butterschmalz', 'ghee', 'schokolade', 'kuvertüre', 'nougat', 'karamell', 'margarine'],
    nein: [
      'sojamilch', 'hafermilch', 'mandelmilch', 'reismilch', 'kokosmilch', 'dinkelmilch',
      'cashewmilch', 'nussmilch', 'erdnussbutter', 'kakaobutter', 'sheabutter',
      'mandelbutter', 'nussbutter', 'kokosbutter', 'laktosefrei', 'milchfrei', 'butterpilz',
    ],
  },
  schalenfruechte: {
    ja: [
      '~mandel', 'haselnuss', 'walnuss', 'cashew', 'pekannuss', 'pecan', 'paranuss',
      '~pistazie', 'macadamia', '~nuss', '~nüsse', 'nusskern', 'marzipan', 'persipan',
      'nougat', 'krokant', 'amarettini', 'amaretto', 'bittermandel', 'mandelblättchen',
    ],
    moeglich: ['studentenfutter', 'nussmischung', 'müsli', 'pesto'],
    nein: [
      'muskatnuss', 'muskat', 'kokosnuss', 'kokosraspel', 'kokosmilch', 'kokosöl',
      'kokosfett', 'kokosblüten', 'erdnuss', 'erdnüsse', 'erdnussbutter', 'erdnussöl',
      'esskastanie', 'kastanie', 'maroni', 'wassernuss', 'muskatblüte',
      // Groessenangabe, keine Zutat: "ein walnussgroßes Stück Ingwer".
      'walnussgroß', 'haselnussgroß',
    ],
  },
  sellerie: {
    ja: ['~sellerie', 'selleriesalz', 'knollensellerie', 'staudensellerie', 'stangensellerie'],
    moeglich: ['suppengrün', 'brühe', 'brühwürfel', 'gemüsebrühe', 'bouillon', 'fond', 'maggi', 'würzmischung'],
    nein: [],
  },
  senf: {
    ja: ['senf', 'dijonsenf', 'dijon', 'mostrich', 'senfkörner', 'senfsaat', 'senfmehl', 'senfpulver'],
    moeglich: ['worcestersauce', 'mayonnaise', 'remoulade', 'currypaste', 'ketchup'],
    nein: [],
  },
  sesam: {
    ja: ['~sesam', 'sesamöl', 'tahin', 'tahini', 'halva', 'gomasio'],
    moeglich: ['hummus', 'falafel', 'burgerbrötchen', 'fladenbrot', 'dukkah'],
    nein: [],
  },
  sulfite: {
    ja: [],
    moeglich: [
      'wein', 'rotwein', 'weißwein', 'weisswein', 'sekt', 'prosecco', 'portwein', 'sherry',
      'madeira', 'marsala', 'vermouth', 'wermut', 'essig', 'balsamico', 'weinessig',
      'rosinen', 'sultaninen', 'korinthen', 'trockenfrüchte', 'dörrobst', 'backpflaumen',
      'trockenaprikosen', 'aprikosen, getrocknet', 'senfgurken', 'meerrettich im glas',
    ],
    nein: [
      // "Schwein" endet auf "wein" — und Hackfleisch ist kein Getraenk.
      'schwein', 'schweine', 'schweins', 'weintraube', 'weinbergschnecke',
      'weinblatt', 'weinblätter', 'weinstein', 'weinsteinbackpulver', 'sauerkraut',
    ],
  },
  lupinen: {
    ja: ['~lupine', 'lupinenmehl', 'lupinenschrot'],
    moeglich: [],
    nein: [],
  },
  weichtiere: {
    ja: [
      'muschel', 'miesmuschel', 'jakobsmuschel', 'venusmuschel', 'herzmuschel', 'auster',
      'tintenfisch', 'kalmar', 'calamari', 'sepia', 'oktopus', 'krake', 'abalone',
      'weinbergschnecke', 'meeresschnecke',
    ],
    moeglich: ['meeresfrüchte', 'fischsuppe'],
    nein: ['muschelnudeln'],
  },
};

/** Ein Muster je Stichwort, mit Allergen und Sicherheitsgrad. */
const PATTERNS = compile(
  Object.entries(RULES).flatMap(([id, grade]) =>
    Object.entries(grade).map(([level, keywords]) => [`${id}|${level}`, keywords]),
  ),
).map((p) => {
  const [id, level] = p.value.split('|');
  return { ...p, id, level };
});

/**
 * Allergene einer einzelnen Zutat. Je Allergen entscheidet das laengste
 * zutreffende Stichwort — so schlaegt "Sojamilch" das kuerzere "Milch"
 * und "Muskatnuss" das kuerzere "Nuss".
 *
 * @returns {{id:string, level:'ja'|'moeglich'}[]}
 */
export function allergensFor(name) {
  const n = String(name).toLowerCase();
  const beste = new Map();

  for (const p of PATTERNS) {
    if (beste.has(p.id)) continue;      // PATTERNS ist nach Laenge sortiert
    if (p.trifft(n)) beste.set(p.id, p.level);
  }

  return [...beste]
    .filter(([, level]) => level !== 'nein')
    .map(([id, level]) => ({ id, level }));
}

/**
 * Allergene eines ganzen Rezepts, mit den Zutaten, aus denen sie
 * stammen. "Enthalten" schlaegt "kann enthalten".
 *
 * @returns {{id:string, label:string, short:string, icon:string,
 *            level:'ja'|'moeglich', quellen:string[]}[]}
 */
export function allergensForRecipe(recipe) {
  const gefunden = new Map();

  for (const ing of recipe?.ingredients || []) {
    for (const { id, level } of allergensFor(ing.name ?? ing.n ?? '')) {
      const eintrag = gefunden.get(id) || { level: 'moeglich', quellen: [] };
      if (level === 'ja') eintrag.level = 'ja';
      if (!eintrag.quellen.includes(ing.name ?? ing.n)) eintrag.quellen.push(ing.name ?? ing.n);
      gefunden.set(id, eintrag);
    }
  }

  return ALLERGENS.filter((a) => gefunden.has(a.id)).map((a) => ({
    ...a,
    ...gefunden.get(a.id),
  }));
}

/**
 * Ob ein Rezept ein Allergen sicher nicht enthaelt. "Kann enthalten"
 * zaehlt hier als enthalten: wer filtert, will es gar nicht sehen.
 */
export function isFreeOf(recipe, id) {
  return !allergensForRecipe(recipe).some((a) => a.id === id);
}
