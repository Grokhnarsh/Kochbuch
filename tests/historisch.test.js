import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  zutatenAusText, MASSE, lebensmittelRechner, heutigeSchreibung, wortschatz, umlauteSetzen, titelSchreibung, personenAus,
} from '../scripts/korpus/historisch.mjs';

const rechner = lebensmittelRechner();
const aus = (text, masse = MASSE.preussen) => zutatenAusText(text, { masse, rechner });
const finde = (liste, name) => liste.find((z) => z.n.includes(name));

test('Mengen im Fliesstext werden gelesen und umgerechnet', () => {
  const z = aus('Ein Viertel Pfund mageres Schweinefleisch, ¼ Pfund Kalbfleisch wird fein gehackt, '
    + 'dann 4 Loth Butter zu Sahne gerührt, 2 Eidotter und ⅛ Maß Milch.');
  assert.deepEqual(finde(z, 'Schweinefleisch'), { a: 115, u: 'g', n: 'mageres Schweinefleisch' });
  assert.deepEqual(finde(z, 'Butter'), { a: 58, u: 'g', n: 'Butter' });
  assert.deepEqual(finde(z, 'Eigelb'), { a: 2, u: '', n: 'Eigelb' });
  assert.deepEqual(finde(z, 'Milch'), { a: 145, u: 'ml', n: 'Milch' });
  // "Butter zu Sahne rühren" ist ein Arbeitsschritt, keine Zutat Sahne
  assert.equal(finde(z, 'Sahne'), undefined);
});

test('bairisches Pfund bei Schiller, preussisches bei Davidis', () => {
  assert.equal(finde(aus('1 Pfund Mehl', MASSE.bayern), 'Mehl').a, 560);
  assert.equal(finde(aus('1 Pfund Mehl', MASSE.preussen), 'Mehl').a, 470);
});

test('Groessenvergleiche und Geraet sind keine eigenen Zutaten', () => {
  const z = aus('Man rührt ½ Ei dick Butter mit einer Wallnuß dick Zucker, stellt es auf Kohlenfeuer.');
  assert.deepEqual(finde(z, 'Butter'), { a: 25, u: 'g', n: 'Butter' });
  assert.equal(finde(z, 'Walnuss'), undefined);
  assert.equal(finde(z, 'Kohl'), undefined);
});

test('Spannen zaehlen mit ihrer Mitte', () => {
  assert.equal(finde(aus('mit 3—4 Eidottern und Essig'), 'Eigelb').a, 3.5);
});

test('alte Schreibung wird fuer die Zutatenliste modernisiert', () => {
  assert.equal(heutigeSchreibung('Citronensaft'), 'Zitronensaft');
  assert.equal(heutigeSchreibung('Weißbrod'), 'Weißbrot');
  assert.equal(heutigeSchreibung('Muskatblüthe'), 'Muskatblüte');
  assert.equal(heutigeSchreibung('Thee'), 'Tee');
  assert.equal(heutigeSchreibung('Thymian'), 'Thymian');
  assert.equal(heutigeSchreibung('Aepfel'), 'Äpfel');
});

test('Umlaute und ß kehren zurueck, wo der Wortschatz sie kennt', () => {
  const schatz = wortschatz();
  assert.equal(umlauteSetzen('4 mittelgrosse Aepfel', schatz), '4 mittelgroße Äpfel');
  // Zusammensetzung, vom Ende her zerlegt ("Eßl." oder "Essl." — beides versteht der Zerleger)
  assert.match(umlauteSetzen('1 Essl. Selleriewuerfel', schatz), /Selleriewürfel$/);
  assert.equal(umlauteSetzen('Wasser und neue Kartoffeln', schatz), 'Wasser und neue Kartoffeln');
  assert.equal(titelSchreibung('BOHNEN-, LINSEN- ODER ERBSENSUPPE OHNE FLEISCH.', schatz),
    'Bohnen-, Linsen- oder Erbsensuppe ohne Fleisch');
  assert.equal(titelSchreibung('GEKOCHTES SCHWEINEFLEISCH MIT WEISSKOHL.', schatz),
    'Gekochtes Schweinefleisch mit Weißkohl');
});

test('Personenzahl aus dem Text', () => {
  assert.equal(personenAus('Man kocht eine gute Bouillon und zu 12 Personen etwa 24 Krebse.'), 12);
  assert.equal(personenAus('für sechs Personen'), 6);
  assert.equal(personenAus('für die Tafel'), null);
});
