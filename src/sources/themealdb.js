/**
 * TheMealDB — frei nutzbare Rezept-API mit Namensnennung.
 * Der oeffentliche Testschluessel "1" steht im Pfad.
 * https://www.themealdb.com/api.php
 */

import { getJSON } from './http.js';
import { parseIngredientLine } from './ingredients.js';

const BASE = 'https://www.themealdb.com/api/json/v1/1';

const CATEGORY_MAP = {
  Dessert: 'Dessert', Starter: 'Vorspeise', Side: 'Beilage',
  Breakfast: 'Hauptgericht', Pasta: 'Hauptgericht', Vegetarian: 'Hauptgericht',
};

function toRecipe(meal) {
  const ingredients = [];
  for (let i = 1; i <= 20; i += 1) {
    const name = (meal[`strIngredient${i}`] || '').trim();
    if (!name) continue;
    const measure = (meal[`strMeasure${i}`] || '').trim();
    const parsed = parseIngredientLine(`${measure} ${name}`.trim());
    ingredients.push({
      a: parsed.amount,
      u: parsed.unit,
      n: parsed.name === measure ? name : parsed.name || name,
    });
  }

  const clean = (s) => s.replace(/^\s*(STEP\s*\d+|\d+[.)])\s*/i, '').trim();

  let steps = (meal.strInstructions || '')
    .split(/\r?\n+/)
    .map(clean)
    .filter((s) => s.length > 3);

  // Manche Eintraege setzen keine Zeilenumbrueche; dann nach Saetzen trennen.
  if (steps.length <= 1 && (meal.strInstructions || '').length > 120) {
    steps = (meal.strInstructions || '')
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .map(clean)
      .filter((s) => s.length > 3);
  }

  const isBreakfast = meal.strCategory === 'Breakfast';
  const isDessert = meal.strCategory === 'Dessert';

  return {
    id: `themealdb-${meal.idMeal}`,
    sourceId: 'themealdb',
    title: meal.strMeal,
    chapter: meal.strCategory || 'Rezepte',
    cuisine: meal.strArea || 'International',
    category: CATEGORY_MAP[meal.strCategory] || 'Hauptgericht',
    meals: isBreakfast ? ['fruehstueck'] : isDessert ? ['snack'] : ['mittag', 'abend'],
    diet: meal.strCategory === 'Vegetarian' ? ['vegetarisch'] : [],
    servings: 4,
    prep: 20,
    cook: 30,
    difficulty: 2,
    kcal: 0,
    tags: (meal.strTags || '').split(',').filter(Boolean).slice(0, 3),
    ingredients,
    steps: steps.length ? steps : ['Zubereitung siehe Originalquelle.'],
    note: 'Aus TheMealDB, frei nutzbar mit Namensnennung.',
    sourceUrl: meal.strSource || `https://www.themealdb.com/meal/${meal.idMeal}`,
  };
}

/** Sucht Rezepte nach Stichwort. */
export async function search(query = '') {
  const data = await getJSON(`${BASE}/search.php?s=${encodeURIComponent(query)}`);
  return (data.meals || []).map(toRecipe);
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

/**
 * Laedt den gesamten frei zugaenglichen Bestand.
 *
 * Der Kuechenfilter deckt in der freien Stufe nur einen Teil ab — unter
 * "German" liegt dort nichts. Das Verzeichnis nach Anfangsbuchstaben
 * liefert dagegen alle Rezepte; Dubletten fallen ueber die Id weg.
 *
 * @param {(geladen:number, buchstabe:string)=>void} [onProgress]
 */
export async function fetchAll(onProgress) {
  const byId = new Map();
  const queue = [...ALPHABET];
  let firstError = null;
  let failed = 0;

  // Sechs Abrufe parallel: nacheinander dauern 26 Runden spuerbar lange,
  // unbegrenzt parallel laeuft man in Drosselungen.
  const worker = async () => {
    while (queue.length) {
      const letter = queue.shift();
      try {
        const data = await getJSON(`${BASE}/search.php?f=${letter}`);
        for (const meal of data.meals || []) byId.set(meal.idMeal, meal);
      } catch (err) {
        // Ein einzelner Buchstabe darf den Gesamtabruf nicht kippen.
        failed += 1;
        firstError ??= err;
      }
      onProgress?.(byId.size, letter);
    }
  };

  await Promise.all(Array.from({ length: 6 }, worker));

  // Schlaegt jeder Abruf fehl, ist das kein leeres Ergebnis, sondern ein
  // Fehler — sonst meldet die Oberflaeche faelschlich "nichts gefunden".
  if (!byId.size && failed === ALPHABET.length && firstError) throw firstError;

  return [...byId.values()].map(toRecipe);
}

/** Laedt die Rezepte einer Kueche, z. B. "Italian" oder "British". */
export async function byArea(area) {
  const list = await getJSON(`${BASE}/filter.php?a=${encodeURIComponent(area)}`);
  const ids = (list.meals || []).map((m) => m.idMeal);
  if (!ids.length) return [];

  const details = [];
  for (const id of ids) {
    const d = await getJSON(`${BASE}/lookup.php?i=${id}`).catch(() => null);
    if (d?.meals?.[0]) details.push(d.meals[0]);
  }
  return details.map(toRecipe);
}

/** Namen aller Kuechen, die die API kennt. */
export async function areas() {
  const data = await getJSON(`${BASE}/list.php?a=list`);
  return (data.meals || []).map((m) => m.strArea);
}
