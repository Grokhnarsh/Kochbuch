/**
 * Formular fuer eigene Rezepte: anlegen, aendern, loeschen.
 *
 * Zutaten und Zubereitung werden als Text eingegeben, eine Zeile je
 * Zutat beziehungsweise Schritt. Das ist schneller getippt als ein
 * Feldergitter und entspricht dem, was in einem Kochbuch steht. Die
 * Zeilen werden mit demselben Parser zerlegt wie importierte Rezepte,
 * und darunter steht laufend, was dabei herauskommt — samt der
 * erkannten Allergene.
 */

import { openModal, closeModal, el } from './modal.js';
import { categories, recipeById, DIET_OPTIONS, MEALS } from '../data/index.js';
import { ausFormular, pruefe, speichern, loeschen, istEigenes } from '../state/eigene.js';
import { allergensForRecipe, HINWEIS } from '../state/allergens.js';
import { formatAmount } from '../state/units.js';

const SCHWIERIGKEIT = [[1, 'einfach'], [2, 'mittel'], [3, 'anspruchsvoll']];

function feld(label, inner, hinweis = '') {
  const wrap = el('label', 'field');
  wrap.append(el('span', 'field-label', label));
  wrap.append(inner);
  if (hinweis) wrap.append(el('span', 'field-hint', hinweis));
  return wrap;
}

function input(name, value, attrs = {}) {
  const node = el('input');
  node.name = name;
  node.value = value ?? '';
  Object.assign(node, attrs);
  return node;
}

function textarea(name, value, rows) {
  const node = el('textarea');
  node.name = name;
  node.rows = rows;
  node.value = value ?? '';
  return node;
}

function auswahl(name, options, value) {
  const node = el('select');
  node.name = name;
  for (const [v, label] of options) {
    const o = el('option', null, label);
    o.value = String(v);
    node.append(o);
  }
  node.value = String(value);
  return node;
}

/** Kaestchengruppe, etwa fuer Mahlzeiten und Ernaehrungsformen. */
function kaestchen(name, options, selected) {
  const wrap = el('div', 'check-row');
  for (const [value, label] of options) {
    const l = el('label', 'check');
    const box = el('input');
    box.type = 'checkbox';
    box.name = name;
    box.value = value;
    box.checked = selected.includes(value);
    l.append(box, el('span', null, label));
    wrap.append(l);
  }
  return wrap;
}

