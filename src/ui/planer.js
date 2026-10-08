/**
 * "Woche füllen" mit Vorgaben: Mahlzeiten, Tage, Personen, Ernaehrung,
 * Zeit, Allergene, Fisch, gesund, Vorrat. Die Vorgaben bleiben fuer das
 * naechste Mal gespeichert, und mit denselben laesst sich spaeter ein
 * einzelnes Feld neu wuerfeln.
 */

import { openModal, closeModal, el } from './modal.js';
import { esc } from './html.js';
import { store } from '../state/store.js';
import { recipes, recipeById, MEALS, DAYS, DIET_OPTIONS } from '../data/index.js';
import { ALLERGENS } from '../state/allergens.js';
import { planeWoche } from '../state/planer.js';
import { mitHaushalt } from '../state/profile.js';
import { MONATE } from '../state/saison.js';

const ZEITEN = [[0, 'beliebig'], [20, 'bis 20 Min.'], [30, 'bis 30 Min.'], [45, 'bis 45 Min.'], [60, 'bis 60 Min.']];

/**
 * @param {{bibliothek?:()=>object[], filterText?:()=>string, onFertig?:Function}} opt
 *        bibliothek liefert die gefilterte Bibliothek, falls der Plan sich danach richten soll
 */
export function openPlaner({ bibliothek = null, filterText = () => '', onFertig = null } = {}) {
  const v = store.vorgaben;
  const filter = filterText();
  const aktive = store.profile.filter((p) => p.aktiv);
  const bewertet = Object.keys(store.bewertungen).length > 0;
  const body = el('form', 'planer');
  const foot = el('div');

  const check = (name, value, an, label) => `<label class="planer-chip">
    <input type="checkbox" name="${name}" value="${esc(value)}" ${an ? 'checked' : ''} /><span>${label}</span></label>`;

  body.innerHTML = `
    <fieldset>
      <legend>Mahlzeiten</legend>
      <div class="planer-chips">${MEALS.map((m) => check('mahlzeiten', m.id, v.mahlzeiten.includes(m.id), esc(m.label))).join('')}</div>
    </fieldset>
    <fieldset>
      <legend>Tage</legend>
      <div class="planer-chips">${DAYS.map((d, i) => check('tage', i, v.tage.includes(i), esc(d.short))).join('')}</div>
    </fieldset>
    <div class="planer-reihe">
      <label>Personen
        <select name="personen">
          <option value="0">wie im Rezept</option>
          ${[1, 2, 3, 4, 5, 6, 8].map((n) => `<option value="${n}" ${v.personen === n ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      <label>Ernährung
        <select name="ernaehrung">
          <option value="">alles</option>
          ${DIET_OPTIONS.map((d) => `<option value="${d}" ${v.ernaehrung === d ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
      </label>
      <label>Zubereitung
        <select name="maxZeit">
          ${ZEITEN.map(([n, l]) => `<option value="${n}" ${v.maxZeit === n ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </label>
      <label>Fisch je Woche
        <select name="fischProWoche">
          ${[0, 1, 2, 3].map((n) => `<option value="${n}" ${v.fischProWoche === n ? 'selected' : ''}>${n ? `${n}×` : 'egal'}</option>`).join('')}
        </select>
      </label>
    </div>
    <fieldset>
      <legend>Ohne Allergene</legend>
      <div class="planer-chips">${ALLERGENS.map((a) => check('ohneAllergene', a.id, v.ohneAllergene.includes(a.id), `${a.icon} ${esc(a.short)}`)).join('')}</div>
    </fieldset>
    <fieldset class="planer-optionen">
      <legend>Bevorzugen</legend>
      <label><input type="checkbox" name="haushalt" ${v.haushalt ? 'checked' : ''} ${aktive.length ? '' : 'disabled'} />
        ${aktive.length ? `passend für alle am Tisch: ${esc(aktive.map((p) => p.name).join(', '))}` : 'passend für den Haushalt — noch keine Personen angelegt'}</label>
      <label><input type="checkbox" name="gesund" ${v.gesund ? 'checked' : ''} /> gut bewertete, ausgewogene Gerichte</label>
      <label><input type="checkbox" name="saison" ${v.saison ? 'checked' : ''} /> Obst und Gemüse der Saison (${MONATE[new Date().getMonth()]})</label>
      <label><input type="checkbox" name="lieblinge" ${v.lieblinge ? 'checked' : ''} ${bewertet ? '' : 'disabled'} />
        eigene Lieblinge, gerade Gekochtes erst später${bewertet ? '' : ' — noch nichts bewertet'}</label>
      <label><input type="checkbox" name="vorrat" ${v.vorrat ? 'checked' : ''} ${store.vorrat.length ? '' : 'disabled'} />
        Rezepte, deren Zutaten im Vorrat liegen${store.vorrat.length ? ` (${store.vorrat.length} Posten)` : ' — der Vorrat ist leer'}</label>
      ${filter ? `<label><input type="checkbox" name="bibliothek" /> nur aus der gefilterten Bibliothek (${esc(filter)})</label>` : ''}
      <label><input type="checkbox" name="ersetzen" ${v.ersetzen ? 'checked' : ''} /> belegte Felder neu planen</label>
    </fieldset>
    <p class="planer-ergebnis" aria-live="polite"></p>
  `;

  function lesen() {
    const f = new FormData(body);
    return {
      mahlzeiten: f.getAll('mahlzeiten'),
      tage: f.getAll('tage').map(Number),
      personen: Number(f.get('personen')),
      ernaehrung: f.get('ernaehrung'),
      maxZeit: Number(f.get('maxZeit')),
      ohneAllergene: f.getAll('ohneAllergene'),
      fischProWoche: Number(f.get('fischProWoche')),
      gesund: f.has('gesund'),
      vorrat: f.has('vorrat'),
      saison: f.has('saison'),
      lieblinge: f.has('lieblinge'),
      haushalt: f.has('haushalt'),
      ersetzen: f.has('ersetzen'),
    };
  }

  const ergebnis = body.querySelector('.planer-ergebnis');
  /** Was der letzte Durchgang gelegt hat; "Noch einmal" ersetzt genau das. */
  let zuletzt = [];

  function planen() {
    const vorgaben = lesen();
    store.vorgaben = vorgaben;
    if (!vorgaben.mahlzeiten.length || !vorgaben.tage.length) {
      ergebnis.textContent = 'Mindestens eine Mahlzeit und einen Tag wählen.';
      return;
    }
    const pool = new FormData(body).has('bibliothek') && bibliothek ? bibliothek() : recipes;
    const { eintraege, ohneTreffer, fisch } = planeWoche(pool, store.week, mitHaushalt(vorgaben, store.profile), {
      vorrat: store.vorrat, lookup: recipeById, bewertungen: store.bewertungen,
    });
    store.placeMany(eintraege);
    zuletzt = Object.keys(eintraege);
    const n = zuletzt.length;
    const teile = [n ? `${n} ${n === 1 ? 'Feld' : 'Felder'} geplant` : 'Kein Feld geplant'];
    if (vorgaben.fischProWoche) teile.push(`${fisch}× Fisch in der Woche`);
    if (ohneTreffer.length) teile.push(`für ${ohneTreffer.length} kein passendes Rezept — die Vorgaben sind dafür zu eng`);
    if (!n && !ohneTreffer.length) teile.push('alle gewählten Felder sind schon belegt');
    ergebnis.textContent = `${teile.join(', ')}.`;
    los.textContent = 'Noch einmal würfeln';
    onFertig?.(n);
  }

  body.addEventListener('submit', (e) => {
    e.preventDefault();
    los.click();
  });

  const fertig = el('button', 'ghost-btn', 'Schließen');
  fertig.type = 'button';
  fertig.addEventListener('click', closeModal);
  const los = el('button', 'primary-btn', 'Woche planen');
  los.type = 'button';
  los.addEventListener('click', () => {
    // "Noch einmal" ersetzt, was eben geplant wurde — von Hand Gelegtes bleibt
    const v2 = lesen();
    if (zuletzt.length && v2.mahlzeiten.length && v2.tage.length) store.removeMany(zuletzt);
    planen();
  });
  foot.append(el('span', 'spacer'), fertig, los);

  openModal({
    title: 'Woche füllen',
    subtitle: 'Nach Vorgaben, mit etwas Zufall',
    body,
    footer: foot,
    wide: true,
  });
}
