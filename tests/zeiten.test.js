import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dauernIn, uhr, dauerText } from '../src/state/zeiten.js';

const sek = (text) => dauernIn(text).map((d) => d.sekunden);

test('Minuten, Stunden und Sekunden werden erkannt', () => {
  assert.deepEqual(sek('15 Minuten köcheln lassen.'), [900]);
  assert.deepEqual(sek('2 Std. schmoren'), [7200]);
  assert.deepEqual(sek('30 Sek. pürieren'), [30]);
  assert.deepEqual(sek('acht Minuten kochen'), [480]);
  assert.deepEqual(sek('1 1/2 Stunden ruhen lassen'), [5400]);
  assert.deepEqual(sek('½ Stunde quellen'), [1800]);
});

test('Halbe, Viertel- und Dreiviertelstunden', () => {
  assert.deepEqual(sek('eine halbe Stunde ziehen lassen'), [1800]);
  assert.deepEqual(sek('nach einer halben Stunde wenden'), [1800]);
  assert.deepEqual(sek('eine Viertelstunde'), [900]);
  assert.deepEqual(sek('eine Dreiviertelstunde backen'), [2700]);
});

test('bei einer Spanne gilt die untere Grenze, die obere bleibt vermerkt', () => {
  const [d] = dauernIn('Bei 180 Grad 20–25 Min. backen');
  assert.equal(d.sekunden, 1200);
  assert.equal(d.bis, 1500);
  assert.equal(d.text, '20–25 Min.');
  assert.deepEqual(sek('10 bis 12 Minuten garen'), [600]);
});

test('"1 Std. 30 Min." ist eine Angabe, nicht zwei', () => {
  const d = dauernIn('1 Std. 30 Min. ruhen lassen');
  assert.equal(d.length, 1);
  assert.equal(d[0].sekunden, 5400);
  assert.equal(dauernIn('1 Stunde und 15 Minuten')[0].sekunden, 4500);
});

test('Thermomix-Einstellungen liefern ihre Zeit', () => {
  assert.deepEqual(sek('Zwiebel 5 Sek./Stufe 5 zerkleinern, dann 17 Min./100°C/Linkslauf garen'), [5, 1020]);
});

test('was keine Zeit ist, bleibt Text', () => {
  assert.deepEqual(sek('Frischkäse unterrühren'), []);
  assert.deepEqual(sek('Minutensteak scharf anbraten'), []);
  assert.deepEqual(sek('über Nacht ziehen lassen'), []);
  assert.deepEqual(sek('Bei 180 Grad backen'), []);
  // "acht" steckt in "beachten", zaehlt dort aber nicht
  assert.deepEqual(sek('beachten, dass es 5 Minuten braucht'), [300]);
});

test('Anzeige als Uhr und als Text', () => {
  assert.equal(uhr(75), '1:15');
  assert.equal(uhr(3725), '1:02:05');
  assert.equal(uhr(0.2), '0:01');
  assert.equal(dauerText(45), '45 Sek.');
  assert.equal(dauerText(600), '10 Min.');
  assert.equal(dauerText(5400), '1 Std. 30 Min.');
  assert.equal(dauerText(7200), '2 Std.');
});
