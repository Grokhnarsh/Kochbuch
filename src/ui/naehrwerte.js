/**
 * Naehrwertuebersicht: die geplante Woche Tag fuer Tag und alle Rezepte
 * in einer sortierbaren Tabelle.
 *
 * Die Woche wird je Person gerechnet — aus jeder geplanten Mahlzeit eine
 * Portion — und an den Referenzmengen der EU gemessen. Tage, an denen ein
 * Gericht keine belastbaren Werte hat, sind als unvollstaendig markiert,
 * statt still zu niedrig auszufallen.
 */

import { openModal, el } from './modal.js';
import { esc } from './html.js';
import { store } from '../state/store.js';
import { recipes, DAYS, naehrwertQuelle } from '../data/index.js';
import { NAEHRSTOFFE, REFERENZ, anzeige } from '../state/naehrwerte.js';
import { wochenLuecke } from '../state/gesundheit.js';

/** Grenzen, ab denen ein Tageswert auffaellt. */
const ZU_VIEL = new Set(['salz', 'gesFett', 'zucker']);
const ZU_WENIG = new Set(['ballast']);

function tagesZelle(id, wert, vollstaendig) {
  const s = NAEHRSTOFFE.find((n) => n.id === id);
  let klasse = '';
  if (vollstaendig && ZU_VIEL.has(id) && wert > REFERENZ[id]) klasse = 'hoch';
  if (vollstaendig && ZU_WENIG.has(id) && wert < REFERENZ[id] * 0.7) klasse = 'niedrig';
  return `<td class="${klasse}">${anzeige(wert, s)}</td>`;
}

function wocheAnsicht(host, { onVorschlaege }) {
  const tage = store.naehrwerteProTag();
  const geplant = tage.filter((t) => t.mahlzeiten > 0);

  if (!geplant.length) {
    host.innerHTML = `<p class="empty-note">Noch nichts geplant. Sobald Gerichte im Plan liegen,
      stehen hier ihre Nährwerte je Tag.</p>`;
    return;
  }

  const kopf = NAEHRSTOFFE.map((n) => `<th title="${esc(n.label)}">${esc(n.kurz || n.label)}<br /><small>${n.einheit}</small></th>`).join('');

  const zeilen = tage.map((t, i) => {
    const tag = DAYS[i];
    if (!t.mahlzeiten) {
      return `<tr class="leer"><th scope="row">${esc(tag.label)}</th><td colspan="${NAEHRSTOFFE.length}">nichts geplant</td></tr>`;
    }
    const vollstaendig = t.belastbar === t.mahlzeiten;
    return `<tr>
      <th scope="row">${esc(tag.label)}${vollstaendig ? '' : ' <span class="stern" title="Mindestens ein Gericht ohne belastbare Nährwerte">*</span>'}
        <br /><small>${t.mahlzeiten} ${t.mahlzeiten === 1 ? 'Mahlzeit' : 'Mahlzeiten'}</small></th>
      ${NAEHRSTOFFE.map((n) => tagesZelle(n.id, t.werte[n.id], vollstaendig)).join('')}
    </tr>`;
  }).join('');

  const luecke = wochenLuecke(tage);
  const mitWerten = tage.filter((t) => t.belastbar > 0);
  const schnitt = NAEHRSTOFFE.map((n) => {
    const w = mitWerten.reduce((s, t) => s + t.werte[n.id], 0) / Math.max(1, mitWerten.length);
    return `<td>${anzeige(w, n)}</td>`;
  }).join('');

  host.innerHTML = `
    <p class="intro-copy">
      Je Person und Tag: aus jeder geplanten Mahlzeit eine Portion. Rot markiert, was über
      der Referenzmenge liegt, grau, wo Ballaststoffe deutlich fehlen.
    </p>
    <div class="nutri-wrap">
      <table class="nutri-table week">
        <thead><tr><th></th>${kopf}</tr></thead>
        <tbody>${zeilen}</tbody>
        <tfoot>
          <tr><th scope="row">Ø Tag</th>${schnitt}</tr>
          <tr class="ref"><th scope="row">Referenz</th>${NAEHRSTOFFE.map((n) => `<td>${REFERENZ[n.id] ?? ''}</td>`).join('')}</tr>
        </tfoot>
      </table>
    </div>
    <p class="nutri-note">
      ${tage.some((t) => t.mahlzeiten > t.belastbar)
        ? '* An diesem Tag hat mindestens ein Gericht keine belastbaren Nährwerte; die Summe liegt dann zu niedrig.'
        : ''}
      Referenzmengen: EU-Lebensmittelinformationsverordnung, Anhang XIII (2000 kcal); Ballaststoffe: DGE (30 g).
    </p>
    ${luecke.text ? `
      <div class="week-hint">
        <span>${esc(luecke.text)}</span>
        <button class="ghost-btn" type="button" data-vorschlaege>Passende Vorschläge</button>
      </div>` : ''}
  `;

  host.querySelector('[data-vorschlaege]')?.addEventListener('click', onVorschlaege);
}

/**
 * Je Portion, je Stueck und je 100 g sind verschiedene Groessen. In einer
 * gemeinsamen Tabelle staende beim Sortieren nach Ballaststoffen eine
 * Gewuerzmischung je 100 g vor jedem Eintopf je Teller — deshalb zeigt
 * die Tabelle immer nur eine Bezugsgroesse.
 */
const GRUPPEN = [
  ['portion', 'Mahlzeiten, je Portion'],
  ['masse', 'Gebäck, Grundrezepte, Gläser, je 100 g'],
  ['stueck', 'Stückgebäck und Häppchen, je Stück'],
];

