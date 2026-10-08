/**
 * Haushalt: wer mitisst, was gekocht wurde, Sichern und Teilen, Drucken.
 */

import { openModal, el } from './modal.js';
import { esc } from './html.js';
import { store, SPEICHER } from '../state/store.js';
import { recipeById, DIET_OPTIONS, vollstaendig } from '../data/index.js';
import { VORLAGEN, HINWEIS_ZIELE } from '../state/profile.js';
import { rueckblick } from '../state/rueckblick.js';
import { MONATE } from '../state/saison.js';
import { euroText } from '../state/kosten.js';
import { icsWoche } from '../state/kalender.js';
import { neueSammlung, sammlungsLink } from '../state/sammlungen.js';
import { ALLERGENS } from '../state/allergens.js';
import { verlauf } from '../state/bewertung.js';
import { sicherung, wiederherstellen, planLink } from '../state/teilen.js';
import { alleFotos, fotoSpeichern } from './fotos.js';
import { drucken } from './drucken.js';

const TAGESFORMAT = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const alsDatum = (tag) => {
  const [j, m, t] = tag.split('-').map(Number);
  return TAGESFORMAT.format(new Date(j, m - 1, t));
};

function herunterladen(name, text, typ = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: typ }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * @param {{onOpen:(recipe:object)=>void, ansicht?:string}} opt
 */
