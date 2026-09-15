import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLERGENS,
  allergensFor,
  allergensForRecipe,
  isFreeOf,
} from '../src/state/allergens.js';

const ids = (name) => allergensFor(name).map((a) => a.id).sort();
const level = (name, id) => allergensFor(name).find((a) => a.id === id)?.level;

test('die vierzehn Allergene des Anhangs II sind vollstaendig', () => {
  assert.equal(ALLERGENS.length, 14);
  for (const a of ALLERGENS) {
    assert.ok(a.id && a.label && a.short, `unvollständig: ${JSON.stringify(a)}`);
  }
  assert.equal(new Set(ALLERGENS.map((a) => a.id)).size, 14);
});

test('erkennt Allergene in einfachen Zutaten', () => {
  assert.deepEqual(ids('Weizenmehl'), ['gluten']);
  assert.deepEqual(ids('Eier'), ['eier']);
  assert.deepEqual(ids('Parmesan'), ['milch']);
  assert.deepEqual(ids('Haselnüsse'), ['schalenfruechte']);
  assert.deepEqual(ids('Sellerieknolle'), ['sellerie']);
  assert.deepEqual(ids('Sardellenfilets'), ['fisch']);
  assert.deepEqual(ids('Garnelen'), ['krebstiere']);
  assert.deepEqual(ids('Miesmuscheln'), ['weichtiere']);
  assert.deepEqual(ids('Tahin'), ['sesam']);
  assert.deepEqual(ids('Lupinenmehl'), ['lupinen']);
  assert.deepEqual(ids('Erdnussöl'), ['erdnuesse']);
  assert.deepEqual(ids('mittelscharfer Senf'), ['senf']);
});

test('erkennt Allergene auch in Zusammensetzungen', () => {
  assert.deepEqual(ids('Hartweizengrieß'), ['gluten']);
  assert.deepEqual(ids('Buttermilch'), ['milch']);
  assert.deepEqual(ids('Ziegenkäserolle'), ['milch'], 'Grundwort in der Wortmitte');
  assert.deepEqual(ids('Frischkäsezubereitung'), ['milch']);
  assert.deepEqual(ids('Weizenmehlmischung'), ['gluten']);
  assert.deepEqual(ids('Mandelblättchen'), ['schalenfruechte']);
  assert.deepEqual(ids('Staudensellerie'), ['sellerie']);
  assert.deepEqual(ids('Räucherlachs in Scheiben'), ['fisch']);
});

test('ein laengeres Stichwort schlaegt ein kuerzeres', () => {
  // Sonst waere jede Pflanzenmilch Milch und jede Muskatnuss eine Nuss.
  assert.deepEqual(ids('Sojamilch'), ['soja']);
  assert.deepEqual(ids('Kokosmilch'), []);
  assert.deepEqual(ids('Mandelmilch'), ['schalenfruechte']);
  assert.deepEqual(ids('Muskatnuss'), []);
  assert.deepEqual(ids('Erdnussbutter'), ['erdnuesse']);
  assert.deepEqual(ids('Mandelmehl'), ['schalenfruechte']);
  assert.deepEqual(ids('Reisnudeln'), []);
});

test('faengt die Verwechslungen, die ein Teilstring machen wuerde', () => {
  assert.deepEqual(ids('Hackfleisch vom Schwein'), [], 'Schwein endet auf "wein"');
  assert.deepEqual(ids('mehligkochende Kartoffeln'), [], '"mehlig" ist kein Mehl');
  assert.deepEqual(ids('Butterschmalz').filter((i) => i === 'gluten'), [], '"schmalz" ist kein Malz');
  assert.deepEqual(ids('Eiertomaten'), [], 'Eiertomate ist eine Tomate');
  assert.deepEqual(ids('Eierschwammerl'), [], 'Eierschwammerl ist ein Pilz');
  assert.deepEqual(ids('Lebkuchengewürz'), [], 'das Gewürz ist kein Gebäck');
  assert.deepEqual(ids('walnussgroßes Stück Ingwer'), [], 'eine Größenangabe');
  assert.deepEqual(ids('Weintrauben'), [], 'Trauben sind nicht geschwefelt gemeint');
  assert.deepEqual(ids('Eiswasser'), [], '"Eis" ist kein Ei');
  assert.deepEqual(ids('Reis'), []);
  assert.deepEqual(ids('Kartoffeln'), []);
});

test('unterscheidet sichere von moeglichen Angaben', () => {
  assert.equal(level('Weizenmehl', 'gluten'), 'ja');
  assert.equal(level('Gemüsebrühe', 'sellerie'), 'moeglich');
  assert.equal(level('Zartbitterschokolade', 'soja'), 'moeglich');
  assert.equal(level('Butterschmalz', 'milch'), 'moeglich');
  assert.equal(level('Rotwein', 'sulfite'), 'moeglich');
  assert.equal(level('Sojasauce', 'gluten'), 'moeglich');
  assert.equal(level('Sojasauce', 'soja'), 'ja');
});

test('fasst die Allergene eines Rezepts zusammen', () => {
  const rezept = {
    ingredients: [
      { name: 'Weizenmehl Type 405' },
      { name: 'Eier' },
      { name: 'Milch' },
      { name: 'Zucker' },
      { name: 'Gemüsebrühe' },
    ],
  };

  const gefunden = allergensForRecipe(rezept);
  assert.deepEqual(gefunden.map((a) => a.id), ['gluten', 'eier', 'milch', 'sellerie']);
  assert.equal(gefunden.find((a) => a.id === 'gluten').level, 'ja');
  assert.equal(gefunden.find((a) => a.id === 'sellerie').level, 'moeglich');
  // Bruehwuerfel tragen oft Weizen — deshalb steht die Bruehe auch beim Gluten.
  assert.deepEqual(
    gefunden.find((a) => a.id === 'gluten').quellen,
    ['Weizenmehl Type 405', 'Gemüsebrühe'],
  );
});

test('die Reihenfolge folgt dem Anhang II, nicht dem Zufall', () => {
  const rezept = { ingredients: [{ name: 'Sesamöl' }, { name: 'Butter' }, { name: 'Mehl' }] };
  assert.deepEqual(allergensForRecipe(rezept).map((a) => a.id), ['gluten', 'milch', 'sesam']);
});

test('"enthalten" schlaegt "kann enthalten"', () => {
  const rezept = { ingredients: [{ name: 'Gemüsebrühe' }, { name: 'Knollensellerie' }] };
  const sellerie = allergensForRecipe(rezept).find((a) => a.id === 'sellerie');
  assert.equal(sellerie.level, 'ja');
  assert.equal(sellerie.quellen.length, 2);
});

test('kennt auch die gebuendelte Zutatenform', () => {
  // Im JSON heissen die Felder a/u/n, im Index amount/unit/name.
  const rezept = { ingredients: [{ a: 250, u: 'g', n: 'Weizenmehl' }] };
  assert.deepEqual(allergensForRecipe(rezept).map((a) => a.id), ['gluten']);
});

test('isFreeOf zaehlt "kann enthalten" als enthalten', () => {
  const mitBruehe = { ingredients: [{ name: 'Gemüsebrühe' }] };
  assert.equal(isFreeOf(mitBruehe, 'sellerie'), false);
  assert.equal(isFreeOf(mitBruehe, 'milch'), true);
  assert.equal(isFreeOf({ ingredients: [] }, 'gluten'), true);
});

test('haelt leere und ungueltige Eingaben aus', () => {
  assert.deepEqual(allergensFor(''), []);
  assert.deepEqual(allergensForRecipe(null), []);
  assert.deepEqual(allergensForRecipe({}), []);
});
