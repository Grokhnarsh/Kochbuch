/**
 * Druckansichten: Wochenplan, Einkaufsliste und ein Rezeptheft der Woche.
 * Gedruckt wird ueber den Druckdialog des Browsers; dort laesst sich auch
 * "Als PDF speichern" waehlen. Jedes Rezept im Heft traegt seine
 * Quellenangabe und Lizenz — fuer frei lizenzierte Rezepte gehoert die
 * Namensnennung auch aufs Papier.
 */

import { store, isoWeekNumber, slotId } from '../state/store.js';
import { recipeById, DAYS, MEALS, vollstaendig } from '../data/index.js';
import { formatAmount } from '../state/units.js';
import { esc } from './html.js';

const datum = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

function kopf(titel) {
  const start = store.weekStart;
  const ende = store.dateOf(6);
  return `<header class="druck-kopf"><h1>${esc(titel)}</h1>
    <p>KW ${isoWeekNumber(start)} · ${datum(start)} bis ${datum(ende)}</p></header>`;
}

function planHtml() {
  const zeilen = DAYS.map((d, i) => `<tr><th scope="row">${esc(d.label)}<br /><small>${datum(store.dateOf(i))}</small></th>${
    MEALS.map((m) => {
      const e = store.week[slotId(i, m.id)];
      const r = e && recipeById.get(e.recipeId);
      const zusatz = e?.rest ? 'Rest vom Vortag' : `${e?.servings} ${r?.yieldUnit || 'Port.'}${e?.extra ? `, +${e.extra} vorgekocht` : ''}`;
      return `<td>${r ? `${esc(r.title)}<br /><small>${esc(zusatz)}</small>` : ''}</td>`;
    }).join('')}</tr>`).join('');
  return `${kopf('Wochenplan')}
    <table class="druck-plan"><thead><tr><th></th>${MEALS.map((m) => `<th scope="col">${esc(m.label)}</th>`).join('')}</tr></thead>
    <tbody>${zeilen}</tbody></table>`;
}

function listeHtml() {
  const { groups, gedeckt } = store.einkauf();
  if (!groups.length && !gedeckt.length) return `${kopf('Einkaufsliste')}<p>Der Wochenplan ist leer.</p>`;
  return `${kopf('Einkaufsliste')}
    <div class="druck-spalten">${groups.map((g) => `
      <section><h2>${esc(g.aisle)}</h2><ul class="druck-liste">${g.items.map((i) => `
        <li><span class="kaestchen"></span>${esc(i.name)} <b>${esc(formatAmount(i.amount, i.unit) || '')}</b></li>`).join('')}
      </ul></section>`).join('')}
    </div>
    ${gedeckt.length ? `<p class="druck-klein">Im Vorrat: ${gedeckt.map((i) => esc(i.name)).join(', ')}</p>` : ''}`;
}

function rezeptHtml(r, servings) {
  vollstaendig(r);
  const f = servings / (r.servings || 1);
  const zutaten = r.ingredients.map((i) => `<li><b>${esc(formatAmount(i.amount == null ? null : i.amount * f, i.unit) || '')}</b> ${esc(i.name)}</li>`).join('');
  const schritte = (r.steps || []).map((s) => `<li>${esc(s)}</li>`).join('');
  const q = r.quelle;
  const quelle = [
    q?.titel && `${q.titel}${q.autor ? `, ${q.autor}` : ''}${q.jahr ? `, ${q.jahr}` : ''}${q.seite ? `, S. ${q.seite}` : ''}`,
    r.source && `${r.source.title}${r.source.author ? `, ${r.source.author}` : ''} — Lizenz: ${r.source.license}`,
    r.sourceUrl || r.source?.url,
  ].filter(Boolean).map(esc).join('<br />');
  return `<article class="druck-rezept">
    <h2>${esc(r.title)}</h2>
    <p class="druck-klein">${servings} ${esc(r.yieldUnit || 'Portionen')}${r.totalTime > 0 ? ` · ${r.totalTime} Minuten` : ''}</p>
    <div class="druck-rezept-inhalt"><ul class="druck-zutaten">${zutaten}</ul><ol>${schritte}</ol></div>
    <p class="druck-quelle">${quelle}${r.note ? `<br />${esc(r.note)}` : ''}</p>
  </article>`;
}

function heftHtml() {
  const gesehen = new Set();
  const teile = [];
  for (let d = 0; d < DAYS.length; d += 1) {
    for (const m of MEALS) {
      const e = store.week[slotId(d, m.id)];
      const r = e && recipeById.get(e.recipeId);
      // Reste kocht man nicht; Vorgekochtes fuer alle Portionen
      if (!r || e.rest || gesehen.has(r.id)) continue;
      gesehen.add(r.id);
      teile.push(rezeptHtml(r, e.servings + (e.extra || 0)));
    }
  }
  return `${kopf('Rezeptheft der Woche')}${teile.length ? teile.join('') : '<p>Der Wochenplan ist leer.</p>'}`;
}

/**
 * @param {'plan'|'liste'|'heft'} was
 */
export function drucken(was) {
  const html = { plan: planHtml, liste: listeHtml, heft: heftHtml }[was]?.();
  if (!html) return;
  let ziel = document.getElementById('druck');
  if (!ziel) {
    ziel = document.createElement('div');
    ziel.id = 'druck';
    document.body.append(ziel);
  }
  ziel.innerHTML = html;
  ziel.dataset.art = was;
  document.documentElement.classList.add('druckt');
  const aufraeumen = () => {
    document.documentElement.classList.remove('druckt');
    window.removeEventListener('afterprint', aufraeumen);
  };
  window.addEventListener('afterprint', aufraeumen);
  window.print();
}
