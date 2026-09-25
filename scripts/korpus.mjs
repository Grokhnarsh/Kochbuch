#!/usr/bin/env node
/**
 * Baut das nachgeladene Rezeptkorpus unter public/korpus/.
 *
 *   npm run korpus -- kochwiki            eine Quelle neu holen
 *   npm run korpus -- kochwiki wikibooks  mehrere
 *   npm run korpus -- --alle              alle bekannten Quellen
 *   npm run korpus -- --neu-rechnen       nur Zusammenfassungen neu rechnen,
 *                                         etwa nach Aenderungen an der
 *                                         Naehrwerttabelle (kein Netz)
 *
 * Abgerufen wird hoeflich und mit Plattencache unter data/cache/ (siehe
 * korpus/abruf.mjs). Nur offen lizenzierte oder gemeinfreie Quellen:
 * Portale wie Chefkoch oder Cookidoo verbieten das massenhafte Kopieren.
 */

import { argv, exit, stdout } from 'node:process';
import { schreibeBuch, leseBuch, buecher } from './korpus/schreiben.mjs';
import { aussieben } from './korpus/pruefen.mjs';

const QUELLEN = {
  wikibooks: () => import('./korpus/quellen/wikibooks.mjs'),
  rezeptewiki: () => import('./korpus/quellen/rezeptewiki.mjs'),
  kochwiki: () => import('./korpus/quellen/kochwiki.mjs'),
  'davidis-1849': () => import('./korpus/quellen/davidis-1849.mjs'),
  'schiller-1843': () => import('./korpus/quellen/schiller-1843.mjs'),
  'heyl-1905': () => import('./korpus/quellen/heyl-1905.mjs'),
};

const args = argv.slice(2);
const zahl = new Intl.NumberFormat('de-DE');

function fortschritt(name) {
  return (n, gesamt) => stdout.write(`\r  ${name}: ${n}/${gesamt} Seiten `);
}

async function hole(name) {
  const modul = (await QUELLEN[name]()).default;
  console.log(`\n▸ ${modul.beschreibung}`);
  const buch = await modul.laden({ fortschritt: fortschritt(name) });
  stdout.write('\n');

  const { gut, verworfen } = aussieben(buch.recipes, { buch });
  const teile = schreibeBuch({ ...buch, name, recipes: gut });
  const bytes = teile.reduce((s, t) => s + t.bytes, 0);
  console.log(`  ${zahl.format(gut.length)} Rezepte${buch.gelesen ? ` aus ${zahl.format(buch.gelesen)} Seiten` : ''}, `
    + `${teile.length} Teil${teile.length === 1 ? '' : 'e'}, ${(bytes / 1e6).toFixed(1)} MB`);
  const liste = Object.entries(verworfen).sort((a, b) => b[1] - a[1]);
  if (liste.length) console.log(`  verworfen: ${liste.map(([m, n]) => `${m} ${n}`).join(', ')}`);
}

function neuRechnen() {
  for (const name of buecher()) {
    const buch = leseBuch(name);
    const teile = schreibeBuch(buch);
    console.log(`  ${name}: ${zahl.format(buch.recipes.length)} Rezepte in ${teile.length} Teil(en) neu gerechnet`);
  }
}

try {
  if (args.includes('--neu-rechnen')) {
    neuRechnen();
  } else {
    const namen = args.includes('--alle') ? Object.keys(QUELLEN) : args.filter((a) => !a.startsWith('--'));
    const unbekannt = namen.filter((n) => !QUELLEN[n]);
    if (!namen.length || unbekannt.length) {
      console.error(`Quellen: ${Object.keys(QUELLEN).join(', ')}${unbekannt.length ? ` (unbekannt: ${unbekannt.join(', ')})` : ''}`);
      exit(1);
    }
    for (const n of namen) await hole(n);
  }
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  exit(1);
}
