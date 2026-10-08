/**
 * Rezeptansicht: Zutaten auf die gewaehlte Portionszahl gerechnet,
 * Zubereitung und die vollstaendige Quellenangabe.
 */

import { openModal, closeModal, el } from './modal.js';
import { store, maxServingsFor, slotId } from '../state/store.js';
import {
  recipeById, recipes, MEALS, DAYS, vollstaendig, naehrwertRechner,
} from '../data/index.js';
import { restPlatz, quelleVon, resteVon } from '../state/vorkochen.js';
import { ersatzFuer, ersatzKonflikte } from '../state/ersatz.js';
import { formIn, formFaktor, FORMEN, backzeitHinweis, inMetrisch } from '../state/formen.js';
import { sammlungenMit, neueSammlung } from '../state/sammlungen.js';
import { openZeitplan } from './zeitplan.js';
import { wuerfleFeld } from '../state/planer.js';
import { kostenRezept, euroText, HINWEIS_KOSTEN } from '../state/kosten.js';
import { saisonFuer, zeitraum, MONATE } from '../state/saison.js';
import { konflikte, mitHaushalt } from '../state/profile.js';
import { tageSeit } from '../state/bewertung.js';
import { fotoLaden } from './fotos.js';
import { formatAmount } from '../state/units.js';
import { allergensForRecipe, HINWEIS } from '../state/allergens.js';
import { istEigenes } from '../state/eigene.js';
import { openRecipeEditor } from './recipeEditor.js';
import { esc, safeUrl } from './html.js';
import { NAEHRSTOFFE, REFERENZ, anzeige } from '../state/naehrwerte.js';
import { HINWEIS_GESUNDHEIT } from '../state/gesundheit.js';
import { naehrwertQuelle } from '../data/index.js';
import { schrittHtml, timerKnoepfe, openKochmodus } from './kochmodus.js';

const liste = (namen) => namen.map((n) => esc(n)).join(', ');

/**
 * Naehrwerttabelle nach dem Muster der EU-Kennzeichnung, dazu, wie
 * belastbar die Rechnung ist und woher die Zahlen stammen.
 */
function naehrwertBlock(recipe) {
  const n = recipe.naehrwerte;
  if (!n) return '';

  const erkannt = n.posten.length;
  const bewertet = erkannt + n.unbekannt.length;
  const herkunft = `
    <p class="nutri-note">
      Berechnet aus ${erkannt} von ${bewertet} Zutaten mit Mengenangabe.
      ${n.ohneMenge.length ? `Ohne Menge, daher nicht eingerechnet: ${liste(n.ohneMenge)}.` : ''}
      ${n.unbekannt.length ? `Nicht zugeordnet: ${liste(n.unbekannt)}.` : ''}
      ${n.hinweise.map((h) => `${esc(h)}.`).join(' ')}
      Werte roh, ohne Garverluste. Quelle: ${esc(naehrwertQuelle.quelle)}, ${esc(naehrwertQuelle.lizenz)}.
    </p>`;

  if (n.vertrauen === 'gering') {
    return `<h3>Nährwerte</h3>
      <p class="allergen-note">Für belastbare Nährwerte fehlen zu viele Angaben.</p>${herkunft}`;
  }

  const zweiteSpalte = n.art !== 'masse' && n.je100g;
  const referenz = n.art === 'portion';
  const zeilen = NAEHRSTOFFE.map((s) => {
    const wert = n.jePortion[s.id];
    const prozent = referenz && REFERENZ[s.id] ? Math.round((wert / REFERENZ[s.id]) * 100) : null;
    return `<tr class="${s.unter ? 'unter' : ''}">
      <th scope="row">${esc(s.label)}</th>
      <td>${anzeige(wert, s)} ${s.einheit}</td>
      ${zweiteSpalte ? `<td>${anzeige(n.je100g[s.id], s)} ${s.einheit}</td>` : ''}
      ${referenz ? `<td class="ref">${prozent != null ? `${prozent} %` : ''}</td>` : ''}
    </tr>`;
  }).join('');

  return `
    <h3>Nährwerte${n.vertrauen === 'mittel' ? ' <span class="nutri-badge">Schätzung</span>' : ''}</h3>
    <div class="nutri-wrap">
      <table class="nutri-table">
        <thead><tr>
          <th></th><th>${esc(n.bezug)}</th>
          ${zweiteSpalte ? '<th>je 100 g</th>' : ''}
          ${referenz ? '<th title="Anteil an der Referenzmenge für einen Erwachsenen (EU, 2000 kcal)">Ref.*</th>' : ''}
        </tr></thead>
        <tbody>${zeilen}</tbody>
      </table>
    </div>
    ${referenz ? '<p class="nutri-note">* Referenzmenge für einen durchschnittlichen Erwachsenen (8400 kJ/2000 kcal).</p>' : ''}
    ${herkunft}
  `;
}

