/**
 * Der Wochenplan als Stundenplan.
 *
 * Zwei Ansichten aus demselben Raster:
 *
 *  - weit (Tablet, Rechner): oben die Mahlzeiten als Spaltenköpfe, links
 *    die Wochentage als Zeilenköpfe, dazwischen die Felder.
 *  - kompakt (Smartphone): ein Tag pro Bildschirm, die vier Mahlzeiten
 *    untereinander. Ein Wochenraster mit 28 Feldern ist auf 390 Pixern
 *    nicht mehr lesbar.
 *
 * Die schwarzen Linien entstehen aus einer durchgehenden dunklen Fläche,
 * auf der die weißen Felder mit einem Spalt von Linienbreite liegen — so
 * sind alle Linien gleich stark, innen wie außen.
 */

import * as THREE from 'three';
import { DAYS, MEALS, recipeById } from '../data/index.js';
import { store, slotId, isoWeekNumber } from '../state/store.js';
import {
  recipeCellTexture,
  emptyCellTexture,
  mealHeadTexture,
  dayHeadTexture,
  cornerTexture,
} from './textures.js';

/** Ab dieser Breite passt das volle Wochenraster. */
export const COMPACT_BREAKPOINT = 760;

// Weite Ansicht
const HEAD_W = 2.05;
const CELL_W = 2.90;
const HEAD_H = 0.82;
const CELL_H = 1.28;

// Kompakte Ansicht: schmale Mahlzeitenspalte, breites Feld
const C_LABEL_W = 1.25;
const C_CELL_W = 4.60;
const C_HEAD_H = 1.10;
// Hohe Zeilen: hochkant ist Hoehe reichlich vorhanden, Breite knapp.
const C_CELL_H = 2.20;

const LINE = 0.045;
const FRAME_PAD = 0.07;

const Y_GRID = 0;
const Y_CELL = 0.01;
const Y_CARD = 0.02;
const Y_DRAG = 0.05;

const DRAG_THRESHOLD = 5;   // Pixel, ab denen aus einem Tippen ein Zug wird
const SWIPE_THRESHOLD = 55; // Pixel für den Tageswechsel per Wischen

/** Maße des Rasters für eine Ansicht. */
function metrics(compact) {
  if (compact) {
    return {
      cols: [C_LABEL_W, C_CELL_W],
      rows: [C_HEAD_H, ...Array(MEALS.length).fill(C_CELL_H)],
    };
  }
  return {
    cols: [HEAD_W, ...Array(MEALS.length).fill(CELL_W)],
    rows: [HEAD_H, ...Array(DAYS.length).fill(CELL_H)],
  };
}

/** Linke Kante und Breite einer Spalte. */
function span(sizes, index) {
  const total = sizes.reduce((a, b) => a + b, 0);
  let start = -total / 2;
  for (let i = 0; i < index; i += 1) start += sizes[i];
  return { start, size: sizes[index] };
}

export class Board {
  /**
   * @param {import('./scene.js').Stage} stage
   * @param {{onSelect?:Function, onDrop?:Function, onDayChange?:Function}} handlers
   */
  constructor(stage, handlers = {}) {
    this.stage = stage;
    this.handlers = handlers;

    this.compact = window.innerWidth < COMPACT_BREAKPOINT;
    this.day = Math.min(6, Math.max(0, (new Date().getDay() + 6) % 7));

    this.root = new THREE.Group();
    stage.scene.add(this.root);

    this.cards = new Map();
    this.slots = new Map();
    this.dayHeads = new Map();
    this.corner = null;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -Y_DRAG);

    this.drag = null;
    this.hoverSlot = null;
    this.hoverCard = null;
    this.armed = null; // per Antippen aufgenommenes Rezept

    // Die beiden Ansichten haben verschiedene Seitenverhaeltnisse; eine
    // gemeinsame Textur wuerde in einer davon verzerrt erscheinen.
    this.emptyTextures = { weit: emptyCellTexture(false), kompakt: emptyCellTexture(true) };

    this.#build();
    this.unsubscribe = store.subscribe(() => this.sync());
    this.sync();

