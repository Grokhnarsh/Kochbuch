/**
 * Zeitplan fuer ein Menue: Gerichte waehlen, die Essenszeit nennen, und
 * die App sagt, wann was beginnt. Siehe state/zeitplan.js.
 */

import { openModal, el } from './modal.js';
import { esc } from './html.js';
import { store } from '../state/store.js';
import { recipeById, DAYS, MEALS } from '../data/index.js';
import { zeitplan, uhrzeit } from '../state/zeitplan.js';
import { ESSENSZEITEN } from '../state/kalender.js';
import { dauerText } from '../state/zeiten.js';
import { starteTimer } from './timer.js';

const zwei = (n) => String(n).padStart(2, '0');

/**
 * @param {{rezepte?:object[], slot?:{day:number, meal:string}|null, onOpen?:(r:object)=>void}} opt
 */
export function openZeitplan({ rezepte = [], slot = null, onOpen = null } = {}) {
  const gewaehlt = new Map(rezepte.map((r) => [r.id, r]));
  const tag = slot ? store.dateOf(slot.day) : new Date();

  // Essenszeit: die der Mahlzeit, sonst die naechste volle Viertelstunde nach der laengsten Kochzeit
  let ziel;
  if (slot && ESSENSZEITEN[slot.meal]) {
    const [h, m] = ESSENSZEITEN[slot.meal];
    ziel = `${zwei(h)}:${zwei(m)}`;
  } else {
    const d = new Date(Date.now() + Math.max(30, ...rezepte.map((r) => r.totalTime || 30)) * 60000);
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    ziel = uhrzeit(d);
  }

  const body = el('div', 'zeitplan');

  /** Was sonst noch in Frage kommt: die Gerichte der Woche, die vom selben Tag zuerst */
  function kandidaten() {
    const liste = [];
    const gesehen = new Set(gewaehlt.keys());
    const tage = slot ? [slot.day, ...DAYS.map((_, i) => i).filter((i) => i !== slot.day)] : DAYS.map((_, i) => i);
    for (const d of tage) {
      for (const m of MEALS) {
        const e = store.entry(d, m.id);
        const r = e && !e.rest && recipeById.get(e.recipeId);
        if (!r || gesehen.has(r.id) || !(r.steps || []).length) continue;
        gesehen.add(r.id);
        liste.push({ r, wo: `${DAYS[d].short} ${m.short}` });
      }
    }
    return liste;
  }

  function zeichne() {
    const [h, m] = ziel.split(':').map(Number);
    const essen = new Date(tag);
    essen.setHours(h, m, 0, 0);
    const plan = zeitplan([...gewaehlt.values()], essen);
    const weitere = kandidaten();

    body.innerHTML = `
      <div class="zeitplan-kopf">
        <label>Essen um <input type="time" name="ziel" value="${esc(ziel)}" step="300" /></label>
        <div class="planer-chips">${[...gewaehlt.values()].map((r) => `<span class="planer-chip an"><span>${esc(r.title)}
          ${gewaehlt.size > 1 ? `<button type="button" class="chip-weg" data-weg="${esc(r.id)}" aria-label="${esc(r.title)} entfernen">&times;</button>` : ''}</span></span>`).join('')}</div>
        ${weitere.length ? `<label>Gericht dazu <select name="dazu"><option value="">aus dem Wochenplan …</option>
          ${weitere.map((x) => `<option value="${esc(x.r.id)}">${esc(x.wo)}: ${esc(x.r.title)}</option>`).join('')}</select></label>` : ''}
      </div>
      ${plan.beginn ? `<p class="zeitplan-summe">Beginn um <b>${uhrzeit(plan.beginn)}</b>, fertig um <b>${uhrzeit(essen)}</b>
        ${plan.konflikte ? ` · <span class="ersatz-warnung">⚠ ${plan.konflikte === 1 ? 'eine Stelle' : `${plan.konflikte} Stellen`}, an der zwei Arbeiten zugleich anstehen — vorziehen oder Hilfe holen</span>` : ''}</p>` : ''}
      <ol class="zeitplan-liste">${plan.schritte.map((x) => `
        <li class="${x.art}${x.konflikt ? ' konflikt' : ''}${x.aktiv ? '' : ' passiv'}">
          <time>${uhrzeit(x.zeit)}</time>
          <span><b>${esc(x.rezept)}</b>${x.nr ? ` · Schritt ${x.nr}` : ''}<br />${esc(x.text)}
            ${x.sekunden >= 60 ? `<small>${esc(dauerText(x.sekunden))}${x.aktiv ? '' : ', nebenbei'}</small>` : ''}</span>
        </li>`).join('')}</ol>
      <p class="nutri-note">Geschätzt aus den Zeiten im Rezept; Schritte ohne Zeitangabe teilen sich den Rest der Gesamtzeit.
        „Nebenbei“ heißt: Der Topf arbeitet, die Hände sind frei.</p>
      <p class="zeitplan-status" aria-live="polite"></p>
    `;

    body.querySelector('[name="ziel"]').addEventListener('change', (e) => {
      if (/^\d{2}:\d{2}$/.test(e.target.value)) ziel = e.target.value;
      zeichne();
    });
    body.querySelector('[name="dazu"]')?.addEventListener('change', (e) => {
      const r = recipeById.get(e.target.value);
      if (r) gewaehlt.set(r.id, r);
      zeichne();
    });
    for (const b of body.querySelectorAll('[data-weg]')) {
      b.addEventListener('click', () => {
        gewaehlt.delete(b.dataset.weg);
        zeichne();
      });
    }
    zeichneFuss(plan);
  }

  const foot = el('div');
  function zeichneFuss(plan) {
    foot.replaceChildren();
    const bisStart = plan.beginn ? Math.round((plan.beginn.getTime() - Date.now()) / 1000) : 0;
    const wecker = el('button', 'primary-btn', 'Timer bis zum Start');
    wecker.disabled = !(bisStart > 30 && bisStart < 24 * 3600);
    wecker.title = wecker.disabled ? 'Der Beginn liegt nicht in den nächsten 24 Stunden' : `Klingelt um ${uhrzeit(plan.beginn)}`;
    wecker.addEventListener('click', () => {
      starteTimer(bisStart, `Loslegen: ${[...gewaehlt.values()].map((r) => r.title).join(', ').slice(0, 40)}`);
      body.querySelector('.zeitplan-status').textContent = `Timer läuft: ${dauerText(bisStart)}.`;
    });
    foot.append(el('span', 'spacer'));
    if (onOpen && gewaehlt.size === 1) {
      const zurueck = el('button', 'ghost-btn', 'Zum Rezept');
      zurueck.addEventListener('click', () => onOpen([...gewaehlt.values()][0]));
      foot.append(zurueck);
    }
    foot.append(wecker);
  }

  zeichne();
  openModal({
    title: 'Zeitplan',
    subtitle: slot ? `${DAYS[slot.day].label}, ${MEALS.find((m) => m.id === slot.meal).label}` : 'Damit alles zugleich fertig ist',
    body,
    footer: foot,
    wide: true,
  });
}
