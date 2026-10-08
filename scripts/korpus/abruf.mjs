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

/** Wartet, bis der Mindestabstand zum vorigen Abruf beim selben Server um ist. */
async function takt(host, abstand) {
  const warte = (letzter.get(host) || 0) + abstand - Date.now();
  if (warte > 0) await pause(warte);
  letzter.set(host, Date.now());
}

/**
 * Ziel einer Weiterleitung, ohne ihr zu folgen — etwa vom Forum-Eintrag
 * eines Buchs zu dessen PDF. Das Ergebnis wird wie jeder Abruf gemerkt.
 *
 * @returns {Promise<string|null>} Adresse aus "Location" oder null
 */
export async function weiterleitung(url, { abstand = 3000 } = {}) {
  mkdirSync(CACHE, { recursive: true });
  const datei = path.join(CACHE, `${createHash('sha1').update(`ziel:${url}`).digest('hex')}`);
  if (existsSync(datei)) return JSON.parse(readFileSync(datei, 'utf8')).ziel;
  await takt(new URL(url).host, abstand);
  const antwort = await fetch(url, { redirect: 'manual', headers: { 'user-agent': UA } });
  const ort = antwort.headers.get('location');
  const ziel = ort ? new URL(ort, url).href : null;
  writeFileSync(datei, JSON.stringify({ ziel, status: antwort.status }));
  return ziel;
}

/**
 * Laedt eine Datei (etwa ein PDF) nach `ziel`. Grosse Dateien kommen nicht
 * in den Cache — gemerkt wird, was daraus gelesen wurde.
 */
export async function ladeDatei(url, ziel, { abstand = 10000 } = {}) {
  const host = new URL(url).host;
  for (let versuch = 0; versuch < 5; versuch += 1) {
    await takt(host, abstand);
    let antwort;
    try {
      antwort = await fetch(url, { headers: { 'user-agent': UA } });
    } catch (err) {
      process.stderr.write(`  ${host}: ${err.message}, neuer Versuch\n`);
      await pause(10000 * (versuch + 1));
      continue;
    }
    if (antwort.status === 429 || antwort.status === 503) {
      await pause((Number(antwort.headers.get('retry-after')) || 30) * 1000);
      continue;
    }
    if (!antwort.ok) throw new Error(`${antwort.status} ${url}`);
    writeFileSync(ziel, Buffer.from(await antwort.arrayBuffer()));
    return ziel;
  }
  throw new Error(`nicht erreichbar: ${url}`);
}

/** Merkt sich ein beliebiges Ergebnis unter einem Schluessel (etwa den Text eines PDFs). */
export function gemerkt(schluessel, erzeugen) {
  mkdirSync(CACHE, { recursive: true });
  const datei = path.join(CACHE, createHash('sha1').update(`wert:${schluessel}`).digest('hex'));
  if (existsSync(datei)) return JSON.parse(readFileSync(datei, 'utf8'));
  const wert = erzeugen();
  if (wert instanceof Promise) {
    return wert.then((w) => { writeFileSync(datei, JSON.stringify(w)); return w; });
  }
  writeFileSync(datei, JSON.stringify(wert));
  return wert;
}
