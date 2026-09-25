/**
 * Einstiegspunkt: verbindet WebGL-Buehne, Wochenplan-Store und
 * Oberflaeche miteinander.
 */

import './style.css';
import { Stage } from './webgl/scene.js';
import { Board, COMPACT_BREAKPOINT } from './webgl/board.js';
import { store, isoWeekNumber, slotId } from './state/store.js';
import { recipes, recipeById, registerRecipes, DAYS, MEALS } from './data/index.js';
import { ladeKorpus } from './data/korpus.js';
import { ladeEigene, bereinige } from './state/eigene.js';
import { ensureImportSource } from './sources/index.js';
import {
  initLibrary, renderLibrary, refreshFilters, visibleRecipes, gefilterteRezepte, filterBeschreibung, zeigeBestand,
} from './ui/library.js';
import { openNaehrwerte } from './ui/naehrwerte.js';
import { openVorschlaege } from './ui/vorschlaege.js';
import { openRecipe, openSlot } from './ui/recipeDetail.js';
import { openRecipeEditor } from './ui/recipeEditor.js';
import { esc } from './ui/html.js';
import { openShoppingList } from './ui/shopping.js';
import { openSources } from './ui/sources.js';
import { initSummary } from './ui/summary.js';

const canvas = document.getElementById('stage');
// Die Bühne braucht eine Ausdehnung, das Board die Bühne. Deshalb erst
// mit einem vorläufigen Rahmen starten und ihn danach setzen.
const stage = new Stage(canvas, { width: 12, height: 10 });

// Eigene und importierte Rezepte vor dem Board einhaengen: das Board
// zeichnet beim Aufbau den gespeicherten Plan, und ein Rezept, das es
// dann noch nicht kennt, bliebe leer, bis sich etwas anderes aendert.
ladeEigene();
ladeImporte();

function ladeImporte() {
  const liste = store.loadImported()
    .map((r) => bereinige(r, ''))
    .filter((r) => r && r.sourceId.startsWith('import-'));
  // Die Quelle eines Imports ist nicht mitgespeichert; ohne sie fehlten
  // nach dem Neuladen Lizenzhinweis und Anbieter.
  for (const r of liste) ensureImportSource(r.sourceId.slice('import-'.length));
  registerRecipes(liste);
}

/**
 * Sichert importierte Rezepte. Direkt nach jeder Aenderung und beim
 * Verlassen der Seite — "beforeunload" allein reicht nicht, mobile
 * Browser lassen es beim Schliessen eines Tabs oft aus.
 */
function sichereImporte() {
  const importe = recipes.filter((r) => r.live && r.sourceId?.startsWith('import-'));
  store.saveImported(
    importe.map((r) => ({
      ...r,
      // Abgeleitetes entsteht beim Laden neu; gespeichert kostete es nur
      // Platz im knappen Speicher des Browsers.
      source: undefined,
      searchText: undefined,
      allergens: undefined,
      naehrwerte: undefined,
      gesundheit: undefined,
      ingredients: r.ingredients.map((i) => ({ a: i.amount, u: i.unit, n: i.name })),
    })),
  );
}

/** Nach dem Nachladen oder Importieren in den Quellen. */
function nachQuellenAenderung() {
  refreshFilters();
  renderLibrary();
  sichereImporte();
}

const board = new Board(stage, {
  onSelect: (slot) => openSlot(slot, afterRecipeChange),
  onDrop: () => fadeHint(),
  onArm: (recipe) => renderArmed(recipe),
  onEmptyTap: () => openLibrarySheet(),
  onDayChange: () => renderDayNav(),
});

stage.setFrame(board.frame);

/** Schmale Geraete bekommen die Tagesansicht und Bedienung per Tippen. */
const isPhone = () => window.innerWidth < COMPACT_BREAKPOINT;

/** Nach dem Speichern oder Loeschen eines eigenen Rezepts. */
function afterRecipeChange() {
  refreshFilters();
  renderLibrary();
  // Der Plan haengt am Store und aktualisiert sich von selbst.
}

