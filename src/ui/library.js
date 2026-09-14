/**
 * Rezeptbibliothek: Suche, Filter und die ziehbaren Rezeptkarten.
 * Karten werden per HTML-Drag auf die WebGL-Buehne gezogen.
 */

import { filterRecipes, sources, categories, diets, recipes } from '../data/index.js';

const els = {
  list: document.getElementById('recipe-list'),
  count: document.getElementById('result-count'),
  search: document.getElementById('search'),
  source: document.getElementById('filter-source'),
  category: document.getElementById('filter-category'),
  diet: document.getElementById('filter-diet'),
  time: document.getElementById('filter-time'),
  corpusNote: document.getElementById('corpus-note'),
  panel: document.getElementById('library'),
  toggle: document.getElementById('library-toggle'),
};

let handlers = {};
let current = [];

function option(value, label) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  return o;
}

/** Fuellt die Auswahlfelder aus den tatsaechlich vorhandenen Daten. */
export function refreshFilters() {
  const keep = {
    source: els.source.value,
    category: els.category.value,
    diet: els.diet.value,
  };

  els.source.replaceChildren(option('', 'Alle Quellen'));
  for (const s of sources) {
    if (!recipes.some((r) => r.sourceId === s.id)) continue;
    els.source.append(option(s.id, s.author === s.title ? s.title : `${s.title}`));
  }

  els.category.replaceChildren(option('', 'Alle Kategorien'));
  for (const c of categories()) els.category.append(option(c, c));

  els.diet.replaceChildren(option('', 'Alle Ernährungsformen'));
  for (const d of diets()) els.diet.append(option(d, d[0].toUpperCase() + d.slice(1)));

  els.source.value = keep.source;
  els.category.value = keep.category;
  els.diet.value = keep.diet;
}

function readFilters() {
  return {
    query: els.search.value,
    source: els.source.value,
    category: els.category.value,
    diet: els.diet.value,
    maxTime: els.time.value ? Number(els.time.value) : 0,
  };
}

function cardNode(recipe) {
  const card = document.createElement('article');
  card.className = 'recipe-card';
  card.draggable = true;
  card.dataset.id = recipe.id;
  card.style.setProperty('--swatch', recipe.source?.accent || '#f0653a');
  card.tabIndex = 0;

  const diet = (recipe.diet || [])
    .slice(0, 2)
    .map((d) => `<span class="tag diet">${d}</span>`)
    .join('');

  card.innerHTML = `
    <div class="swatch"></div>
    <div class="body">
      <h3>${recipe.title}</h3>
      <div class="meta">
        <span><b>${recipe.totalTime}</b> Min.</span>
        <span><b>${recipe.servings}</b> Port.</span>
        ${recipe.kcal ? `<span><b>${recipe.kcal}</b> kcal</span>` : ''}
      </div>
      <div class="tag-row">
        <span class="tag src">${recipe.source?.author || recipe.source?.title || 'Quelle'}</span>
        <span class="tag">${recipe.category}</span>
        ${diet}
      </div>
    </div>
  `;

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/x-kochbuch-recipe', recipe.id);
    e.dataTransfer.effectAllowed = 'copy';
    card.classList.add('dragging');
    handlers.onDragStart?.(recipe);
  });

  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('click', () => handlers.onOpen?.(recipe));

  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handlers.onOpen?.(recipe);
    if (e.key === '+' || e.key === ' ') {
      e.preventDefault();
      handlers.onQuickAdd?.(recipe);
    }
  });

  card.addEventListener('dblclick', () => handlers.onQuickAdd?.(recipe));

  return card;
}

export function renderLibrary() {
  current = filterRecipes(readFilters());

  els.count.textContent = current.length
    ? `${current.length} Rezept${current.length === 1 ? '' : 'e'}`
    : 'Keine Treffer';

  if (!current.length) {
    els.list.replaceChildren(
      Object.assign(document.createElement('p'), {
        className: 'empty-note',
        textContent: 'Nichts gefunden. Andere Suche oder Filter zurücksetzen.',
      }),
    );
    return;
  }

  const frag = document.createDocumentFragment();
  for (const r of current.slice(0, 260)) frag.append(cardNode(r));
  els.list.replaceChildren(frag);
  els.list.scrollTop = 0;
}

/** Aktuell gefilterte Rezepte, etwa als Vorrat fuer das Auffuellen. */
export const visibleRecipes = () => current;

export function initLibrary(h) {
  handlers = h;
  refreshFilters();
  renderLibrary();

  let debounce;
  els.search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(renderLibrary, 130);
  });

  for (const sel of [els.source, els.category, els.diet, els.time]) {
    sel.addEventListener('change', renderLibrary);
  }

  els.toggle.addEventListener('click', () => {
    els.panel.classList.toggle('collapsed');
  });

  els.corpusNote.textContent = `${recipes.length} Rezepte aus ${
    new Set(recipes.map((r) => r.sourceId)).size
  } Quellen`;
}
