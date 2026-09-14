/**
 * Registry der Supermarkt-Anbindungen. Jeder Adapter liefert dieselbe
 * Schnittstelle, sodass weitere Haendler ergaenzt werden koennen.
 */

import * as rewe from './rewe.js';

export const shops = [rewe];
export const defaultShop = rewe;
export const shopById = new Map(shops.map((s) => [s.id, s]));
