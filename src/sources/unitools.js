/**
 * UniTools-Rezeptdatensatz (CC BY-SA 4.0).
 *
 * 501 Gerichte aus 127 Ländern als eine JSON-Datei, mit strukturierten
 * Zutaten, Schritten, Nährwerten und Ernährungsformen. Die Felder lassen
 * sich fast eins zu eins auf das Format dieser App abbilden.
 *
 * https://theunitools.com/ · CC BY-SA 4.0
 */

import { getJSON } from './http.js';

const URL = 'https://theunitools.com/data/unitools-recipes-v1.json';

/** Einheiten des Datensatzes auf die Schreibweise dieser App. */
const UNITS = {
  g: 'g', kg: 'kg', ml: 'ml', l: 'l',
  piece: 'Stk', tbsp: 'EL', tsp: 'TL',
  clove: 'Zehe', pinch: 'Prise', sprig: 'Zweig', slice: 'Scheibe',
  toTaste: '', // Menge nach Geschmack: bleibt ohne Zahl
};

const CATEGORIES = {
  main: 'Hauptgericht',
  soup: 'Suppe',
  dessert: 'Dessert',
  snack: 'Snack',
  breakfast: 'Frühstück',
  bread: 'Backen',
  side: 'Beilage',
  salad: 'Salat',
  sauce: 'Grundrezept',
  drink: 'Getränk',
};

const MEALS_FOR = {
  breakfast: ['fruehstueck'],
  bread: ['fruehstueck', 'snack'],
  dessert: ['snack'],
  snack: ['snack'],
  drink: ['snack'],
};

const DIETS = {
  vegetarian: ['vegetarisch'],
  vegan: ['vegetarisch', 'vegan'],
  'gluten-free': ['glutenfrei'],
  pescatarian: ['pescetarisch'],
};

const DIFFICULTY = { easy: 1, medium: 2, hard: 3 };

const regionNames = new Intl.DisplayNames(['de'], { type: 'region' });

/** Ländercode zu deutschem Namen, mit dem Code als Rückfallebene. */
function cuisineOf(code) {
  try {
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
}

/** Zutatenname um den Zusatz ergänzen, falls einer mitgeliefert wird. */
function ingredientName(ing) {
  const base = ing.name?.en || ing.id || '';
  const note = ing.note?.en;
  return note ? `${base}, ${note}` : base;
}

/** Wandelt einen Datensatz-Eintrag in ein Rezept dieser App. */
export function toRecipe(raw) {
  const category = CATEGORIES[raw.category] || 'Hauptgericht';

  const diet = [...new Set((raw.diets || []).flatMap((d) => DIETS[d] || []))];

  const ingredients = (raw.ingredients || []).map((i) => {
    const unit = UNITS[i.unit] ?? i.unit ?? '';
    return {
      a: i.unit === 'toTaste' ? null : (i.quantity ?? null),
      u: unit,
      n: ingredientName(i),
    };
  });

  const steps = (raw.steps || [])
    .map((s) => (typeof s === 'string' ? s : s.text?.en || ''))
    .map((s) => s.trim())
    .filter(Boolean);

  const title = raw.name?.en || raw.nativeName || raw.slug;

  return {
    id: `unitools-${raw.slug}`,
    sourceId: 'unitools',
    title,
    chapter: raw.nativeName && raw.nativeName !== title ? raw.nativeName : 'UniTools',
    cuisine: cuisineOf(raw.country),
    category,
    meals: MEALS_FOR[raw.category] || ['mittag', 'abend'],
    diet,
    servings: raw.baseServings || 2,
    prep: raw.prepMinutes || 0,
    cook: raw.cookMinutes || 0,
    difficulty: DIFFICULTY[raw.difficulty] || 2,
    kcal: raw.nutritionPerServing?.calories || 0,
    tags: [cuisineOf(raw.country)],
    ingredients,
    steps,
    note: raw.summary?.en
      ? `${raw.summary.en} — Aus dem UniTools-Datensatz, CC BY-SA 4.0.`
      : 'Aus dem UniTools-Datensatz, CC BY-SA 4.0.',
    sourceUrl: 'https://theunitools.com/',
  };
}

/** Lädt den gesamten Datensatz und wandelt ihn um. */
export async function fetchAll() {
  const data = await getJSON(URL, { timeout: 40000 });
  const raw = Array.isArray(data) ? data : data.recipes || [];
  return raw.map(toRecipe).filter((r) => r.ingredients.length >= 3 && r.steps.length >= 3);
}
