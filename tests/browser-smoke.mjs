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
import { mkdir } from 'node:fs/promises';

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
  check('Bibliothek ist gefüllt', cards > 100, `${cards} Karten`);

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
  await page.keyboard.press('Escape');

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

  const alle = await page.locator('.recipe-card').count();
  await page.selectOption('#filter-allergen', 'milch');
  await page.waitForTimeout(400);
  const mitMilch = await page.evaluate(() =>
    [...document.querySelectorAll('.card-allergens')]
      .filter((n) => (n.title || '').includes('Milch')).length);
  const ohne = await page.locator('.recipe-card').count();
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

  check('keine Fehler in der Browserkonsole', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
}

if (fails.length) {
  console.error(`\n${fails.length} Prüfung(en) fehlgeschlagen: ${fails.join(', ')}`);
  process.exit(1);
}
console.log('\nAlle Prüfungen bestanden.');
