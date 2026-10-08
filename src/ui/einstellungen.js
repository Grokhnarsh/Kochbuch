/**
 * Einstellungen: Ansicht (Farbschema, Schrift, Tassen umrechnen) und der
 * Abgleich zwischen Geraeten ueber den eigenen WebDAV-Speicher.
 */

import { openModal, el } from './modal.js';
import { esc } from './html.js';
import { store } from '../state/store.js';
import {
  abgleichEinstellungen, setzeAbgleich, abgleichen, dateiAdresse, beiAbgleich,
} from './abgleich.js';

const ZEIT = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' });

export function openEinstellungen({ ansicht = 'ansicht' } = {}) {
  let tab = ansicht;
  const body = el('div', 'einstellungen');
  let abmelden = null;

  function zeichne() {
    body.replaceChildren();
    const reiter = el('div', 'seg');
    reiter.setAttribute('role', 'tablist');
    for (const [id, label] of [['ansicht', 'Ansicht'], ['abgleich', 'Abgleich zwischen Geräten']]) {
      const b = el('button', 'seg-btn', label);
      b.type = 'button';
      b.dataset.tab = id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(tab === id));
      b.addEventListener('click', () => { tab = id; zeichne(); });
      reiter.append(b);
    }
    body.append(reiter, tab === 'ansicht' ? ansichtTeil() : abgleichTeil());
  }

  function ansichtTeil() {
    const a = store.ansicht;
    const box = el('form', 'planer');
    const wahl = (name, wert, aktuell, label) => `<label class="planer-chip"><input type="radio" name="${name}" value="${wert}"
      ${String(aktuell) === String(wert) ? 'checked' : ''} /><span>${label}</span></label>`;
    box.innerHTML = `
      <fieldset><legend>Farbschema</legend>
        <div class="planer-chips">${wahl('thema', 'auto', a.thema, 'wie das System')}${wahl('thema', 'hell', a.thema, 'hell')}${wahl('thema', 'dunkel', a.thema, 'dunkel')}</div>
      </fieldset>
      <fieldset><legend>Schriftgröße in Listen und Fenstern</legend>
        <div class="planer-chips">${wahl('schrift', 1, a.schrift, 'normal')}${wahl('schrift', 1.15, a.schrift, 'größer')}${wahl('schrift', 1.3, a.schrift, 'groß')}</div>
      </fieldset>
      <fieldset class="planer-optionen"><legend>Mengen</legend>
        <label><input type="checkbox" name="metrisch" ${a.metrisch ? 'checked' : ''} />
          Tassen und Cups in Gramm oder Milliliter umrechnen — in Rezept, Kochmodus und Einkaufsliste</label>
      </fieldset>
      <p class="nutri-note">Diese Einstellungen gelten nur auf diesem Gerät.</p>`;
    box.addEventListener('change', () => {
      const f = new FormData(box);
      store.setAnsicht({ thema: f.get('thema'), schrift: Number(f.get('schrift')), metrisch: f.has('metrisch') });
    });
    return box;
  }

  function abgleichTeil() {
    const e = abgleichEinstellungen();
    const box = el('form', 'planer abgleich');
    box.innerHTML = `
      <p class="intro-copy">Plan, Einkaufsliste mit Haken, Vorrat, eigene Rezepte, Haushalt, Bewertungen und
        Sammlungen auf mehreren Geräten — über einen eigenen WebDAV-Speicher, etwa eine Nextcloud. Alle Geräte
        tragen dieselbe Adresse ein. Fotos bleiben auf dem Gerät.</p>
      <label class="feld">Ordner oder Datei (https)
        <input type="url" name="url" value="${esc(e.url)}" placeholder="https://cloud.example.de/remote.php/dav/files/NAME/Kochbuch"
          autocomplete="off" spellcheck="false" /></label>
      <div class="planer-reihe">
        <label class="feld">Benutzer <input type="text" name="benutzer" value="${esc(e.benutzer)}" autocomplete="username" /></label>
        <label class="feld">App-Passwort <input type="password" name="passwort" value="${esc(e.passwort)}" autocomplete="current-password" /></label>
      </div>
      <label class="planer-optionen-zeile"><input type="checkbox" name="aktiv" ${e.aktiv ? 'checked' : ''} />
        von selbst abgleichen: nach Änderungen, beim Öffnen und jede Minute</label>
      <div class="knopf-reihe">
        <button type="submit" class="primary-btn">Speichern und jetzt abgleichen</button>
      </div>
      <p class="abgleich-status" aria-live="polite"></p>
      <details class="nutri-note"><summary>Was der Server können muss</summary>
        <p>WebDAV mit Lesen und Schreiben einer Datei (GET, PUT). Der Server muss Anfragen von dieser App
          zulassen (CORS); Nextcloud tut das von Haus aus nicht — die Nextcloud-App „WebAppPassword“ oder eine Regel im
          Webserver schaltet es für die Adresse dieser App frei. Ein App-Passwort statt des Hauptpassworts verwenden:
          Es liegt in diesem Browser und geht nur an den eingetragenen Server.</p>
        <p>Zusammengeführt wird je Woche und je Eintrag; bei gleichzeitigen Änderungen an derselben Woche gilt die neuere.
          Gelöschtes bleibt gelöscht.</p>
      </details>`;
    const status = box.querySelector('.abgleich-status');
    const zeigeStatus = (x) => {
      status.textContent = x.meldung
        ? `⚠ ${x.meldung}`
        : x.letzter ? `Zuletzt abgeglichen: ${ZEIT.format(new Date(x.letzter))}` : '';
    };
    zeigeStatus(e);
    abmelden?.();
    abmelden = beiAbgleich(zeigeStatus);
    box.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(box);
      const url = String(f.get('url') || '').trim();
      if (url && !dateiAdresse(url)) {
        status.textContent = '⚠ Bitte eine https-Adresse eintragen.';
        return;
      }
      setzeAbgleich({
        url, benutzer: String(f.get('benutzer') || ''), passwort: String(f.get('passwort') || ''), aktiv: f.has('aktiv'),
      });
      if (!url) {
        status.textContent = 'Abgleich ist aus.';
        return;
      }
      status.textContent = 'Gleiche ab …';
      const r = await abgleichen();
      if (r.ok) status.textContent = `Abgeglichen: ${ZEIT.format(new Date())}`;
    });
    return box;
  }

  zeichne();
  openModal({
    title: 'Einstellungen',
    subtitle: 'Ansicht und Abgleich',
    body,
    wide: true,
    onClose: () => abmelden?.(),
  });
}
