/**
 * Verdichtet geplante Gerichte zu einer Einkaufsliste.
 *
 * Reine Funktion ohne App-Zustand: Eintraege und ein Rezept-Nachschlag
 * gehen hinein, nach Abteilungen gruppierte Positionen kommen heraus.
 */

import { toBase, fromBase, roundAmount } from './units.js';
import { aisleFor, AISLE_ORDER } from './aisles.js';

/**
 * @param {{recipeId:string, servings:number}[]} entries
 * @param {Map<string, object>|{get:(id:string)=>object}} lookup
 * @param {Record<string, boolean>} checked Abgehakte Positionen
 */
export function aggregate(entries, lookup, checked = {}) {
  const acc = new Map();

  for (const entry of entries) {
    const recipe = lookup.get(entry.recipeId);
    if (!recipe) continue;

    const factor = entry.servings / (recipe.servings || 1);

    for (const ing of recipe.ingredients) {
      const scaled = ing.amount == null ? null : ing.amount * factor;
      const base = toBase(scaled, ing.unit);
      const key = `${ing.name.toLowerCase()}|${base.unit}`;
      const prev = acc.get(key);

      if (prev) {
        // Eine Position ohne Menge ("etwas Salz") macht die Summe unbestimmt.
        prev.amount = prev.amount == null || base.amount == null
          ? null
          : prev.amount + base.amount;
        if (!prev.recipes.includes(recipe.title)) prev.recipes.push(recipe.title);
      } else {
        acc.set(key, {
          key,
          name: ing.name,
          unit: base.unit,
          amount: base.amount,
          recipes: [recipe.title],
          aisle: aisleFor(ing.name),
        });
      }
    }
  }

  const groups = new Map(AISLE_ORDER.map((a) => [a, []]));

  for (const item of acc.values()) {
    const shown = fromBase(item.amount, item.unit);
    groups.get(item.aisle).push({
      ...item,
      amount: roundAmount(shown.amount),
      unit: shown.unit,
      done: Boolean(checked[item.key]),
    });
  }

  return AISLE_ORDER
    .map((aisle) => ({
      aisle,
      items: groups.get(aisle).sort((a, b) => a.name.localeCompare(b.name, 'de')),
    }))
    .filter((g) => g.items.length);
}
