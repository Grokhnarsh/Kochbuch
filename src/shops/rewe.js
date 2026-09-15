/**
 * REWE-Anbindung: Rezept -> Einkaufsliste -> Bestellung.
 *
 * REWE bietet keine oeffentliche Entwickler-API fuer Warenkorb oder
 * Bestellung an. Verlaesslich oeffentlich ist die Produktsuche des
 * Onlineshops:
 *
 *   https://shop.rewe.de/productList?search=<begriff>
 *
 * Dieser Adapter baut daraus die Uebergabe: jede Position der
 * Einkaufsliste bekommt einen Suchlink in den Shop, wo das Produkt mit
 * einem Klick in den Warenkorb wandert. Wer eine eigene Warenkorb-
 * Schnittstelle hat (Partner-Zugang oder selbst betriebener Proxy),
 * haengt sie ueber `configure({ cartEndpoint })` ein, ohne dass sich
 * am Rest der App etwas aendert.
 */

import { toSearchTerm } from '../sources/ingredients.js';
import { formatAmount } from '../state/units.js';

export const id = 'rewe';
export const label = 'REWE';
export const homepage = 'https://shop.rewe.de/';

/** Optionaler eigener Warenkorb-Endpunkt. */
let cartEndpoint = null;
let cartToken = null;

export function configure({ endpoint = null, token = null } = {}) {
  cartEndpoint = endpoint;
  cartToken = token;
}

export const hasCartApi = () => Boolean(cartEndpoint);

/** Suchlink in den REWE-Onlineshop. */
export function searchUrl(term) {
  return `https://shop.rewe.de/productList?search=${encodeURIComponent(term)}`;
}

/**
 * Uebersetzt die Einkaufsliste in bestellbare Positionen.
 * @param {{aisle:string, items:Array}[]} groups Ergebnis von store.shoppingList()
 */
export function buildOrder(groups) {
  return groups.flatMap((group) =>
    group.items.map((item) => {
      const term = toSearchTerm(item.name);
      return {
        key: item.key,
        aisle: group.aisle,
        name: item.name,
        term,
        amount: item.amount,
        unit: item.unit,
        quantityLabel: formatAmount(item.amount, item.unit),
        url: searchUrl(term),
        recipes: item.recipes,
        done: item.done,
      };
    }),
  );
}

/** Offene Positionen, absteigend nach Abteilung sortiert wie im Markt. */
export function openItems(groups) {
  return buildOrder(groups).filter((i) => !i.done);
}

/**
 * Legt die Positionen in den Warenkorb — nur moeglich, wenn ein eigener
 * Endpunkt konfiguriert ist. Ohne ihn bleibt der Deeplink-Weg.
 * @returns {Promise<{ok:boolean, reason?:string, result?:unknown}>}
 */
export async function addToCart(items) {
  if (!cartEndpoint) {
    return {
      ok: false,
      reason:
        'REWE veröffentlicht keine Warenkorb-API. Ohne eigenen Endpunkt führt der Weg über die Produktsuche.',
    };
  }

  const res = await fetch(cartEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cartToken ? { Authorization: `Bearer ${cartToken}` } : {}),
    },
    body: JSON.stringify({
      items: items.map((i) => ({ term: i.term, amount: i.amount, unit: i.unit })),
    }),
  });

  if (!res.ok) return { ok: false, reason: `Endpunkt antwortete mit ${res.status}` };
  return { ok: true, result: await res.json().catch(() => null) };
}

/** Einkaufsliste als Klartext, etwa zum Teilen per Nachricht. */
export function toPlainText(groups) {
  const lines = [];
  for (const group of groups) {
    lines.push(`— ${group.aisle} —`);
    for (const item of group.items) {
      const amount = formatAmount(item.amount, item.unit);
      lines.push(`  ${amount ? `${amount} ` : ''}${item.name}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

/** Einkaufsliste als CSV, inklusive Suchbegriff und Shoplink. */
export function toCSV(groups) {
  const rows = [['Abteilung', 'Zutat', 'Menge', 'Einheit', 'Suchbegriff', 'REWE-Link']];
  for (const item of buildOrder(groups)) {
    rows.push([
      item.aisle,
      item.name,
      item.amount ?? '',
      item.unit ?? '',
      item.term,
      item.url,
    ]);
  }
  return rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}
