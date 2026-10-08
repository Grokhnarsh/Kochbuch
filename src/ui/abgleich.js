/**
 * Abgleich ueber einen eigenen WebDAV-Speicher, etwa eine Nextcloud.
 *
 * Alle Geraete lesen und schreiben dieselbe Datei. Beim Abgleich wird sie
 * geholt, mit dem eigenen Stand zusammengefuehrt (state/abgleich.js) und,
 * wenn sich etwas geaendert hat, zurueckgeschrieben — mit If-Match, damit
 * kein Geraet die Aenderung eines anderen ueberschreibt, das gerade
 * dazwischen geschrieben hat.
 *
 * Voraussetzungen, die die App nicht selbst schaffen kann:
 * - Der Server muss Anfragen von der Adresse dieser App erlauben (CORS).
 *   Nextcloud tut das von Haus aus nicht; die App "WebAppPassword" oder
 *   eine Zeile in der Webserver-Konfiguration schaltet es frei.
 * - Ein App-Passwort statt des Hauptpassworts. Es liegt im localStorage
 *   dieses Browsers und geht nur an den eingetragenen Server.
 */

import { store } from '../state/store.js';
import {
  zusammenfuehren, gleicheDaten, standAusText, standAlsText, stabil,
} from '../state/abgleich.js';
import { wiederherstellen, FORMAT } from '../state/teilen.js';

const KEY = 'kochbuch.abgleich.v1';
const DATEI = 'kochbuch-abgleich.json';

const leer = { url: '', benutzer: '', passwort: '', aktiv: false, letzter: 0, meldung: '' };

export function abgleichEinstellungen() {
  try {
    const roh = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...leer, ...(roh && typeof roh === 'object' ? roh : {}) };
  } catch {
    return { ...leer };
  }
}

function speichern(e) {
  try { localStorage.setItem(KEY, JSON.stringify(e)); } catch { /* ohne Speicher kein Abgleich */ }
}

export function setzeAbgleich(teil) {
  const neu = { ...abgleichEinstellungen(), ...teil };
  speichern(neu);
  planen();
  return neu;
}

