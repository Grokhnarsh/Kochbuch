/**
 * Liest die USDA-Datenbank "SR Legacy" (FoodData Central, April 2018).
 *
 * Gemeinfrei (CC0) und die Referenz, auf die sich die meisten
 * Naehrwerttabellen stuetzen. Die Rohdaten liegen nicht im Repository —
 * rund 40 MB —, sondern werden bei Bedarf geladen; mitgeliefert wird nur
 * der kleine Auszug, den die App braucht.
 *
 *   https://fdc.nal.usda.gov/download-datasets
 */

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const SR_URL =
  'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip';

/** Die Naehrstoffe der EU-Naehrwertdeklaration, plus Ballaststoffe. */
export const NAEHRSTOFFE = {
  1008: 'kcal',
  1003: 'eiweiss',
  1004: 'fett',
  1258: 'gesFett',
  1005: 'kh',
  2000: 'zucker',
  1079: 'ballast',
  1093: 'natrium',   // mg; Salz = Natrium × 2,5
};

/** Zerlegt eine CSV-Zeile mit Feldern in Anfuehrungszeichen. */
function felder(zeile) {
  const out = [];
  let i = 0;
  while (i < zeile.length) {
    if (zeile[i] === '"') {
      let j = i + 1;
      let wert = '';
      while (j < zeile.length) {
        if (zeile[j] === '"' && zeile[j + 1] === '"') { wert += '"'; j += 2; continue; }
        if (zeile[j] === '"') break;
        wert += zeile[j];
        j += 1;
      }
      out.push(wert);
      i = j + 2;
    } else {
      const k = zeile.indexOf(',', i);
      out.push(k < 0 ? zeile.slice(i) : zeile.slice(i, k));
      i = k < 0 ? zeile.length : k + 1;
    }
  }
  return out;
}

function tabelle(datei) {
  const zeilen = readFileSync(datei, 'utf8').split(/\r?\n/).filter(Boolean);
  const kopf = felder(zeilen[0]);
  return zeilen.slice(1).map((z) => Object.fromEntries(felder(z).map((w, k) => [kopf[k], w])));
}

/** Laedt die Datenbank, bei Bedarf mit Download. */
export function ladeSR(verzeichnis) {
  const basis = path.join(verzeichnis, 'FoodData_Central_sr_legacy_food_csv_2018-04');
  if (!existsSync(path.join(basis, 'food.csv'))) {
    mkdirSync(verzeichnis, { recursive: true });
    const zip = path.join(verzeichnis, 'sr.zip');
    console.log(`Lade ${SR_URL} …`);
    execFileSync('curl', ['-sSfL', '-o', zip, SR_URL], { stdio: 'inherit' });
    execFileSync('unzip', ['-o', '-q', zip, '-d', verzeichnis], { stdio: 'inherit' });
  }

  const foods = new Map();
  for (const f of tabelle(path.join(basis, 'food.csv'))) {
    foods.set(f.fdc_id, { fdc: Number(f.fdc_id), beschreibung: f.description, werte: {}, portionen: [] });
  }

  for (const n of tabelle(path.join(basis, 'food_nutrient.csv'))) {
    const schluessel = NAEHRSTOFFE[n.nutrient_id];
    const food = foods.get(n.fdc_id);
    if (schluessel && food) food.werte[schluessel] = Number(n.amount);
  }

  for (const p of tabelle(path.join(basis, 'food_portion.csv'))) {
    const food = foods.get(p.fdc_id);
    if (!food) continue;
    food.portionen.push({
      menge: Number(p.amount) || 1,
      art: `${p.modifier || ''} ${p.portion_description || ''}`.trim(),
      gramm: Number(p.gram_weight),
    });
  }

  const nachBeschreibung = new Map([...foods.values()].map((f) => [f.beschreibung, f]));
  return { foods, nachBeschreibung };
}
