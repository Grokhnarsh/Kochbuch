/**
 * Rezeptbibliothek: Suche, Filter und die ziehbaren Rezeptkarten.
 * Karten werden per HTML-Drag auf die WebGL-Buehne gezogen.
 */

import { filterRecipes, sources, categories, diets, recipes } from '../data/index.js';
import { ALLERGENS } from '../state/allergens.js';
import { esc } from './html.js';
import { kcalText } from '../state/naehrwerte.js';

const els = {
  list: document.getElementById('recipe-list'),
  count: document.getElementById('result-count'),
  search: document.getElementById('search'),
  source: document.getElementById('filter-source'),
  category: document.getElementById('filter-category'),
  diet: document.getElementById('filter-diet'),
  allergen: document.getElementById('filter-allergen'),
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
    allergen: els.allergen.value,
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

  els.allergen.replaceChildren(option('', 'Ohne Allergen …'));
  for (const a of ALLERGENS) els.allergen.append(option(a.id, `ohne ${a.short}`));

  els.source.value = keep.source;
  els.category.value = keep.category;
  els.diet.value = keep.diet;
  els.allergen.value = keep.allergen;
}

function readFilters() {
  return {
    query: els.search.value,
    source: els.source.value,
    category: els.category.value,
    diet: els.diet.value,
    ohneAllergen: els.allergen.value,
    maxTime: els.time.value ? Number(els.time.value) : 0,
  };
}

/**
 * Ein Blatt fuer ausgewogene Gerichte. Nur ein Zeichen auf der Karte —
 * die Begruendung steht in der Rezeptansicht und in den Vorschlaegen.
 */
function gesundZeichen(recipe) {
  const g = recipe.gesundheit;
  if (!g || g.punkte < 60) return '';
  const titel = `${g.stufe[0].toUpperCase()}${g.stufe.slice(1)} (${g.punkte} von 100 Punkten)`;
  return `<span class="card-health" title="${esc(titel)}" aria-label="${esc(titel)}">🌿</span>`;
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
    .map((d) => `<span class="tag diet">${esc(d)}</span>`)
    .join('');

  // Auf der Karte reichen die Zeichen; die Namen stehen im Titel und
  // ausgeschrieben in der Rezeptansicht.
  const allergene = recipe.allergens || [];
  const sicher = allergene.filter((a) => a.level === 'ja');
  const moeglich = allergene.filter((a) => a.level === 'moeglich');
  const allergenTitel = [
    sicher.length ? `Enthält: ${sicher.map((a) => a.short).join(', ')}` : '',
    moeglich.length ? `Kann enthalten: ${moeglich.map((a) => a.short).join(', ')}` : '',
  ].filter(Boolean).join(' · ');

  const allergenZeile = allergene.length
    ? `<span class="card-allergens" title="${esc(allergenTitel)}" aria-label="${esc(allergenTitel)}">${
        sicher.map((a) => a.icon).join('')
      }${moeglich.length ? `<span class="maybe">${moeglich.map((a) => a.icon).join('')}</span>` : ''}</span>`
    : '';

  card.innerHTML = `
    <div class="swatch"></div>
    <div class="body">
      <h3>${esc(recipe.title)}</h3>
      <div class="meta">
        ${recipe.totalTime > 0 ? `<span><b>${recipe.totalTime}</b> Min.</span>` : ''}
        <span><b>${esc(recipe.servings)}</b> ${esc(recipe.yieldUnit || 'Port.')}</span>
        ${recipe.kcal ? `<span>${esc(kcalText(recipe))}</span>` : ''}
        ${gesundZeichen(recipe)}
        ${allergenZeile}
      </div>
      <div class="tag-row">
        <span class="tag src">${esc(recipe.source?.author || recipe.source?.title || 'Quelle')}</span>
        <span class="tag">${esc(recipe.category)}</span>
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

  // Auf dem Handy steht die Zahl im zugeklappten Blattkopf.
  handlers.onCount?.(current.length);

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

/**
 * Rezepte nach den Filtern der Bibliothek, aber ohne den Suchtext: wer
 * "ohne Milch" gewaehlt hat, will das auch bei Vorschlaegen — ein
 * eingetipptes "Kuchen" soll sie dagegen nicht auf Kuchen beschraenken.
 */
export function gefilterteRezepte() {
  return filterRecipes({ ...readFilters(), query: '' });
}

/** Die aktiven Filter in Worten, fuer Hinweise in anderen Ansichten. */
export function filterBeschreibung() {
  const teile = [];
  for (const sel of [els.source, els.category, els.diet, els.allergen, els.time]) {
    if (sel.value) teile.push(sel.selectedOptions[0]?.textContent || sel.value);
  }
  return teile.join(', ');
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

  for (const sel of [els.source, els.category, els.diet, els.allergen, els.time]) {
    sel.addEventListener('change', renderLibrary);
  }

  els.toggle.addEventListener('click', () => {
    els.panel.classList.toggle('collapsed');
  });

  els.corpusNote.textContent = `${recipes.length} Rezepte aus ${
    new Set(recipes.map((r) => r.sourceId)).size
  } Quellen`;
}
