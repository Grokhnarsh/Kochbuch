/**
 * Rezeptansicht: Zutaten auf die gewaehlte Portionszahl gerechnet,
 * Zubereitung und die vollstaendige Quellenangabe.
 */

import { openModal, closeModal, el } from './modal.js';
import { store, maxServingsFor } from '../state/store.js';
import { recipeById, MEALS, DAYS } from '../data/index.js';
import { formatAmount } from '../state/units.js';
import { allergensForRecipe, HINWEIS } from '../state/allergens.js';
import { istEigenes } from '../state/eigene.js';
import { openRecipeEditor } from './recipeEditor.js';
import { esc, safeUrl } from './html.js';
import { NAEHRSTOFFE, REFERENZ, anzeige } from '../state/naehrwerte.js';
import { HINWEIS_GESUNDHEIT } from '../state/gesundheit.js';
import { naehrwertQuelle } from '../data/index.js';

const liste = (namen) => namen.map((n) => esc(n)).join(', ');

/**
 * Naehrwerttabelle nach dem Muster der EU-Kennzeichnung, dazu, wie
 * belastbar die Rechnung ist und woher die Zahlen stammen.
 */
function naehrwertBlock(recipe) {
  const n = recipe.naehrwerte;
  if (!n) return '';

  const erkannt = n.posten.length;
  const bewertet = erkannt + n.unbekannt.length;
  const herkunft = `
    <p class="nutri-note">
      Berechnet aus ${erkannt} von ${bewertet} Zutaten mit Mengenangabe.
      ${n.ohneMenge.length ? `Ohne Menge, daher nicht eingerechnet: ${liste(n.ohneMenge)}.` : ''}
      ${n.unbekannt.length ? `Nicht zugeordnet: ${liste(n.unbekannt)}.` : ''}
      ${n.hinweise.map((h) => `${esc(h)}.`).join(' ')}
      Werte roh, ohne Garverluste. Quelle: ${esc(naehrwertQuelle.quelle)}, ${esc(naehrwertQuelle.lizenz)}.
    </p>`;

  if (n.vertrauen === 'gering') {
    return `<h3>Nährwerte</h3>
      <p class="allergen-note">Für belastbare Nährwerte fehlen zu viele Angaben.</p>${herkunft}`;
  }

  const zweiteSpalte = n.art !== 'masse' && n.je100g;
  const referenz = n.art === 'portion';
  const zeilen = NAEHRSTOFFE.map((s) => {
    const wert = n.jePortion[s.id];
    const prozent = referenz && REFERENZ[s.id] ? Math.round((wert / REFERENZ[s.id]) * 100) : null;
    return `<tr class="${s.unter ? 'unter' : ''}">
      <th scope="row">${esc(s.label)}</th>
      <td>${anzeige(wert, s)} ${s.einheit}</td>
      ${zweiteSpalte ? `<td>${anzeige(n.je100g[s.id], s)} ${s.einheit}</td>` : ''}
      ${referenz ? `<td class="ref">${prozent != null ? `${prozent} %` : ''}</td>` : ''}
    </tr>`;
  }).join('');

  return `
    <h3>Nährwerte${n.vertrauen === 'mittel' ? ' <span class="nutri-badge">Schätzung</span>' : ''}</h3>
    <div class="nutri-wrap">
      <table class="nutri-table">
        <thead><tr>
          <th></th><th>${esc(n.bezug)}</th>
          ${zweiteSpalte ? '<th>je 100 g</th>' : ''}
          ${referenz ? '<th title="Anteil an der Referenzmenge für einen Erwachsenen (EU, 2000 kcal)">Ref.*</th>' : ''}
        </tr></thead>
        <tbody>${zeilen}</tbody>
      </table>
    </div>
    ${referenz ? '<p class="nutri-note">* Referenzmenge für einen durchschnittlichen Erwachsenen (8400 kJ/2000 kcal).</p>' : ''}
    ${herkunft}
  `;
}

/** Die Gesundheitsbewertung mit ihren Gruenden. */
function gesundheitBlock(recipe) {
  const g = recipe.gesundheit;
  if (!g) return '';
  const gruende = g.gruende.slice(0, 6).map((x) => `
    <li class="${x.gut ? 'gut' : 'schlecht'}">${x.gut ? '＋' : '−'} ${esc(x.text)}</li>`).join('');
  return `
    <h3>Ausgewogenheit</h3>
    <div class="health-head">
      <span class="health-score" style="--p:${g.punkte}">${g.punkte}</span>
      <span><b>${esc(g.stufe[0].toUpperCase() + g.stufe.slice(1))}</b><br />
        <span class="nutri-note">${g.punkte} von 100 Punkten</span></span>
    </div>
    <ul class="health-reasons">${gruende}</ul>
    <p class="nutri-note">${esc(HINWEIS_GESUNDHEIT)}</p>
  `;
}

/**
 * Der Allergenblock. "Enthält" und "kann enthalten" stehen getrennt,
 * und darunter steht, woher die Angabe kommt: aus den Zutatennamen,
 * nicht von einem Etikett.
 */
