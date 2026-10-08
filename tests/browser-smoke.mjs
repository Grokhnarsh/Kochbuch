/**
 * Rauchtest im echten Browser.
 *
 * Die WebGL-Buehne laesst sich nicht sinnvoll mit Modultests pruefen,
 * deshalb faehrt dieser Test die gebaute App in Chromium hoch und geht
 * die wichtigsten Wege durch: Board aufbauen, Rezepte planen, Karten
 * ziehen, Einkaufsliste und Uebergabe an den Shop.
 *
 *   npm run build && npm run preview &
 *   npm run test:browser
 *
 * Ein abweichender Browser laesst sich ueber CHROMIUM_PATH angeben.
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const SHOTS = process.env.SHOT_DIR || null;

const fails = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails.push(name);
};

const shot = async (page, name) => {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1512, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);

  const gl = await page.evaluate(() => {
    const c = document.getElementById('stage');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  });
  check('WebGL-Kontext steht', gl);

  const slots = await page.evaluate(() => window.kochbuch?.board.slots.size);
  check('Raster hat 28 Slots', slots === 28, `${slots}`);

  const cards = await page.locator('.recipe-card').count();
  check('Bibliothek ist gefüllt', cards >= 20, `${cards} Karten`);

  // Die grossen Sammlungen kommen nach dem ersten Bild
  const korpus = await page.evaluate(async () => {
    const ergebnis = await window.kochbuch.korpus;
    return { ...ergebnis, gesamt: window.kochbuch.recipeById.size, fuss: document.getElementById('corpus-note').textContent };
  });
  check('große Sammlungen werden nachgeladen', korpus.rezepte > 5000 && korpus.fehler === 0,
    `${korpus.rezepte} Rezepte aus ${korpus.teile} Teilen, ${korpus.gesamt} insgesamt`);
  check('die Bibliothek nennt den Bestand', /\d\.\d{3} Rezepte aus \d+ Quellen$/.test(korpus.fuss), korpus.fuss);

  // Karten entstehen beim Blaettern stapelweise
  const vorher = await page.locator('.recipe-card').count();
  await page.locator('#recipe-list').evaluate((n) => { n.scrollTop = n.scrollHeight; });
  await page.waitForTimeout(500);
  const nachher = await page.locator('.recipe-card').count();
  check('beim Blättern kommen weitere Karten dazu', nachher > vorher, `${vorher} → ${nachher}`);
  await page.locator('#recipe-list').evaluate((n) => { n.scrollTop = 0; });

  const cardHeight = await page.locator('.recipe-card').first().evaluate((n) => n.clientHeight);
  check('Bibliothekskarten sind nicht gestaucht', cardHeight > 60, `${cardHeight}px`);
  await shot(page, '01-start');

  await page.evaluate(() => {
    window.kochbuch.store.place(0, 'mittag', 'prato-wiener-schnitzel');
  });
  await page.waitForTimeout(700);
  const placed = await page.evaluate(() => window.kochbuch.board.cards.size);
  check('Rezept erscheint als Karte auf dem Board', placed === 1, `${placed}`);

  await page.click('#btn-autofill');
  await page.waitForTimeout(400);
  await shot(page, '02a-woche-fuellen');
  await page.locator('.modal-foot .primary-btn').click();
  await page.waitForTimeout(900);
  const filled = await page.evaluate(() => Object.keys(window.kochbuch.store.week).length);
  check('Woche füllen belegt 21 Slots', filled === 21, `${filled}`);
  const meldung = await page.locator('.planer-ergebnis').textContent();
  check('und sagt, wie viele Felder es waren', /20 Felder geplant/.test(meldung), meldung);
  await page.keyboard.press('Escape');
  await shot(page, '02-woche');

  // Karte per Maus in einen freien Slot ziehen
  const pts = await page.evaluate(() => {
    const b = window.kochbuch.board;
    const V = window.kochbuch.board.root.position.constructor;
    const card = [...b.cards.values()][0];
    const slot = [...b.slots.values()].find(
      (s) => !window.kochbuch.store.entry(s.userData.day, s.userData.meal),
    );
    const r = b.stage.renderer.domElement.getBoundingClientRect();
    const to2d = (o) => {
      const p = o.getWorldPosition(new V()).project(b.stage.camera);
      return { x: ((p.x + 1) / 2) * r.width, y: ((-p.y + 1) / 2) * r.height };
    };
    return {
      from: to2d(card),
      to: to2d(slot),
      target: `${slot.userData.day}:${slot.userData.meal}`,
    };
  });

  await page.mouse.move(pts.from.x, pts.from.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(
      pts.from.x + ((pts.to.x - pts.from.x) * i) / 12,
      pts.from.y + ((pts.to.y - pts.from.y) * i) / 12,
    );
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
  await page.waitForTimeout(700);
  const landed = await page.evaluate((t) => Boolean(window.kochbuch.store.week[t]), pts.target);
  check('Karte lässt sich in einen freien Slot ziehen', landed, pts.target);
  await shot(page, '03-ziehen');

  await page.click('#btn-shopping');
  await page.waitForTimeout(500);
  const items = await page.locator('.shop-item').count();
  const aisles = await page.locator('.shop-group h3').count();
  check('Einkaufsliste fasst Zutaten zusammen', items > 40, `${items} Positionen`);
  check('Einkaufsliste ist nach Abteilungen sortiert', aisles >= 5, `${aisles} Abteilungen`);
  await shot(page, '04-einkaufsliste');

  await page.locator('.modal-foot .primary-btn').click();
  await page.waitForTimeout(400);
  const links = await page.locator('a[href*="shop.rewe.de/productList"]').count();
  check('Jede Position führt in den REWE-Shop', links === items, `${links} Links`);
  await shot(page, '05-rewe');
  await page.keyboard.press('Escape');

  await page.locator('.recipe-card').first().click();
  await page.waitForTimeout(400);
  const ings = await page.locator('.ing-list li').count();
  const steps = await page.locator('.step-list li').count();
  check('Rezeptansicht zeigt Zutaten und Schritte', ings > 2 && steps > 2, `${ings}/${steps}`);
  await page.keyboard.press('Escape');

  await page.click('#btn-sources');
  await page.waitForTimeout(400);
  const srcs = await page.locator('.source-card').count();
  check('Quellenverzeichnis ist vollständig', srcs >= 10, `${srcs} Quellen`);
  await shot(page, '06-quellen');

  // Sammlung aus "npm run import -- --urls": selbst gewaehlte Rezepte, hier eines im Thermomix-Stil
  const sammlung = path.join(tmpdir(), `kochbuch-sammlung-${Date.now()}.json`);
  await writeFile(sammlung, JSON.stringify({ recipes: [{
    id: 'import-example-org-sammeltest-risotto', title: 'Sammeltest-Risotto', sourceUrl: 'https://example.org/risotto',
    sourceHost: 'example.org', category: 'Hauptgericht', meals: ['mittag', 'abend'], servings: 4,
    ingredients: [{ a: 300, u: 'g', n: 'Risottoreis' }, { a: 1, u: 'l', n: 'Gemüsebrühe' }, { a: 1, u: '', n: 'Zwiebel' }],
    steps: ['Zwiebel 5 Sek./Stufe 5 zerkleinern.', 'Reis und Brühe zugeben, 17 Min./100°C/Linkslauf/Sanftrührstufe garen.'],
  }] }));
  await page.locator('.modal input[type="file"]').setInputFiles(sammlung);
  await page.waitForTimeout(500);
  const sammelStatus = await page.locator('.modal').textContent();
  check('eine Import-Sammlung lässt sich laden', /1 von 1 Rezepten/.test(sammelStatus));
  await page.keyboard.press('Escape');
  await page.fill('#search', 'Sammeltest-Risotto');
  await page.waitForTimeout(400);
  const tmChip = await page.locator('.recipe-card .tag.thermomix').count();
  check('Thermomix-Rezepte tragen ihr Schlagwort', tmChip === 1, `${tmChip}`);
  await page.locator('.recipe-card').first().click();
  await page.waitForTimeout(400);
  const tmSet = await page.locator('.modal .tm-set').allTextContents();
  check('Thermomix-Einstellungen sind hervorgehoben', tmSet.length === 2, tmSet.join(' | '));
  await page.keyboard.press('Escape');

  // Ein geschuetztes, frei lizenziertes Buch: Werk, Urheber und Lizenz stehen am Rezept
  await page.fill('#search', 'Köche-Nord');
  await page.waitForTimeout(400);
  await page.locator('.recipe-card').first().click();
  await page.waitForTimeout(400);
  const namensnennung = await page.locator('.modal .source-line').textContent().catch(() => '');
  const lizenzLink = await page.locator('.modal .source-note a[href*="creativecommons.org/licenses/by-sa/3.0"]').count();
  check('Köche-Nord-Rezepte nennen Buch, Urheber und Lizenz',
    /Petersen-Clausen.*S\. \d+/.test(namensnennung || '') && lizenzLink === 1, `${namensnennung} / ${lizenzLink}`);
  await page.keyboard.press('Escape');
  await page.fill('#search', '');
  await page.waitForTimeout(300);

  // Das erste Oetker-Kochbuch von 1895, gemeinfrei
  await page.fill('#search', 'Topfkuchen Oetker');
  await page.waitForTimeout(400);
  const oetker = await page.locator('.recipe-card .tag.original').count();
  check('das Oetker-Kochbuch von 1895 ist dabei, im Wortlaut', oetker >= 1, `${oetker}`);
  await page.fill('#search', '');
  await page.waitForTimeout(300);

  // --------------------------------------------------- Allergene

  await page.fill('#search', 'Käsespätzle');
  await page.waitForTimeout(400);
  await page.locator('.recipe-card').first().click();
  await page.waitForTimeout(400);
  const allergene = await page.locator('.modal .allergen-chip').allTextContents();
  check(
    'Rezeptansicht nennt die Allergene',
    allergene.some((t) => t.includes('Gluten')) && allergene.some((t) => t.includes('Milch')),
    allergene.join(' '),
  );
  const hinweis = await page.locator('.modal .allergen-note').first().textContent();
  check('dazu steht der Vorbehalt', /ohne Gewähr/.test(hinweis));
  await shot(page, '07-allergene');
  await page.keyboard.press('Escape');
  await page.fill('#search', '');
  await page.waitForTimeout(300);

  // Gezaehlt wird die Trefferzahl, nicht die Karten: die Liste zeigt
  // hoechstens 260 auf einmal.
  const treffer = async () => Number((await page.locator('#result-count').textContent()).replace(/\D/g, ''));
  const alle = await treffer();
  await page.selectOption('#filter-allergen', 'milch');
  await page.waitForTimeout(400);
  const mitMilch = await page.evaluate(() =>
    [...document.querySelectorAll('.card-allergens')]
      .filter((n) => (n.title || '').includes('Milch')).length);
  const ohne = await treffer();
  check('Filter blendet Rezepte mit Milch aus', mitMilch === 0 && ohne < alle, `${ohne} von ${alle}`);
  await page.selectOption('#filter-allergen', '');
  await page.waitForTimeout(300);

  // --------------------------------------------------- Eigenes Rezept

  await page.click('#btn-new-recipe');
  await page.waitForTimeout(400);
  await page.fill('input[name="title"]', 'Rauchtest-Suppe');
  await page.fill('textarea[name="ingredients"]', '500 g Kartoffeln\n200 ml Sahne\n2 EL Weizenmehl');
  await page.waitForTimeout(400);
  const vorschau = await page.locator('.parse-preview .allergen-chip').allTextContents();
  check('das Formular zeigt die Allergene beim Tippen', vorschau.length >= 2, vorschau.join(' '));
  await shot(page, '08-formular');

  await page.fill('textarea[name="steps"]', 'Kartoffeln garen.\nAlles verrühren.');
  // Abgeschrieben aus einem eigenen Buch: die Quelle gehoert dazu
  await page.fill('input[name="quelleTitel"]', 'Rauchtests Hausbuch');
  await page.fill('input[name="quelleSeite"]', '42');
  await page.locator('.modal-foot .primary-btn').click();
  await page.waitForTimeout(600);

  const gespeichert = await page.evaluate(() =>
    Boolean(window.kochbuch.recipeById.get('eigen-rauchtest-suppe')));
  check('eigenes Rezept liegt danach im Index', gespeichert);

  // Gesucht ueber den Buchtitel der Quelle, nicht ueber den Rezepttitel
  await page.fill('#search', 'Hausbuch');
  await page.waitForTimeout(400);
  const eigene = await page.locator('.recipe-card h3').allTextContents();
  check('und steht in der Bibliothek, auffindbar über die Quelle', eigene.includes('Rauchtest-Suppe'), eigene.join(', '));

  await page.locator('.recipe-card', { hasText: 'Rauchtest-Suppe' }).first().click();
  await page.waitForTimeout(400);
  const quellenZeile = await page.locator('.source-line').textContent().catch(() => '');
  check('die Ansicht nennt Buch und Seite', /Rauchtests Hausbuch.*S\. 42/.test(quellenZeile || ''), quellenZeile);
  const bearbeiten = await page.locator('.modal-foot .ghost-btn', { hasText: 'Bearbeiten' }).count();
  check('und lässt sich wieder bearbeiten', bearbeiten === 1);
  await shot(page, '09-eigenes-rezept');
  await page.keyboard.press('Escape');
  await page.fill('#search', '');
  await page.waitForTimeout(300);

  // --------------------------------------------------- Naehrwerte

  // Ein Rezept aus dem nachgeladenen Koch-Wiki: die Karte kennt nur die
  // Zusammenfassung, die Ansicht rechnet die Gruende beim Oeffnen nach.
  await page.fill('#search', 'Bauerneintopf');
  await page.waitForTimeout(400);
  await page.locator('.recipe-card', { hasText: 'Koch-Wiki' }).first().click();
  await page.waitForTimeout(400);
  const nachgerechnet = await page.evaluate(() => {
    const r = window.kochbuch.recipeById.get('kochwiki-bauerneintopf');
    return { posten: r?.naehrwerte?.posten?.length || 0, zusammenfassung: Boolean(r?.naehrwerte?.zusammenfassung) };
  });
  check('ein nachgeladenes Rezept wird beim Öffnen voll gerechnet',
    nachgerechnet.posten > 0 && !nachgerechnet.zusammenfassung, JSON.stringify(nachgerechnet));
  await page.keyboard.press('Escape');

  await page.fill('#search', 'Linseneintopf');
  await page.waitForTimeout(400);
  await page.locator('.recipe-card').first().click();
  await page.waitForTimeout(400);
  const naehrZeilen = await page.locator('.modal .nutri-table tbody tr').count();
  check('Rezeptansicht zeigt die Nährwerttabelle', naehrZeilen === 8, `${naehrZeilen} Zeilen`);
  const bewertung = await page.locator('.modal .health-score').textContent().catch(() => '');
  check('und eine Bewertung mit Gründen', Number(bewertung) > 0
    && (await page.locator('.modal .health-reasons li').count()) > 0, `${bewertung} Punkte`);
  await shot(page, '10-naehrwerte');
  await page.keyboard.press('Escape');
  await page.fill('#search', '');
  await page.waitForTimeout(300);

  // --------------------------------------------------- Gesunde Vorschlaege

  await page.click('#btn-clear');
  await page.waitForTimeout(400);
  await page.click('#btn-suggest');
  await page.waitForTimeout(500);
  const vorschlaege = await page.locator('.suggest-card').count();
  check('Vorschläge erscheinen', vorschlaege > 0, `${vorschlaege} Karten`);
  await page.locator('.suggest-card [data-planen]').first().click();
  await page.waitForTimeout(300);
  const einer = await page.evaluate(() => Object.keys(window.kochbuch.store.week).length);
  check('ein Vorschlag lässt sich einplanen', einer === 1, `${einer} Einträge`);
  await page.locator('.modal-foot .primary-btn').click();
  await page.waitForTimeout(700);
  const gefuellt = await page.evaluate(() => Object.keys(window.kochbuch.store.week).length);
  check('Woche gesund füllen belegt die freien Felder', gefuellt >= 15, `${gefuellt} Einträge`);
  await shot(page, '11-vorschlaege');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  const proPerson = await page.evaluate(() => {
    // Mehr Portionen einzuplanen darf die Kalorien je Person nicht aendern.
    const s = window.kochbuch.store;
    const vorher = s.kcalPerDay()[0];
    const e = Object.entries(s.week).find(([k]) => k.startsWith('0:'));
    if (!e) return { vorher, nachher: vorher };
    const [tag, mahlzeit] = e[0].split(':');
    s.setServings(Number(tag), mahlzeit, e[1].servings * 2);
    return { vorher, nachher: s.kcalPerDay()[0] };
  });
  check('Kalorien je Person hängen nicht an der Portionszahl',
    Math.abs(proPerson.vorher - proPerson.nachher) < 0.001, JSON.stringify(proPerson));

  await page.click('#btn-nutrition');
  await page.waitForTimeout(500);
  const tage = await page.locator('.nutri-table.week tbody tr').count();
  check('Nährwertübersicht zeigt sieben Tage', tage === 7, `${tage}`);
  await page.locator('.seg-btn[data-tab="rezepte"]').click();
  await page.waitForTimeout(400);
  const tabellenZeilen = await page.locator('.nutri-table.all tbody tr').count();
  check('und alle Mahlzeiten mit belastbaren Werten', tabellenZeilen > 200, `${tabellenZeilen} Zeilen`);
  await shot(page, '12-uebersicht');
  await page.keyboard.press('Escape');

  // --------------------------------------------------- Woche nach Vorgaben

  await page.click('#btn-clear');
  await page.waitForTimeout(300);
  await page.click('#btn-autofill');
  await page.waitForTimeout(400);
  // Nur Mittag und Abend, vegetarisch nicht, aber ohne Milch und zweimal Fisch, fuer zwei
  await page.locator('.planer input[name="mahlzeiten"][value="fruehstueck"]').uncheck({ force: true });
  await page.locator('.planer input[name="ohneAllergene"][value="milch"]').check({ force: true });
  await page.selectOption('.planer select[name="fischProWoche"]', '2');
  await page.selectOption('.planer select[name="personen"]', '2');
  await page.locator('.modal-foot .primary-btn').click();
  await page.waitForTimeout(800);
  const plan = await page.evaluate(() => {
    const { store, recipeById } = window.kochbuch;
    const e = Object.entries(store.week).map(([k, v]) => ({ k, v, r: recipeById.get(v.recipeId) }));
    return {
      n: e.length,
      fruehstueck: e.filter((x) => x.k.endsWith('fruehstueck')).length,
      milch: e.filter((x) => x.r.allergens.some((a) => a.id === 'milch')).length,
      fisch: e.filter((x) => x.r.allergens.some((a) => a.id === 'fisch' && a.level === 'ja')).length,
      zwei: e.every((x) => x.v.servings === 2 || (x.r.yieldUnit && !/portion/i.test(x.r.yieldUnit))),
    };
  });
  check('Woche nach Vorgaben: Mittag und Abend, ohne Milch, 2× Fisch, für zwei',
    plan.n === 14 && plan.fruehstueck === 0 && plan.milch === 0 && plan.fisch === 2 && plan.zwei, JSON.stringify(plan));
  const ersteWoche = await page.evaluate(() => JSON.stringify(window.kochbuch.store.week));
  await page.locator('.modal-foot .primary-btn').click();
  await page.waitForTimeout(800);
  const zweiteWoche = await page.evaluate(() => JSON.stringify(window.kochbuch.store.week));
  check('noch einmal würfeln ergibt eine andere Woche', ersteWoche !== zweiteWoche
    && (await page.evaluate(() => Object.keys(window.kochbuch.store.week).length)) === 14);
  await shot(page, '13-vorgaben');
  await page.keyboard.press('Escape');

  // Ein Feld neu wuerfeln, nach denselben Vorgaben
  const feld = await page.evaluate(() => Object.entries(window.kochbuch.store.week)[0]);
  await page.evaluate(([k]) => {
    const [day, meal] = k.split(':');
    window.kochbuch.board.handlers.onSelect({ day: Number(day), meal });
  }, feld);
  await page.waitForTimeout(400);
  const andersDa = await page.locator('.modal-foot .ghost-btn', { hasText: 'Anderes Gericht' }).count();
  if (andersDa) {
    await page.locator('.modal-foot .ghost-btn', { hasText: 'Anderes Gericht' }).click();
    await page.waitForTimeout(400);
  }
  const getauscht = await page.evaluate(([k, e]) => {
    const neu = window.kochbuch.store.week[k];
    const r = window.kochbuch.recipeById.get(neu.recipeId);
    return { anders: neu.recipeId !== e.recipeId, milch: r.allergens.some((a) => a.id === 'milch') };
  }, feld);
  check('„Anderes Gericht“ tauscht ein Feld nach den Vorgaben', andersDa === 1 && getauscht.anders && !getauscht.milch,
    JSON.stringify({ andersDa, ...getauscht }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // --------------------------------------------------- Vorrat

  await page.click('#btn-vorrat');
  await page.waitForTimeout(400);
  for (const p of ['1 kg Mehl', 'Salz', 'Eier', 'Milch']) {
    await page.fill('.vorrat-form input', p);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
  }
  const imVorrat = await page.locator('.vorrat-liste li').count();
  check('Vorrat nimmt Zutaten mit und ohne Menge auf', imVorrat === 4, `${imVorrat}`);
  await page.locator('.seg-btn[data-tab="kochen"]').click();
  await page.waitForTimeout(800);
  const kochbar = await page.locator('.vorrat-card').count();
  const allesDa = await page.locator('.vorrat-card .passt').count();
  check('„Was kann ich kochen?“ findet Rezepte aus dem Vorrat', kochbar > 5 && allesDa > 0, `${kochbar} Karten, ${allesDa} mit allem`);
  await shot(page, '14-vorrat');
  await page.keyboard.press('Escape');

  await page.evaluate(() => {
    const s = window.kochbuch.store;
    s.clearWeek();
    s.place(0, 'mittag', 'prato-wiener-schnitzel');
  });
  await page.click('#btn-shopping');
  await page.waitForTimeout(500);
  const gedeckt = await page.locator('.vorrat-gedeckt .shop-item').allTextContents();
  const offen = await page.locator('.shop-item input[type=checkbox]').count();
  check('die Einkaufsliste zieht den Vorrat ab', gedeckt.some((t) => /Ei/.test(t)) && gedeckt.some((t) => /Mehl/.test(t)),
    `${gedeckt.length} gedeckt, ${offen} offen: ${gedeckt.join(' | ').replace(/\s+/g, ' ')}`);
  await shot(page, '15-liste-mit-vorrat');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.kochbuch.store.setVorrat([]));

  // --------------------------------------------------- Kochmodus

  await page.fill('#search', 'Linseneintopf');
  await page.waitForTimeout(400);
  await page.locator('.recipe-card').first().click();
  await page.waitForTimeout(400);
  await page.locator('.modal-foot .km-start').click();
  await page.waitForTimeout(400);
  const km = await page.evaluate(() => ({
    offen: Boolean(document.querySelector('.kochmodus')),
    stand: document.querySelector('.km-stand')?.textContent,
  }));
  check('Kochmodus öffnet mit dem ersten Schritt', km.offen && /^Schritt 1 von \d+/.test(km.stand || ''), km.stand);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  const zwei = await page.locator('.km-stand').textContent();
  check('Pfeiltaste blättert weiter', /^Schritt 2 /.test(zwei), zwei);
  await page.locator('.km-zutaten-btn').click();
  const zutatenSichtbar = await page.locator('.km-zutaten li').first().isVisible();
  check('die Zutaten lassen sich daneben aufklappen', zutatenSichtbar);
  await shot(page, '16-kochmodus');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('Escape beendet den Kochmodus', (await page.locator('.kochmodus').count()) === 0);
  await page.fill('#search', '');
  await page.waitForTimeout(300);

  // Ein Schritt mit Zeitangabe stellt einen Timer, der auch ohne Kochmodus weiterlaeuft
  await page.evaluate(() => {
    window.kochbuch.store.saveOwn({
      id: 'eigen-timertest', sourceId: 'eigene', title: 'Timertest', category: 'Hauptgericht', meals: ['mittag'],
      servings: 2, ingredients: [{ a: 200, u: 'g', n: 'Nudeln' }],
      steps: ['Nudeln 10 Minuten kochen.', 'Abgießen und 1 Std. 30 Min. ziehen lassen.'],
    });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.fill('#search', 'Timertest');
  await page.waitForTimeout(400);
  await page.locator('.recipe-card').first().click();
  await page.waitForTimeout(400);
  const zeitKnoepfe = await page.locator('.modal .zeit-btn').allTextContents();
  check('Zeitangaben in den Schritten sind Timer-Knöpfe', zeitKnoepfe.length === 2, zeitKnoepfe.join(' | '));
  await page.locator('.modal-foot .km-start').click();
  await page.waitForTimeout(300);
  await page.locator('.kochmodus .zeit-btn').first().click();
  await page.waitForTimeout(400);
  const timerText = await page.locator('.timer-chip').first().textContent();
  check('ein Tipp stellt den Timer', /9:5\d|10:00/.test(timerText), timerText.replace(/\s+/g, ' '));
  await shot(page, '17-timer');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const nochDa = await page.locator('.timer-chip').count();
  check('der Timer läuft nach dem Kochmodus weiter', nochDa === 1);
  // Abgelaufen: die Leiste meldet es, bis jemand quittiert
  await page.evaluate(() => {
    const t = JSON.parse(localStorage.getItem('kochbuch.timer.v1'))[0];
    t.ende = Date.now() - 1000;
    localStorage.setItem('kochbuch.timer.v1', JSON.stringify([t]));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const fertig = await page.locator('.timer-chip.fertig').count();
  check('ein abgelaufener Timer meldet sich, auch nach dem Neuladen', fertig === 1);
  await page.locator('.timer-chip .timer-btn').last().click();
  await page.waitForTimeout(300);
  check('und verschwindet nach dem Quittieren', (await page.locator('.timer-chip').count()) === 0);
  await page.fill('#search', '');
  await page.waitForTimeout(300);

  // --------------------------------------------------- Haushalt und Bewertungen

  await page.click('#btn-haushalt');
  await page.waitForTimeout(400);
  await page.fill('.haushalt form input[name="person"]', 'Anna');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.locator('.person input[data-feld="allergene"][value="schalenfruechte"]').check({ force: true });
  await page.waitForTimeout(300);
  const profil = await page.evaluate(() => window.kochbuch.store.profile);
  check('eine Person mit Nussallergie lässt sich anlegen', profil.length === 1 && profil[0].allergene.includes('schalenfruechte'),
    JSON.stringify(profil));
  await shot(page, '18-haushalt');
  await page.keyboard.press('Escape');
  await page.fill('#search', 'Walnuss');
  await page.waitForTimeout(500);
  const warnung = await page.locator('.recipe-card .card-konflikt').first().textContent().catch(() => '');
  check('Rezepte mit Nüssen tragen eine Warnung für Anna', /Anna/.test(warnung), warnung);
  await page.locator('.recipe-card', { has: page.locator('.card-konflikt') }).first().click();
  await page.waitForTimeout(400);
  const imRezept = await page.locator('.modal .haushalt-warnung').textContent().catch(() => '');
  check('und die Rezeptansicht sagt, warum', /Anna.*Nüsse/.test(imRezept), imRezept);
  await page.keyboard.press('Escape');
  await page.fill('#search', '');
  await page.waitForTimeout(300);

  await page.click('#btn-clear');
  await page.click('#btn-autofill');
  await page.waitForTimeout(400);
  await page.locator('.planer input[name="haushalt"]').check({ force: true });
  await page.locator('.modal-foot .primary-btn').click();
  await page.waitForTimeout(800);
  const nussfrei = await page.evaluate(() => {
    const { store, recipeById } = window.kochbuch;
    return Object.values(store.week).filter((e) => recipeById.get(e.recipeId).allergens.some((a) => a.id === 'schalenfruechte')).length;
  });
  check('„für alle am Tisch“ plant ohne Nüsse', nussfrei === 0, `${nussfrei} mit Nüssen`);
  await page.keyboard.press('Escape');

  // Sterne, Notiz, gekocht
  await page.fill('#search', 'Linseneintopf');
  await page.waitForTimeout(400);
  await page.locator('.recipe-card').first().click();
  await page.waitForTimeout(400);
  const linsenId = await page.evaluate(() => [...window.kochbuch.recipeById.values()].find((r) => r.title === document.querySelector('.modal-head h2').textContent).id);
  await page.locator('.modal .stern[data-sterne="5"]').click();
  await page.fill('.modal .notiz', 'Mit mehr Ingwer');
  await page.locator('.modal .gekocht-btn').click();
  await page.waitForTimeout(600);
  const meine = await page.evaluate((id) => window.kochbuch.store.bewertung(id), linsenId);
  check('Sterne, Notiz und „heute gekocht“ werden gespeichert',
    meine?.sterne === 5 && meine.notiz === 'Mit mehr Ingwer' && meine.gekocht.length === 1, JSON.stringify(meine));
  const kosten = await page.locator('.modal .kosten-zeile').textContent().catch(() => '');
  check('die Rezeptansicht schätzt die Kosten', /ca\. \d+,\d\d €.*je Portion/.test(kosten), kosten);
  await shot(page, '19-rezept-notizen-kosten');
  await page.keyboard.press('Escape');
  await page.fill('#search', '');
  await page.selectOption('#filter-mehr', 'lieblinge');
  await page.waitForTimeout(400);
  const lieblinge = await page.locator('.recipe-card').count();
  check('der Filter „Lieblinge“ zeigt das bewertete Rezept', lieblinge === 1);
  await page.selectOption('#filter-mehr', '');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.kochbuch.haushaltOeffnen('verlauf'));
  await page.waitForTimeout(300);
  const verlaufText = await page.locator('.verlauf').last().textContent();
  check('der Kochverlauf nennt das Gericht', /Linseneintopf/.test(verlaufText));
  await page.keyboard.press('Escape');

  // Saison, Reste, Wochenkosten
  await page.evaluate(() => window.kochbuch.vorratOeffnen('saison'));
  await page.waitForTimeout(800);
  const saison = await page.locator('.saison-chips .planer-chip').count();
  const saisonGerichte = await page.locator('.vorrat-card').count();
  check('der Saisonkalender zeigt den Monat und Gerichte dazu', saison > 5 && saisonGerichte > 5, `${saison} Zutaten, ${saisonGerichte} Gerichte`);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const s = window.kochbuch.store;
    s.clearWeek();
    window.kochbuch.store.saveOwn({
      id: 'eigen-sahnetest', sourceId: 'eigene', title: 'Sahnetest', category: 'Hauptgericht', meals: ['abend'], servings: 2,
      ingredients: [{ a: 120, u: 'ml', n: 'Sahne' }, { a: 250, u: 'g', n: 'Nudeln' }], steps: ['Kochen.', 'Servieren.'],
    });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.kochbuch.store.place(0, 'abend', 'eigen-sahnetest'));
  await page.evaluate(() => window.kochbuch.store.place(1, 'abend', 'prato-wiener-schnitzel'));
  await page.click('#btn-shopping');
  await page.waitForTimeout(1500);
  const rest = await page.locator('.reste .rest').first().textContent().catch(() => '');
  const ideen = await page.locator('.reste .rest-ideen .link-btn').count();
  check('die Einkaufsliste sagt, was übrig bleibt, mit Ideen', /80 ml Sahne/.test(rest) && ideen > 0, `${rest.replace(/\s+/g, ' ')} / ${ideen}`);
  const woche = await page.locator('.modal .kosten-zeile').textContent().catch(() => '');
  check('und schätzt die Kosten der Woche', /ca\. \d+,\d\d €/.test(woche), woche.replace(/\s+/g, ' '));
  await shot(page, '20-reste');
  await page.keyboard.press('Escape');

  // Drucken: die Druckansicht enthaelt Rezepte mit Quellenangabe
  await page.evaluate(() => { window.print = () => { window.__gedruckt = true; }; });
  await page.evaluate(() => window.kochbuch.haushaltOeffnen('drucken'));
  await page.waitForTimeout(300);
  await page.locator('[data-druck="heft"]').click();
  await page.waitForTimeout(300);
  await page.emulateMedia({ media: 'print' });
  const druck = await page.evaluate(() => ({
    gedruckt: window.__gedruckt === true,
    rezepte: document.querySelectorAll('#druck .druck-rezept').length,
    quelle: document.querySelector('#druck .druck-quelle')?.textContent || '',
    sichtbar: getComputedStyle(document.getElementById('druck')).display !== 'none',
    stage: getComputedStyle(document.getElementById('stage')).display,
  }));
  check('das Rezeptheft enthält jedes Gericht mit Quelle', druck.gedruckt && druck.rezepte === 2 && /Lizenz/.test(druck.quelle)
    && druck.sichtbar && druck.stage === 'none', JSON.stringify(druck));
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.keyboard.press('Escape');

  // Sichern und wiederherstellen
  await page.evaluate(() => window.kochbuch.haushaltOeffnen('sichern'));
  await page.waitForTimeout(300);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-sichern]').click()]);
  const pfad = await download.path();
  const datei = JSON.parse(await (await import('node:fs/promises')).readFile(pfad, 'utf8'));
  check('die Sicherung enthält eigene Rezepte, Haushalt und Bewertungen',
    datei.format === 'kochbuch-sicherung' && datei.daten.eigene.some((r) => r.id === 'eigen-sahnetest')
    && datei.daten.profile.length === 1 && Object.keys(datei.daten.bewertungen).length === 1);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.kochbuch.haushaltOeffnen('sichern'));
  await page.waitForTimeout(300);
  page.once('dialog', (d) => d.accept());
  await page.locator('.sichern input[type="file"]').setInputFiles(pfad);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1800);
  const zurueck = await page.evaluate(() => ({
    eigen: Boolean(window.kochbuch.recipeById.get('eigen-sahnetest')),
    profile: window.kochbuch.store.profile.length,
  }));
  check('nach dem Einlesen ist alles wieder da', zurueck.eigen && zurueck.profile === 1, JSON.stringify(zurueck));

  // Wochenplan als Link
  const geteilt = await page.evaluate(() => {
    const s = window.kochbuch.store;
    s.clearWeek();
    s.place(2, 'mittag', 'prato-wiener-schnitzel', 3);
    const e = Object.entries(s.week).map(([slot, x]) => [slot, x.recipeId, x.servings]);
    const json = JSON.stringify({ w: s.key, e });
    const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    s.clearWeek();
    return `${location.origin}${location.pathname}#plan=${b64}`;
  });
  page.once('dialog', (d) => d.accept());
  await page.goto(geteilt, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const uebernommen = await page.evaluate(() => ({
    eintrag: window.kochbuch.store.week['2:mittag'],
    hash: location.hash,
  }));
  check('ein geteilter Wochenplan lässt sich übernehmen',
    uebernommen.eintrag?.recipeId === 'prato-wiener-schnitzel' && uebernommen.eintrag.servings === 3 && !uebernommen.hash,
    JSON.stringify(uebernommen));

  // Foto zu einem eigenen Rezept
  const bild = path.join(tmpdir(), `kochbuch-foto-${Date.now()}.png`);
  await page.screenshot({ path: bild, clip: { x: 0, y: 0, width: 300, height: 200 } });
  await page.fill('#search', 'Sahnetest');
  await page.waitForTimeout(400);
  await page.locator('.recipe-card').first().click();
  await page.waitForTimeout(300);
  await page.locator('.modal-foot .ghost-btn', { hasText: 'Bearbeiten' }).click();
  await page.waitForTimeout(300);
  await page.locator('input[name="fotoDatei"]').setInputFiles(bild);
  await page.waitForTimeout(600);
  await page.locator('.modal-foot .primary-btn').click();
  await page.waitForTimeout(600);
  await page.locator('.recipe-card').first().click();
  await page.waitForTimeout(800);
  const foto = await page.locator('.modal .rezept-foto').evaluate((n) => n.src.slice(0, 30)).catch(() => '');
  check('ein Foto zum eigenen Rezept wird gespeichert und gezeigt', foto.startsWith('data:image/jpeg;base64,'), foto);
  await page.keyboard.press('Escape');
  await page.fill('#search', '');
  await page.waitForTimeout(300);

  // Offline: Manifest, Service Worker, Start ohne Netz
  const sw = await page.evaluate(async () => {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
    return { aktiv: Boolean(reg?.active), manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') };
  });
  check('Service Worker und Manifest sind da', sw.aktiv && sw.manifest === './manifest.webmanifest', JSON.stringify(sw));
  // Einmal mit aktivem Service Worker laden, damit alles im Speicher liegt
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.context().setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(3000);
  const offline = await page.evaluate(async () => ({
    karten: document.querySelectorAll('.recipe-card').length,
    rezepte: window.kochbuch ? (await window.kochbuch.korpus).rezepte : 0,
  })).catch((e) => ({ fehler: e.message }));
  check('die App startet ohne Netz, samt großen Sammlungen', offline.karten > 20 && offline.rezepte > 5000, JSON.stringify(offline));
  await page.context().setOffline(false);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // --------------------------------------------------- Sicherheit

  const markup = await page.evaluate(() => {
    // Ein Titel, wie er von einer praeparierten Webseite kaeme
    window.__xss = false;
    window.kochbuch.store.saveOwn({
      id: 'eigen-xss', sourceId: 'eigene', title: 'Kuchen <img src=x onerror="window.__xss=true">',
      category: 'Dessert', meals: ['snack'], servings: 2, ingredients: [{ a: 1, u: '', n: '<b>Ei</b>' }], steps: ['<script>x</script>'],
    });
    return true;
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.fill('#search', 'Kuchen <img');
  await page.waitForTimeout(500);
  await page.locator('.recipe-card').first().click().catch(() => {});
  await page.waitForTimeout(500);
  const ausgefuehrt = await page.evaluate(() => window.__xss === true);
  const alsText = await page.locator('.recipe-card h3').first().textContent().catch(() => '');
  check('Markup aus Rezeptdaten wird nicht ausgeführt', markup && !ausgefuehrt && alsText.includes('<img'), alsText);
  await page.keyboard.press('Escape');

  check('keine Fehler in der Browserkonsole', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
}

if (fails.length) {
  console.error(`\n${fails.length} Prüfung(en) fehlgeschlagen: ${fails.join(', ')}`);
  process.exit(1);
}
console.log('\nAlle Prüfungen bestanden.');
