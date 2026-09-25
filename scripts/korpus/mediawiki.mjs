/**
 * Massenabruf aus MediaWiki-Wikis: alle Seiten einer Kategorie, der
 * Wikitext und die Kategorien von fuenfzig Seiten je Anfrage.
 *
 * Fuenfzig ist die Obergrenze der API fuer Seiteninhalte je Aufruf. Fuer
 * das Koch-Wiki heisst das rund zweihundert Anfragen statt neuntausend.
 */

import { abruf, apiAdresse } from './abruf.mjs';

/**
 * Titel aller Seiten einer Kategorie (nur Artikel, keine Unterkategorien).
 * @returns {Promise<string[]>}
 */
export async function kategorieSeiten(api, kategorie, { abstand } = {}) {
  const titel = [];
  let weiter = {};
  do {
    const antwort = await abruf(apiAdresse(api, {
      action: 'query',
      list: 'categorymembers',
      cmtitle: kategorie,
      cmnamespace: '0',
      cmtype: 'page',
      cmlimit: '500',
      ...weiter,
    }), { abstand });
    titel.push(...(antwort.query?.categorymembers || []).map((m) => m.title));
    weiter = antwort.continue || null;
  } while (weiter);
  return titel;
}

/** Unterkategorien einer Kategorie. */
export async function unterkategorien(api, kategorie, { abstand } = {}) {
  const namen = [];
  let weiter = {};
  do {
    const antwort = await abruf(apiAdresse(api, {
      action: 'query',
      list: 'categorymembers',
      cmtitle: kategorie,
      cmtype: 'subcat',
      cmlimit: '500',
      ...weiter,
    }), { abstand });
    namen.push(...(antwort.query?.categorymembers || []).map((m) => m.title));
    weiter = antwort.continue || null;
  } while (weiter);
  return namen;
}

/**
 * Wikitext und Kategorien vieler Seiten. Weiterleitungen werden
 * aufgeloest; der Schluessel ist der Titel der Zielseite.
 *
 * @param {string} api
 * @param {string[]} titel
 * @param {{abstand?:number, fortschritt?:(n:number, gesamt:number)=>void}} [optionen]
 * @returns {Promise<Map<string, {wikitext:string, kategorien:string[]}>>}
 */
export async function seitenInhalte(api, titel, { abstand, fortschritt } = {}) {
  const ergebnis = new Map();
  for (let i = 0; i < titel.length; i += 50) {
    const stapel = titel.slice(i, i + 50);
    const seiten = new Map();
    let weiter = {};
    // Die Kategorien eines Stapels koennen auf mehrere Antworten verteilt
    // sein ("clcontinue"); die Inhalte kommen mit der ersten.
    do {
      const antwort = await abruf(apiAdresse(api, {
        action: 'query',
        prop: 'revisions|categories',
        rvprop: 'content',
        rvslots: 'main',
        cllimit: 'max',
        redirects: '1',
        titles: stapel.join('|'),
        ...weiter,
      }), { abstand });
      for (const seite of antwort.query?.pages || []) {
        if (seite.missing || seite.invalid) continue;
        const bisher = seiten.get(seite.title) || { wikitext: '', kategorien: [] };
        const text = seite.revisions?.[0]?.slots?.main?.content;
        if (text) bisher.wikitext = text;
        for (const k of seite.categories || []) bisher.kategorien.push(k.title.replace(/^[^:]+:/, ''));
        seiten.set(seite.title, bisher);
      }
      weiter = antwort.continue || null;
    } while (weiter);

    for (const [name, inhalt] of seiten) if (inhalt.wikitext) ergebnis.set(name, inhalt);
    fortschritt?.(Math.min(i + 50, titel.length), titel.length);
  }
  return ergebnis;
}
