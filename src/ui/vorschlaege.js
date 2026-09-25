/**
 * Vorschlaege fuer gesunde Gerichte.
 *
 * Je Mahlzeit die am besten bewerteten Rezepte, die noch nicht im Plan
 * liegen. Was der Woche bisher fehlt — Ballaststoffe etwa —, gibt
 * Rezepten Vorrang, die genau das mitbringen; die Karte sagt dann auch,
 * warum. Die Filter der Bibliothek gelten mit: wer "ohne Milch" gewaehlt
 * hat, bekommt nichts mit Milch vorgeschlagen.
 */

import { openModal, el } from './modal.js';
import { esc } from './html.js';
import { store, slotId } from '../state/store.js';
import { MEALS, DAYS, vollstaendig } from '../data/index.js';
import { vorschlaege, wochenLuecke, HINWEIS_GESUNDHEIT } from '../state/gesundheit.js';
import { kcalText } from '../state/naehrwerte.js';

const MAHLZEITEN = MEALS.filter((m) => m.id !== 'snack');
const JE_SEITE = 6;

/** Die erste Mahlzeit, fuer die in dieser Woche noch ein Feld frei ist. */
function naechsteFreieMahlzeit() {
  for (const m of MAHLZEITEN) {
    if (DAYS.some((_, d) => !store.week[slotId(d, m.id)])) return m.id;
  }
  return 'mittag';
}

function freierTag(mahlzeit) {
  return DAYS.findIndex((_, d) => !store.week[slotId(d, mahlzeit)]);
}

function karte(v, mahlzeit, { onOpen, onGeplant }) {
  // Fuer die Rangliste reicht die Punktzahl; die Gruende auf der Karte
  // gibt es erst mit der vollen Rechnung — fuer sechs Karten, nicht fuer alle.
  const r = vollstaendig(v.rezept);
  const g = r.gesundheit || v.bewertung;
  const card = el('article', 'suggest-card');
  const gruende = g.gruende.filter((x) => x.gut).slice(0, 3)
    .map((x) => `<span class="tag diet">${esc(x.text)}</span>`).join('');

  card.innerHTML = `
    <span class="health-score small" style="--p:${g.punkte}" title="${g.punkte} von 100 Punkten">${g.punkte}</span>
    <div class="body">
      <h3>${esc(r.title)}</h3>
      <div class="meta">
        <span>${esc(g.stufe[0].toUpperCase() + g.stufe.slice(1))}</span>
        <span>${esc(kcalText(r))}</span>
        ${r.totalTime > 0 ? `<span>${r.totalTime} Min.</span>` : ''}
        ${v.passtZurWoche ? '<span class="passt">passt zur Woche</span>' : ''}
      </div>
      <div class="tag-row">${gruende}</div>
    </div>
    <div class="actions">
      <button class="ghost-btn" type="button" data-ansehen>Ansehen</button>
      <button class="primary-btn" type="button" data-planen>Einplanen</button>
    </div>
  `;

  card.querySelector('[data-ansehen]').addEventListener('click', () => onOpen(r));
  card.querySelector('[data-planen]').addEventListener('click', (e) => {
    const tag = freierTag(mahlzeit);
    if (tag < 0) {
      e.target.textContent = 'Alles belegt';
      e.target.disabled = true;
      return;
    }
    store.place(tag, mahlzeit, r.id);
    onGeplant?.(r, tag, mahlzeit);
    e.target.textContent = `${DAYS[tag].short} geplant`;
    e.target.disabled = true;
  });
  return card;
}

/**
 * @param {{pool:()=>object[], filterText:()=>string, onOpen:(r:object)=>void, onGeplant?:Function}} h
 */
