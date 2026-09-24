/**
 * Kennzahlen der geplanten Woche in der rechten Randspalte.
 */

import { store } from '../state/store.js';

const host = document.getElementById('week-summary');

function minutesLabel(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} Min.`;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

export function renderSummary() {
  const s = store.stats();

  host.innerHTML = `
    <span><b>${s.count}</b> von ${s.totalSlots} Feldern</span>
    <span><b>${s.plannedDays}</b> von 7 Tagen</span>
    <span>Kochzeit <b>${minutesLabel(s.cookMinutes)}</b></span>
    <button class="link-btn" type="button" data-naehrwerte title="Nährwerte der Woche ansehen">
      Ø <b>${s.kcalAvg || '—'}</b> kcal/Tag je Person</button>
  `;
}

export function initSummary({ onNaehrwerte } = {}) {
  renderSummary();
  store.subscribe(renderSummary);
  // Der Knopf wird bei jedem Neuzeichnen ersetzt, der Klick deshalb am Wirt abgefangen.
  host.addEventListener('click', (e) => {
    if (e.target.closest('[data-naehrwerte]')) onNaehrwerte?.();
  });
}