function allergenBlock(recipe) {
  const gefunden = recipe.allergens || allergensForRecipe(recipe);
  if (!gefunden.length) {
    return `<h3>Allergene</h3>
      <p class="allergen-note">In den Zutaten ist keines der vierzehn
      kennzeichnungspflichtigen Allergene erkennbar. ${HINWEIS}</p>`;
  }

  const chip = (a) => `<span class="allergen-chip ${a.level}" title="${
    esc(a.quellen.join(', '))
  }">${a.icon} ${esc(a.short)}</span>`;

  const sicher = gefunden.filter((a) => a.level === 'ja');
  const moeglich = gefunden.filter((a) => a.level === 'moeglich');

  return `
    <h3>Allergene</h3>
    ${sicher.length
      ? `<div class="allergen-row"><span class="allergen-lead">Enthält</span>${
          sicher.map(chip).join('')}</div>`
      : ''}
    ${moeglich.length
      ? `<div class="allergen-row"><span class="allergen-lead">Kann enthalten</span>${
          moeglich.map(chip).join('')}</div>`
      : ''}
    <p class="allergen-note">${HINWEIS}</p>
  `;
}

/**
 * @param {object} recipe
 * @param {{day:number, meal:string}|null} slot Wenn gesetzt, wirkt die
 *        Portionsanpassung direkt auf den Plan.
 */
export function openRecipe(recipe, slot = null, onPlace = null, onEdited = null) {
  const entry = slot ? store.entry(slot.day, slot.meal) : null;
  let servings = entry?.servings || recipe.servings || 2;
  // Dieselbe Obergrenze wie im Store, sonst zeigte die Ansicht eine
  // andere Zahl als der Plan speichert.
  const maxServings = maxServingsFor(recipe);

  const body = el('div');
  const foot = el('div');

  const source = recipe.source;
  const subtitle = [
    source?.title,
    source?.author,
    source?.year ? String(source.year) : null,
  ].filter(Boolean).join(' · ');

  function render() {
    const factor = servings / (recipe.servings || 1);

    const ings = recipe.ingredients
      .map((i) => {
        const amount = i.amount == null ? null : i.amount * factor;
        const label = formatAmount(amount, i.unit);
        return `<li><span>${esc(i.name)}</span><span class="amt">${esc(label || '—')}</span></li>`;
      })
      .join('');

    const steps = (recipe.steps || []).map((s) => `<li>${esc(s)}</li>`).join('');
    const link = recipe.sourceUrl || source?.url;

    const licence = source
      ? `<div class="source-note">
           <strong>${esc(source.title)}</strong>${source.author ? `, ${esc(source.author)}` : ''}${
             source.year ? ` (${esc(source.year)})` : ''
           }<br />
           Lizenz: ${esc(source.license)} · ${esc(source.via || '')}
           ${link
             ? `<br /><a href="${esc(safeUrl(link))}" target="_blank" rel="noopener noreferrer">${esc(link)}</a>`
             : ''}
           ${recipe.note ? `<br /><br />${esc(recipe.note)}` : ''}
         </div>`
      : '';

    body.innerHTML = `
      <div class="detail-grid">
        <div>
          <h3>Zutaten</h3>
          <div class="servings-row">
            <button class="icon-btn" data-step="-1" aria-label="Weniger Portionen">−</button>
            <b>${servings}</b>
            <button class="icon-btn" data-step="1" aria-label="Mehr Portionen">+</button>
            <span>${esc(recipe.yieldUnit || 'Portionen')}</span>
          </div>
          <ul class="ing-list">${ings}</ul>
          ${allergenBlock(recipe)}
        </div>
        <div>
          <h3>Zubereitung${recipe.totalTime > 0 ? ` · ${recipe.totalTime} Minuten` : ''}</h3>
          <ol class="step-list">${steps}</ol>
          ${naehrwertBlock(recipe)}
          ${gesundheitBlock(recipe)}
          ${licence}
        </div>
      </div>
    `;

    for (const btn of body.querySelectorAll('[data-step]')) {
      btn.addEventListener('click', () => {
        servings = Math.max(1, Math.min(maxServings, servings + Number(btn.dataset.step)));
        if (slot) store.setServings(slot.day, slot.meal, servings);
        render();
      });
    }
  }

  function renderFoot() {
    foot.replaceChildren();

    if (istEigenes(recipe)) {
      const aendern = el('button', 'ghost-btn', 'Bearbeiten');
      aendern.addEventListener('click', () => openRecipeEditor(recipe, { onSaved: onEdited, onDeleted: onEdited }));
      foot.append(aendern);
    }

    if (slot) {
      const where = el('span', null,
        `${DAYS[slot.day].label}, ${MEALS.find((m) => m.id === slot.meal).label}`);
      where.style.color = 'var(--ink-faint)';
      where.style.fontSize = '12.5px';

      const remove = el('button', 'ghost-btn', 'Aus Plan entfernen');
      remove.addEventListener('click', () => {
        store.remove(slot.day, slot.meal);
        closeModal();
      });

      const done = el('button', 'primary-btn', 'Fertig');
      done.addEventListener('click', closeModal);

      foot.append(where, el('span', 'spacer'), remove, done);
    } else {
      const add = el('button', 'primary-btn', 'In den Plan legen');
      add.addEventListener('click', () => {
        onPlace?.(recipe, servings);
        closeModal();
      });

      const hint = el('span', null, 'Oder die Karte direkt auf ein Feld ziehen.');
      hint.style.color = 'var(--ink-faint)';
      hint.style.fontSize = '12.5px';

      foot.append(hint, el('span', 'spacer'), add);
    }
  }

  render();
  renderFoot();
  openModal({ title: recipe.title, subtitle, body, footer: foot, wide: true });
}

/** Oeffnet das Rezept, das in einem Feld liegt. */
export function openSlot(slot, onEdited = null) {
  const entry = store.entry(slot.day, slot.meal);
  if (!entry) return;
  const recipe = recipeById.get(entry.recipeId);
  if (recipe) openRecipe(recipe, slot, null, onEdited);
}
