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
    <h3>Diese Woche</h3>
    <div class="summary-row"><span>Gerichte</span><b>${s.count} / ${s.totalSlots}</b></div>
    <div class="summary-row"><span>Geplante Tage</span><b>${s.plannedDays} / 7</b></div>
    <div class="summary-row"><span>Kochzeit</span><b>${minutesLabel(s.cookMinutes)}</b></div>
    <div class="summary-row"><span>Ø kcal / Tag</span><b>${s.kcalAvg || '—'}</b></div>
    <div class="summary-bar"><i style="width:${Math.round(s.fill * 100)}%"></i></div>
  `;
}

export function initSummary() {
  renderSummary();
  store.subscribe(renderSummary);
}