/** Die Gesundheitsbewertung mit ihren Gruenden. */
function gesundheitBlock(recipe) {
  const g = recipe.gesundheit;
  if (!g) return '';
  const gruende = g.gruende.slice(0, 6).map((x) => `
    <li class="${x.gut ? 'gut' : 'schlecht'}">${x.gut ? '＋' : '−'} ${esc(x.text)}</li>`).join('');
  return `
    <h3>Ausgewogenheit</h3>
    <div class="health-head">
      <span class="health-score" style="--p:${g.punkte}">${g.punkte}</span>
      <span><b>${esc(g.stufe[0].toUpperCase() + g.stufe.slice(1))}</b><br />
        <span class="nutri-note">${g.punkte} von 100 Punkten</span></span>
    </div>
    <ul class="health-reasons">${gruende}</ul>
    <p class="nutri-note">${esc(HINWEIS_GESUNDHEIT)}</p>
  `;
}

/**
 * Der Allergenblock. "Enthält" und "kann enthalten" stehen getrennt,
 * und darunter steht, woher die Angabe kommt: aus den Zutatennamen,
 * nicht von einem Etikett.
 */
function allergenBlock(recipe) {
  const gefunden = recipe.allergens || allergensForRecipe(recipe);
  if (!gefunden.length) {
    return `<h3>Allergene</h3>
      <p class="allergen-note">In den Zutaten ist keines der vierzehn
      kennzeichnungspflichtigen Allergene erkennbar. ${HINWEIS}</p>`;
  }

  const chip = (a) => `<span class="allergen-chip ${a.level}" title="${
    esc(a.quellen.join(', '))
  }">${a.icon} ${esc(a.short)}</span>`;

  const sicher = gefunden.filter((a) => a.level === 'ja');
  const moeglich = gefunden.filter((a) => a.level === 'moeglich');

  return `
    <h3>Allergene</h3>
    ${sicher.length
      ? `<div class="allergen-row"><span class="allergen-lead">Enthält</span>${
          sicher.map(chip).join('')}</div>`
      : ''}
    ${moeglich.length
      ? `<div class="allergen-row"><span class="allergen-lead">Kann enthalten</span>${
          moeglich.map(chip).join('')}</div>`
      : ''}
    <p class="allergen-note">${HINWEIS}</p>
  `;
}

