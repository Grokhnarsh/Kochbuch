/**
 * Einstiegspunkt: verbindet WebGL-Buehne, Wochenplan-Store und
 * Oberflaeche miteinander.
 */

import './style.css';
import { Stage } from './webgl/scene.js';
import { Board, FRAME } from './webgl/board.js';
import { store, isoWeekNumber } from './state/store.js';
import { recipes, recipeById, registerRecipes } from './data/index.js';
import { initLibrary, renderLibrary, refreshFilters, visibleRecipes } from './ui/library.js';
import { openRecipe, openSlot } from './ui/recipeDetail.js';
import { openShoppingList } from './ui/shopping.js';
import { openSources } from './ui/sources.js';
import { initSummary } from './ui/summary.js';

const canvas = document.getElementById('stage');
const stage = new Stage(canvas, FRAME);

const board = new Board(stage, {
  onSelect: (slot) => openSlot(slot),
  onDrop: () => fadeHint(),
});

// --------------------------------------------------------------- Kopfzeile

const weekLabel = document.getElementById('week-label');

function renderWeekLabel() {
  const start = store.weekStart;
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const fmt = (d) =>
    `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;

  weekLabel.textContent = `KW ${isoWeekNumber(start)} · ${fmt(start)}–${fmt(end)}${end.getFullYear()}`;
}

store.subscribe(renderWeekLabel);
renderWeekLabel();

document.getElementById('week-prev').addEventListener('click', () => store.shiftWeek(-1));
document.getElementById('week-next').addEventListener('click', () => store.shiftWeek(1));
document.getElementById('week-today').addEventListener('click', () => store.goToday());

document.getElementById('btn-shopping').addEventListener('click', openShoppingList);

document.getElementById('btn-sources').addEventListener('click', () =>
  openSources(() => {
    refreshFilters();
    renderLibrary();
  }),
);

document.getElementById('btn-autofill').addEventListener('click', () => {
  const pool = visibleRecipes().length > 12 ? visibleRecipes() : recipes;
  store.autofill(pool);
  fadeHint();
});

document.getElementById('btn-clear').addEventListener('click', () => {
  if (Object.keys(store.week).length === 0) return;
  store.clearWeek();
});

// -------------------------------------------------------------- Bibliothek

initLibrary({
  onOpen: (recipe) =>
    openRecipe(recipe, null, (r, servings) => {
      const slot = board.placeInFirstFreeSlot(r);
      if (slot) store.setServings(slot.day, slot.meal, servings);
      fadeHint();
    }),
  onQuickAdd: (recipe) => {
    board.placeInFirstFreeSlot(recipe);
    fadeHint();
  },
  onDragStart: () => fadeHint(),
});

initSummary();

// ------------------------------------------------------------------ Hinweis

const hint = document.getElementById('hint');
let hintTimer = setTimeout(() => hint.classList.add('faded'), 9000);

function fadeHint() {
  clearTimeout(hintTimer);
  hint.classList.add('faded');
}

// Importierte Rezepte aus einer frueheren Sitzung zuruecklesen
const imported = store.loadImported();
if (imported.length) {
  registerRecipes(imported);
  refreshFilters();
  renderLibrary();
}

// Importe fuer die naechste Sitzung sichern
window.addEventListener('beforeunload', () => {
  const own = recipes.filter((r) => r.live && r.sourceId?.startsWith('import-'));
  if (own.length) {
    store.saveImported(
      own.map((r) => ({
        ...r,
        source: undefined,
        searchText: undefined,
        ingredients: r.ingredients.map((i) => ({ a: i.amount, u: i.unit, n: i.name })),
      })),
    );
  }
});

// Fuer Konsole und Tests erreichbar halten
Object.assign(window, { kochbuch: { store, board, stage, recipeById } });
