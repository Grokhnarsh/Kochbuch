/**
 * Kochmodus: ein Arbeitsschritt fuellt den Bildschirm, in grosser Schrift,
 * mit Wischen oder Pfeiltasten zum naechsten. Zeitangaben im Schritt
 * werden zu Knoepfen, die einen Timer stellen, und der Bildschirm bleibt
 * an, solange gekocht wird — mit Teig an den Fingern tippt niemand gern
 * auf ein dunkles Handy.
 */

import { esc } from './html.js';
import { dauernIn, dauerText } from '../state/zeiten.js';
import { formatAmount } from '../state/units.js';
import { EINSTELLUNG } from '../sources/thermomix.js';
import { starteTimer, quittiereAlle } from './timer.js';
import { store } from '../state/store.js';
import { befehlAus } from '../state/sprache.js';
import { inMetrisch } from '../state/formen.js';
import { naehrwertRechner } from '../data/index.js';

/** Spracherkennung des Browsers, falls es eine gibt (Chrome, Edge, Safari) */
const Erkennung = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;

/**
 * Ein Arbeitsschritt als HTML: maskiert, Thermomix-Einstellungen
 * hervorgehoben und jede Zeitangabe als Timer-Knopf — auch die in einer
 * Einstellung ("17 Min./100 °C/Stufe 1").
 *
 * @param {string} text
 * @param {{name?:string}} [opt] Name, unter dem ein Timer laeuft
 */
export function schrittHtml(text, { name = '' } = {}) {
  const s = String(text ?? '');
  const dauern = dauernIn(s);

  // Ein Stueck Text mit Timer-Knoepfen fuer die Zeitangaben darin
  const mitZeiten = (von, bis) => {
    let html = '';
    let pos = von;
    for (const d of dauern) {
      if (d.start < von || d.ende > bis) continue;
      const titel = d.bis
        ? `Timer auf ${dauerText(d.sekunden)} stellen (bis ${dauerText(d.bis)})`
        : `Timer auf ${dauerText(d.sekunden)} stellen`;
      html += esc(s.slice(pos, d.start));
      html += `<button type="button" class="zeit-btn" data-sek="${d.sekunden}" data-name="${esc(name)}" title="${esc(titel)}">⏱ ${esc(d.text)}</button>`;
      pos = d.ende;
    }
    return html + esc(s.slice(pos, bis));
  };

  let html = '';
  let pos = 0;
  EINSTELLUNG.lastIndex = 0;
  for (const m of s.matchAll(EINSTELLUNG)) {
    html += mitZeiten(pos, m.index);
    html += `<span class="tm-set" title="Thermomix-Einstellung">${mitZeiten(m.index, m.index + m[0].length)}</span>`;
    pos = m.index + m[0].length;
  }
  return html + mitZeiten(pos, s.length);
}

/** Haengt die Timer-Knoepfe eines Containers an. Einmal je Container. */
export function timerKnoepfe(container) {
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.zeit-btn');
    if (!btn) return;
    e.preventDefault();
    const sek = Number(btn.dataset.sek);
    const name = btn.dataset.name ? `${btn.dataset.name} · ${dauerText(sek)}` : dauerText(sek);
    starteTimer(sek, name);
    btn.classList.add('gestartet');
  });
}

const kurz = (t, n = 26) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

// ---------------------------------------------------------- Bildschirm an

let sperre = null;
let sperreGewuenscht = false;

async function bildschirmAn() {
  sperreGewuenscht = true;
  try {
    if (navigator.wakeLock && document.visibilityState === 'visible') {
      sperre = await navigator.wakeLock.request('screen');
      sperre.addEventListener?.('release', () => { sperre = null; });
    }
  } catch {
    sperre = null; // Akkusparmodus oder nicht erlaubt: dann eben ohne
  }
}

function bildschirmFrei() {
  sperreGewuenscht = false;
  sperre?.release().catch(() => {});
  sperre = null;
}

// Beim Zurueckkehren in den Tab gibt der Browser die Sperre frei.
document.addEventListener('visibilitychange', () => {
  if (sperreGewuenscht && !sperre && document.visibilityState === 'visible') bildschirmAn();
});

// --------------------------------------------------------------- Ansicht

let offen = null;

/**
 * @param {object} recipe
 * @param {{servings?:number}} [opt] Portionen, auf die die Zutaten gerechnet werden
 */