/** Was es ungefaehr kostet, auf die gewaehlten Portionen gerechnet. */
function kostenBlock(recipe, servings) {
  const k = kostenRezept(recipe);
  if (!k) return '';
  if (k.abdeckung < 0.6) {
    return `<h3>Kosten</h3><p class="nutri-note">Für eine Schätzung fehlen zu viele Preise. ${esc(HINWEIS_KOSTEN)}</p>`;
  }
  const faktor = servings / (recipe.servings || 1);
  const gesamt = k.gesamt * faktor;
  const teuer = k.posten.slice(0, 3).filter((p) => p.euro * faktor >= 0.3)
    .map((p) => `${esc(p.name)} ${euroText(p.euro * faktor)}`).join(', ');
  const sparen = k.sparen.slice(0, 2)
    .map((x) => `<li>Statt ${esc(x.statt)}: ${esc(x.mit)} — spart etwa ${euroText(x.ersparnis * faktor)}</li>`).join('');
  return `
    <h3>Kosten <span class="nutri-badge">Schätzung</span></h3>
    <p class="kosten-zeile"><b>ca. ${euroText(gesamt)}</b> für ${esc(String(servings))} ${esc(recipe.yieldUnit || (servings === 1 ? 'Portion' : 'Portionen'))}${
      k.jePortion != null ? ` · ${euroText(k.jePortion)} je ${recipe.yieldUnit && !/portion/i.test(recipe.yieldUnit) ? 'Stück' : 'Portion'}` : ''}</p>
    ${teuer ? `<p class="nutri-note">Am meisten machen aus: ${teuer}.</p>` : ''}
    ${sparen ? `<ul class="sparen">${sparen}</ul>` : ''}
    <p class="nutri-note">${esc(HINWEIS_KOSTEN)}${k.ohnePreis.length ? ` Ohne Preis: ${liste(k.ohnePreis.slice(0, 5))}.` : ''}</p>
  `;
}

/** Saisonzutaten: was jetzt passt und was gerade von weit her kommt. */
function saisonBlock(recipe) {
  if (recipe.lesetext) return '';
  const monat = new Date().getMonth() + 1;
  const s = saisonFuer(recipe, monat);
  if (!s.passend.length && !s.ausser.length) return '';
  return `
    <h3>Saison im ${MONATE[monat - 1]}</h3>
    ${s.passend.length ? `<p class="saison-gut">✓ ${s.passend.map(esc).join(', ')} ${s.passend.length === 1 ? 'hat' : 'haben'} jetzt Saison.</p>` : ''}
    ${s.ausser.length ? `<p class="nutri-note">Außerhalb der Saison: ${s.ausser.map((z) => `${esc(z)} (${esc(zeitraum(z))})`).join(', ')}.</p>` : ''}
  `;
}

/** Fuer wen am Tisch das Rezept nicht passt. */
function haushaltBlock(recipe) {
  const k = store.profile.some((p) => p.aktiv) ? konflikte(recipe, store.profile) : [];
  if (!k.length) return '';
  return `<div class="haushalt-warnung" role="note">⚠ Passt nicht für ${
    k.map((x) => `<b>${esc(x.name)}</b> (${esc(x.gruende.join(', '))})`).join(', ')}</div>`;
}

