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
  await page.waitForTimeout(1100);
  const filled = await page.evaluate(() => Object.keys(window.kochbuch.store.week).length);
  check('Woche füllen belegt 21 Slots', filled === 21, `${filled}`);
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
  await page.locator('.modal-foot .primary-btn').click();
  await page.waitForTimeout(600);

  const gespeichert = await page.evaluate(() =>
    Boolean(window.kochbuch.recipeById.get('eigen-rauchtest-suppe')));
  check('eigenes Rezept liegt danach im Index', gespeichert);

  await page.fill('#search', 'Rauchtest');
  await page.waitForTimeout(400);
  const eigene = await page.locator('.recipe-card h3').allTextContents();
  check('und steht in der Bibliothek', eigene.includes('Rauchtest-Suppe'), eigene.join(', '));

  await page.locator('.recipe-card').first().click();
  await page.waitForTimeout(400);
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