function rezepteAnsicht(host, { onOpen }) {
  const alleBelastbar = recipes.filter((r) => r.naehrwerte && r.naehrwerte.vertrauen !== 'gering');
  let gruppe = 'portion';
  let sortierung = { feld: 'title', auf: true };
  let suche = '';

  const spalten = [
    { id: 'title', label: 'Rezept' },
    ...NAEHRSTOFFE.map((n) => ({ id: n.id, label: n.kurz || n.label, einheit: n.einheit, naehrstoff: n })),
    { id: 'punkte', label: 'Bewertung' },
  ];

  const wert = (r, feld) => {
    if (feld === 'title') return r.title;
    if (feld === 'punkte') return r.gesundheit?.punkte ?? -1;
    return r.naehrwerte.jePortion[feld];
  };

  host.innerHTML = `
    <div class="nutri-filter">
      <input type="search" placeholder="Rezept suchen…" aria-label="Rezept suchen" />
      <select aria-label="Bezugsgröße">${GRUPPEN.map(([id, label]) => `<option value="${id}">${esc(label)}</option>`).join('')}</select>
    </div>
    <p class="nutri-note" data-anzahl></p>
    <div class="nutri-wrap"><table class="nutri-table all">
      <thead><tr>${spalten.map((s) => `<th data-feld="${s.id}" tabindex="0" role="button">${esc(s.label)}${
        s.einheit ? `<br /><small>${s.einheit}</small>` : ''}</th>`).join('')}</tr></thead>
      <tbody></tbody>
    </table></div>
  `;

  const tbody = host.querySelector('tbody');
  const anzahl = host.querySelector('[data-anzahl]');

  function zeichnen() {
    const q = suche.trim().toLowerCase();
    const belastbar = alleBelastbar.filter((r) => r.naehrwerte.art === gruppe);
    const liste = belastbar
      .filter((r) => !q || r.searchText.includes(q))
      .sort((a, b) => {
        const x = wert(a, sortierung.feld);
        const y = wert(b, sortierung.feld);
        const v = typeof x === 'string' ? x.localeCompare(y, 'de') : x - y;
        return sortierung.auf ? v : -v;
      });

    anzahl.textContent = `${liste.length} Rezepte in dieser Gruppe. ${
      recipes.length - alleBelastbar.length} Rezepte haben zu wenige Angaben für belastbare Werte und fehlen hier.`;

    tbody.innerHTML = liste.map((r) => `
      <tr data-id="${esc(r.id)}" tabindex="0">
        <th scope="row">${esc(r.title)}${
          r.naehrwerte.vertrauen === 'mittel' ? '<br /><small>Schätzung</small>' : ''}</th>
        ${NAEHRSTOFFE.map((n) => `<td>${anzeige(r.naehrwerte.jePortion[n.id], n)}</td>`).join('')}
        <td>${r.gesundheit ? `<span class="mini-score" style="--p:${r.gesundheit.punkte}">${r.gesundheit.punkte}</span>` : '—'}</td>
      </tr>`).join('');

    for (const th of host.querySelectorAll('th[data-feld]')) {
      th.setAttribute('aria-sort', th.dataset.feld === sortierung.feld ? (sortierung.auf ? 'ascending' : 'descending') : 'none');
    }
  }

  host.querySelector('input').addEventListener('input', (e) => { suche = e.target.value; zeichnen(); });
  host.querySelector('select').addEventListener('change', (e) => { gruppe = e.target.value; zeichnen(); });
  for (const th of host.querySelectorAll('th[data-feld]')) {
    const sortiere = () => {
      const feld = th.dataset.feld;
      // Zahlen zuerst absteigend: wer nach Eiweiss sortiert, sucht viel davon.
      sortierung = sortierung.feld === feld ? { feld, auf: !sortierung.auf } : { feld, auf: feld === 'title' };
      zeichnen();
    };
    th.addEventListener('click', sortiere);
    th.addEventListener('keydown', (e) => { if (e.key === 'Enter') sortiere(); });
  }
  tbody.addEventListener('click', (e) => {
    const id = e.target.closest('tr[data-id]')?.dataset.id;
    const r = id && alleBelastbar.find((x) => x.id === id);
    if (r) onOpen(r);
  });

  zeichnen();
}

/**
 * @param {{onOpen:(recipe:object)=>void, onVorschlaege:()=>void, ansicht?:'woche'|'rezepte'}} h
 */
export function openNaehrwerte({ onOpen, onVorschlaege, ansicht = 'woche' }) {
  const body = el('div');
  const tabs = el('div', 'seg');
  tabs.setAttribute('role', 'tablist');
  const inhalt = el('div');

  const zeige = (welche) => {
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.tab === welche));
    if (welche === 'woche') wocheAnsicht(inhalt, { onVorschlaege });
    else rezepteAnsicht(inhalt, { onOpen });
  };

  for (const [id, label] of [['woche', 'Diese Woche'], ['rezepte', 'Alle Rezepte']]) {
    const b = el('button', 'seg-btn', label);
    b.type = 'button';
    b.dataset.tab = id;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => zeige(id));
    tabs.append(b);
  }

  body.append(tabs, inhalt);
  zeige(ansicht);

  openModal({
    title: 'Nährwerte',
    subtitle: `Berechnet aus den Zutaten · ${naehrwertQuelle.quelle}`,
    body,
    wide: true,
  });
}