export function openHaushalt({ onOpen, ansicht = 'personen' } = {}) {
  let tab = ansicht;
  const body = el('div', 'haushalt');
  let unsubscribe = null;

  function zeichne() {
    body.replaceChildren();
    const reiter = el('div', 'seg');
    reiter.setAttribute('role', 'tablist');
    for (const [id, label] of [['personen', 'Personen'], ['verlauf', 'Gekocht'], ['rueckblick', 'Rückblick'],
      ['sammlungen', 'Sammlungen'], ['sichern', 'Sichern & Teilen'], ['drucken', 'Drucken & Kalender']]) {
      const b = el('button', 'seg-btn', label);
      b.type = 'button';
      b.dataset.tab = id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(tab === id));
      b.addEventListener('click', () => { tab = id; zeichne(); });
      reiter.append(b);
    }
    body.append(reiter, {
      personen, verlauf: verlaufAnsicht, rueckblick: rueckblickAnsicht, sammlungen: sammlungsAnsicht, sichern, drucken: druckAnsicht,
    }[tab]());
  }

  // ------------------------------------------------------------ Personen

  function personen() {
    const box = el('div');
    box.innerHTML = `<p class="intro-copy">Wer mitisst, was er nicht verträgt und was er nicht mag.
      Rezepte, die für jemanden nicht passen, tragen ein ⚠, und „Woche füllen“ kann für alle planen.
      Allergene erkennt die App aus den Zutatennamen — ohne Gewähr; bei einer Allergie zählt die Packung.
      Mit Richtwerten zeigt die Nährwertübersicht, wie weit der Plan jede Person versorgt; eine halbe Portion
      für ein kleines Kind verringert die Menge, für die „Woche füllen“ plant. ${esc(HINWEIS_ZIELE)}</p>`;

    for (const p of store.profile) {
      const karte = el('fieldset', 'person');
      karte.innerHTML = `
        <legend>${esc(p.name)}</legend>
        <label class="person-aktiv"><input type="checkbox" data-feld="aktiv" ${p.aktiv ? 'checked' : ''} /> isst mit</label>
        <div class="planer-chips">${DIET_OPTIONS.map((d) => `<label class="planer-chip"><input type="checkbox" data-feld="ernaehrung" value="${d}"
          ${p.ernaehrung.includes(d) ? 'checked' : ''} /><span>${d}</span></label>`).join('')}</div>
        <div class="planer-chips">${ALLERGENS.map((a) => `<label class="planer-chip"><input type="checkbox" data-feld="allergene" value="${a.id}"
          ${p.allergene.includes(a.id) ? 'checked' : ''} /><span>${a.icon} ohne ${esc(a.short)}</span></label>`).join('')}</div>
        <label class="person-meidet">Mag nicht <input type="text" data-feld="meidet" value="${esc(p.meidet.join(', '))}"
          placeholder="z. B. Pilze, Koriander, Leber" maxlength="400" /></label>
        <div class="person-ziele">
          <label>Richtwerte <select data-feld="vorlage">
            <option value="">eigene Werte</option>
            ${VORLAGEN.map((v) => `<option value="${v.id}" ${p.vorlage === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}
          </select></label>
          <label>Portion <select data-feld="faktor">
            ${[[0.5, 'halbe'], [0.75, 'dreiviertel'], [1, 'ganze'], [1.25, 'eineinviertel'], [1.5, 'anderthalb']]
              .map(([f, t]) => `<option value="${f}" ${p.faktor === f ? 'selected' : ''}>${t}</option>`).join('')}
          </select></label>
          <label>kcal/Tag <input type="number" data-feld="kcal" min="500" max="5000" step="50" value="${p.kcal ?? ''}" /></label>
          <label>Eiweiß g/Tag <input type="number" data-feld="eiweiss" min="5" max="300" step="1" value="${p.eiweiss ?? ''}" /></label>
        </div>
        <button type="button" class="ghost-btn danger" data-weg>Entfernen</button>`;
      karte.addEventListener('change', (e) => {
        const feld = e.target.dataset.feld;
        if (!feld) return;
        const neu = { ...p };
        if (feld === 'aktiv') neu.aktiv = e.target.checked;
        else if (feld === 'meidet') neu.meidet = e.target.value.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
        else if (feld === 'vorlage') {
          // Eine Vorlage setzt Portion und Ziele; danach laesst sich alles einzeln aendern
          const v = VORLAGEN.find((x) => x.id === e.target.value);
          neu.vorlage = v?.id || '';
          if (v) Object.assign(neu, { faktor: v.faktor, kcal: v.kcal, eiweiss: v.eiweiss });
        } else if (feld === 'faktor') neu.faktor = Number(e.target.value);
        else if (feld === 'kcal' || feld === 'eiweiss') {
          neu[feld] = e.target.value === '' ? null : Number(e.target.value);
          neu.vorlage = '';
        }
        else neu[feld] = [...karte.querySelectorAll(`[data-feld="${feld}"]:checked`)].map((x) => x.value);
        store.setProfile(store.profile.map((x) => (x.id === p.id ? neu : x)));
      });
      karte.querySelector('[data-weg]').addEventListener('click', () => {
        if (window.confirm(`${p.name} aus dem Haushalt entfernen?`)) store.setProfile(store.profile.filter((x) => x.id !== p.id));
      });
      box.append(karte);
    }

    const form = el('form', 'vorrat-form');
    form.innerHTML = `<input type="text" name="person" placeholder="Name, z. B. Anna" maxlength="40" aria-label="Name der Person" />
      <button type="submit" class="primary-btn">Person hinzufügen</button>`;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      // Nicht form.name: das ist der Name des Formulars selbst
      const name = form.elements.person.value.trim();
      if (!name) return;
      const id = `p-${Date.now().toString(36)}`;
      store.setProfile([...store.profile, { id, name, aktiv: true, ernaehrung: [], allergene: [], meidet: [] }]);
      body.querySelector('input[name="person"]')?.focus();
    });
    box.append(form);
    return box;
  }

  // ------------------------------------------------------------- Verlauf

  function verlaufAnsicht() {
    const box = el('div');
    const eintraege = verlauf(store.bewertungen);
    const lieblinge = Object.entries(store.bewertungen)
      .filter(([, b]) => b.sterne >= 4)
      .sort((a, b) => b[1].sterne - a[1].sterne)
      .map(([id, b]) => ({ r: recipeById.get(id), b }))
      .filter((x) => x.r);

    const knopf = (r, text) => `<button type="button" class="link-btn" data-oeffne="${esc(r.id)}">${esc(text || r.title)}</button>`;

    box.innerHTML = `
      ${lieblinge.length ? `<h3>Lieblinge</h3><ul class="verlauf">${lieblinge.slice(0, 30)
        .map(({ r, b }) => `<li><span class="card-sterne">★${b.sterne}</span> ${knopf(r)}${b.notiz ? ` <span class="aus">· ${esc(b.notiz)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      <h3>Kochverlauf</h3>
      ${eintraege.length ? '' : `<p class="empty-note">Noch nichts gekocht. „Heute gekocht“ in der Rezeptansicht
        oder das Ende des Kochmodus tragen ein Gericht hier ein.</p>`}
    `;
    if (eintraege.length) {
      const liste = el('ul', 'verlauf');
      let letzter = '';
      for (const { id, tag } of eintraege.slice(0, 120)) {
        const r = recipeById.get(id);
        if (!r) continue;
        const li = el('li');
        li.innerHTML = `${tag !== letzter ? `<span class="verlauf-tag">${esc(alsDatum(tag))}</span>` : ''}${knopf(r)}`;
        letzter = tag;
        liste.append(li);
      }
      box.append(liste);
    }
    box.addEventListener('click', (e) => {
      const id = e.target.closest('[data-oeffne]')?.dataset.oeffne;
      const r = id && recipeById.get(id);
      if (r) onOpen?.(r);
    });
    return box;
  }

  // ------------------------------------------------------------ Rückblick

  const jetzt = new Date();
  let rbJahr = jetzt.getFullYear();
  let rbMonat = jetzt.getMonth() + 1;

  function rueckblickAnsicht() {
    const box = el('div', 'rueckblick');
    const r = rueckblick({
      plans: store.plans, bewertungen: store.bewertungen, lookup: recipeById, jahr: rbJahr, monat: rbMonat, rechne: vollstaendig,
    });
    const prozent = (x) => `${Math.round(x * 100)} %`;
    const kachel = (wert, label, sub = '') => `<div class="kachel"><b>${wert}</b><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
    const anteil = (x, label) => `<div class="anteil"><span>${esc(label)}</span>
      <span class="anteil-balken" role="img" aria-label="${esc(label)}: ${prozent(x)}"><span style="width:${Math.round(x * 100)}%"></span></span>
      <b>${prozent(x)}</b></div>`;
    const istJetzt = rbJahr === jetzt.getFullYear() && rbMonat === jetzt.getMonth() + 1;
    box.innerHTML = `
      <div class="rueckblick-kopf">
        <button type="button" class="icon-btn" data-monat="-1" aria-label="Voriger Monat">&#8249;</button>
        <h3>${MONATE[rbMonat - 1]} ${rbJahr}</h3>
        <button type="button" class="icon-btn" data-monat="1" aria-label="Nächster Monat" ${istJetzt ? 'disabled' : ''}>&#8250;</button>
      </div>
      ${r.geplant || r.gekocht ? `
      <div class="kacheln">
        ${kachel(r.geplant, 'Gerichte im Plan', r.vorgekocht ? `davon ${r.vorgekocht} Reste` : '')}
        ${kachel(r.gekocht, 'als gekocht markiert', r.neu.length ? `${r.neu.length} zum ersten Mal` : '')}
        ${kachel(r.fisch, 'mal Fisch')}
        ${kachel(r.gesundheit ?? '–', 'Ø Ausgewogenheit', 'von 100 Punkten')}
        ${kachel(r.kosten != null ? `ca. ${euroText(r.kosten)}` : '–', 'geschätzte Kosten', r.kostenGerichte ? `für ${r.kostenGerichte} Gerichte` : '')}
      </div>
      <div class="anteile">
        ${anteil(r.vegetarisch, 'Hauptgerichte vegetarisch')}
        ${anteil(r.saisonal, 'Hauptgerichte mit Saisonzutaten')}
      </div>
      ${r.lieblinge.length ? `<h3>Am häufigsten</h3><ul class="verlauf">${r.lieblinge.map((x) => `<li><span class="card-sterne">${x.n}×</span>
        <button type="button" class="link-btn" data-oeffne="${esc(x.id)}">${esc(x.title)}</button></li>`).join('')}</ul>` : ''}
      ${r.neu.length ? `<p class="nutri-note">Neu ausprobiert: ${r.neu.map(esc).join(', ')}.</p>` : ''}
      <p class="nutri-note">Aus den Wochenplänen und dem Kochverlauf dieses Browsers. Kosten nach Richtpreisen, ohne Gewähr.</p>`
      : '<p class="empty-note">In diesem Monat stand nichts im Plan und nichts ist als gekocht markiert.</p>'}`;
    box.addEventListener('click', (e) => {
      const d = Number(e.target.closest('[data-monat]')?.dataset.monat);
      if (d) {
        rbMonat += d;
        if (rbMonat < 1) { rbMonat = 12; rbJahr -= 1; }
        if (rbMonat > 12) { rbMonat = 1; rbJahr += 1; }
        zeichne();
        return;
      }
      const id = e.target.closest('[data-oeffne]')?.dataset.oeffne;
      const rezept = id && recipeById.get(id);
      if (rezept) onOpen?.(rezept);
    });
    return box;
  }

  // ----------------------------------------------------------- Sammlungen

  function sammlungsAnsicht() {
    const box = el('div', 'sammlungen');
    box.innerHTML = `<p class="intro-copy">Eigene Ordner für Rezepte, etwa „Weihnachten“ oder „Schnell unter der Woche“.
      Rezepte kommen in der Rezeptansicht hinein; in der Bibliothek lässt sich nach einer Sammlung filtern.
      Ein Link teilt die Sammlung; eigene und importierte Rezepte kennt der Empfänger nicht.</p>`;
    for (const x of store.sammlungen) {
      const rezepte = x.rezepte.map((id) => recipeById.get(id)).filter(Boolean);
      const karte = el('fieldset', 'person');
      karte.innerHTML = `
        <legend>${esc(x.name)} · ${rezepte.length}</legend>
        <ul class="verlauf">${rezepte.slice(0, 40).map((r) => `<li><button type="button" class="link-btn" data-oeffne="${esc(r.id)}">${esc(r.title)}</button></li>`).join('')
          || '<li class="aus">Noch leer</li>'}</ul>
        <div class="knopf-reihe">
          <button type="button" class="ghost-btn" data-umbenennen>Umbenennen</button>
          <button type="button" class="ghost-btn" data-link>Link teilen</button>
          <button type="button" class="ghost-btn danger" data-weg>Löschen</button>
        </div>
        <p class="teilen-status" aria-live="polite"></p>`;
      karte.querySelector('[data-umbenennen]').addEventListener('click', () => {
        const name = window.prompt('Neuer Name der Sammlung', x.name)?.trim();
        if (name) store.setSammlungen(store.sammlungen.map((y) => (y.id === x.id ? { ...y, name } : y)));
      });
      karte.querySelector('[data-weg]').addEventListener('click', () => {
        if (window.confirm(`Sammlung „${x.name}“ löschen? Die Rezepte bleiben erhalten.`)) {
          store.setSammlungen(store.sammlungen.filter((y) => y.id !== x.id));
        }
      });
      karte.querySelector('[data-link]').addEventListener('click', async () => {
        const { hash, ausgelassen } = sammlungsLink(x);
        await teilenOderKopieren(`${window.location.origin}${window.location.pathname}${hash}`, `Sammlung: ${x.name}`,
          karte.querySelector('.teilen-status'), ausgelassen ? ` ${ausgelassen} eigene oder importierte Rezepte sind nicht im Link.` : '');
      });
      box.append(karte);
    }
    const form = el('form', 'vorrat-form');
    form.innerHTML = `<input type="text" name="sammlung" placeholder="Name, z. B. Weihnachten" maxlength="60" aria-label="Name der Sammlung" />
      <button type="submit" class="primary-btn">Sammlung anlegen</button>`;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = form.elements.sammlung.value.trim();
      if (name) store.setSammlungen([...store.sammlungen, neueSammlung(name)]);
    });
    box.append(form);
    box.addEventListener('click', (e) => {
      const id = e.target.closest('[data-oeffne]')?.dataset.oeffne;
      const r = id && recipeById.get(id);
      if (r) onOpen?.(r);
    });
    return box;
  }

  /** Teilt eine Adresse ueber das Teilen-Menue des Geraets oder kopiert sie */
  async function teilenOderKopieren(url, titel, hinweis, zusatz = '') {
    try {
      if (navigator.share) {
        await navigator.share({ title: titel, url });
        hinweis.textContent = `Geteilt.${zusatz}`;
        return;
      }
    } catch { /* abgebrochen: dann kopieren */ }
    try {
      await navigator.clipboard.writeText(url);
      hinweis.textContent = `Link kopiert.${zusatz}`;
    } catch {
      hinweis.textContent = `${url}${zusatz}`;
    }
  }

  // ------------------------------------------------------ Sichern, Teilen

  function sichern() {
    const box = el('div', 'sichern');
    box.innerHTML = `
      <h3>Sicherung</h3>
      <p class="intro-copy">Alles, was diese App speichert — Pläne, eigene Rezepte, Vorrat, Haushalt,
        Bewertungen —, liegt nur in diesem Browser. Eine Sicherungsdatei nimmt es auf ein anderes Gerät mit.</p>
      <label class="planer-optionen-zeile"><input type="checkbox" name="fotos" checked /> Fotos eigener Rezepte mitnehmen</label>
      <label class="planer-optionen-zeile"><input type="checkbox" name="andere" /> Datei ist für andere: Abschriften aus
        Kochbüchern und von Webseiten importierte Rezepte weglassen</label>
      <div class="knopf-reihe">
        <button type="button" class="primary-btn" data-sichern>Sicherung herunterladen</button>
        <label class="ghost-btn datei-knopf">Sicherung einlesen …<input type="file" accept="application/json,.json" hidden /></label>
      </div>
      <p class="sichern-status" aria-live="polite"></p>

      <h3>Wochenplan teilen</h3>
      <p class="intro-copy">Ein Link mit dem Plan dieser Woche. Wer ihn öffnet, kann den Plan übernehmen.
        Eigene und importierte Rezepte kennt der Empfänger nicht; sie fehlen im Link.</p>
      <div class="knopf-reihe"><button type="button" class="primary-btn" data-teilen>Link teilen</button></div>
      <p class="teilen-status" aria-live="polite"></p>
    `;
    const status = box.querySelector('.sichern-status');

    box.querySelector('[data-sichern]').addEventListener('click', async () => {
      const lesen = (key, ersatz) => {
        try { return JSON.parse(localStorage.getItem(key)) ?? ersatz; } catch { return ersatz; }
      };
      const daten = {
        plan: store.plans,
        eigene: store.loadOwn(),
        importe: store.loadImported(),
        vorrat: store.vorrat,
        planer: lesen(SPEICHER.planer, {}),
        profile: store.profile,
        bewertungen: store.bewertungen,
        sammlungen: store.sammlungen,
        abgehakt: store.abgehakt,
        fotos: box.querySelector('[name="fotos"]').checked ? await alleFotos() : {},
      };
      const fuerAndere = box.querySelector('[name="andere"]').checked;
      const datei = sicherung(daten, { fuerAndere });
      const tag = new Date().toISOString().slice(0, 10);
      herunterladen(`kochbuch-sicherung-${tag}.json`, JSON.stringify(datei));
      status.textContent = `Gesichert: ${datei.daten.eigene.length} eigene Rezepte, ${Object.keys(datei.daten.plan).length} Wochen, `
        + `${datei.daten.vorrat.length} Vorratsposten, ${datei.daten.profile.length} Personen.`;
    });

    box.querySelector('input[type="file"]').addEventListener('change', async (e) => {
      const datei = e.target.files?.[0];
      if (!datei) return;
      try {
        const { daten, zahlen } = wiederherstellen(await datei.text());
        const frage = `Sicherung einlesen? Das ersetzt die Daten in diesem Browser: ${zahlen.wochen} Wochen, `
          + `${zahlen.eigene} eigene Rezepte, ${zahlen.vorrat} Vorratsposten, ${zahlen.profile} Personen, `
          + `${zahlen.bewertungen} Bewertungen, ${zahlen.sammlungen} Sammlungen, ${zahlen.fotos} Fotos.`;
        if (!window.confirm(frage)) return;
        const schreiben = (key, wert) => localStorage.setItem(key, JSON.stringify(wert));
        schreiben(SPEICHER.plan, daten.plan);
        schreiben(SPEICHER.eigene, daten.eigene);
        schreiben(SPEICHER.importe, daten.importe);
        schreiben(SPEICHER.vorrat, daten.vorrat);
        schreiben(SPEICHER.planer, daten.planer);
        schreiben(SPEICHER.profile, daten.profile);
        schreiben(SPEICHER.bewertungen, daten.bewertungen);
        schreiben(SPEICHER.sammlungen, daten.sammlungen);
        schreiben(SPEICHER.abgehakt, daten.abgehakt);
        for (const [id, url] of Object.entries(daten.fotos)) await fotoSpeichern(id, url);
        // Eigene und importierte Rezepte haengen beim Start in den Index
        window.location.reload();
      } catch (err) {
        status.textContent = err.message || 'Die Sicherung ließ sich nicht lesen.';
      } finally {
        e.target.value = '';
      }
    });

    box.querySelector('[data-teilen]').addEventListener('click', async () => {
      const { hash, ausgelassen } = planLink(store.key, store.week);
      const url = `${window.location.origin}${window.location.pathname}${hash}`;
      const zusatz = ausgelassen ? ` ${ausgelassen} eigene oder importierte Gerichte sind nicht im Link.` : '';
      await teilenOderKopieren(url, 'Wochenplan', box.querySelector('.teilen-status'), zusatz);
    });
    return box;
  }

  // -------------------------------------------------------------- Drucken

  function druckAnsicht() {
    const box = el('div');
    box.innerHTML = `
      <p class="intro-copy">Druckt über den Druckdialog des Browsers; dort lässt sich auch „Als PDF speichern“
        wählen. Das Rezeptheft enthält jedes Gericht der Woche einmal, mit Zutaten für die geplanten Portionen,
        Zubereitung und Quellenangabe.</p>
      <div class="knopf-reihe">
        <button type="button" class="ghost-btn" data-druck="plan">Wochenplan</button>
        <button type="button" class="ghost-btn" data-druck="liste">Einkaufsliste</button>
        <button type="button" class="primary-btn" data-druck="heft">Rezeptheft der Woche</button>
      </div>
      <h3>In den Kalender</h3>
      <p class="intro-copy">Der Wochenplan als Kalenderdatei (.ics) für Google, Apple, Outlook oder Thunderbird:
        jedes Gericht ein Termin, der so beginnt, dass es zur Essenszeit fertig ist (Frühstück 7:30, Mittag 12:30,
        Imbiss 15:30, Abend 18:30). Was am Vortag beginnen muss — einweichen, auftauen, über Nacht gehen lassen —,
        bekommt eine Erinnerung am Vorabend um 20 Uhr.</p>
      <div class="knopf-reihe">
        <label class="planer-optionen-zeile">Erinnerung <select name="erinnerung">
          <option value="0">keine</option><option value="10">10 Min. vorher</option>
          <option value="15" selected>15 Min. vorher</option><option value="30">30 Min. vorher</option></select></label>
        <button type="button" class="primary-btn" data-ics>Kalenderdatei herunterladen</button>
      </div>
      <p class="kalender-status" aria-live="polite"></p>`;
    box.addEventListener('click', (e) => {
      const was = e.target.closest('[data-druck]')?.dataset.druck;
      if (was) drucken(was);
      if (e.target.closest('[data-ics]')) {
        const { text, termine, vortag } = icsWoche(store.weekStart, store.week, recipeById, {
          erinnerung: Number(box.querySelector('[name="erinnerung"]').value),
        });
        const status = box.querySelector('.kalender-status');
        if (!termine) {
          status.textContent = 'Der Wochenplan ist leer.';
          return;
        }
        herunterladen(`wochenplan-${store.key}.ics`, text, 'text/calendar');
        status.textContent = `${termine} Termine${vortag ? `, ${vortag} Erinnerungen am Vorabend` : ''}.`;
      }
    });
    return box;
  }

  zeichne();
  unsubscribe = store.subscribe(() => {
    // Beim Tippen in "Mag nicht" nicht neu zeichnen, sonst springt der Cursor
    if (body.contains(document.activeElement) && document.activeElement.matches('[data-feld="meidet"], [data-feld="kcal"], [data-feld="eiweiss"]')) return;
    zeichne();
  });

  openModal({
    title: 'Haushalt',
    subtitle: 'Personen, Kochverlauf, Rückblick, Sammlungen, Sichern, Drucken und Kalender',
    body,
    wide: true,
    onClose: () => unsubscribe?.(),
  });
}
