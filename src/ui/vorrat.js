/**
 * Vorrat pflegen und fragen, was sich daraus kochen laesst.
 *
 * Der Vorrat wird von der Einkaufsliste abgezogen. Er ist eine Liste
 * dessen, was man da hat — kein Lagerbuch: Was gekocht wird, zieht die
 * App nicht selbst ab, das traegt man aus, wenn es leer ist.
 */

import { openModal, el } from './modal.js';
import { esc } from './html.js';
import { store } from '../state/store.js';
import { recipes, vollstaendig } from '../data/index.js';
import { formatAmount } from '../state/units.js';
import { GRUNDZUTATEN, postenAus, fuegeHinzu, kochbarMitVorrat } from '../state/vorrat.js';
import { imMonat, saisonFuer, MONATE } from '../state/saison.js';

const posten = (p) => `${p.menge != null ? `${formatAmount(p.menge, p.einheit)} ` : ''}${p.name}`;

/**
 * @param {{onOpen:(recipe:object)=>void, ansicht?:'vorrat'|'kochen'}} opt
 */
export function openVorrat({ onOpen, ansicht = 'vorrat' } = {}) {
  let tab = ansicht;
  const body = el('div');
  const foot = el('div');
  let unsubscribe = null;

  function zeichne() {
    body.replaceChildren();
    const reiter = el('div', 'seg');
    reiter.setAttribute('role', 'tablist');
    for (const [id, label] of [['vorrat', `Vorrat (${store.vorrat.length})`], ['kochen', 'Was kann ich kochen?'],
      ['saison', `Saison im ${MONATE[new Date().getMonth()]}`]]) {
      const b = el('button', 'seg-btn', esc(label));
      b.type = 'button';
      b.dataset.tab = id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(tab === id));
      b.addEventListener('click', () => { tab = id; zeichne(); });
      reiter.append(b);
    }
    body.append(reiter);
    body.append({ vorrat: vorratAnsicht, kochen: kochenAnsicht, saison: saisonAnsicht }[tab]());
    zeichneFuss();
  }

  function vorratAnsicht() {
    const box = el('div', 'vorrat');
    box.innerHTML = `
      <p class="intro-copy">Was hier steht, zieht die Einkaufsliste ab. Ohne Menge gilt
        eine Zutat als vorhanden, mit Menge wird gerechnet: 1 kg Mehl im Vorrat und
        1,2 kg im Plan ergeben 200 g auf der Liste.</p>
      <form class="vorrat-form">
        <input type="text" name="posten" placeholder="z. B. 1 kg Mehl, 6 Eier oder Reis"
          aria-label="Zutat für den Vorrat" autocomplete="off" maxlength="100" />
        <button type="submit" class="primary-btn">Hinzufügen</button>
      </form>
      <ul class="vorrat-liste"></ul>
    `;
    const liste = box.querySelector('.vorrat-liste');
    if (!store.vorrat.length) {
      liste.outerHTML = `<p class="empty-note">Der Vorrat ist leer. Einfach eintragen, was da ist,
        oder mit den Grundzutaten beginnen.</p>`;
    } else {
      liste.innerHTML = store.vorrat
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
        .map((p) => `<li><span>${esc(posten(p))}</span>
          <button type="button" class="icon-btn" data-weg="${esc(p.name)}" aria-label="${esc(p.name)} austragen">&times;</button></li>`)
        .join('');
      liste.addEventListener('click', (e) => {
        const name = e.target.closest('[data-weg]')?.dataset.weg;
        if (name != null) store.setVorrat(store.vorrat.filter((p) => p.name !== name));
      });
    }

    const form = box.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const p = postenAus(form.posten.value);
      if (!p) return;
      store.setVorrat(fuegeHinzu(store.vorrat, p));
      body.querySelector('.vorrat-form input')?.focus();
    });
    queueMicrotask(() => form.posten?.focus());
    return box;
  }

  function kochenAnsicht() {
    const box = el('div', 'vorrat-kochen');
    if (!store.vorrat.length) {
      box.innerHTML = '<p class="empty-note">Erst den Vorrat eintragen, dann sucht die App passende Rezepte.</p>';
      return box;
    }
    const treffer = kochbarMitVorrat(recipes, store.vorrat, { limit: 30 });
    if (!treffer.length) {
      box.innerHTML = `<p class="empty-note">Kein Rezept, dem höchstens drei Zutaten fehlen.
        Mit ein paar Einträgen mehr im Vorrat findet sich eher etwas.</p>`;
      return box;
    }
    box.innerHTML = `<p class="intro-copy">${treffer.length} Rezepte, denen höchstens drei Zutaten
      fehlen; zuerst die, für die alles da ist. Salz, Pfeffer und Wasser zählen nicht.</p>`;
    for (const t of treffer) {
      const card = el('article', 'suggest-card vorrat-card');
      card.innerHTML = `
        <span class="vorrat-quote" title="Anteil der Zutaten im Vorrat">${Math.round(t.anteil * 100)}&nbsp;%</span>
        <div class="body">
          <h3>${esc(t.recipe.title)}</h3>
          <div class="meta">
            ${t.fehlt.length ? `<span>Fehlt: ${esc(t.fehlt.join(', '))}</span>` : '<span class="passt">Alles da</span>'}
            ${t.recipe.totalTime > 0 ? `<span>${t.recipe.totalTime} Min.</span>` : ''}
          </div>
        </div>
        <div class="actions"><button class="ghost-btn" type="button">Ansehen</button></div>`;
      card.querySelector('button').addEventListener('click', () => onOpen?.(vollstaendig(t.recipe)));
      box.append(card);
    }
    return box;
  }

  /** Was jetzt waechst, und Gerichte, die genau das verwenden */
  function saisonAnsicht() {
    const box = el('div', 'vorrat-kochen');
    const monat = new Date().getMonth() + 1;
    const jetzt = imMonat(monat);
    const treffer = recipes
      .filter((r) => !r.lesetext && (r.meals || []).some((m) => m === 'mittag' || m === 'abend'))
      .map((r) => ({ r, s: saisonFuer(r, monat) }))
      .filter((x) => x.s.saisonal)
      .sort((a, b) => b.s.passend.length - a.s.passend.length
        || (b.r.gesundheit?.punkte || 0) - (a.r.gesundheit?.punkte || 0))
      .slice(0, 24);
    box.innerHTML = `
      <p class="intro-copy">Aus heimischem Anbau, Freiland oder Lager, hat im ${MONATE[monat - 1]} Saison:</p>
      <div class="planer-chips saison-chips">${jetzt.map((z) => `<span class="planer-chip"><span>${esc(z)}</span></span>`).join('')}</div>
      <h3>Gerichte der Saison</h3>`;
    for (const { r, s } of treffer) {
      const card = el('article', 'suggest-card vorrat-card');
      card.innerHTML = `
        <span class="vorrat-quote" title="Saisonzutaten">${s.passend.length}</span>
        <div class="body"><h3>${esc(r.title)}</h3>
          <div class="meta"><span class="passt">${esc(s.passend.join(', '))}</span>
          ${r.totalTime > 0 ? `<span>${r.totalTime} Min.</span>` : ''}</div></div>
        <div class="actions"><button class="ghost-btn" type="button">Ansehen</button></div>`;
      card.querySelector('button').addEventListener('click', () => onOpen?.(vollstaendig(r)));
      box.append(card);
    }
    return box;
  }

  function zeichneFuss() {
    foot.replaceChildren();
    const grund = el('button', 'ghost-btn', 'Grundzutaten eintragen');
    grund.title = GRUNDZUTATEN.join(', ');
    grund.addEventListener('click', () => {
      let liste = store.vorrat;
      for (const name of GRUNDZUTATEN) liste = fuegeHinzu(liste, { name, menge: null, einheit: '' });
      store.setVorrat(liste);
    });
    const leeren = el('button', 'ghost-btn', 'Alles austragen');
    leeren.disabled = !store.vorrat.length;
    leeren.addEventListener('click', () => {
      if (window.confirm('Den ganzen Vorrat austragen?')) store.setVorrat([]);
    });
    foot.append(grund, leeren);
  }

  zeichne();
  unsubscribe = store.subscribe(() => {
    // Nur der Vorrat zeichnet neu; Eingaben im Formular sollen stehen bleiben
    const eingabe = body.querySelector('.vorrat-form input')?.value;
    zeichne();
    const feld = body.querySelector('.vorrat-form input');
    if (feld && eingabe && store.vorrat.every((p) => p.name !== postenAus(eingabe)?.name)) feld.value = eingabe;
  });

  openModal({
    title: 'Vorrat',
    subtitle: 'Was in Küche und Kammer liegt',
    body,
    footer: foot,
    wide: true,
    onClose: () => unsubscribe?.(),
  });
}