    this.#bindPointer();
    this.#bindExternalDrag();
    stage.onTick((dt) => this.#animate(dt));

    window.addEventListener('resize', () => this.#checkBreakpoint());
  }

  /** Tage, die in der aktuellen Ansicht sichtbar sind. */
  visibleDays() {
    return this.compact ? [this.day] : DAYS.map((_, i) => i);
  }

  /** Ausdehnung des Rasters, die die Kamera rahmen muss. */
  get emptyTexture() {
    return this.compact ? this.emptyTextures.kompakt : this.emptyTextures.weit;
  }

  get frame() {
    const m = metrics(this.compact);
    return {
      width: m.cols.reduce((a, b) => a + b, 0) + 2 * FRAME_PAD,
      height: m.rows.reduce((a, b) => a + b, 0) + 2 * FRAME_PAD,
    };
  }

  #checkBreakpoint() {
    const compact = window.innerWidth < COMPACT_BREAKPOINT;
    if (compact === this.compact) return;
    this.compact = compact;
    this.#rebuild();
  }

  /** Wechselt den angezeigten Tag in der kompakten Ansicht. */
  showDay(index) {
    const next = Math.min(DAYS.length - 1, Math.max(0, index));
    if (!this.compact || next === this.day) return;
    this.day = next;
    this.#rebuild();
    this.handlers.onDayChange?.(next);
  }

