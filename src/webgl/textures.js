/**
 * Zeichnet die Zellen des Stundenplans auf 2D-Canvas und reicht sie als
 * Texturen an Three.js weiter.
 *
 * Gestaltung wie ein gedruckter Plan: weißer Grund, schwarze Schrift,
 * ruhige Flächen. Die Texturen sind bewusst deutlich größer als die
 * Zelle auf dem Bildschirm, damit die Schrift scharf bleibt.
 */

import * as THREE from 'three';

const FONT = '"Inter", "Segoe UI", -apple-system, system-ui, sans-serif';

const INK = '#000000';
const INK_SOFT = '#444444';
const INK_FAINT = '#8a8a8a';
const HEAD_FILL = '#f2f2f2';
const TODAY_FILL = '#ffeee7';
const TODAY_INK = '#b33b12';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Bricht Text auf höchstens `maxLines` Zeilen um und kürzt mit Auslassung. */
function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);

  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    if (ctx.measureText(last).width > maxWidth) {
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

/* ---------------------------------------------------------------- Zellen */

/** Belegte Zelle: Gericht mit Kennzahlen und Herkunft. */
export function recipeCellTexture(recipe, servings) {
  const W = 800;
  const H = 353;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const accent = recipe.source?.accent || '#f0653a';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Farbmarke der Quelle am linken Rand
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 16, H);

  const padX = 40;
  let y = 66;

  ctx.font = `600 34px ${FONT}`;
  ctx.fillStyle = accent;
  ctx.letterSpacing = '1.6px';
  ctx.fillText(recipe.category.toUpperCase(), padX, y);
  ctx.letterSpacing = '0px';

  y += 62;
  ctx.font = `700 58px ${FONT}`;
  ctx.fillStyle = INK;
  for (const line of wrapLines(ctx, recipe.title, W - padX - 34, 2)) {
    ctx.fillText(line, padX, y);
    y += 64;
  }

  ctx.font = `500 40px ${FONT}`;
  ctx.fillStyle = INK_SOFT;
  const facts = [`${recipe.totalTime} Min.`, `${servings} Port.`];
  if (recipe.kcal) {
    facts.push(`${Math.round((recipe.kcal * servings) / (recipe.servings || 1))} kcal`);
  }
  ctx.fillText(facts.join('   ·   '), padX, H - 84);

  ctx.font = `500 34px ${FONT}`;
  ctx.fillStyle = INK_FAINT;
  const src = recipe.source?.author || recipe.source?.title || '';
  ctx.fillText(wrapLines(ctx, src, W - padX - 34, 1)[0] || '', padX, H - 32);

  return toTexture(c);
}

/** Freie Zelle: bleibt leer wie im gedruckten Plan, mit leisem Hinweis. */
export function emptyCellTexture() {
  const W = 800;
  const H = 353;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#d0d0d0';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(W / 2 - 26, H / 2);
  ctx.lineTo(W / 2 + 26, H / 2);
  ctx.moveTo(W / 2, H / 2 - 26);
  ctx.lineTo(W / 2, H / 2 + 26);
  ctx.stroke();

  return toTexture(c);
}

/** Spaltenkopf: Name der Mahlzeit. */
export function mealHeadTexture(meal) {
  const W = 800;
  const H = 226;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');

  ctx.fillStyle = HEAD_FILL;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.font = `700 62px ${FONT}`;
  ctx.fillStyle = INK;
  ctx.letterSpacing = '2px';
  ctx.fillText(meal.label.toUpperCase(), W / 2, H / 2 + 21);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';

  return toTexture(c);
}

/** Zeilenkopf: Wochentag mit Datum und Tagesenergie. */
export function dayHeadTexture(day, date, kcal, isToday) {
  const W = 600;
  const H = 375;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');

  ctx.fillStyle = isToday ? TODAY_FILL : HEAD_FILL;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';

  ctx.font = `700 64px ${FONT}`;
  ctx.fillStyle = isToday ? TODAY_INK : INK;
  ctx.fillText(day.label, W / 2, 138);

  ctx.font = `500 44px ${FONT}`;
  ctx.fillStyle = isToday ? TODAY_INK : INK_SOFT;
  const d = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.`;
  ctx.fillText(d, W / 2, 202);

  if (kcal > 0) {
    ctx.font = `600 40px ${FONT}`;
    ctx.fillStyle = '#2f6b4f';
    ctx.fillText(`${Math.round(kcal)} kcal`, W / 2, 274);
  }

  ctx.textAlign = 'left';
  return toTexture(c);
}

/** Eckfeld oben links: Kalenderwoche. */
export function cornerTexture(label) {
  const W = 600;
  const H = 240;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');

  ctx.fillStyle = HEAD_FILL;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.font = `700 52px ${FONT}`;
  ctx.fillStyle = INK_SOFT;
  ctx.fillText(label, W / 2, H / 2 + 19);
  ctx.textAlign = 'left';

  return toTexture(c);
}
