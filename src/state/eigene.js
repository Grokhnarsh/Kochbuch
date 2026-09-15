/**
 * Eigene Rezepte: anlegen, aendern, loeschen, sichern.
 *
 * Sie liegen im localStorage dieses Browsers — die App hat keinen
 * Server, der sie aufbewahren koennte. Deshalb gibt es die Sammlung
 * auch als Datei zum Herunterladen und Wiedereinlesen: ein anderer
 * Rechner, ein geleerter Browser, und sie waeren sonst weg.
 */

import { store } from './store.js';
import { registerSource, upsertRecipe, removeRecipe, recipeById } from '../data/index.js';
import { EIGENE_QUELLE, slug, istEigenes, ausFormular, zeilen, pruefe } from './rezeptform.js';

export { EIGENE_QUELLE, slug, istEigenes, ausFormular, zeilen, pruefe };

/** Liest die gespeicherten Rezepte und haengt sie in den Index. */
export function ladeEigene() {
  registerSource(EIGENE_QUELLE);
  const gespeichert = store.loadOwn();
  for (const r of gespeichert) upsertRecipe(r);
  return gespeichert;
}

/** Speichert ein Rezept dauerhaft und aktualisiert den Index. */
export function speichern(rezept) {
  store.saveOwn(rezept);
  return upsertRecipe(rezept);
}

/**
 * Loescht ein eigenes Rezept — auch aus allen Wochenplaenen, sonst
 * bliebe dort ein Eintrag ohne Rezept dahinter stehen.
 */
export function loeschen(id) {
  store.removeOwn(id);
  store.purgeRecipe(id);
  removeRecipe(id);
}

/** Alle eigenen Rezepte, so wie sie gespeichert sind. */
export const alleEigenen = () => store.loadOwn();

/** Die Sammlung als Datei — der einzige Weg, sie mitzunehmen. */
export function alsDatei() {
  return JSON.stringify(
    { sourceId: EIGENE_QUELLE.id, exportiert: new Date().toISOString(), recipes: alleEigenen() },
    null,
    2,
  );
}

/**
 * Liest eine gesicherte Datei wieder ein. Bestehende Rezepte mit
 * gleicher Id werden ersetzt, alles andere kommt dazu.
 *
 * @returns {{gelesen:number, ersetzt:number}}
 */
export function ausDatei(text) {
  const doc = JSON.parse(text);
  const liste = Array.isArray(doc) ? doc : doc.recipes;
  if (!Array.isArray(liste)) throw new Error('Die Datei enthält keine Rezeptliste.');

  let ersetzt = 0;
  for (const roh of liste) {
    if (!roh?.title || !Array.isArray(roh.ingredients)) continue;
    const rezept = { ...roh, sourceId: EIGENE_QUELLE.id, id: roh.id || `eigen-${slug(roh.title)}` };
    if (recipeById.has(rezept.id)) ersetzt += 1;
    speichern(rezept);
  }
  return { gelesen: liste.length, ersetzt };
}
