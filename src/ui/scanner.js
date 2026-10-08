/**
 * Barcode-Scanner fuer den Vorrat: Kamera auf die Packung, das Produkt
 * kommt aus Open Food Facts (ODbL), der Posten steht im Eingabefeld.
 *
 * Die Kamera-Erkennung (BarcodeDetector) gibt es in Chrome und Edge auf
 * Android und dem Mac, nicht in Firefox und nicht in Safari auf dem
 * iPhone. Dort, und wenn die Kamera nicht will, tippt man die Nummer
 * unter dem Strichcode ein.
 *
 * Abgefragt wird nur die Nummer; Open Food Facts erfaehrt, welches
 * Produkt gesucht wurde, sonst nichts.
 */

import { esc } from './html.js';
import { istEan, produktAdresse, postenAusProdukt } from '../state/produkt.js';
import { allergenById } from '../state/allergens.js';

export const kannScannen = () => 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia);

/** Fragt Open Food Facts nach einem Produkt */
export async function produktSuchen(ean) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(produktAdresse(ean), { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Open Food Facts antwortete mit ${res.status}`);
    return postenAusProdukt(await res.json());
  } finally {
    clearTimeout(t);
  }
}

/**
 * Baut den Scanner in einen Container ein.
 * @param {HTMLElement} host
 * @param {(posten:object)=>void} onTreffer bekommt den Posten aus postenAusProdukt()
 * @returns {{stop:()=>void}}
 */
export function scannerEinbauen(host, onTreffer) {
  host.innerHTML = `
    <div class="scanner">
      ${kannScannen() ? '<video class="scanner-bild" playsinline muted aria-label="Kamerabild"></video>' : ''}
      <form class="vorrat-form scanner-form">
        <input type="text" name="ean" inputmode="numeric" pattern="[0-9]*" maxlength="13"
          placeholder="Nummer unter dem Strichcode" aria-label="Strichcode-Nummer" autocomplete="off" />
        <button type="submit" class="ghost-btn">Suchen</button>
      </form>
      <p class="scanner-status" aria-live="polite">${kannScannen() ? 'Strichcode vor die Kamera halten …'
        : 'Dieser Browser erkennt keine Strichcodes per Kamera. Die Nummer unter dem Strichcode eintippen.'}</p>
      <p class="nutri-note">Produktdaten: <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer">Open Food Facts</a>,
        Lizenz ODbL — von Freiwilligen gepflegt, nicht immer vollständig.</p>
    </div>`;
  const status = host.querySelector('.scanner-status');
  const video = host.querySelector('video');
  let strom = null;
  let takt = null;
  let aus = false;
  let sucht = false;

  async function nachschlagen(ean) {
    if (sucht) return;
    if (!istEan(ean)) {
      status.textContent = `${ean} ist keine gültige Strichcode-Nummer.`;
      return;
    }
    sucht = true;
    status.textContent = `Suche ${ean} …`;
    try {
      const p = await produktSuchen(ean);
      if (aus) return;
      if (!p) {
        status.textContent = `Produkt ${ean} ist bei Open Food Facts nicht eingetragen. Bitte von Hand eintragen.`;
        return;
      }
      const allergene = p.allergene.map((id) => allergenById.get(id)?.short).filter(Boolean);
      status.innerHTML = `Gefunden: <b>${esc(p.name)}</b>${p.marke ? ` (${esc(p.marke)})` : ''}${
        allergene.length ? ` · enthält ${esc(allergene.join(', '))}` : ''}`;
      onTreffer(p);
    } catch (e) {
      if (!aus) status.textContent = `Keine Verbindung zu Open Food Facts${e?.message ? ` (${e.message})` : ''}.`;
    } finally {
      sucht = false;
    }
  }

  host.querySelector('.scanner-form').addEventListener('submit', (e) => {
    e.preventDefault();
    nachschlagen(e.target.elements.ean.value.replace(/\D/g, ''));
  });

  async function kamera() {
    try {
      strom = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (aus) { stop(); return; }
      video.srcObject = strom;
      await video.play();
      const formate = await window.BarcodeDetector.getSupportedFormats?.() || [];
      const gewuenscht = ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter((f) => !formate.length || formate.includes(f));
      const erkenner = new window.BarcodeDetector({ formats: gewuenscht });
      let zuletzt = '';
      takt = setInterval(async () => {
        if (sucht || aus || video.readyState < 2) return;
        try {
          const codes = await erkenner.detect(video);
          const code = codes.find((c) => istEan(c.rawValue))?.rawValue;
          if (code && code !== zuletzt) {
            zuletzt = code;
            navigator.vibrate?.(60);
            nachschlagen(code);
          }
        } catch { /* naechster Versuch */ }
      }, 350);
    } catch {
      status.textContent = 'Die Kamera ließ sich nicht öffnen. Die Nummer unter dem Strichcode eintippen.';
      video?.remove();
    }
  }

  function stop() {
    aus = true;
    clearInterval(takt);
    for (const spur of strom?.getTracks() || []) spur.stop();
    strom = null;
  }

  if (video) kamera();
  else queueMicrotask(() => host.querySelector('[name="ean"]')?.focus());
  return { stop };
}
