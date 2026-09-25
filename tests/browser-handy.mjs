/**
 * Rauchtest der Handy-Ansicht.
 *
 * Die schmale Ansicht ist kein anderes Aussehen derselben Bedienung,
 * sondern eine andere Bedienung: ein Tag statt sieben, Antippen statt
 * Ziehen, Bibliothek als Blatt. Deshalb ein eigener Durchgang, in einem
 * Fenster in Telefongroesse und mit Beruehrung statt Maus.
 *
 *   npm run build && npm run preview &
 *   npm run test:handy
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
  // iPhone-Format: schmal genug fuer die Tagesansicht, hoch genug, dass
  // vier Mahlzeitenzeilen nebeneinander Platz finden.
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);

  const board = await page.evaluate(() => ({
    compact: window.kochbuch?.board.compact,
    slots: window.kochbuch?.board.slots.size,
    day: window.kochbuch?.board.day,
  }));
  check('Plan schaltet auf die Tagesansicht', board.compact === true);
  check('Tagesansicht zeigt vier Mahlzeiten', board.slots === 4, `${board.slots} Felder`);

  const dayButtons = await page.locator('#day-strip button').count();
  check('Tagesleiste hat sieben Tage', dayButtons === 7, `${dayButtons} Schaltflächen`);
  await shot(page, 'handy-01-start');

  // Die Bibliothek liegt als Blatt am unteren Rand und wird am Griff
  // heraufgezogen.
  await page.locator('#library-head').tap();
  await page.waitForTimeout(500);
  const cardVisible = await page.locator('.recipe-card').first().isVisible();
  check('Bibliothek zieht als Blatt herauf', cardVisible);
  await shot(page, 'handy-02-bibliothek');

  // Antippen nimmt das Rezept auf, statt die Rezeptansicht zu oeffnen.
  await page.locator('.recipe-card').first().tap();
  await page.waitForTimeout(500);
  const armed = await page.locator('#armed-bar').isVisible();
  const armedName = await page.locator('#armed-bar .name').textContent().catch(() => null);
  check('Antippen nimmt das Rezept auf', armed && Boolean(armedName), armedName || 'keine Leiste');
  await shot(page, 'handy-03-aufgenommen');

  // Zielfeld in Fensterkoordinaten: das Raster liegt in WebGL, nicht im DOM.
  const ziel = await page.evaluate(() => {
    const b = window.kochbuch.board;
    const Vector3 = b.root.position.constructor;
    const slot = [...b.slots.values()][1];
    const p = slot.getWorldPosition(new Vector3()).project(b.stage.camera);
    const r = b.stage.renderer.domElement.getBoundingClientRect();
    return {
      x: r.left + ((p.x + 1) / 2) * r.width,
      y: r.top + ((-p.y + 1) / 2) * r.height,
      key: `${slot.userData.day}:${slot.userData.meal}`,
    };
  });
  await page.touchscreen.tap(ziel.x, ziel.y);
  await page.waitForTimeout(700);
  const abgelegt = await page.evaluate((k) => Boolean(window.kochbuch.store.week[k]), ziel.key);
  check('Feld antippen legt das Rezept ab', abgelegt, ziel.key);
  const bar = await page.locator('#armed-bar').isVisible();
  check('Leiste verschwindet nach dem Ablegen', !bar);
  await shot(page, 'handy-04-abgelegt');

  // Relativ zum heutigen Tag wechseln: die Ansicht startet auf heute, ein
  // fester Zieltag waere an einem von sieben Tagen gar kein Wechsel.
  const start = await page.evaluate(() => window.kochbuch.board.day);
  const zielTag = (start + 3) % 7;
  await page.locator('#day-strip button').nth(zielTag).tap();
  await page.waitForTimeout(600);
  const tag = await page.evaluate(() => window.kochbuch.board.day);
  check('Tagesleiste wechselt den Tag', tag === zielTag && tag !== start, `von ${start} auf ${tag}`);
  await shot(page, 'handy-05-anderer-tag');

  await page.locator('#btn-shopping').tap();
  await page.waitForTimeout(600);
  const modal = await page.locator('.modal').boundingBox();
  check('Ansichten füllen das Fenster', modal && modal.width > 340, `${Math.round(modal?.width || 0)}px`);
  await shot(page, 'handy-06-einkaufsliste');
  await page.keyboard.press('Escape');

  // Neue Ansichten ueber das Ueberlaufmenue, ohne seitliches Scrollen
  for (const [aktion, name, selektor] of [
    ['suggest', 'Vorschläge', '.suggest-card'],
    ['nutrition', 'Nährwerte', '.nutri-table.week'],
  ]) {
    await page.locator('#btn-more').tap();
    await page.waitForTimeout(300);
    await page.locator(`#phone-menu [data-action="${aktion}"]`).tap();
    await page.waitForTimeout(600);
    const da = await page.locator(selektor).first().isVisible().catch(() => false);
    const breit = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(`${name} öffnen sich über das Menü`, da && !breit, breit ? 'Seite scrollt seitlich' : '');
    await shot(page, `handy-${aktion}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  check('keine Fehler in der Browserkonsole', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
}

if (fails.length) {
  console.error(`\n${fails.length} Prüfung(en) fehlgeschlagen: ${fails.join(', ')}`);
  process.exit(1);
}
console.log('\nAlle Prüfungen bestanden.');