export function openKochmodus(recipe, { servings } = {}) {
  offen?.schliessen();
  const schritte = (recipe.steps || []).filter((s) => String(s).trim());
  if (!schritte.length) return null;

  const portionen = servings || recipe.servings || 2;
  const faktor = portionen / (recipe.servings || 1);
  let nr = 0;
  let zutatenOffen = false;

  const root = document.createElement('div');
  root.className = 'kochmodus';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', `Kochmodus: ${recipe.title}`);
  root.tabIndex = -1;

  const menge = (i) => {
    const amount = i.amount == null ? null : i.amount * faktor;
    const m = store.ansicht.metrisch ? inMetrisch({ ...i, amount }, naehrwertRechner) : null;
    return m ? `≈ ${formatAmount(m.amount, m.unit)}` : formatAmount(amount, i.unit);
  };
  const zutaten = recipe.ingredients.map((i, idx) => `
    <li><label><input type="checkbox" data-zutat="${idx}" />
      <span class="amt">${esc(menge(i) || '')}</span>
      <span>${esc(i.name)}</span></label></li>`).join('');

  root.innerHTML = `
    <header class="km-kopf">
      <div class="km-titel">
        <b>${esc(recipe.title)}</b>
        <span class="km-stand"></span>
      </div>
      ${'speechSynthesis' in window ? '<button type="button" class="ghost-btn km-vorlesen" aria-pressed="false" title="Jeden Schritt vorlesen">🔊 Vorlesen</button>' : ''}
      ${Erkennung() ? '<button type="button" class="ghost-btn km-sprache" aria-pressed="false" title="Mit der Stimme steuern: „weiter“, „zurück“, „Timer 10 Minuten“, „Zutaten“, „Stopp“">🎤 Sprache</button>' : ''}
      <button type="button" class="ghost-btn km-zutaten-btn" aria-expanded="false">Zutaten</button>
      <button type="button" class="icon-btn km-zu" aria-label="Kochmodus beenden">&times;</button>
    </header>
    <div class="km-fortschritt" aria-hidden="true"><span></span></div>
    <div class="km-mitte">
      <aside class="km-zutaten" hidden>
        <h3>Zutaten für ${esc(String(portionen))} ${esc(recipe.yieldUnit || 'Portionen')}</h3>
        <ul>${zutaten}</ul>
      </aside>
      <main class="km-schritt" aria-live="polite"></main>
    </div>
    <footer class="km-fuss">
      <button type="button" class="ghost-btn km-zurueck">‹ Zurück</button>
      <span class="km-hinweis"></span>
      <button type="button" class="primary-btn km-weiter">Weiter ›</button>
    </footer>
  `;

  const $ = (sel) => root.querySelector(sel);
  const schrittEl = $('.km-schritt');
  const zutatenEl = $('.km-zutaten');
  timerKnoepfe(schrittEl);

  function zeichne() {
    const text = schritte[nr];
    schrittEl.innerHTML = `
      <span class="km-nr">${nr + 1}</span>
      <p class="km-text">${schrittHtml(text, { name: `${kurz(recipe.title)}, Schritt ${nr + 1}` })}</p>`;
    $('.km-stand').textContent = `Schritt ${nr + 1} von ${schritte.length}`;
    $('.km-fortschritt span').style.width = `${((nr + 1) / schritte.length) * 100}%`;
    $('.km-zurueck').disabled = nr === 0;
    $('.km-weiter').textContent = nr === schritte.length - 1 ? 'Fertig' : 'Weiter ›';
    if (vorlesen) lies(text);
  }

  // ------------------------------------------------ Vorlesen und Sprache

  let vorlesen = false;
  let hoerer = null;
  let hoerenAn = false;

  function lies(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(`Schritt ${nr + 1}. ${text}`);
    u.lang = 'de-DE';
    window.speechSynthesis.speak(u);
  }

  function hinweis(text) {
    $('.km-hinweis').textContent = text;
  }

  /** Fuehrt einen erkannten Befehl aus */
  function ausfuehren(gehoert) {
    const b = befehlAus(gehoert);
    if (!b) {
      hinweis(`„${gehoert}“ — nicht verstanden`);
      return;
    }
    hinweis(`🎤 „${gehoert}“`);
    if (b.art === 'weiter') gehe(1);
    else if (b.art === 'zurueck') gehe(-1);
    else if (b.art === 'vorlesen') lies(schritte[nr]);
    else if (b.art === 'zutaten') zutatenUmschalten();
    else if (b.art === 'stopp') {
      quittiereAlle();
      window.speechSynthesis?.cancel();
    } else if (b.art === 'beenden') schliessen();
    else if (b.art === 'timer') {
      if (b.sekunden) starteTimer(b.sekunden, `${kurz(recipe.title)} · ${dauerText(b.sekunden)}`);
      else schrittEl.querySelector('.zeit-btn')?.click();
    }
  }

  function hoeren(an) {
    hoerenAn = an;
    $('.km-sprache')?.setAttribute('aria-pressed', String(an));
    if (!an) {
      const h = hoerer;
      hoerer = null;
      try { h?.stop(); } catch { /* schon aus */ }
      hinweis(sperre ? 'Bildschirm bleibt an' : '');
      return;
    }
    const E = Erkennung();
    if (!E) return;
    const h = new E();
    h.lang = 'de-DE';
    h.continuous = true;
    h.interimResults = false;
    h.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      if (r?.isFinal !== false) ausfuehren(r[0].transcript);
    };
    h.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        hoeren(false);
        hinweis('Kein Zugriff auf das Mikrofon');
      }
    };
    // Die Erkennung beendet sich nach einer Weile von selbst; solange gewuenscht, neu starten
    h.onend = () => {
      if (hoerenAn && hoerer === h) setTimeout(() => { if (hoerenAn && hoerer === h) { try { h.start(); } catch { /* laeuft */ } } }, 250);
    };
    hoerer = h;
    try {
      h.start();
      hinweis('🎤 Ich höre: „weiter“, „zurück“, „Timer 10 Minuten“, „Zutaten“, „Stopp“');
    } catch {
      hoeren(false);
    }
  }

  function gehe(delta) {
    const ziel = nr + delta;
    if (ziel >= schritte.length) {
      // Bis zum letzten Schritt gekocht: das kommt in den Kochverlauf
      store.gekocht(recipe.id);
      schliessen();
      return;
    }
    if (ziel < 0) return;
    nr = ziel;
    zeichne();
  }

  function zutatenUmschalten() {
    zutatenOffen = !zutatenOffen;
    zutatenEl.hidden = !zutatenOffen;
    $('.km-zutaten-btn').setAttribute('aria-expanded', String(zutatenOffen));
    root.classList.toggle('mit-zutaten', zutatenOffen);
  }

  function taste(e) {
    if (e.target.closest?.('input, textarea')) return;
    if (e.key === 'Escape') { e.stopImmediatePropagation(); schliessen(); }
    else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); gehe(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); gehe(-1); }
  }

  // Wischen: waagrecht deutlicher als senkrecht, damit Scrollen langer
  // Schritte nicht umblaettert.
  let start = null;
  schrittEl.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY }; });
  schrittEl.addEventListener('pointerup', (e) => {
    if (!start || e.target.closest('.zeit-btn')) { start = null; return; }
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) gehe(dx < 0 ? 1 : -1);
  });

  zutatenEl.addEventListener('change', (e) => {
    const box = e.target.closest('[data-zutat]');
    if (box) box.closest('li').classList.toggle('erledigt', box.checked);
  });

  $('.km-zurueck').addEventListener('click', () => gehe(-1));
  $('.km-weiter').addEventListener('click', () => gehe(1));
  $('.km-zu').addEventListener('click', () => schliessen());
  $('.km-zutaten-btn').addEventListener('click', zutatenUmschalten);
  $('.km-vorlesen')?.addEventListener('click', (e) => {
    vorlesen = !vorlesen;
    e.currentTarget.setAttribute('aria-pressed', String(vorlesen));
    if (vorlesen) lies(schritte[nr]);
    else window.speechSynthesis.cancel();
  });
  $('.km-sprache')?.addEventListener('click', () => hoeren(!hoerenAn));
  document.addEventListener('keydown', taste, true);

  function schliessen() {
    hoeren(false);
    if (vorlesen) window.speechSynthesis?.cancel();
    document.removeEventListener('keydown', taste, true);
    bildschirmFrei();
    root.remove();
    document.body.classList.remove('kocht');
    offen = null;
  }

  document.body.append(root);
  document.body.classList.add('kocht');
  zeichne();
  root.focus();
  bildschirmAn().then(() => {
    $('.km-hinweis').textContent = sperre ? 'Bildschirm bleibt an' : '';
  });

  offen = { schliessen, gehe, ausfuehren, get nr() { return nr; } };
  return offen;
}
