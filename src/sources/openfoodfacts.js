/**
 * Open Food Facts (ODbL 1.0) — Produkt- und Naehrwertdaten.
 * Reichert Positionen der Einkaufsliste mit konkreten Produkten an.
 * https://world.openfoodfacts.org/
 */

import { getJSON } from './http.js';

const SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl';

/** Sucht Produkte zu einem Zutatennamen. */
export async function findProducts(term, pageSize = 5) {
  const q = new URLSearchParams({
    search_terms: term,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: String(pageSize),
    fields: 'code,product_name,brands,quantity,nutriments,image_small_url',
  });

  const data = await getJSON(`${SEARCH}?${q}`);

  return (data.products || [])
    .filter((p) => p.product_name)
    .map((p) => ({
      code: p.code,
      name: p.product_name,
      brand: (p.brands || '').split(',')[0].trim(),
      quantity: p.quantity || '',
      kcalPer100g: p.nutriments?.['energy-kcal_100g'] ?? null,
      image: p.image_small_url || null,
      url: `https://world.openfoodfacts.org/product/${p.code}`,
    }));
}
