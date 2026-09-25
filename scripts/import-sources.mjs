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
 *   npm run import -- --urls meine-rezepte.txt   (eine Adresse je Zeile)
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
import * as kochwiki from '../src/sources/kochwiki.js';
import * as unitools from '../src/sources/unitools.js';

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

/** Hoechstens so viele Adressen je Lauf: das Werkzeug ist fuer die eigene Auswahl da, nicht zum Abgrasen. */
const HOECHSTENS_URLS = 50;
/** Abstand zwischen zwei Abrufen, damit kein Anbieter Last spuert */
const ABSTAND_MS = 5000;

/**
 * Importiert selbst ausgewaehlte Rezeptseiten — etwa die Lieblingsrezepte
 * von Chefkoch oder Cookidoo — nacheinander und mit Pause. Jedes Rezept
 * landet einzeln unter data/importiert/, alle zusammen in
 * data/importiert/sammlung.json; diese Datei liest die App unter
 * "Quellen → Sammlung laden" ein. Nichts davon gelangt ins Repository.
 */
async function importUrls(datei) {
  const text = await readFile(datei, 'utf8');
  const alle = [...new Set(text.split(/\r?\n/).map((z) => z.trim()).filter((z) => /^https?:\/\//.test(z)))];
  if (!alle.length) throw new Error(`${datei} enthält keine Adressen (eine je Zeile, beginnend mit https://).`);
  if (alle.length > HOECHSTENS_URLS) {
    console.log(`  ${alle.length} Adressen — eingelesen werden die ersten ${HOECHSTENS_URLS}.`);
  }

  const rezepte = [];
  for (const [i, url] of alle.slice(0, HOECHSTENS_URLS).entries()) {
    if (i) await new Promise((fertig) => setTimeout(fertig, ABSTAND_MS));
    try {
      const recipe = parseRecipeFromHtml(await fetchText(url), url);
      if (!recipe) {
        console.log(`✗ ${url}: kein schema.org-Rezept auf der Seite`);
        continue;
      }
      await save(OUT_PRIVATE, recipe.id, recipe);
      rezepte.push(recipe);
      console.log(`✓ ${recipe.title} — ${recipe.ingredients.length} Zutaten, ${recipe.steps.length} Schritte${
        recipe.tags.includes('Thermomix') ? ' (Thermomix)' : ''}`);
    } catch (err) {
      console.log(`✗ ${url}: ${err.message}`);
    }
  }

  const out = await save(OUT_PRIVATE, 'sammlung', {
    art: 'kochbuch-importe',
    hinweis: 'Rechte am Rezepttext beim jeweiligen Anbieter; nur zur privaten Nutzung.',
    exportiert: new Date().toISOString(),
    recipes: rezepte,
  });
  console.log(`\n${rezepte.length} von ${Math.min(alle.length, HOECHSTENS_URLS)} Rezepten übernommen: ${out}`);
  console.log('In der App unter „Quellen & Lizenzen → Sammlung laden“ einlesen.');
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
    license: 'CC BY-SA 4.0',
    fetchedAt: new Date().toISOString(),
    recipes,
  });
  console.log(`✓ ${recipes.length} Rezepte aus dem Wikibooks-Kochbuch`);
  console.log(`  ${out}`);
  // Der ganze Bestand liegt schon im Korpus; ein zweites Buch ergaebe doppelte Rezepte.
  if (args.bundle) console.log('  Mitliefern: npm run korpus -- wikibooks (vollständig, mit Nährwerten)');
}

async function importUnitools() {
  const recipes = await unitools.fetchAll();
  if (!recipes.length) throw new Error('Datensatz war leer.');

  const out = await save(OUT_OPEN, 'unitools', {
    sourceId: 'unitools',
    license: 'CC BY-SA 4.0',
    attribution: 'UniTools — theunitools.com',
    fetchedAt: new Date().toISOString(),
    recipes,
  });
  console.log(`✓ ${recipes.length} Rezepte aus dem UniTools-Datensatz`);
  console.log(`  ${out}`);
  if (args.bundle) await bundle('unitools', 'unitools', recipes);
}

async function importKochwiki(limit) {
  const recipes = await kochwiki.fetchBatch(limit, (n, total) =>
    process.stdout.write(`\r  ${n}/${total} Rezepte `));
  process.stdout.write('\n');
  if (!recipes.length) throw new Error('Keine verwertbaren Rezeptseiten gefunden.');

  const out = await save(OUT_OPEN, 'kochwiki', {
    sourceId: 'kochwiki',
    license: 'CC BY-SA',
    fetchedAt: new Date().toISOString(),
    recipes,
  });
  console.log(`✓ ${recipes.length} Rezepte aus dem Koch-Wiki`);
  console.log(`  ${out}`);
  if (args.bundle) console.log('  Mitliefern: npm run korpus -- kochwiki (vollständig, mit Nährwerten)');
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
  if (typeof args.urls === 'string') {
    await importUrls(args.urls);
  } else if (args.url || args.file) {
    await importUrl(typeof args.url === 'string' ? args.url : '', typeof args.file === 'string' ? args.file : null);
  } else if (args.themealdb) {
    await importTheMealDB(typeof args.themealdb === 'string' ? args.themealdb : 'German');
  } else if (args.wikibooks) {
    await importWikibooks(typeof args.wikibooks === 'string' ? Number(args.wikibooks) : 20);
  } else if (args.unitools) {
    await importUnitools();
  } else if (args.kochwiki) {
    await importKochwiki(typeof args.kochwiki === 'string' ? Number(args.kochwiki) : 40);
  } else if (args.gutendex) {
    await importGutendex(typeof args.gutendex === 'string' ? args.gutendex : 'cookery');
  } else {
    console.log(`Kochbuch-Import

  --url <adresse>        Rezeptseite mit schema.org-Daten importieren
  --file <datei>         Bereits gespeichertes HTML lesen (mit --url für die Quellenangabe)
  --themealdb alle       Gesamten TheMealDB-Bestand laden (rund 790 Rezepte)
  --themealdb <küche>    Nur eine Küche laden, z. B. Italian
  --wikibooks <anzahl>   Seiten aus dem Wikibooks-Kochbuch laden
  --unitools             UniTools-Datensatz laden (501 Gerichte, CC BY-SA 4.0)
  --kochwiki <anzahl>    Rezepte aus dem Koch-Wiki laden (CC BY-SA)
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
