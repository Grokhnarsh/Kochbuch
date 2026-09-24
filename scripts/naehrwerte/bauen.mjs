#!/usr/bin/env node
/**
 * Baut die Naehrwerttabelle der App aus der USDA-Datenbank.
 *
 *   node scripts/naehrwerte/bauen.mjs
 *
 * Laedt bei Bedarf "SR Legacy" (gemeinfrei) nach data/usda-sr/, sucht fuer
 * jede Zuordnung in zuordnung.mjs das Lebensmittel mit genau dieser
 * Beschreibung und schreibt je 100 g Energie, Eiweiss, Fett, gesaettigte
 * Fettsaeuren, Kohlenhydrate, Zucker, Ballaststoffe und Salz nach
 * src/data/naehrwerte.json. Loeffel- und Stueckgewichte kommen aus den
 * Portionsangaben der Datenbank, wo die Zuordnung keine eigenen setzt.
 *
 * Fehlt eine Beschreibung in der Datenbank, bricht das Werkzeug ab —
 * lieber kein Wert als ein falsch zugeordneter.
 */

import { writeFileSync } from 'node:fs';
import { ladeSR, SR_URL } from './sr.mjs';
import { ZUORDNUNG } from './zuordnung.mjs';

const ZIEL = 'src/data/naehrwerte.json';
const ROH = 'data/usda-sr';

const runden = (x, stellen = 1) => (x == null ? null : Math.round(x * 10 ** stellen) / 10 ** stellen);

/** Gramm je Einheit aus den Portionsangaben, etwa "1 tbsp = 14,2 g". */
function portion(food, muster) {
  const p = food.portionen.find((x) => muster.test(x.art) && x.gramm > 0);
  return p ? p.gramm / p.menge : null;
}

const sr = ladeSR(ROH);
const fehlend = [];
const eintraege = [];

for (const [id, name, beschreibung, schluessel, gewichte] of ZUORDNUNG) {
  const food = sr.nachBeschreibung.get(beschreibung);
  if (!food) { fehlend.push(`${id}: ${beschreibung}`); continue; }

  const w = food.werte;
  const je100g = {
    kcal: runden(w.kcal, 0),
    eiweiss: runden(w.eiweiss),
    fett: runden(w.fett),
    gesFett: runden(w.gesFett),
    kh: runden(w.kh),
    zucker: runden(w.zucker),
    ballast: runden(w.ballast),
    // Salz nach LMIV: Natrium × 2,5
    salz: w.natrium == null ? null : runden((w.natrium * 2.5) / 1000, 2),
  };

  const cup = portion(food, /^cup\b(?!.*(chopped|diced|sliced|cubes|pieces|shredded|packed|halves|whole|mashed))/i)
    ?? portion(food, /^cup\b/i);
  const tbsp = portion(food, /^(tbsp|tablespoon)\b/i);
  const tsp = portion(food, /^(tsp|teaspoon)\b/i);

  const el = gewichte.el ?? tbsp ?? (tsp ? tsp * 3 : null) ?? (cup ? cup / 16 : null);
  const tl = gewichte.tl ?? tsp ?? (tbsp ? tbsp / 3 : null) ?? (cup ? cup / 48 : null);
  const stueck = gewichte.stueck
    ?? portion(food, /^medium\b/i)
    ?? portion(food, /^large\b/i)
    ?? null;

  eintraege.push({
    id,
    name,
    fdc: food.fdc,
    quelle: beschreibung,
    schluessel,
    je100g,
    ...(el ? { el: runden(el) } : {}),
    ...(tl ? { tl: runden(tl, 2) } : {}),
    // Dichte nur fuer Fluessiges und Pulver, wo "ml" vorkommen kann.
    ...(gewichte.dichte ? { dichte: gewichte.dichte } : cup ? { dichte: runden(cup / 236.6, 2) } : {}),
    ...(stueck ? { stueck: runden(stueck) } : {}),
    ...Object.fromEntries(
      Object.entries(gewichte).filter(([k]) => !['el', 'tl', 'stueck', 'dichte'].includes(k)),
    ),
  });
}

if (fehlend.length) {
  console.error(`Nicht in der Datenbank gefunden:\n  ${fehlend.join('\n  ')}`);
  process.exit(1);
}

const doc = {
  meta: {
    quelle: 'USDA FoodData Central, SR Legacy (April 2018)',
    lizenz: 'Gemeinfrei (CC0 1.0)',
    url: 'https://fdc.nal.usda.gov/',
    datensatz: SR_URL,
    hinweis: 'Werte je 100 g essbarer Anteil. Salz = Natrium × 2,5.',
  },
  eintraege,
};

writeFileSync(ZIEL, `${JSON.stringify(doc, null, 1)}\n`);
const ohne = eintraege.filter((e) => Object.values(e.je100g).some((v) => v == null));
console.log(`✓ ${eintraege.length} Lebensmittel nach ${ZIEL}`);
console.log(`  mit Lücken in einzelnen Nährstoffen: ${ohne.length}`);
for (const e of ohne) {
  console.log(`    ${e.id}: ${Object.entries(e.je100g).filter(([, v]) => v == null).map(([k]) => k).join(', ')}`);
}
