/**
 * Zeichnet alle Beschriftungen der Buehne auf 2D-Canvas und reicht sie
 * als Texturen an Three.js weiter. So bleibt die Typografie scharf und
 * die gesamte Darstellung liegt im WebGL-Kontext.
 */

import * as THREE from 'three';

const FONT = '"Inter", "Segoe UI", -apple-system, system-ui, sans-serif';
const INK = '#14161b';
const INK_SOFT = '#5d636e';
const INK_FAINT = '#99a0ab';

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
  t.needsUpdate = true;
  return t;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Bricht Text auf maximal `maxLines` Zeilen um und kuerzt mit Auslassung. */
function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = text.split(' ');
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

/** Karte eines geplanten Rezepts. */
export function recipeCardTexture(recipe, servings) {
  const W = 620;
  const H = 372;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const accent = recipe.source?.accent || '#f0653a';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Akzentstreifen der Quelle
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 14, H);

  // Sanfter Farbschimmer aus der Quellfarbe
  const glow = ctx.createLinearGradient(14, 0, W * 0.75, H);
  glow.addColorStop(0, `${accent}14`);
  glow.addColorStop(1, '#ffffff00');
  ctx.fillStyle = glow;
  ctx.fillRect(14, 0, W - 14, H);

  const padX = 44;
  let y = 62;

  // Kategorie
  ctx.font = `600 20px ${FONT}`;
  ctx.fillStyle = accent;
  ctx.letterSpacing = '1.4px';
  ctx.fillText(recipe.category.toUpperCase(), padX, y);
  ctx.letterSpacing = '0px';

  // Titel
  y += 46;
  ctx.font = `640 38px ${FONT}`;
  ctx.fillStyle = INK;
  const titleLines = wrapLines(ctx, recipe.title, W - padX - 40, 2);
  for (const line of titleLines) {
    ctx.fillText(line, padX, y);
    y += 45;
  }

  // Kennzahlen
  y = H - 96;
  ctx.font = `500 23px ${FONT}`;
  ctx.fillStyle = INK_SOFT;
  const facts = [`${recipe.totalTime} Min.`, `${servings} Port.`];
  if (recipe.kcal) {
    facts.push(`${Math.round((recipe.kcal * servings) / (recipe.servings || 1))} kcal`);
  }
  ctx.fillText(facts.join('   ·   '), padX, y);

  // Quelle
  y = H - 46;
  ctx.font = `500 20px ${FONT}`;
  ctx.fillStyle = INK_FAINT;
  const src = recipe.source?.author || recipe.source?.title || '';
  const srcLine = wrapLines(ctx, src, W - padX - 40, 1)[0] || '';
  ctx.fillText(srcLine, padX, y);

  return toTexture(c);
}

/** Leerer Slot mit gestricheltem Rahmen und Mahlzeitenhinweis. */
export function slotTexture(label) {
  const W = 620;
  const H = 372;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillRect(0, 0, W, H);

  ctx.setLineDash([13, 11]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(20,22,27,0.22)';
  roundRect(ctx, 18, 18, W - 36, H - 36, 26);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = `500 26px ${FONT}`;
  ctx.fillStyle = 'rgba(20,22,27,0.34)';
  ctx.textAlign = 'center';
  ctx.fillText(label, W / 2, H / 2 + 9);
  ctx.textAlign = 'left';

  return toTexture(c);
}

/** Zeilenkopf eines Wochentags: Name, Datum und Tagesenergie. */
export function dayHeaderTexture(day, date, kcal, isToday) {
  const W = 560;
  const H = 220;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const right = W - 26;

  ctx.clearRect(0, 0, W, H);

  if (isToday) {
    ctx.fillStyle = '#fff0ea';
    roundRect(ctx, 10, 12, W - 20, H - 24, 30);
    ctx.fill();
  }

  ctx.textAlign = 'right';

  ctx.font = `660 60px ${FONT}`;
  ctx.fillStyle = isToday ? '#c2431c' : INK;
  ctx.fillText(day.label, right, 82);

  ctx.font = `500 34px ${FONT}`;
  ctx.fillStyle = isToday ? '#c2431c' : INK_FAINT;
  const d = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.`;
  ctx.fillText(d, right, 132);

  if (kcal > 0) {
    ctx.font = `600 30px ${FONT}`;
    ctx.fillStyle = '#3f7d63';
    ctx.fillText(`${Math.round(kcal)} kcal`, right, 184);
  }

  ctx.textAlign = 'left';
  return toTexture(c);
}

/** Spaltenkopf einer Mahlzeit ueber dem Raster. */
export function mealLabelTexture(meal) {
  const W = 460;
  const H = 130;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');

  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = `640 46px ${FONT}`;
  ctx.fillStyle = INK_SOFT;
  ctx.letterSpacing = '1px';
  ctx.fillText(meal.label, W / 2, H / 2 + 16);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';

  return toTexture(c);
}
