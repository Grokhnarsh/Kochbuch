/**
 * Zeichnet die Zellen des Stundenplans auf 2D-Canvas und reicht sie als
 * Texturen an Three.js weiter.
 *
 * Gestaltung wie ein gedruckter Plan: weißer Grund, schwarze Schrift,
 * ruhige Flächen. Die Texturen sind bewusst deutlich größer als die
 * Zelle auf dem Bildschirm, damit die Schrift scharf bleibt.
 */

import * as THREE from 'three';
import { kcalText } from '../state/naehrwerte.js';

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

/**
 * Belegte Zelle: Gericht mit Kennzahlen und Herkunft.
 * Die kompakte Ansicht hat breitere, flachere Felder.
 */
export function recipeCellTexture(recipe, servings, compact = false) {
  const W = 800;
  const H = compact ? 383 : 353;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const accent = recipe.source?.accent || '#f0653a';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Farbmarke der Quelle am linken Rand
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 16, H);

  const padX = 40;
  let y = compact ? 56 : 66;

  ctx.font = `600 ${compact ? 30 : 34}px ${FONT}`;
  ctx.fillStyle = accent;
  ctx.letterSpacing = '1.6px';
  ctx.fillText(recipe.category.toUpperCase(), padX, y);
  ctx.letterSpacing = '0px';

  y += compact ? 56 : 62;
  ctx.font = `700 ${compact ? 52 : 58}px ${FONT}`;
  ctx.fillStyle = INK;
  for (const line of wrapLines(ctx, recipe.title, W - padX - 34, 2)) {
    ctx.fillText(line, padX, y);
    y += compact ? 56 : 64;
  }

  // Fehlende Angaben werden weggelassen, nicht als Null gezeigt.
  const facts = [];
  if (recipe.totalTime > 0) facts.push(`${recipe.totalTime} Min.`);
  facts.push(`${servings} ${recipe.yieldUnit || 'Port.'}`);
  // Kalorien je Portion, nicht mal der Portionszahl: wer fuer acht kocht,
  // isst nicht doppelt so viel wie fuer vier.
  if (recipe.kcal) facts.push(kcalText(recipe));

  // Hochkant laeuft der Text von oben durch, sonst klafft eine Luecke
  // zwischen Titel und Kennzahlen. Im weiten Feld bleibt der Fuss unten.
  const factsY = compact ? y + 12 : H - 84;
  const srcY = compact ? y + 58 : H - 32;

  ctx.font = `500 ${compact ? 36 : 40}px ${FONT}`;
  ctx.fillStyle = INK_SOFT;
  ctx.fillText(facts.join('   ·   '), padX, factsY);

  ctx.font = `500 ${compact ? 32 : 34}px ${FONT}`;
  ctx.fillStyle = INK_FAINT;
  const src = recipe.source?.author || recipe.source?.title || '';
  ctx.fillText(wrapLines(ctx, src, W - padX - 34, 1)[0] || '', padX, srcY);

  return toTexture(c);
}

/** Freie Zelle: bleibt leer wie im gedruckten Plan, mit leisem Hinweis. */
export function emptyCellTexture(compact = false) {
  const W = 800;
  const H = compact ? 383 : 353;
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
export function mealHeadTexture(meal, compact = false) {
  const W = compact ? 300 : 800;
  const H = compact ? 528 : 226;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');

  ctx.fillStyle = HEAD_FILL;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = INK;

  if (compact) {
    // Schmale Spalte: kein Versalsatz, notfalls zweizeilig.
    ctx.font = `700 44px ${FONT}`;
    const lines = wrapLines(ctx, meal.label, W - 26, 2);
    let y = H / 2 - ((lines.length - 1) * 50) / 2 + 15;
    for (const line of lines) {
      ctx.fillText(line, W / 2, y);
      y += 50;
    }
  } else {
    ctx.font = `700 62px ${FONT}`;
    ctx.letterSpacing = '2px';
    ctx.fillText(meal.label.toUpperCase(), W / 2, H / 2 + 21);
    ctx.letterSpacing = '0px';
  }

  ctx.textAlign = 'left';
  return toTexture(c);
}

/** Zeilenkopf: Wochentag mit Datum und Tagesenergie. */
export function dayHeadTexture(day, date, kcal, isToday, compact = false) {
  const W = compact ? 900 : 600;
  const H = compact ? 169 : 375;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = isToday ? TODAY_FILL : HEAD_FILL;
  ctx.fillRect(0, 0, W, H);

  const ink = isToday ? TODAY_INK : INK;
  const datum = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.`;

  if (compact) {
    // Eine breite Kopfzeile: Name links, Datum und Energie rechts.
    ctx.textAlign = 'left';
    ctx.font = `700 64px ${FONT}`;
    ctx.fillStyle = ink;
    ctx.fillText(day.label, 34, 108);

    ctx.textAlign = 'right';
    ctx.font = `500 46px ${FONT}`;
    ctx.fillStyle = isToday ? TODAY_INK : INK_SOFT;
    ctx.fillText(kcal > 0 ? `${datum}   ·   ${Math.round(kcal)} kcal` : datum, W - 34, 108);
  } else {
    const right = W - 26;
    ctx.textAlign = 'right';

    ctx.font = `660 60px ${FONT}`;
    ctx.fillStyle = ink;
    ctx.fillText(day.label, right, 82);

    ctx.font = `500 34px ${FONT}`;
    ctx.fillStyle = isToday ? TODAY_INK : INK_FAINT;
    ctx.fillText(datum, right, 132);

    if (kcal > 0) {
      ctx.font = `600 30px ${FONT}`;
      ctx.fillStyle = '#3f7d63';
      ctx.fillText(`${Math.round(kcal)} kcal`, right, 184);
    }
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
