/**
 * Quellenuebersicht: alle mitgelieferten Kochbuecher und APIs mit
 * Lizenz und Link, dazu das Nachladen der Live-Quellen und der
 * Import einzelner Rezepte per Adresse.
 */

import { openModal, el } from './modal.js';
import { sources, recipes } from '../data/index.js';
import { liveSources, loadLiveSource, importFromHtml, importFromUrl, SourceError } from '../sources/index.js';

const KIND_LABEL = {
  buch: 'Gemeinfreies Kochbuch',
  wiki: 'Wiki-Projekt',
  api: 'Offene Schnittstelle',
  datensatz: 'Offener Datensatz',
  import: 'Eigener Import',
};

function sourceCard(source) {
  const count = recipes.filter((r) => r.sourceId === source.id).length;

  const card = el('article', 'source-card');
  card.style.setProperty('--swatch', source.accent || '#f0653a');
  card.innerHTML = `
    <div class="swatch"></div>
    <div class="body">
      <h3>${source.title}</h3>
      <p>
        ${source.author}${source.year ? ` · ${source.year}` : ''}${
          source.country ? ` · ${source.country}` : ''
        }<br />
        ${KIND_LABEL[source.kind] || ''}${count ? ` · ${count} Rezepte geladen` : ''}<br />
        <a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.url}</a>
      </p>
      <span class="lic">${source.license}</span>
    </div>
  `;
  return card;
}

function statusLine(kind) {
  const node = el('p', `intro-copy status-${kind}`);
  node.style.marginTop = '14px';
  return node;
}

function liveBlock(onChanged) {
  const wrap = el('section');
  wrap.style.marginBottom = '22px';
  wrap.append(el('h3', null, 'Live nachladen'));
  Object.assign(wrap.querySelector('h3').style, {
    fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.07em',
    color: 'var(--ink-faint)', margin: '0 0 10px',
  });

  const row = el('div');
  row.style.display = 'flex';
  row.style.flexWrap = 'wrap';
  row.style.gap = '8px';

  const status = statusLine('live');

  for (const source of liveSources) {
    const btn = el('button', 'ghost-btn', source.label);
    btn.title = source.hint;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = 'Lädt…';
      status.textContent = `${source.label} wird geladen…`;
      try {
        const added = await loadLiveSource(source.id, (geladen) => {
          status.textContent = `${source.label}: ${geladen} Rezepte geladen…`;
        });
        status.textContent = added.length
          ? `${added.length} Rezepte von ${source.label} übernommen.`
          : `${source.label}: nichts Neues gefunden.`;
        onChanged?.();
      } catch (err) {
        status.textContent = err instanceof SourceError
          ? `${source.label}: ${err.message}`
          : `${source.label}: Abruf fehlgeschlagen.`;
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    });
    row.append(btn);
  }

  wrap.append(row, status);
  return wrap;
}

function importBlock(onChanged) {
  const wrap = el('section');
  wrap.style.marginBottom = '22px';

  wrap.innerHTML = `
    <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:.07em;
               color:var(--ink-faint);margin:0 0 10px">Rezept per Adresse importieren</h3>
    <p class="intro-copy" style="margin-bottom:10px">
      Funktioniert mit jeder Seite, die ihr Rezept als schema.org-Daten ausliefert —
      darunter Chefkoch.de und rewe.de. Importierte Rezepte bleiben Eigentum des
      Anbieters und werden nur lokal in diesem Browser gespeichert.
      Blockt die Seite den direkten Zugriff (CORS), den Seitenquelltext einfügen
      oder <code>npm run import -- --url &lt;adresse&gt;</code> nutzen.
    </p>
  `;

  const input = el('input');
  input.type = 'url';
  input.placeholder = 'https://www.chefkoch.de/rezepte/…';
  Object.assign(input.style, {
    width: '100%', padding: '9px 12px', border: '1px solid var(--line)',
    borderRadius: 'var(--r-sm)', marginBottom: '8px',
  });

  const paste = el('textarea');
  paste.placeholder = 'Alternativ: Seitenquelltext hier einfügen';
  paste.rows = 3;
  Object.assign(paste.style, {
    width: '100%', padding: '9px 12px', border: '1px solid var(--line)',
    borderRadius: 'var(--r-sm)', fontFamily: 'inherit', fontSize: '12.5px',
    resize: 'vertical', marginBottom: '8px',
  });

  const go = el('button', 'primary-btn', 'Importieren');
  const status = statusLine('import');
  status.style.marginTop = '8px';

  go.addEventListener('click', async () => {
    const url = input.value.trim();
    const html = paste.value.trim();
    if (!url && !html) {
      status.textContent = 'Adresse oder Seitenquelltext angeben.';
      return;
    }

    go.disabled = true;
    go.textContent = 'Importiert…';
    status.textContent = '';

    try {
      const recipe = html ? importFromHtml(html, url) : await importFromUrl(url);
      status.textContent = recipe
        ? `„${recipe.title}" importiert und in der Bibliothek verfügbar.`
        : 'Kein Rezept gefunden.';
      if (recipe) {
        input.value = '';
        paste.value = '';
        onChanged?.();
      }
    } catch (err) {
      status.textContent = err instanceof SourceError
        ? err.message
        : 'Import fehlgeschlagen.';
    } finally {
      go.disabled = false;
      go.textContent = 'Importieren';
    }
  });

  wrap.append(input, paste, go, status);
  return wrap;
}

export function openSources(onChanged) {
  const body = el('div');

  body.append(
    Object.assign(el('p', 'intro-copy'), {
      innerHTML: `Alle mitgelieferten Rezepte stammen aus gemeinfreien Kochbüchern
        und offen lizenzierten Projekten. Die Angaben unten nennen Werk, Urheber,
        Lizenz und Fundstelle — ${recipes.length} Rezepte aus
        ${new Set(recipes.map((r) => r.sourceId)).size} Quellen.`,
    }),
  );

  body.append(liveBlock(onChanged), importBlock(onChanged));

  const list = el('section');
  list.append(
    Object.assign(el('h3', null, 'Quellenverzeichnis'), {
      style: 'font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-faint);margin:0 0 10px',
    }),
  );
  for (const s of sources) list.append(sourceCard(s));
  body.append(list);

  openModal({
    title: 'Quellen & Lizenzen',
    subtitle: 'Herkunft aller Rezepte, Live-Quellen und Import',
    body,
    wide: true,
  });
}