function newRecipe() {
  openRecipeEditor(null, { onSaved: afterRecipeChange });
}

function oeffneAusUebersicht(recipe) {
  openRecipe(recipe, null, placeFromDetail, afterRecipeChange);
}

function vorschlaegeOeffnen() {
  openVorschlaege({
    pool: gefilterteRezepte,
    filterText: filterBeschreibung,
    onOpen: oeffneAusUebersicht,
    onGeplant: () => fadeHint(),
  });
}

function naehrwerteOeffnen(ansicht = 'woche') {
  openNaehrwerte({ onOpen: oeffneAusUebersicht, onVorschlaege: vorschlaegeOeffnen, ansicht });
}

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
document.getElementById('btn-new-recipe').addEventListener('click', newRecipe);
document.getElementById('btn-suggest').addEventListener('click', vorschlaegeOeffnen);
document.getElementById('btn-nutrition').addEventListener('click', () => naehrwerteOeffnen());

document.getElementById('btn-sources').addEventListener('click', () => openSources(nachQuellenAenderung));

document.getElementById('btn-autofill').addEventListener('click', () => {
  const pool = visibleRecipes().length > 12 ? visibleRecipes() : recipes;
  store.autofill(pool);
  fadeHint();
});

document.getElementById('btn-clear').addEventListener('click', () => {
  if (Object.keys(store.week).length === 0) return;
  store.clearWeek();
});

// ------------------------------------------------------------ Tagesleiste

const dayStrip = document.getElementById('day-strip');

/**
 * Leiste mit den sieben Wochentagen. Ein Punkt zeigt, an welchen Tagen
 * schon etwas geplant ist.
 */
function renderDayNav() {
  if (!isPhone()) {
    dayStrip.replaceChildren();
    return;
  }

  const frag = document.createDocumentFragment();

  DAYS.forEach((day, index) => {
    const belegt = MEALS.some((m) => store.week[slotId(index, m.id)]);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = belegt ? '' : 'leer';
    btn.setAttribute('aria-current', String(index === board.day));
    btn.innerHTML = `${day.short}<span class="dot"></span>`;
    btn.addEventListener('click', () => board.showDay(index));
    frag.append(btn);
  });

  dayStrip.replaceChildren(frag);
}

store.subscribe(renderDayNav);
window.addEventListener('resize', renderDayNav);
renderDayNav();

// ------------------------------------------------- Aufgenommenes Rezept

const armedBar = document.getElementById('armed-bar');

/**
 * Auf dem Handy wird ein Rezept angetippt statt gezogen. Diese Leiste
 * zeigt, was in der Hand liegt, und wartet auf das Feld.
 */
function renderArmed(recipe) {
  if (!recipe) {
    armedBar.hidden = true;
    armedBar.replaceChildren();
    return;
  }

  armedBar.hidden = false;
  armedBar.innerHTML = `
    <span class="text">
      <span class="name">${esc(recipe.title)}</span>
      <span class="was">Feld antippen zum Ablegen</span>
    </span>
  `;

  const ansehen = document.createElement('button');
  ansehen.type = 'button';
  ansehen.textContent = 'Ansehen';
  ansehen.addEventListener('click', () => openRecipe(recipe, null, placeFromDetail, afterRecipeChange));

  const abbrechen = document.createElement('button');
  abbrechen.type = 'button';
  abbrechen.className = 'schliessen';
  abbrechen.setAttribute('aria-label', 'Abbrechen');
  abbrechen.textContent = '\u00d7';
  abbrechen.addEventListener('click', () => board.disarm());

  armedBar.append(ansehen, abbrechen);
}

// -------------------------------------------------------------- Bibliothek

const library = document.getElementById('library');
const libraryHead = document.getElementById('library-head');
const libraryCount = document.getElementById('library-count');

function openLibrarySheet() {
  if (isPhone()) library.classList.add('offen');
}