  #rebuild() {
    this.#clear();
    this.#build();
    this.stage.setFrame(this.frame);
    this.sync();
    this.handlers.onDayChange?.(this.day);
  }

  #clear() {
    for (const child of [...this.root.children]) {
      this.root.remove(child);
      child.geometry?.dispose();
      child.material?.map?.dispose();
      child.material?.dispose();
    }
    this.cards.clear();
    this.slots.clear();
    this.dayHeads.clear();
    this._cardGeo = null;
  }

  // ------------------------------------------------------------ Aufbau

  #build() {
    const m = metrics(this.compact);
    this.metrics = m;

    this.cellGroup = new THREE.Group();
    this.cardGroup = new THREE.Group();
    this.root.add(this.cellGroup, this.cardGroup);

    const frame = this.frame;
    const grid = new THREE.Mesh(
      new THREE.PlaneGeometry(frame.width, frame.height),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = Y_GRID;
    this.root.add(grid);

    if (this.compact) this.#buildCompact();
    else this.#buildWide();
  }

  /** Mittelpunkt und Größe einer Zelle im Raster. */
  #cellBox(col, row, colSpan = 1) {
    const c = span(this.metrics.cols, col);
    const r = span(this.metrics.rows, row);
    let width = c.size;
    for (let i = 1; i < colSpan; i += 1) width += this.metrics.cols[col + i];
    return {
      x: c.start + width / 2,
      z: r.start + r.size / 2,
      width,
      height: r.size,
    };
  }

  #cell(col, row, map, colSpan = 1) {
    const box = this.#cellBox(col, row, colSpan);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(box.width - LINE, box.height - LINE),
      new THREE.MeshBasicMaterial({ map, color: 0xffffff }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(box.x, Y_CELL, box.z);
    this.cellGroup.add(mesh);
    return mesh;
  }

  #buildWide() {
    this.corner = this.#cell(0, 0, cornerTexture(''));
    MEALS.forEach((meal, i) => this.#cell(i + 1, 0, mealHeadTexture(meal)));

    DAYS.forEach((_, day) => {
      this.dayHeads.set(day, this.#cell(0, day + 1, null));

      MEALS.forEach((meal, mealIndex) => {
        const mesh = this.#cell(mealIndex + 1, day + 1, this.emptyTexture);
        mesh.userData = { day, meal: meal.id, mealIndex };
        this.slots.set(slotId(day, meal.id), mesh);
      });
    });
  }

  #buildCompact() {
    // Kopfzeile über die volle Breite: nur ein Tag ist sichtbar.
    this.dayHeads.set(this.day, this.#cell(0, 0, null, 2));

    MEALS.forEach((meal, i) => {
      this.#cell(0, i + 1, mealHeadTexture(meal, true));

      const mesh = this.#cell(1, i + 1, this.emptyTexture);
      mesh.userData = { day: this.day, meal: meal.id, mealIndex: i };
      this.slots.set(slotId(this.day, meal.id), mesh);
    });
  }

  // ---------------------------------------------------- Abgleich mit Store

  sync() {
    const week = store.week;
    const kcal = store.kcalPerDay();
    const today = new Date().setHours(0, 0, 0, 0);

    if (this.corner) {
      this.corner.material.map?.dispose();
      this.corner.material.map = cornerTexture(`KW ${isoWeekNumber(store.weekStart)}`);
      this.corner.material.needsUpdate = true;
    }

    for (const [day, mesh] of this.dayHeads) {
      const date = store.dateOf(day);
      mesh.material.map?.dispose();
      mesh.material.map = dayHeadTexture(
        DAYS[day],
        date,
        kcal[day],
        date.setHours(0, 0, 0, 0) === today,
        this.compact,
      );
      mesh.material.needsUpdate = true;
    }

    const seen = new Set();

    for (const day of this.visibleDays()) {
      MEALS.forEach((meal, mealIndex) => {
        const id = slotId(day, meal.id);
        const entry = week[id];
        if (!entry) return;

        const recipe = recipeById.get(entry.recipeId);
        if (!recipe) return;

        const slot = this.slots.get(id);
        if (!slot) return;

        seen.add(id);
        let card = this.cards.get(id);

        if (!card) {
          card = this.#createCard(slot);
          this.cards.set(id, card);
          this.cardGroup.add(card);
          card.position.set(slot.position.x, Y_CARD, slot.position.z);
          card.scale.setScalar(0.9);
        }

        const stamp = `${entry.recipeId}|${entry.servings}|${this.compact}`;
        if (card.userData.stamp !== stamp) {
          card.material.map?.dispose();
          card.material.map = recipeCellTexture(recipe, entry.servings, this.compact);
          card.material.needsUpdate = true;
          card.userData.stamp = stamp;
        }

        Object.assign(card.userData, {
          day,
          meal: meal.id,
          mealIndex,
          recipeId: entry.recipeId,
          home: new THREE.Vector3(slot.position.x, Y_CARD, slot.position.z),
        });

        if (this.drag?.card !== card) card.userData.target = card.userData.home.clone();
      });
    }

    for (const [id, card] of this.cards) {
      if (seen.has(id)) continue;
      this.cardGroup.remove(card);
      card.material.map?.dispose();
      card.material.dispose();
      this.cards.delete(id);
    }

    const remapped = new Map();
    for (const card of this.cards.values()) {
      remapped.set(slotId(card.userData.day, card.userData.meal), card);
    }
    this.cards = remapped;
  }

  #createCard(slot) {
    if (!this._cardGeo) {
      const p = slot.geometry.parameters;
      this._cardGeo = new THREE.PlaneGeometry(p.width, p.height);
    }
    const mesh = new THREE.Mesh(
      this._cardGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.userData = { target: new THREE.Vector3() };
    return mesh;
  }

  // ------------------------------------------------------------ Zeigegerät

  #ndc(event) {
    const r = this.stage.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - r.left) / r.width) * 2 - 1,
      -((event.clientY - r.top) / r.height) * 2 + 1,
    );
    return this.pointer;
  }

  #intersect(objects) {
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);
    return this.raycaster.intersectObjects(objects, false)[0] || null;
  }

  #slotAt(event) {
    this.#ndc(event);
    const hit = this.#intersect([...this.slots.values()]);
    return hit ? hit.object : null;
  }

  /** Nimmt ein Rezept auf; der nächste Tipp auf ein Feld legt es ab. */
  arm(recipe) {
    this.armed = recipe;
    this.handlers.onArm?.(recipe);
  }

  disarm() {
    if (!this.armed) return;
    this.armed = null;
    this.handlers.onArm?.(null);
  }

  #bindPointer() {
    const el = this.stage.renderer.domElement;

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.gesture = { x: e.clientX, y: e.clientY, time: Date.now() };

      this.#ndc(e);
      const hit = this.#intersect([...this.cards.values()]);
      if (!hit) return;

      this.stage.controls.enabled = false;
      this.drag = {
        card: hit.object,
        from: { day: hit.object.userData.day, meal: hit.object.userData.meal },
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        pointerId: e.pointerId,
      };
      el.setPointerCapture(e.pointerId);
    }, true);

    el.addEventListener('pointermove', (e) => {
      if (this.drag) {
        const dx = e.clientX - this.drag.startX;
        const dy = e.clientY - this.drag.startY;

        if (!this.drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          this.drag.moved = true;
          this.drag.card.position.y = Y_DRAG;
          el.style.cursor = 'grabbing';
        }

        if (this.drag.moved) {
          this.#ndc(e);
          this.raycaster.setFromCamera(this.pointer, this.stage.camera);
          const point = new THREE.Vector3();
          if (this.raycaster.ray.intersectPlane(this.dragPlane, point)) {
            this.root.worldToLocal(point);
            this.drag.card.userData.target.set(point.x, Y_DRAG, point.z);
          }
          this.hoverSlot = this.#slotAt(e);
        }
        return;
      }

      if (e.pointerType === 'touch') return;
      this.#ndc(e);
      const hit = this.#intersect([...this.cards.values()]);
      this.hoverCard = hit ? hit.object : null;
      if (!this.stage.controls.dragging) {
        el.style.cursor = hit || this.armed ? 'pointer' : 'default';
      }
    });

    const finish = (e) => {
      const gesture = this.gesture;
      this.gesture = null;

      if (!this.drag) {
        this.#handleTap(e, gesture);
        return;
      }

      const { card, from, moved } = this.drag;
      this.drag = null;
      this.stage.controls.enabled = true;
      el.style.cursor = 'default';
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);

      if (!moved) {
        this.handlers.onSelect?.(from);
        return;
      }

      const slot = this.hoverSlot;
      this.hoverSlot = null;
      card.position.y = Y_CARD;

      if (slot && !(slot.userData.day === from.day && slot.userData.meal === from.meal)) {
        store.move(from, { day: slot.userData.day, meal: slot.userData.meal });
      } else {
        card.userData.target = card.userData.home.clone();
      }
    };

    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', () => { this.gesture = null; });

    el.addEventListener('dblclick', (e) => {
      this.#ndc(e);
      if (!this.#intersect([...this.cards.values()])) this.stage.resetView();
    });
  }

  /** Tippen auf freie Fläche: ablegen, Tag wechseln oder nichts. */
  #handleTap(e, gesture) {
    if (!gesture) return;

    const dx = e.clientX - gesture.x;
    const dy = e.clientY - gesture.y;

    // Waagerechtes Wischen blättert in der kompakten Ansicht durch die Tage.
    if (this.compact && Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      this.showDay(this.day + (dx < 0 ? 1 : -1));
      return;
    }

    if (Math.hypot(dx, dy) > DRAG_THRESHOLD) return;

    const slot = this.#slotAt(e);
    if (!slot) {
      this.disarm();
      return;
    }

    if (this.armed) {
      store.place(slot.userData.day, slot.userData.meal, this.armed.id);
      this.disarm();
      this.handlers.onDrop?.(this.armed);
      return;
    }

    if (!store.entry(slot.userData.day, slot.userData.meal)) {
      this.handlers.onEmptyTap?.({ day: slot.userData.day, meal: slot.userData.meal });
    }
  }

  #bindExternalDrag() {
    const el = this.stage.renderer.domElement;

    el.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes('text/x-kochbuch-recipe')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      this.hoverSlot = this.#slotAt(e);
    });

    el.addEventListener('dragleave', () => { this.hoverSlot = null; });

    el.addEventListener('drop', (e) => {
      const recipeId = e.dataTransfer?.getData('text/x-kochbuch-recipe');
      if (!recipeId) return;
      e.preventDefault();

      const slot = this.#slotAt(e);
      this.hoverSlot = null;
      if (!slot) return;

      store.place(slot.userData.day, slot.userData.meal, recipeId);
      this.handlers.onDrop?.(recipeId);
    });
  }

  /** Legt ein Gericht in das erste freie passende Feld. */
  placeInFirstFreeSlot(recipe) {
    const preferred = MEALS.filter((m) => (recipe.meals || []).includes(m.id));
    const order = preferred.length ? preferred : MEALS;

    // In der Tagesansicht zuerst den sichtbaren Tag bedienen.
    const days = this.compact
      ? [this.day, ...DAYS.map((_, i) => i).filter((i) => i !== this.day)]
      : DAYS.map((_, i) => i);

    for (const day of days) {
      for (const meal of order) {
        if (!store.entry(day, meal.id)) {
          store.place(day, meal.id, recipe.id);
          if (this.compact && day !== this.day) this.showDay(day);
          return { day, meal: meal.id };
        }
      }
    }
    return null;
  }

  // ------------------------------------------------------------ Animation

  #animate(dt) {
    const k = 1 - Math.exp(-16 * dt);

    for (const card of this.cards.values()) {
      const held = this.drag?.card === card;
      const hovered = this.hoverCard === card && !this.drag;

      card.position.lerp(card.userData.target, k);

      const want = held ? 1.05 : hovered ? 1.015 : 1;
      const s = card.scale.x + (want - card.scale.x) * k;
      card.scale.set(s, s, s);
    }

    for (const slot of this.slots.values()) {
      const active = this.hoverSlot === slot
        || (this.armed && !store.entry(slot.userData.day, slot.userData.meal));
      const target = active ? new THREE.Color(0xffe2d4) : new THREE.Color(0xffffff);
      slot.material.color.lerp(target, k);
    }
  }

  dispose() {
    this.unsubscribe?.();
  }
}
