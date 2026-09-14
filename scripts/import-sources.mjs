#!/usr/bin/env node
/**
 * Import-Werkzeug fuer die Kommandozeile.
 *
 * Unter Node greift kein CORS, deshalb funktioniert hier auch das, was
 * der Browser blockt: einzelne Rezeptseiten abrufen und offene APIs
 * abfragen.
 *
 *   npm run import -- --url https://www.chefkoch.de/rezepte/...
 *   npm run import -- --file seite.html --url https://...
 *   npm run import -- --themealdb German
 *   npm run import -- --wikibooks 20
 *   npm run import -- --gutendex cookery
 *
 * Rezepte von kommerziellen Portalen landen unter data/importiert/ und
 * sind per .gitignore vom Repository ausgenommen: die Rechte am
 * Rezepttext liegen beim jeweiligen Anbieter.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { argv, exit } from 'node:process';
import path from 'node:path';

import { parseRecipeFromHtml } from '../src/sources/schemaorg.js';
import * as themealdb from '../src/sources/themealdb.js';
import * as wikibooks from '../src/sources/wikibooks.js';
import * as gutendex from '../src/sources/gutendex.js';

const OUT_PRIVATE = 'data/importiert';
const OUT_OPEN = 'data/offene-quellen';
const OUT_BUNDLE = 'src/data/books';

const args = parseArgs(argv.slice(2));

function parseArgs(list) {
  const out = { _: [] };
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = list[i + 1];
      if (!next || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i += 1; }
    } else {
      out._.push(a);
    }
  }
  return out;
}

/**
 * Legt geladene Rezepte zusaetzlich als Buch in src/data/books/ ab, sodass
 * sie fest mitgeliefert werden. Nur auf ausdrueckliches --bundle: ob die
 * Lizenz einer Quelle das Weitergeben erlaubt, entscheidet der Betreiber.
 */
async function bundle(sourceId, name, recipes) {
  const doc = {
    sourceId,
    recipes: recipes.map((r) => ({
      ...r,
      ingredients: r.ingredients.map((i) => ('a' in i ? i : { a: i.amount, u: i.unit, n: i.name })),
      source: undefined,
      searchText: undefined,
    })),
  };
  const out = await save(OUT_BUNDLE, name, doc);
  console.log(`  eingebunden: ${out}`);
  console.log('  Prüfen Sie, ob die Lizenz der Quelle das Mitliefern erlaubt.');
}

async function save(dir, name, data) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.json`);
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return file;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      // Ohne erkennbaren Client liefern viele Portale eine Sperrseite.
      'User-Agent': 'Mozilla/5.0 (compatible; KochbuchImport/1.0)',
      'Accept-Language': 'de-DE,de;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`${url} antwortete mit ${res.status}`);
  return res.text();
}

async function importUrl(url, file) {
  const html = file ? await readFile(file, 'utf8') : await fetchText(url);
  const recipe = parseRecipeFromHtml(html, url || '');
  if (!recipe) throw new Error('Kein schema.org-Rezept auf der Seite gefunden.');

  const out = await save(OUT_PRIVATE, recipe.id, recipe);
  console.log(`✓ ${recipe.title} — ${recipe.ingredients.length} Zutaten, ${recipe.steps.length} Schritte`);
  console.log(`  ${out}`);
  console.log('  Hinweis: Rechte beim Anbieter, nicht ins Repository aufnehmen.');
}

async function importTheMealDB(area) {
  const alle = area === true || area === 'alle';
  const recipes = alle
    ? await themealdb.fetchAll((n, ch) => process.stdout.write(`\r  ${ch}: ${n} Rezepte `))
    : await themealdb.byArea(area);
  if (alle) process.stdout.write('\n');

  if (!recipes.length) {
    const verfuegbar = await themealdb.areas().catch(() => []);
    throw new Error(
      `Keine Rezepte für Küche "${area}". `
      + `Die freie Stufe deckt nicht jede Küche ab — "--themealdb alle" lädt den gesamten Bestand.`
      + (verfuegbar.length ? ` Bekannte Küchen: ${verfuegbar.slice(0, 8).join(', ')} …` : ''),
    );
  }

  const out = await save(OUT_OPEN, `themealdb-${alle ? 'alle' : String(area).toLowerCase()}`, {
    sourceId: 'themealdb',
    license: 'Frei nutzbar mit Namensnennung',
    fetchedAt: new Date().toISOString(),
    recipes,
  });
  console.log(`✓ ${recipes.length} Rezepte von TheMealDB (${alle ? 'gesamter Bestand' : area})`);
  console.log(`  ${out}`);
  if (args.bundle) await bundle('themealdb', 'themealdb', recipes);
}

async function importWikibooks(limit) {
  const recipes = await wikibooks.fetchBatch(limit, (n, total) =>
    process.stdout.write(`\r  ${n}/${total} Seiten `));
  process.stdout.write('\n');
  if (!recipes.length) throw new Error('Keine verwertbaren Rezeptseiten gefunden.');

  const out = await save(OUT_OPEN, 'wikibooks-kochbuch', {
    sourceId: 'wikibooks-de',
    license: 'CC BY-SA 3.0',
    fetchedAt: new Date().toISOString(),
    recipes,
  });
  console.log(`✓ ${recipes.length} Rezepte aus dem Wikibooks-Kochbuch`);
  console.log(`  ${out}`);
  if (args.bundle) await bundle('wikibooks-de', 'wikibooks-live', recipes);
}

async function importGutendex(query) {
  const books = await gutendex.findCookbooks(query);

  const out = await save(OUT_OPEN, `gutendex-${query}`, {
    sourceId: 'gutendex',
    fetchedAt: new Date().toISOString(),
    books,
  });
  console.log(`✓ ${books.length} gemeinfreie Kochbücher gefunden`);
  for (const b of books.slice(0, 10)) console.log(`  · ${b.title} — ${b.author}`);
  console.log(`  ${out}`);
}

try {
  if (args.url || args.file) {
    await importUrl(typeof args.url === 'string' ? args.url : '', typeof args.file === 'string' ? args.file : null);
  } else if (args.themealdb) {
    await importTheMealDB(typeof args.themealdb === 'string' ? args.themealdb : 'German');
  } else if (args.wikibooks) {
    await importWikibooks(typeof args.wikibooks === 'string' ? Number(args.wikibooks) : 20);
  } else if (args.gutendex) {
    await importGutendex(typeof args.gutendex === 'string' ? args.gutendex : 'cookery');
  } else {
    console.log(`Kochbuch-Import

  --url <adresse>        Rezeptseite mit schema.org-Daten importieren
  --file <datei>         Bereits gespeichertes HTML lesen (mit --url für die Quellenangabe)
  --themealdb alle       Gesamten TheMealDB-Bestand laden (rund 790 Rezepte)
  --themealdb <küche>    Nur eine Küche laden, z. B. Italian
  --wikibooks <anzahl>   Seiten aus dem Wikibooks-Kochbuch laden
  --gutendex <suche>     Gemeinfreie Kochbücher bei Project Gutenberg suchen
  --bundle               Geladene Rezepte zusätzlich nach src/data/books/ schreiben

Hinweis: In abgeschotteten Netzen liest Nodes fetch den Proxy nur mit
NODE_USE_ENV_PROXY=1.
`);
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  exit(1);
}