export function openVorschlaege({ pool, filterText, onOpen, onGeplant }) {
  let mahlzeit = naechsteFreieMahlzeit();
  let seite = 0;

  const body = el('div');
  const seg = el('div', 'seg');
  const hinweis = el('div');
  const liste = el('div', 'suggest-list');
  const mehr = el('button', 'ghost-btn', 'Weitere Vorschläge');
  mehr.type = 'button';

  for (const m of MAHLZEITEN) {
    const b = el('button', 'seg-btn', m.label);
    b.type = 'button';
    b.dataset.meal = m.id;
    b.addEventListener('click', () => { mahlzeit = m.id; seite = 0; zeichnen(); });
    seg.append(b);
  }

  function rangliste() {
    const luecke = wochenLuecke(store.naehrwerteProTag());
    const geplant = new Set(Object.values(store.week).map((e) => e.recipeId));
    return {
      luecke,
      liste: vorschlaege(pool(), { mahlzeit, ausschliessen: geplant, schwerpunkt: luecke.schwerpunkt }),
    };
  }

  function zeichnen() {
    for (const b of seg.children) b.setAttribute('aria-selected', String(b.dataset.meal === mahlzeit));
    const { luecke, liste: rang } = rangliste();
    const filter = filterText();

    hinweis.innerHTML = `
      ${luecke.text ? `<p class="week-hint"><span>${esc(luecke.text)} Vorschläge, die das ausgleichen, stehen vorn.</span></p>` : ''}
      ${filter ? `<p class="nutri-note">Es gelten die Filter der Bibliothek: ${esc(filter)}.</p>` : ''}
    `;

    liste.replaceChildren();
    if (!rang.length) {
      liste.append(Object.assign(el('p', 'empty-note'), {
        textContent: 'Für diese Mahlzeit gibt es mit den aktuellen Filtern keinen passenden Vorschlag.',
      }));
      mehr.hidden = true;
      return;
    }

    const seiten = Math.ceil(rang.length / JE_SEITE);
    seite %= seiten;
    for (const v of rang.slice(seite * JE_SEITE, (seite + 1) * JE_SEITE)) {
      liste.append(karte(v, mahlzeit, { onOpen, onGeplant }));
    }
    mehr.hidden = seiten < 2;
    mehr.textContent = `Weitere Vorschläge (${seite + 1}/${seiten})`;
  }

  mehr.addEventListener('click', () => { seite += 1; zeichnen(); });

  const note = Object.assign(el('p', 'nutri-note'), { textContent: HINWEIS_GESUNDHEIT });
  body.append(seg, hinweis, liste, mehr, note);

  // Fusszeile: die ganze Woche auf einmal
  const foot = el('div');
  const fuellen = el('button', 'primary-btn', 'Woche gesund füllen');
  fuellen.type = 'button';
  fuellen.title = 'Freie Felder für Frühstück, Mittag und Abend mit gut bewerteten Gerichten belegen';
  fuellen.addEventListener('click', () => {
    const n = gesundFuellen(pool());
    fuellen.textContent = n ? `${n} Felder belegt` : 'Nichts mehr frei';
    zeichnen();
  });
  foot.append(el('span', 'spacer'), fuellen);

  zeichnen();
  openModal({
    title: 'Gesunde Vorschläge',
    subtitle: 'Gut bewertete Gerichte, die noch nicht im Plan liegen',
    body,
    footer: foot,
    wide: true,
  });
}

/**
 * Belegt alle freien Felder fuer Fruehstueck, Mittag und Abend mit gut
 * bewerteten Gerichten. Damit nicht jede Woche gleich aussieht, wird aus
 * den besten zwoelf je Mahlzeit gelost, ohne Wiederholung.
 *
 * @returns {number} Zahl der belegten Felder
 */
export function gesundFuellen(vorrat, zufall = Math.random) {
  const luecke = wochenLuecke(store.naehrwerteProTag());
  const belegt = new Set(Object.values(store.week).map((e) => e.recipeId));
  const neu = {};

  for (const m of MAHLZEITEN) {
    for (let d = 0; d < DAYS.length; d += 1) {
      if (store.week[slotId(d, m.id)]) continue;
      const kandidaten = vorschlaege(vorrat, { mahlzeit: m.id, ausschliessen: belegt, schwerpunkt: luecke.schwerpunkt })
        .slice(0, 12);
      if (!kandidaten.length) continue;
      const wahl = kandidaten[Math.floor(zufall() * kandidaten.length)].rezept;
      neu[slotId(d, m.id)] = { recipeId: wahl.id, servings: wahl.servings || 2 };
      belegt.add(wahl.id);
    }
  }

  store.placeMany(neu);
  return Object.keys(neu).length;
}