const gewaehlt = (form, name) =>
  [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((b) => b.value);

/**
 * @param {object|null} recipe Zum Bearbeiten das bestehende Rezept
 * @param {{onSaved?:Function, onDeleted?:Function}} hooks
 */
export function openRecipeEditor(recipe = null, { onSaved, onDeleted } = {}) {
  const bearbeiten = Boolean(recipe && istEigenes(recipe));

  const form = el('form', 'recipe-form');
  form.noValidate = true;

  const zutatenText = (recipe?.ingredients || [])
    .map((i) => `${formatAmount(i.amount, i.unit)} ${i.name}`.trim())
    .join('\n');

  form.append(
    feld('Titel', input('title', recipe?.title, { placeholder: 'Wie heißt das Gericht?', required: true })),
  );

  const zeile1 = el('div', 'form-row');
  const kategorie = input('category', recipe?.category || 'Hauptgericht');
  kategorie.setAttribute('list', 'kategorien');
  const liste = el('datalist');
  liste.id = 'kategorien';
  for (const c of categories()) {
    const o = el('option');
    o.value = c;
    liste.append(o);
  }
  zeile1.append(
    feld('Kategorie', kategorie),
    feld('Küche', input('cuisine', recipe?.cuisine || '', { placeholder: 'z. B. Fränkisch' })),
  );
  form.append(zeile1, liste);

  const zeile2 = el('div', 'form-row');
  zeile2.append(
    feld('Ertrag', input('servings', recipe?.servings ?? 4, { type: 'number', min: 1, max: 400 })),
    feld('Einheit', input('yieldUnit', recipe?.yieldUnit || '', { placeholder: 'Portionen' })),
    feld('Vorbereitung', input('prep', recipe?.prep ?? '', { type: 'number', min: 0, max: 1440 }), 'Minuten'),
    feld('Garzeit', input('cook', recipe?.cook ?? '', { type: 'number', min: 0, max: 1440 }), 'Minuten'),
  );
  form.append(zeile2);

  const zeile3 = el('div', 'form-row');
  zeile3.append(
    feld('Schwierigkeit', auswahl('difficulty', SCHWIERIGKEIT, recipe?.difficulty ?? 1)),
    feld('Kalorien', input('kcal', recipe?.kcal || '', { type: 'number', min: 0, max: 5000 }), 'je Portion, optional'),
  );
  form.append(zeile3);

  form.append(
    feld('Mahlzeiten', kaestchen('meals', MEALS.map((m) => [m.id, m.label]), recipe?.meals || ['mittag'])),
    feld('Ernährungsform', kaestchen('diet', DIET_OPTIONS.map((d) => [d, d]), recipe?.diet || [])),
  );

  form.append(
    feld(
      'Zutaten',
      textarea('ingredients', zutatenText, 8),
      'Eine Zutat je Zeile, Menge zuerst: „250 g Mehl“, „2 Eier“, „etwas Salz“.',
    ),
  );

  const vorschau = el('div', 'parse-preview');
  form.append(vorschau);

  form.append(
    feld(
      'Zubereitung',
      textarea('steps', (recipe?.steps || []).join('\n'), 8),
      'Ein Schritt je Zeile.',
    ),
    feld('Notiz', input('note', recipe?.note || '', { placeholder: 'Woher das Rezept stammt, Varianten …' })),
  );

  const fehlerFeld = el('p', 'form-errors');
  fehlerFeld.hidden = true;
  form.append(fehlerFeld);

  /** Zeigt laufend, wie die Zutatenzeilen gelesen werden. */
  function renderVorschau() {
    const entwurf = lesen();
    if (!entwurf.ingredients.length) {
      vorschau.replaceChildren();
      return;
    }

    const zutaten = entwurf.ingredients
      .map((i) => {
        const menge = formatAmount(i.a, i.u);
        return `<li><span>${i.n}</span><span class="amt">${menge || '—'}</span></li>`;
      })
      .join('');

    const allergene = allergensForRecipe({ ingredients: entwurf.ingredients });
    const chips = allergene
      .map((a) => `<span class="allergen-chip ${a.level}">${a.icon} ${a.short}${
        a.level === 'moeglich' ? ' ?' : ''
      }</span>`)
      .join('');

    vorschau.innerHTML = `
      <h4>So wird gelesen</h4>
      <ul class="ing-list">${zutaten}</ul>
      ${allergene.length
        ? `<h4>Erkannte Allergene</h4><div class="allergen-row">${chips}</div>
           <p class="allergen-note">${HINWEIS}</p>`
        : ''}
    `;
  }

  const lesen = () => {
    const daten = Object.fromEntries(new FormData(form));
    return ausFormular(
      {
        ...daten,
        meals: gewaehlt(form, 'meals'),
        diet: gewaehlt(form, 'diet'),
        erstellt: recipe?.erstellt,
      },
      bearbeiten ? recipe.id : null,
    );
  };

  let tippPause;
  form.addEventListener('input', (e) => {
    if (e.target.name !== 'ingredients') return;
    clearTimeout(tippPause);
    tippPause = setTimeout(renderVorschau, 220);
  });

  form.addEventListener('submit', (e) => e.preventDefault());

  // ------------------------------------------------------------- Fusszeile

  const foot = el('div');

  if (bearbeiten) {
    const weg = el('button', 'ghost-btn danger', 'Löschen');
    weg.type = 'button';
    weg.addEventListener('click', () => {
      if (!window.confirm(`„${recipe.title}“ endgültig löschen?`)) return;
      loeschen(recipe.id);
      closeModal();
      onDeleted?.(recipe);
    });
    foot.append(weg);
  }

  const abbrechen = el('button', 'ghost-btn', 'Abbrechen');
  abbrechen.type = 'button';
  abbrechen.addEventListener('click', closeModal);

  const sichern = el('button', 'primary-btn', bearbeiten ? 'Änderungen speichern' : 'Rezept speichern');
  sichern.type = 'button';
  sichern.addEventListener('click', () => {
    const entwurf = lesen();
    // Beim Bearbeiten ist die eigene Id natuerlich vergeben.
    const vergeben = new Set([...recipeById.keys()].filter((id) => id !== recipe?.id));
    const fehler = pruefe(entwurf, { bestehendeIds: vergeben });

    if (fehler.length) {
      fehlerFeld.hidden = false;
      fehlerFeld.textContent = fehler.join(' ');
      fehlerFeld.scrollIntoView({ block: 'nearest' });
      return;
    }

    const gespeichert = speichern(entwurf);
    closeModal();
    onSaved?.(gespeichert);
  });

  foot.append(el('span', 'spacer'), abbrechen, sichern);

  renderVorschau();

  openModal({
    title: bearbeiten ? 'Rezept bearbeiten' : 'Eigenes Rezept',
    subtitle: bearbeiten
      ? 'Gespeichert in diesem Browser'
      : 'Wird in diesem Browser gespeichert und steht danach in der Bibliothek',
    body: form,
    footer: foot,
    wide: true,
  });

  form.querySelector('input[name="title"]').focus();
}