/** Eigene Sterne, Notiz und Kochverlauf */
function meinBlock(recipe) {
  const b = store.bewertung(recipe.id);
  const sterne = b?.sterne || 0;
  const seit = tageSeit(b);
  const mal = b?.gekocht.length || 0;
  const zuletzt = mal
    ? `${mal}× gekocht, zuletzt ${seit === 0 ? 'heute' : seit === 1 ? 'gestern' : `vor ${seit} Tagen`}`
    : 'Noch nicht gekocht';
  return `
    <h3>Meine Notizen</h3>
    <div class="sterne" role="radiogroup" aria-label="Eigene Bewertung">
      ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="stern${n <= sterne ? ' an' : ''}" data-sterne="${n}"
        role="radio" aria-checked="${n === sterne}" aria-label="${n} von 5 Sternen">★</button>`).join('')}
      <span class="gekocht-info">${esc(zuletzt)}</span>
      <button type="button" class="ghost-btn gekocht-btn">Heute gekocht</button>
    </div>
    <textarea class="notiz" rows="2" maxlength="1000" placeholder="z. B. beim nächsten Mal weniger Salz"
      aria-label="Notiz zum Rezept">${esc(b?.notiz || '')}</textarea>
    ${sammlungsBlock(recipe)}
  `;
}

/** In welchen Sammlungen das Rezept liegt; ein Tipp legt es hinein oder nimmt es heraus */
function sammlungsBlock(recipe) {
  const drin = new Set(sammlungenMit(store.sammlungen, recipe.id).map((x) => x.id));
  return `
    <div class="sammlung-wahl" role="group" aria-label="Sammlungen">
      <span class="allergen-lead">Sammlungen</span>
      ${store.sammlungen.map((x) => `<button type="button" class="sammlung-chip${drin.has(x.id) ? ' an' : ''}" data-sammlung="${esc(x.id)}"
        aria-pressed="${drin.has(x.id)}">${drin.has(x.id) ? '✓ ' : ''}${esc(x.name)}</button>`).join('')}
      <form class="sammlung-neu"><input type="text" name="sammlung" maxlength="60" placeholder="Neue Sammlung"
        aria-label="Name einer neuen Sammlung" /><button type="submit" class="ghost-btn">+</button></form>
    </div>`;
}

/** Ersatz fuer eine Zutat, mit Warnungen fuer den Haushalt */
function ersatzHtml(zutat) {
  const aktiv = store.profile.filter((p) => p.aktiv);
  return `<li class="ersatz-liste"><ul>${ersatzFuer(zutat).map((a) => {
    const k = ersatzKonflikte(a, aktiv);
    return `<li><b>${esc(a.name)}</b>${a.vegan ? ' <span class="nutri-badge">vegan</span>' : ''}
      <span class="ersatz-menge">${esc(a.menge)}</span>
      ${k.length ? `<span class="ersatz-warnung">⚠ ${esc(k.join('; '))}</span>` : ''}</li>`;
  }).join('')}</ul></li>`;
}

/**
 * @param {object} recipe
 * @param {{day:number, meal:string}|null} slot Wenn gesetzt, wirkt die
 *        Portionsanpassung direkt auf den Plan.
 */
export function openRecipe(recipe, slot = null, onPlace = null, onEdited = null) {
  // Die grossen Sammlungen bringen nur eine Zusammenfassung mit; Gruende,
  // Posten und Hinweise entstehen jetzt, fuer dieses eine Rezept.
  vollstaendig(recipe);
  const entry = slot ? store.entry(slot.day, slot.meal) : null;
  let servings = entry?.servings || recipe.servings || 2;
  // Backform: wie im Rezept, oder eine andere — nur fuer diese Ansicht
  const formQuelle = formIn(recipe);
  let formZiel = null;
  const ersatzOffen = new Set();
  // Dieselbe Obergrenze wie im Store, sonst zeigte die Ansicht eine
  // andere Zahl als der Plan speichert.
  const maxServings = maxServingsFor(recipe);

  const body = el('div');
  const foot = el('div');
  timerKnoepfe(body);

  const source = recipe.source;
  const subtitle = [
    source?.title,
    source?.author,
    source?.year ? String(source.year) : null,
  ].filter(Boolean).join(' · ');

  /** Wo die Reste dieses Gerichts liegen oder woher dieser Rest stammt */
  function vorkochHinweis() {
    if (!slot || !entry) return '';
    const feld = (id) => {
      const [d, m] = id.split(':');
      return `${DAYS[Number(d)].label} ${MEALS.find((x) => x.id === m).label}`;
    };
    const aktuell = store.entry(slot.day, slot.meal);
    if (aktuell?.rest) {
      const q = quelleVon(store.week, aktuell);
      return `<p class="rest-hinweis">♻ Rest ${q ? `vom ${esc(feld(q.id))}` : 'vom Vortag'} — wird nur aufgewärmt
        und nicht eingekauft.</p>`;
    }
    if (aktuell?.extra) {
      const r = resteVon(store.week, aktuell).map((x) => feld(x.id));
      return `<p class="rest-hinweis">♻ Gekocht werden ${aktuell.servings + aktuell.extra} Portionen,
        ${aktuell.extra} davon für ${esc(r.join(', ') || 'später')}.</p>`;
    }
    return '';
  }

  function render() {
    const formF = formQuelle && formZiel ? formFaktor(formQuelle, formZiel) : 1;
    const factor = (servings / (recipe.servings || 1)) * formF;

    const ings = recipe.ingredients
      .map((i, idx) => {
        const amount = i.amount == null ? null : i.amount * factor;
        // Tassen und Cups in Gramm oder Milliliter, wenn gewuenscht
        const m = store.ansicht.metrisch ? inMetrisch({ ...i, amount }, naehrwertRechner) : null;
        const label = m ? `≈ ${formatAmount(m.amount, m.unit)}` : formatAmount(amount, i.unit);
        const ersatz = ersatzFuer(i.name).length;
        return `<li><span>${esc(i.name)}${ersatz ? ` <button type="button" class="ersatz-btn" data-ersatz="${idx}"
          aria-expanded="${ersatzOffen.has(idx)}" title="Ersatz für ${esc(i.name)}" aria-label="Ersatz für ${esc(i.name)}">⇄</button>` : ''}</span>
          <span class="amt"${m ? ` title="im Rezept: ${esc(formatAmount(amount, i.unit))}"` : ''}>${esc(label || '—')}</span></li>
          ${ersatzOffen.has(idx) ? ersatzHtml(i.name) : ''}`;
      })
      .join('');

    const formWahl = formQuelle ? `
      <label class="form-wahl">Backform
        <select data-form>
          <option value="">${esc(formQuelle.name)}${formQuelle.angenommen ? ' (angenommen)' : ' (wie im Rezept)'}</option>
          ${FORMEN.filter((f) => f.id !== formQuelle.id).map((f) => `<option value="${f.id}" ${formZiel?.id === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
        </select>
      </label>
      ${formZiel ? `<p class="nutri-note">Mengen × ${esc(formF.toLocaleString('de-DE', { maximumFractionDigits: 2 }))} für die andere Form, nur in dieser Ansicht.
        ${esc(backzeitHinweis(formF))}</p>` : ''}` : '';

    // Thermomix-Einstellungen ("10 Sek./Stufe 5") hervorgehoben, Zeitangaben als Timer-Knopf
    const steps = (recipe.steps || [])
      .map((s, i) => `<li>${schrittHtml(s, { name: `${recipe.title.slice(0, 24)}, Schritt ${i + 1}` })}</li>`)
      .join('');
    const link = recipe.sourceUrl || source?.url;

    // Bei abgeschriebenen Rezepten die Angabe, woher sie stammen
    const q = recipe.quelle;
    const quellenZeile = q
      ? `<p class="source-line"><strong>Quelle:</strong> ${[
        q.titel && `<cite>${esc(q.titel)}</cite>`, q.autor && esc(q.autor), q.jahr && esc(q.jahr), q.seite && `S. ${esc(q.seite)}`,
      ].filter(Boolean).join(', ')}</p>`
      : '';

    const licence = source
      ? `<div class="source-note">${quellenZeile}
           <strong>${esc(source.title)}</strong>${source.author ? `, ${esc(source.author)}` : ''}${
             source.year ? ` (${esc(source.year)})` : ''
           }<br />
           Lizenz: ${source.licenseUrl
             ? `<a href="${esc(safeUrl(source.licenseUrl))}" target="_blank" rel="noopener noreferrer">${esc(source.license)}</a>`
             : esc(source.license)} · ${esc(source.via || '')}
           ${link
             ? `<br /><a href="${esc(safeUrl(link))}" target="_blank" rel="noopener noreferrer">${esc(link)}</a>`
             : ''}
           ${recipe.note ? `<br /><br />${esc(recipe.note)}` : ''}
         </div>`
      : '';

    body.innerHTML = `
      ${haushaltBlock(recipe)}
      ${vorkochHinweis()}
      <div class="detail-grid">
        <div>
          <h3>Zutaten</h3>
          ${formWahl}
          <div class="servings-row">
            <button class="icon-btn" data-step="-1" aria-label="Weniger Portionen">−</button>
            <b>${servings}</b>
            <button class="icon-btn" data-step="1" aria-label="Mehr Portionen">+</button>
            <span>${esc(recipe.yieldUnit || 'Portionen')}</span>
          </div>
          <ul class="ing-list">${ings}</ul>
          ${allergenBlock(recipe)}
          ${meinBlock(recipe)}
        </div>
        <div>
          <h3>Zubereitung${recipe.totalTime > 0 ? ` · ${recipe.totalTime} Minuten` : ''}</h3>
          ${recipe.lesetext ? `<p class="original-note">Historischer Text im Wortlaut. Die Zutatenliste ist
            daraus erschlossen und kann unvollständig sein; alte Maße sind umgerechnet.
            ${recipe.servingsGeschaetzt ? 'Das Original nennt keine Portionszahl, gerechnet wird mit 4.' : ''}</p>` : ''}
          <ol class="step-list${recipe.lesetext ? ' original' : ''}">${steps}</ol>
          ${naehrwertBlock(recipe)}
          ${gesundheitBlock(recipe)}
          ${saisonBlock(recipe)}
          ${kostenBlock(recipe, servings)}
          ${licence}
        </div>
      </div>
    `;

    body.querySelector('[data-form]')?.addEventListener('change', (e) => {
      formZiel = FORMEN.find((f) => f.id === e.target.value) || null;
      render();
    });
    for (const btn of body.querySelectorAll('[data-ersatz]')) {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.ersatz);
        if (ersatzOffen.has(idx)) ersatzOffen.delete(idx);
        else ersatzOffen.add(idx);
        render();
      });
    }
    for (const btn of body.querySelectorAll('[data-sammlung]')) {
      btn.addEventListener('click', () => {
        store.inSammlung(btn.dataset.sammlung, recipe.id);
        render();
      });
    }
    body.querySelector('.sammlung-neu')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = e.target.elements.sammlung.value.trim();
      if (!name) return;
      const neu = neueSammlung(name);
      neu.rezepte.push(recipe.id);
      store.setSammlungen([...store.sammlungen, neu]);
      render();
    });

    for (const btn of body.querySelectorAll('[data-sterne]')) {
      btn.addEventListener('click', () => {
        const n = Number(btn.dataset.sterne);
        // Derselbe Stern noch einmal nimmt die Bewertung zurueck
        store.bewerte(recipe.id, store.bewertung(recipe.id)?.sterne === n ? 0 : n);
        render();
      });
    }
    body.querySelector('.gekocht-btn')?.addEventListener('click', () => {
      store.gekocht(recipe.id);
      render();
    });
    const notiz = body.querySelector('.notiz');
    let notizTakt = null;
    notiz?.addEventListener('input', () => {
      clearTimeout(notizTakt);
      notizTakt = setTimeout(() => store.notiere(recipe.id, notiz.value), 400);
    });
    notiz?.addEventListener('blur', () => {
      clearTimeout(notizTakt);
      if ((store.bewertung(recipe.id)?.notiz || '') !== notiz.value) store.notiere(recipe.id, notiz.value);
    });

    for (const btn of body.querySelectorAll('[data-step]')) {
      btn.addEventListener('click', () => {
        servings = Math.max(1, Math.min(maxServings, servings + Number(btn.dataset.step)));
        if (slot) store.setServings(slot.day, slot.meal, servings);
        render();
      });
    }
  }

  function renderFoot() {
    foot.replaceChildren();

    if ((recipe.steps || []).length) {
      const kochen = el('button', 'ghost-btn km-start', 'Kochmodus');
      kochen.title = 'Schritt für Schritt, großer Text, Timer, Bildschirm bleibt an';
      kochen.addEventListener('click', () => {
        closeModal();
        openKochmodus(recipe, { servings });
      });
      foot.append(kochen);
    }

    if ((recipe.steps || []).length) {
      const plan = el('button', 'ghost-btn', 'Zeitplan');
      plan.title = 'Wann was beginnen muss, damit alles zur selben Zeit fertig ist';
      plan.addEventListener('click', () => openZeitplan({
        rezepte: [recipe],
        slot,
        onOpen: () => (slot ? openSlot(slot, onEdited) : openRecipe(recipe, null, onPlace, onEdited)),
      }));
      foot.append(plan);
    }

    if (istEigenes(recipe)) {
      const aendern = el('button', 'ghost-btn', 'Bearbeiten');
      aendern.addEventListener('click', () => openRecipeEditor(recipe, { onSaved: onEdited, onDeleted: onEdited }));
      foot.append(aendern);
    }

    if (slot) {
      const where = el('span', null,
        `${DAYS[slot.day].label}, ${MEALS.find((m) => m.id === slot.meal).label}`);
      where.style.color = 'var(--ink-faint)';
      where.style.fontSize = '12.5px';

      // Nach denselben Vorgaben wie "Woche füllen" ein anderes Gericht ziehen
      const anders = el('button', 'ghost-btn', 'Anderes Gericht');
      anders.title = 'Ein anderes Rezept für dieses Feld, nach den Vorgaben von „Woche füllen“';
      anders.addEventListener('click', () => {
        const neu = wuerfleFeld(recipes, store.week, slot, mitHaushalt(store.vorgaben, store.profile), {
          vorrat: store.vorrat, lookup: recipeById, bewertungen: store.bewertungen,
        });
        if (!neu) {
          anders.textContent = 'Kein anderes passendes';
          anders.disabled = true;
          return;
        }
        store.place(slot.day, slot.meal, neu.recipeId, neu.servings);
        openSlot(slot, onEdited);
      });

      // Doppelt kochen: der Rest kommt aufs naechste freie Feld
      const aktuell = store.entry(slot.day, slot.meal);
      const doppelt = el('button', 'ghost-btn', 'Doppelt kochen');
      doppelt.title = 'Mehr kochen und den Rest an einem der nächsten Tage essen';
      const ziel = aktuell && !aktuell.rest ? restPlatz(store.week, slotId(slot.day, slot.meal)) : null;
      if (!ziel) {
        doppelt.disabled = true;
        doppelt.title = aktuell?.rest ? 'Das ist schon ein Rest' : 'In den nächsten zwei Tagen ist kein Feld frei';
      }
      doppelt.addEventListener('click', () => {
        const [d, m] = ziel.split(':');
        if (store.vorkochen(slot, { day: Number(d), meal: m }, aktuell.servings)) openSlot(slot, onEdited);
      });

      const remove = el('button', 'ghost-btn', 'Aus Plan entfernen');
      remove.addEventListener('click', () => {
        store.remove(slot.day, slot.meal);
        closeModal();
      });

      const done = el('button', 'primary-btn', 'Fertig');
      done.addEventListener('click', closeModal);

      foot.append(where, el('span', 'spacer'), doppelt, anders, remove, done);
    } else {
      const add = el('button', 'primary-btn', 'In den Plan legen');
      add.addEventListener('click', () => {
        onPlace?.(recipe, servings);
        closeModal();
      });

      const hint = el('span', null, 'Oder die Karte direkt auf ein Feld ziehen.');
      hint.style.color = 'var(--ink-faint)';
      hint.style.fontSize = '12.5px';

      foot.append(hint, el('span', 'spacer'), add);
    }
  }

  render();
  renderFoot();
  openModal({ title: recipe.title, subtitle, body, footer: foot, wide: true });

  // Eigenes Foto, falls vorhanden; es kommt aus IndexedDB und damit spaeter
  if (istEigenes(recipe)) {
    fotoLaden(recipe.id).then((url) => {
      if (!url || !body.isConnected) return;
      const bild = Object.assign(document.createElement('img'), { src: url, alt: recipe.title, className: 'rezept-foto' });
      body.prepend(bild);
    });
  }
}

/** Oeffnet das Rezept, das in einem Feld liegt. */
export function openSlot(slot, onEdited = null) {
  const entry = store.entry(slot.day, slot.meal);
  if (!entry) return;
  const recipe = recipeById.get(entry.recipeId);
  if (recipe) openRecipe(recipe, slot, null, onEdited);
}
