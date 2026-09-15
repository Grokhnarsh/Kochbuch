import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startOfWeek, weekKey, isoWeekNumber } from '../src/state/week.js';

test('die Woche beginnt am Montag', () => {
  assert.equal(startOfWeek(new Date(2026, 8, 17)).getDay(), 1); // Donnerstag -> Montag
  assert.equal(startOfWeek(new Date(2026, 8, 14)).getDate(), 14); // Montag bleibt
  assert.equal(startOfWeek(new Date(2026, 8, 20)).getDate(), 14); // Sonntag zaehlt zur Vorwoche
});

test('der Wochenschluessel ist stabil fuer jeden Tag der Woche', () => {
  const keys = [14, 15, 16, 17, 18, 19, 20].map((d) => weekKey(new Date(2026, 8, d)));
  assert.equal(new Set(keys).size, 1);
  assert.equal(keys[0], '2026-09-14');
});

test('Kalenderwochen folgen ISO 8601', () => {
  assert.equal(isoWeekNumber(new Date(2026, 0, 1)), 1);
  assert.equal(isoWeekNumber(new Date(2026, 8, 14)), 38);
  assert.equal(isoWeekNumber(new Date(2027, 0, 4)), 1);
});
