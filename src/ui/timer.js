/**
 * Kuechentimer. Mehrere laufen nebeneinander ("Nudeln", "Sosse") und
 * stehen in einer schwebenden Leiste, ob der Kochmodus offen ist oder
 * nicht. Abgelaufen klingelt es, bis jemand quittiert.
 *
 * Gerechnet wird mit dem Endzeitpunkt, nicht mit gezaehlten Ticks: ein
 * Browser bremst Intervalle im Hintergrund, die Uhr laeuft trotzdem
 * richtig. Die Timer liegen im localStorage und ueberstehen so auch ein
 * versehentliches Neuladen.
 */

import { uhr, dauerText } from '../state/zeiten.js';
import { esc } from './html.js';

const KEY = 'kochbuch.timer.v1';
let timer = laden();
let takt = null;
let ton = null;
let leiste = null;
const beobachter = new Set();

function laden() {
  try {
    const liste = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(liste) ? liste.filter((t) => t && Number.isFinite(t.gesamt)) : [];
  } catch {
    return [];
  }
}

function sichern() {
  try { localStorage.setItem(KEY, JSON.stringify(timer)); } catch { /* ohne Speicher nur fuer die Sitzung */ }
}

/** Verbleibende Sekunden eines Timers. */
export function rest(t, jetzt = Date.now()) {
  return t.pausiert != null ? t.pausiert : Math.max(0, (t.ende - jetzt) / 1000);
}

export const laufende = () => timer.slice();

/** Wird bei jeder Aenderung und jedem Tick aufgerufen. */
export function beobachte(fn) {
  beobachter.add(fn);
  return () => beobachter.delete(fn);
}

/**
 * @param {number} sekunden
 * @param {string} name Wofuer, etwa "Schritt 3: 15 Minuten"
 */
export function starteTimer(sekunden, name) {
  const t = {
    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name || dauerText(sekunden),
    gesamt: sekunden,
    ende: Date.now() + sekunden * 1000,
    pausiert: null,
    fertig: false,
  };
  timer.push(t);
  // Den Ton beim Klick vorbereiten: Browser erlauben Audio erst nach
  // einer Nutzeraktion, und das Klingeln kommt Minuten spaeter.
  tonBereit();
  aenderung();
  return t;
}

export function pausiere(id) {
  const t = timer.find((x) => x.id === id);
  if (!t || t.fertig) return;
  if (t.pausiert == null) t.pausiert = rest(t);
  else {
    t.ende = Date.now() + t.pausiert * 1000;
    t.pausiert = null;
  }
  aenderung();
}

export function entferne(id) {
  timer = timer.filter((x) => x.id !== id);
  aenderung();
}

function aenderung() {
  sichern();
  ticken();
  if (timer.length && !takt) takt = setInterval(ticken, 250);
  if (!timer.length && takt) {
    clearInterval(takt);
    takt = null;
  }
}

function ticken() {
  const jetzt = Date.now();
  let neuFertig = false;
  for (const t of timer) {
    if (!t.fertig && t.pausiert == null && t.ende <= jetzt) {
      t.fertig = true;
      neuFertig = true;
    }
  }
  if (neuFertig) {
    sichern();
    // Vibrieren duerfen Seiten erst nach einer Beruehrung; nach dem
    // Neuladen mit einem abgelaufenen Timer gibt es die noch nicht.
    if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.([300, 150, 300, 150, 300]);
  }
  klingeln(timer.some((t) => t.fertig));
  zeichneLeiste();
  for (const fn of beobachter) fn(timer);
}

// ------------------------------------------------------------------ Ton

function tonBereit() {
  if (ton) return ton;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    ton = { ctx: new Ctx(), naechster: 0 };
  } catch {
    ton = null;
  }
  return ton;
}

/** Drei kurze Pieptoene, wiederholt, solange ein Timer abgelaufen ist. */
function klingeln(an) {
  if (!an || !ton) return;
  const { ctx } = ton;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (ctx.currentTime < ton.naechster) return;
  for (let i = 0; i < 3; i += 1) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + i * 0.22;
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.2);
  }
  ton.naechster = ctx.currentTime + 1.6;
}

// --------------------------------------------------------------- Leiste

function zeichneLeiste() {
  if (!leiste) {
    leiste = document.createElement('div');
    leiste.className = 'timer-bar';
    leiste.setAttribute('aria-live', 'polite');
    leiste.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-timer]');
      if (!btn) return;
      const { timer: id, aktion } = btn.dataset;
      if (aktion === 'pause') pausiere(id);
      else entferne(id);
    });
    document.body.append(leiste);
  }
  leiste.hidden = !timer.length;
  if (!timer.length) {
    leiste.replaceChildren();
    return;
  }

  // Nur neu aufbauen, was sich sichtbar aendert; sonst verlöre ein Knopf
  // unter dem Finger alle 250 ms seinen Zustand.
  const signatur = timer.map((t) => `${t.id}${t.fertig}${t.pausiert != null}`).join('|');
  if (leiste.dataset.signatur !== signatur) {
    leiste.dataset.signatur = signatur;
    leiste.innerHTML = timer.map((t) => `
      <div class="timer-chip${t.fertig ? ' fertig' : ''}${t.pausiert != null ? ' pausiert' : ''}" data-id="${esc(t.id)}">
        <span class="timer-name">${esc(t.name)}</span>
        <b class="timer-zeit"></b>
        ${t.fertig ? '' : `<button type="button" class="timer-btn" data-timer="${esc(t.id)}" data-aktion="pause"
          aria-label="${t.pausiert != null ? 'Weiter' : 'Anhalten'}">${t.pausiert != null ? '▶' : '❚❚'}</button>`}
        <button type="button" class="timer-btn" data-timer="${esc(t.id)}" data-aktion="weg"
          aria-label="${t.fertig ? 'Quittieren' : 'Timer löschen'}">${t.fertig ? 'OK' : '×'}</button>
      </div>`).join('');
  }
  const jetzt = Date.now();
  for (const t of timer) {
    const zeit = leiste.querySelector(`[data-id="${CSS.escape(t.id)}"] .timer-zeit`);
    if (zeit) zeit.textContent = t.fertig ? 'Fertig!' : uhr(rest(t, jetzt));
  }
}

/** Gespeicherte Timer nach dem Laden wieder anzeigen. */
export function initTimer() {
  if (timer.length) aenderung();
}