function closeLibrarySheet() {
  library.classList.remove('offen');
}

libraryHead.addEventListener('click', (e) => {
  if (!isPhone() || e.target.closest('.library-toggle')) return;
  library.classList.toggle('offen');
});

function placeFromDetail(recipe, servings) {
  const slot = board.placeInFirstFreeSlot(recipe);
  if (slot) store.setServings(slot.day, slot.meal, servings);
  fadeHint();
}

initLibrary({
  onOpen: (recipe) => {
    // Auf dem Handy nimmt ein Tipp das Rezept auf, statt die Ansicht zu
    // oeffnen: danach waehlt man das Feld selbst.
    if (isPhone()) {
      board.arm(recipe);
      closeLibrarySheet();
      return;
    }
    openRecipe(recipe, null, placeFromDetail, afterRecipeChange);
  },
  onQuickAdd: (recipe) => {
    board.placeInFirstFreeSlot(recipe);
    fadeHint();
  },
  onDragStart: () => fadeHint(),
  onCount: (n) => { libraryCount.textContent = `${n}`; },
});

initSummary({ onNaehrwerte: () => naehrwerteOeffnen() });

// ------------------------------------------------------- Grosse Sammlungen

/**
 * Die Wikis und historischen Kochbuecher kommen, wenn der Plan schon
 * steht. Nach jedem Teil wachsen Filter und Liste, und der Plan zeichnet
 * Gerichte, die er vorher noch nicht kannte.
 */
zeigeBestand({ laedt: true });
const korpus = ladeKorpus({
  onTeil: (neu) => {
    refreshFilters();
    renderLibrary({ behalteScroll: true });
    zeigeBestand({ laedt: true });
    // Neu zeichnen nur, wenn der Plan ein eben geladenes Rezept enthaelt
    const ids = new Set(neu.map((r) => r.id));
    if (Object.values(store.week).some((e) => ids.has(e.recipeId))) store.emit();
  },
}).then((ergebnis) => {
  zeigeBestand({ fehler: ergebnis.fehler > 0 });
  return ergebnis;
});

// ------------------------------------------------------ Ueberlaufmenue

const phoneMenu = document.getElementById('phone-menu');
const moreBtn = document.getElementById('btn-more');

const AKTIONEN = {
  autofill: () => {
    const pool = visibleRecipes().length > 12 ? visibleRecipes() : recipes;
    store.autofill(pool);
    fadeHint();
  },
  clear: () => {
    if (Object.keys(store.week).length) store.clearWeek();
  },
  sources: () => openSources(nachQuellenAenderung),
  newRecipe,
  suggest: vorschlaegeOeffnen,
  nutrition: () => naehrwerteOeffnen(),
};

moreBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const offen = phoneMenu.hidden;
  phoneMenu.hidden = !offen;
  moreBtn.setAttribute('aria-expanded', String(offen));
});

phoneMenu.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  phoneMenu.hidden = true;
  moreBtn.setAttribute('aria-expanded', 'false');
  AKTIONEN[action]?.();
});

document.addEventListener('click', () => {
  if (phoneMenu.hidden) return;
  phoneMenu.hidden = true;
  moreBtn.setAttribute('aria-expanded', 'false');
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  board.disarm();
  phoneMenu.hidden = true;
});

// ------------------------------------------------------------------ Hinweis

const hint = document.getElementById('hint');
let hintTimer = setTimeout(() => hint.classList.add('faded'), 9000);

function fadeHint() {
  clearTimeout(hintTimer);
  hint.classList.add('faded');
}

// "pagehide" feuert auch dort, wo "beforeunload" ausbleibt.
window.addEventListener('pagehide', sichereImporte);

// Fuer Konsole und Tests erreichbar halten
Object.assign(window, {
  kochbuch: { store, board, stage, recipeById, newRecipe, vorschlaegeOeffnen, naehrwerteOeffnen, korpus },
});
