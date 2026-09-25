/**
 * Einkaufsliste und Uebergabe an den Supermarkt.
 *
 * Die Liste entsteht aus dem Wochenplan: alle Zutaten werden auf die
 * geplanten Portionen hochgerechnet, zusammengefasst und nach
 * Abteilungen sortiert. Von dort geht es weiter in den REWE-Onlineshop.
 */

import { openModal, el } from './modal.js';
import { store } from '../state/store.js';
import { formatAmount } from '../state/units.js';
import { allergensFor, allergenById, HINWEIS } from '../state/allergens.js';
import { defaultShop } from '../shops/index.js';
import { esc, safeUrl } from './html.js';

/**
 * Welche Allergene in der ganzen Liste stecken, und in welchen
 * Positionen. Wer fuer jemanden mit Allergie einkauft, will das vor
 * dem Markt wissen, nicht im Regal.
 */
function allergenUebersicht(groups) {
  const gefunden = new Map();

  for (const g of groups) {
    for (const item of g.items) {
      for (const { id, level } of allergensFor(item.name)) {
        const eintrag = gefunden.get(id) || { level: 'moeglich', positionen: [] };
        if (level === 'ja') eintrag.level = 'ja';
        eintrag.positionen.push(item.name);
        gefunden.set(id, eintrag);
      }
    }
  }

  if (!gefunden.size) return '';

  const chips = [...gefunden]
    .sort((a, b) => b[1].positionen.length - a[1].positionen.length)
    .map(([id, e]) => {
      const a = allergenById.get(id);
      return `<span class="allergen-chip ${e.level}" title="${esc(e.positionen.join(', '))}">${
        a.icon} ${a.short} <b>${e.positionen.length}</b></span>`;
    })
    .join('');

  return `
    <section class="shop-group">
      <h3>Allergene in dieser Liste</h3>
      <div class="allergen-row">${chips}</div>
      <p class="allergen-note">${HINWEIS}</p>
    </section>
  `;
}

let view = 'liste';
let cursor = 0;

function copyToClipboard(text, button) {
  const done = () => {
    const label = button.textContent;
    button.textContent = 'Kopiert';
    setTimeout(() => { button.textContent = label; }, 1600);
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallback(text, done));
  } else {
    fallback(text, done);
  }
}

function fallback(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.append(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } finally { ta.remove(); }
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function renderList(groups, body) {
  if (!groups.length) {
    body.innerHTML = `<p class="empty-note">
      Der Wochenplan ist noch leer. Sobald Rezepte im Plan liegen,
      entsteht hier automatisch die Einkaufsliste.</p>`;
    return;
  }

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const open = groups.reduce((n, g) => n + g.items.filter((i) => !i.done).length, 0);

  body.innerHTML = `
    <p class="intro-copy">
      ${total} Positionen aus ${Object.keys(store.week).length} geplanten Gerichten,
      auf die eingestellten Portionen hochgerechnet. Noch offen: <strong>${open}</strong>.
    </p>
    ${allergenUebersicht(groups)}
    ${groups.map((g) => `
      <section class="shop-group">
        <h3>${esc(g.aisle)}</h3>
        ${g.items.map((i) => `
          <div class="shop-item${i.done ? ' done' : ''}">
            <input type="checkbox" id="c-${esc(i.key)}" ${i.done ? 'checked' : ''} />
            <label for="c-${esc(i.key)}" title="${esc(i.recipes.join(', '))}">${esc(i.name)}</label>
            <span class="amt">${esc(formatAmount(i.amount, i.unit) || '—')}</span>
          </div>
        `).join('')}
      </section>
    `).join('')}
  `;

  for (const box of body.querySelectorAll('input[type=checkbox]')) {
    box.addEventListener('change', () => {
      store.toggleChecked(box.id.slice(2));
    });
  }
}

function renderShop(groups, body) {
  const items = defaultShop.buildOrder(groups);
  const open = items.filter((i) => !i.done);

  if (!items.length) {
    body.innerHTML = '<p class="empty-note">Noch nichts zu bestellen.</p>';
    return;
  }

  cursor = Math.min(cursor, Math.max(0, open.length - 1));
  const next = open[cursor];

  body.innerHTML = `
    <p class="intro-copy">
      ${defaultShop.label} veröffentlicht keine Warenkorb-Schnittstelle für fremde
      Anwendungen. Der verlässliche Weg ist die Produktsuche des Shops: Position
      öffnen, Produkt und Menge wählen, in den Warenkorb legen — hier Schritt für
      Schritt durch alle ${open.length} offenen Positionen.
    </p>

    ${next ? `
      <div class="servings-row" style="justify-content:space-between">
        <span>Nächste Position: <strong style="color:var(--ink)">${esc(next.name)}</strong>
          ${next.quantityLabel ? `· ${esc(next.quantityLabel)}` : ''}</span>
        <button class="primary-btn" id="open-next">Bei ${defaultShop.label} suchen</button>
      </div>` : '<p class="intro-copy">Alle Positionen abgehakt.</p>'}

    <section class="shop-group" style="margin-top:18px">
      <h3>Alle Positionen</h3>
      ${items.map((i) => `
        <div class="shop-item${i.done ? ' done' : ''}">
          <input type="checkbox" id="s-${esc(i.key)}" ${i.done ? 'checked' : ''} />
          <label for="s-${esc(i.key)}">${esc(i.name)}
            <span style="color:var(--ink-faint)">· sucht „${esc(i.term)}"</span>
          </label>
          <span class="amt">${esc(i.quantityLabel || '—')}</span>
          <a class="ghost-btn" style="padding:4px 10px;font-size:12px"
             href="${esc(safeUrl(i.url))}" target="_blank" rel="noopener noreferrer">Öffnen</a>
        </div>
      `).join('')}
    </section>
  `;

  body.querySelector('#open-next')?.addEventListener('click', () => {
    window.open(next.url, '_blank', 'noopener');
    store.toggleChecked(next.key);
  });

  for (const box of body.querySelectorAll('input[type=checkbox]')) {
    box.addEventListener('change', () => store.toggleChecked(box.id.slice(2)));
  }
}

export function openShoppingList() {
  view = 'liste';
  cursor = 0;

  const body = el('div');
  const foot = el('div');
  let unsubscribe = null;

  function draw() {
    const groups = store.shoppingList();
    if (view === 'liste') renderList(groups, body);
    else renderShop(groups, body);
    drawFoot(groups);
  }

  function drawFoot(groups) {
    foot.replaceChildren();

    const copy = el('button', 'ghost-btn', 'Kopieren');
    copy.addEventListener('click', () =>
      copyToClipboard(defaultShop.toPlainText(groups), copy));

    const csv = el('button', 'ghost-btn', 'CSV');
    csv.addEventListener('click', () =>
      download('einkaufsliste.csv', defaultShop.toCSV(groups), 'text/csv;charset=utf-8'));

    const toggle = el(
      'button',
      'primary-btn',
      view === 'liste' ? `Bei ${defaultShop.label} bestellen` : 'Zurück zur Liste',
    );
    toggle.addEventListener('click', () => {
      view = view === 'liste' ? 'shop' : 'liste';
      draw();
    });

    foot.append(copy, csv, el('span', 'spacer'), toggle);
  }

  draw();
  unsubscribe = store.subscribe(draw);

  openModal({
    title: 'Einkaufsliste',
    subtitle: 'Aus dem Wochenplan zusammengefasst',
    body,
    footer: foot,
    wide: true,
    onClose: () => unsubscribe?.(),
  });
}