/** Die Adresse der Datei: eine .json-Adresse wie angegeben, sonst ein Ordner */
export function dateiAdresse(url) {
  const u = String(url || '').trim();
  if (!/^https:\/\//i.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(u)) return '';
  return /\.json$/i.test(u) ? u : `${u.replace(/\/+$/, '')}/${DATEI}`;
}

const basic = (b, p) => `Basic ${btoa(unescape(encodeURIComponent(`${b}:${p}`)))}`;

/**
 * Prueft einen Stand wie eine Sicherung. Beide Seiten gehen hier durch,
 * damit sie sich in derselben Form vergleichen — sonst saehe ein fehlendes
 * Vorgabefeld wie eine Aenderung aus, und es wuerde endlos geschrieben.
 */
function bereinigt(stand) {
  const { daten } = wiederherstellen({ format: FORMAT, daten: stand.daten });
  const { fotos, ...ohneFotos } = daten;
  // Was aus den Haushaltsprofilen kommt, speichert der Planer nicht
  const { ernaehrungen, meidet, ...planer } = ohneFotos.planer;
  return { ...stand, daten: { ...ohneFotos, planer } };
}

let laeuft = null;
let beiNeuem = () => {};
const meldungen = new Set();

/** Ruft fn(einstellungen) nach jedem Abgleich */
export function beiAbgleich(fn) {
  meldungen.add(fn);
  return () => meldungen.delete(fn);
}

function melden(teil) {
  const e = setzeAbgleichOhnePlanen(teil);
  for (const fn of meldungen) fn(e);
  return e;
}

function setzeAbgleichOhnePlanen(teil) {
  const neu = { ...abgleichEinstellungen(), ...teil };
  speichern(neu);
  return neu;
}

/** Stand, der zuletzt mit dem Server gleich war; ohne Aenderung kein erneuter Abgleich */
let zuletztGleich = '';

/**
 * Gleicht einmal ab.
 * @returns {Promise<{ok:boolean, meldung:string}>}
 */
export function abgleichen() {
  if (laeuft) return laeuft;
  laeuft = (async () => {
    const e = abgleichEinstellungen();
    const adresse = dateiAdresse(e.url);
    if (!adresse) return { ok: false, meldung: 'Keine gültige https-Adresse eingetragen.' };
    const kopf = { Authorization: basic(e.benutzer, e.passwort) };

    for (let versuch = 0; versuch < 3; versuch += 1) {
      let antwort;
      try {
        antwort = await fetch(adresse, { headers: { ...kopf, Accept: 'application/json' }, cache: 'no-store' });
      } catch {
        const meldung = 'Server nicht erreichbar — offline, falsche Adresse, oder der Server erlaubt diese App nicht (CORS).';
        melden({ meldung });
        return { ok: false, meldung };
      }
      if (antwort.status === 401 || antwort.status === 403) {
        melden({ meldung: 'Anmeldung abgelehnt. Benutzer und App-Passwort prüfen.' });
        return { ok: false, meldung: abgleichEinstellungen().meldung };
      }
      let fern = null;
      let etag = null;
      if (antwort.ok) {
        try {
          fern = bereinigt(standAusText(await antwort.text()));
        } catch (err) {
          melden({ meldung: err.message });
          return { ok: false, meldung: err.message };
        }
        etag = antwort.headers.get('ETag');
      } else if (antwort.status !== 404) {
        melden({ meldung: `Der Server antwortete mit ${antwort.status}.` });
        return { ok: false, meldung: abgleichEinstellungen().meldung };
      }

      const roh = store.stand();
      const lokal = bereinigt(roh);
      const neu = fern ? zusammenfuehren(lokal, fern) : lokal;

      // Erst lokal uebernehmen, was von anderen Geraeten kam
      if (!gleicheDaten(neu, lokal) || stabil(neu.zeiten) !== stabil(lokal.zeiten)) {
        const eigeneVorher = new Set(roh.daten.eigene.map((r) => r.id));
        const importeVorher = new Set(roh.daten.importe.map((r) => r.id));
        store.standSetzen(neu);
        beiNeuem({ eigeneVorher, importeVorher });
      }

      // Dann schreiben, wenn der Server etwas nicht hat
      if (!fern || !gleicheDaten(neu, fern) || stabil(neu.zeiten) !== stabil(fern.zeiten)) {
        let put;
        try {
          put = await fetch(adresse, {
            method: 'PUT',
            headers: {
              ...kopf,
              'Content-Type': 'application/json',
              ...(etag ? { 'If-Match': etag } : fern ? {} : { 'If-None-Match': '*' }),
            },
            body: standAlsText(neu),
          });
        } catch {
          melden({ meldung: 'Schreiben fehlgeschlagen: Server nicht erreichbar.' });
          return { ok: false, meldung: abgleichEinstellungen().meldung };
        }
        // Ein anderes Geraet war schneller: noch einmal holen und mischen
        if (put.status === 412) continue;
        if (!put.ok) {
          const hinweis = put.status === 409 ? ' Gibt es den Ordner?' : '';
          melden({ meldung: `Schreiben abgelehnt (${put.status}).${hinweis}` });
          return { ok: false, meldung: abgleichEinstellungen().meldung };
        }
      }
      zuletztGleich = stabil(store.stand().daten);
      melden({ letzter: Date.now(), meldung: '' });
      return { ok: true, meldung: '' };
    }
    melden({ meldung: 'Andere Geräte schreiben gerade; später noch einmal.' });
    return { ok: false, meldung: abgleichEinstellungen().meldung };
  })().finally(() => {
    laeuft = null;
  });
  return laeuft;
}

// ------------------------------------------------------------ von selbst

let takt = null;
let verzoegert = null;
let abo = null;

/** Nach Aenderungen, beim Zurueckkehren in die App und jede Minute */
function planen() {
  const e = abgleichEinstellungen();
  clearInterval(takt);
  takt = null;
  abo?.();
  abo = null;
  if (!e.aktiv || !dateiAdresse(e.url)) return;
  takt = setInterval(() => {
    if (document.visibilityState === 'visible') abgleichen();
  }, 60000);
  abo = store.subscribe(() => {
    clearTimeout(verzoegert);
    verzoegert = setTimeout(() => {
      if (stabil(store.stand().daten) !== zuletztGleich) abgleichen();
    }, 4000);
  });
}

/**
 * @param {{onNeu?:(vorher:{eigeneVorher:Set<string>, importeVorher:Set<string>})=>void}} opt
 *        onNeu haengt eigene und importierte Rezepte nach einem Abgleich neu ein
 */
export function initAbgleich({ onNeu } = {}) {
  if (onNeu) beiNeuem = onNeu;
  planen();
  document.addEventListener('visibilitychange', () => {
    const e = abgleichEinstellungen();
    if (document.visibilityState === 'visible' && e.aktiv && dateiAdresse(e.url)) abgleichen();
  });
  const e = abgleichEinstellungen();
  if (e.aktiv && dateiAdresse(e.url)) abgleichen();
}
