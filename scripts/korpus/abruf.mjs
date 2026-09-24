/**
 * Hoeflicher Abruf fuer das Import-Werkzeug.
 *
 * Offene Wikis und Archive leben von Spenden und vertragen keine
 * Stosslast. Deshalb: ein Client, der sich mit Namen und Kontaktadresse
 * meldet (so verlangt es die Wikimedia-Richtlinie), ein Mindestabstand
 * je Server, Warten nach "429"/"503" so lange, wie der Server sagt, und
 * ein Plattencache — ein zweiter Lauf fragt nichts erneut.
 *
 * Der Cache liegt unter data/cache/ und ist vom Repository ausgenommen.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const UA = 'KochbuchImport/1.0 (https://github.com/Grokhnarsh/Kochbuch)';

const CACHE = process.env.KORPUS_CACHE || 'data/cache';
const pause = (ms) => new Promise((fertig) => setTimeout(fertig, ms));
const letzter = new Map();

/**
 * @param {string} url
 * @param {{abstand?:number, json?:boolean, headers?:object, frisch?:boolean}} [optionen]
 *        abstand: Mindestabstand zum vorigen Abruf beim selben Server in ms
 */
export async function abruf(url, { abstand = 1500, json = true, headers = {}, frisch = false } = {}) {
  mkdirSync(CACHE, { recursive: true });
  const datei = path.join(CACHE, createHash('sha1').update(url).digest('hex'));
  if (!frisch && existsSync(datei)) {
    const text = readFileSync(datei, 'utf8');
    return json ? JSON.parse(text) : text;
  }

  const host = new URL(url).host;
  for (let versuch = 0; versuch < 8; versuch += 1) {
    const warte = (letzter.get(host) || 0) + abstand - Date.now();
    if (warte > 0) await pause(warte);
    letzter.set(host, Date.now());

    let antwort;
    try {
      antwort = await fetch(url, { headers: { 'user-agent': UA, 'api-user-agent': UA, ...headers } });
    } catch (err) {
      // Netzaussetzer: kurz warten, dann noch einmal
      process.stderr.write(`  ${host}: ${err.message}, neuer Versuch\n`);
      await pause(5000 * (versuch + 1));
      continue;
    }

    if (antwort.status === 429 || antwort.status === 503) {
      const sekunden = Number(antwort.headers.get('retry-after')) || 10 * (versuch + 1);
      process.stderr.write(`  ${antwort.status} von ${host}, warte ${sekunden} s\n`);
      await pause(sekunden * 1000);
      continue;
    }
    if (!antwort.ok) throw new Error(`${antwort.status} ${url}`);

    const text = await antwort.text();
    // MediaWiki meldet Drosselung auch im Inhalt, mit Status 200.
    if (json && /"code"\s*:\s*"(ratelimited|maxlag)"/.test(text.slice(0, 400))) {
      process.stderr.write(`  ${host} drosselt, warte 30 s\n`);
      await pause(30000);
      continue;
    }
    writeFileSync(datei, text);
    return json ? JSON.parse(text) : text;
  }
  throw new Error(`dauerhaft gedrosselt oder nicht erreichbar: ${url}`);
}

/** Adresse eines MediaWiki-API-Aufrufs im Format 2. */
export const apiAdresse = (basis, parameter) =>
  `${basis}?${new URLSearchParams({ format: 'json', formatversion: '2', ...parameter })}`;
