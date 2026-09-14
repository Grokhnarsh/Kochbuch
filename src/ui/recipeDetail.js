/**
 * Rezeptansicht: Zutaten auf die gewaehlte Portionszahl gerechnet,
 * Zubereitung und die vollstaendige Quellenangabe.
 */

import { openModal, closeModal, el } from './modal.js';
import { store } from '../state/store.js';
import { recipeById, MEALS, DAYS } from '../data/index.js';
import { formatAmount } from '../state/units.js';

/**
 * @param {object} recipe
 * @param {{day:number, meal:string}|null} slot Wenn gesetzt, wirkt die
 *        Portionsanpassung direkt auf den Plan.
 */
export function openRecipe(recipe, slot = null, onPlace = null) {
  const entry = slot ? store.entry(slot.day, slot.meal) : null;
  let servings = entry?.servings || recipe.servings || 2;

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
        return `<li><span>${i.name}</span><span class="amt">${label || '—'}</span></li>`;
      })
      .join('');

    const steps = recipe.steps.map((s) => `<li>${s}</li>`).join('');

    const licence = source
      ? `<div class="source-note">
           <strong>${source.title}</strong>${source.author ? `, ${source.author}` : ''}${
             source.year ? ` (${source.year})` : ''
           }<br />
           Lizenz: ${source.license} · ${source.via || ''}<br />
           <a href="${recipe.sourceUrl || source.url}" target="_blank" rel="noopener noreferrer">${
             recipe.sourceUrl || source.url
           }</a>
           ${recipe.note ? `<br /><br />${recipe.note}` : ''}
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
            <span>Portionen</span>
          </div>
          <ul class="ing-list">${ings}</ul>
        </div>
        <div>
          <h3>Zubereitung · ${recipe.totalTime} Minuten</h3>
          <ol class="step-list">${steps}</ol>
          ${licence}
        </div>
      </div>
    `;

    for (const btn of body.querySelectorAll('[data-step]')) {
      btn.addEventListener('click', () => {
        servings = Math.max(1, Math.min(24, servings + Number(btn.dataset.step)));
        if (slot) store.setServings(slot.day, slot.meal, servings);
        render();
      });
    }
  }

  function renderFoot() {
    foot.replaceChildren();

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
export function openSlot(slot) {
  const entry = store.entry(slot.day, slot.meal);
  if (!entry) return;
  const recipe = recipeById.get(entry.recipeId);
  if (recipe) openRecipe(recipe, slot);
}
