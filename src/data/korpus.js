/**
 * Laedt die grossen Rezeptsammlungen nach dem ersten Bild.
 *
 * Koch-Wiki, Wikibooks, Rezepte-Wiki und die historischen Kochbuecher
 * bringen zusammen zehntausend Rezepte und mehr. Im Bundle wuerden sie
 * den Start um Sekunden verzoegern; deshalb liegen sie als statische
 * Dateien unter public/korpus/ und werden geholt, sobald der Plan steht.
 * Ein Verzeichnis (index.json) nennt die Teile, jeder Teil ist ein Buch
 * im selben Format wie die mitgelieferten, mit vorberechneter
 * Zusammenfassung je Rezept.
 *
 * Fehlt das Verzeichnis — etwa in einem Test ohne Korpus —, bleibt es
 * bei den mitgelieferten Buechern. Die App funktioniert auch so.
 */

import { vorbereiten, aufnehmen } from './index.js';

/** Rezepte je Scheibe; dazwischen darf der Browser zeichnen. */
const SCHEIBE = 400;

/** Ordner der Teile, relativ zur Seite: so funktioniert es unter jedem Pfad. */
const BASIS = `${import.meta.env?.BASE_URL ?? './'}korpus/`;

const naechsterTakt = () => new Promise((fertig) => setTimeout(fertig, 0));

/**
 * @param {{onTeil?:(neu:object[], teil:object, stand:{geladen:number, gesamt:number})=>void,
 *          onFehler?:(fehler:Error, teil:object|null)=>void,
 *          laden?:(pfad:string)=>Promise<any>}} [optionen]
 * @returns {Promise<{rezepte:number, teile:number, fehler:number}>}
 */
export async function ladeKorpus({ onTeil, onFehler, laden = holeJson } = {}) {
  let verzeichnis;
  try {
    verzeichnis = await laden(`${BASIS}index.json`);
  } catch (err) {
    onFehler?.(err, null);
    return { rezepte: 0, teile: 0, fehler: 1 };
  }

  const teile = verzeichnis?.teile || [];
  const stand = { geladen: 0, gesamt: teile.length };
  let rezepte = 0;
  let fehler = 0;

  // Nacheinander statt alle auf einmal: jeder Teil ist sofort nutzbar,
  // und das Handy muss nie mehrere grosse Dateien gleichzeitig halten.
  for (const teil of teile) {
    try {
      const buch = await laden(`${BASIS}${teil.datei}`);
      // Zwischen Laden und Einsortieren darf der Browser zeichnen — und
      // zwischen den Scheiben auch: die Suche bleibt bedienbar.
      const fertig = [];
      for (let von = 0; von < buch.recipes.length; von += SCHEIBE) {
        await naechsterTakt();
        fertig.push(...vorbereiten(buch, von, von + SCHEIBE));
      }
      const neu = aufnehmen(fertig);
      rezepte += neu.length;
      stand.geladen += 1;
      onTeil?.(neu, teil, { ...stand });
    } catch (err) {
      fehler += 1;
      onFehler?.(err, teil);
    }
    await naechsterTakt();
  }

  return { rezepte, teile: stand.geladen, fehler };
}

async function holeJson(pfad) {
  const res = await fetch(pfad);
  if (!res.ok) throw new Error(`${pfad}: ${res.status}`);
  return res.json();
}
