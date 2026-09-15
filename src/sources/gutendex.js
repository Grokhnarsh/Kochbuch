/**
 * Gutendex — JSON-API fuer die Metadaten von Project Gutenberg.
 * Dient dazu, weitere gemeinfreie Kochbuecher zu finden.
 * https://gutendex.com/
 */

import { getJSON } from './http.js';

const BASE = 'https://gutendex.com/books';

/** Sucht gemeinfreie Kochbuecher nach Stichwort. */
export async function findCookbooks(query = 'cookery', languages = 'en,de') {
  const q = new URLSearchParams({ search: query, languages });
  const data = await getJSON(`${BASE}?${q}`);

  return (data.results || []).map((b) => ({
    id: `gutenberg-${b.id}`,
    title: b.title,
    author: b.authors?.[0]?.name || 'unbekannt',
    year: b.authors?.[0]?.death_year || null,
    url: `https://www.gutenberg.org/ebooks/${b.id}`,
    htmlUrl: b.formats?.['text/html'] || null,
    downloads: b.download_count || 0,
  }));
}
