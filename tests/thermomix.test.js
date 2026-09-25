import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hatEinstellung, istThermomix, markiereEinstellungen } from '../src/sources/thermomix.js';
import { parseRecipeFromHtml, decodeEntities, schritteAusHtml } from '../src/sources/schemaorg.js';

test('Thermomix-Einstellungen werden erkannt', () => {
  for (const text of [
    'Zwiebel 5 Sek./Stufe 5 zerkleinern.',
    'Öl zugeben und 3 Min./120°C/Stufe 1 dünsten.',
    'Alles 20 Min./100°C/Linkslauf/Stufe 1 garen.',
    '3 Min./Varoma/Linkslauf/Sanftrührstufe',
    'Turbo/0,5 Sek./2-3 Mal',
    'Teig 2 Min./Teigknetstufe kneten.',
    'Sahne 30 Sek./Stufe 3-4 schlagen.',
  ]) {
    assert.ok(hatEinstellung(text), text);
  }
});

test('gewoehnliche Zeitangaben sind keine Thermomix-Einstellung', () => {
  for (const text of ['10 Min. kochen lassen.', 'Bei 180 °C 25 Min. backen.', 'Auf Stufe 2 der Herdplatte erhitzen.']) {
    assert.ok(!hatEinstellung(text), text);
  }
});

test('Einstellungen werden im maskierten Text hervorgehoben', () => {
  assert.equal(
    markiereEinstellungen('Zwiebel 5 Sek./Stufe 5 zerkleinern &amp; umrühren.'),
    'Zwiebel <span class="tm-set" title="Thermomix-Einstellung">5 Sek./Stufe 5</span> zerkleinern &amp; umrühren.',
  );
});

test('Rezepte von Cookidoo gelten als Thermomix-Rezepte', () => {
  assert.ok(istThermomix({ sourceHost: 'cookidoo.de' }));
  assert.ok(istThermomix({ sourceUrl: 'https://www.rezeptwelt.de/hauptgerichte/x' }));
  assert.ok(!istThermomix({ sourceUrl: 'https://www.chefkoch.de/rezepte/1', steps: ['10 Min. kochen.'] }));
});

test('benannte Entitaeten wie &frac12; werden aufgeloest', () => {
  assert.equal(decodeEntities('1 &frac12; TL Salz'), '1 ½ TL Salz');
  assert.equal(decodeEntities('180 &deg;C &ndash; Umluft'), '180 °C – Umluft');
  assert.equal(decodeEntities('&unbekannt;'), '&unbekannt;');
});

/** Eine Seite wie bei Cookidoo: Zutaten in schema.org, Schritte nur nach Anmeldung */
const COOKIDOO = `<html><head><script type="application/ld+json">${JSON.stringify({
  '@context': 'http://schema.org/', '@type': 'Recipe', name: 'Vollwert-Brötchen',
  recipeYield: '12 Stück', recipeIngredient: ['400 g Weizenmehl', '1 &frac12; TL Salz', '220 g Wasser'],
})}</script></head><body><div>Zubereitung 10 Min</div></body></html>`;

test('Cookidoo: Zutaten ja, fehlende Schritte werden ehrlich benannt', () => {
  const r = parseRecipeFromHtml(COOKIDOO, 'https://cookidoo.de/recipes/recipe/de-DE/r1');
  assert.deepEqual(r.ingredients[1], { a: 1.5, u: 'TL', n: 'Salz' });
  assert.ok(r.tags.includes('Thermomix'));
  assert.equal(r.steps.length, 1);
  assert.match(r.steps[0], /nur angemeldeten Nutzern/);
});

test('ohne Anweisungen in schema.org helfen die Schritte unter "Zubereitung"', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'Recipe', name: 'Suppe', recipeIngredient: ['1 l Brühe', '2 Möhren', '1 Zwiebel'],
  })}</script>
    <h2>Zutaten</h2><ul><li>1 l Brühe</li></ul>
    <h2>Zubereitung</h2><ol><li>Zwiebel würfeln und 3 Min./120°C/Stufe 1 dünsten.</li>
    <li>Brühe zugeben und alles 20 Min. köcheln lassen.</li></ol><h2>Tipps</h2><p>Guten Appetit!</p>`;
  assert.equal(schritteAusHtml(html).length, 2);
  const r = parseRecipeFromHtml(html, 'https://example.org/suppe');
  assert.equal(r.steps.length, 2);
  assert.ok(r.tags.includes('Thermomix'), 'Einstellung im Schritt macht es zum Thermomix-Rezept');
});
