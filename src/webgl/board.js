/**
 * Der Wochenplan als Stundenplan.
 *
 * Ein durchgehendes Raster: oben die Mahlzeiten als Spaltenköpfe, links
 * die Wochentage als Zeilenköpfe, dazwischen die Felder für die Gerichte.
 * Die schwarzen Linien entstehen aus einer durchgehenden dunklen Fläche,
 * auf der die weißen Felder mit einem Spalt von Linienbreite liegen — so
 * sind alle Linien gleich stark, innen wie außen.
 *
 * Felder lassen sich mit dem Zeigegerät tauschen; aus der Bibliothek
 * kommen Gerichte per HTML-Drag herein.
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

// Die Spaltenbreite ist so gewählt, dass das Seitenverhältnis des Rasters
// dem freien Bildschirmbereich nahekommt — sonst bleibt seitlich Platz
// ungenutzt, während die Höhe schon ausgereizt ist.
const HEAD_W = 2.05;  // Breite der Tagesspalte
const CELL_W = 2.90;  // Breite einer Mahlzeitenspalte
const HEAD_H = 0.82;  // Höhe der Kopfzeile
const CELL_H = 1.28;  // Höhe einer Tageszeile
const LINE = 0.045;   // Stärke der Rasterlinien
const FRAME_PAD = 0.07; // zusätzliche Stärke des Außenrahmens

const GRID_W = HEAD_W + MEALS.length * CELL_W;
const GRID_H = HEAD_H + DAYS.length * CELL_H;

/** Ausdehnung des Plans, die die Kamera rahmen muss. */
export const FRAME = {
  width: GRID_W + 2 * FRAME_PAD,
  height: GRID_H + 2 * FRAME_PAD,
};

const Y_GRID = 0;
const Y_CELL = 0.01;
const Y_CARD = 0.02;
const Y_DRAG = 0.05;

const DRAG_THRESHOLD = 5; // Pixel, ab denen aus einem Klick ein Zug wird

/** Linke Kante und Breite einer Spalte (0 = Tagesspalte). */
function column(index) {
  const left = -GRID_W / 2;
  if (index === 0) return { left, width: HEAD_W };
  return { left: left + HEAD_W + (index - 1) * CELL_W, width: CELL_W };
}

/** Obere Kante und Höhe einer Zeile (0 = Kopfzeile). */
function row(index) {
  const top = -GRID_H / 2;
  if (index === 0) return { top, height: HEAD_H };
  return { top: top + HEAD_H + (index - 1) * CELL_H, height: CELL_H };
}

const centreX = (col) => column(col).left + column(col).width / 2;
const centreZ = (r) => row(r).top + row(r).height / 2;

/** Feldmitte für Tag und Mahlzeit. */
const slotX = (mealIndex) => centreX(mealIndex + 1);
const slotZ = (day) => centreZ(day + 1);

export class Board {
  /**
   * @param {import('./scene.js').Stage} stage
   * @param {{onSelect?:Function, onDrop?:Function}} handlers
   */
  constructor(stage, handlers = {}) {
    this.stage = stage;
    this.handlers = handlers;

    this.root = new THREE.Group();
    this.cellGroup = new THREE.Group();
    this.cardGroup = new THREE.Group();
    this.root.add(this.cellGroup, this.cardGroup);
    stage.scene.add(this.root);

    /** @type {Map<string, THREE.Mesh>} */
    this.cards = new Map();
    /** @type {Map<string, THREE.Mesh>} */
    this.slots = new Map();
    this.dayHeads = [];
    this.corner = null;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -Y_DRAG);

    this.drag = null;
    this.hoverSlot = null;
    this.hoverCard = null;

    this.emptyTexture = emptyCellTexture();

    this.#buildGrid();
    this.#buildHeads();
    this.#buildSlots();

    this.unsubscribe = store.subscribe(() => this.sync());
    this.sync();

    this.#bindPointer();
    this.#bindExternalDrag();
    stage.onTick((dt) => this.#animate(dt));
  }

  // ------------------------------------------------------------ Aufbau

  /** Dunkle Grundfläche; sie scheint als Raster zwischen den Feldern durch. */
  #buildGrid() {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(FRAME.width, FRAME.height),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = Y_GRID;
    this.root.add(mesh);
  }

  /** Weißes Feld in der Zelle, um eine Linienbreite eingerückt. */
  #cell(colIndex, rowIndex, map, y = Y_CELL) {
    const col = column(colIndex);
    const r = row(rowIndex);

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(col.width - LINE, r.height - LINE),
      new THREE.MeshBasicMaterial({ map, color: 0xffffff }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(centreX(colIndex), y, centreZ(rowIndex));
    return mesh;
  }

  #buildHeads() {
    this.corner = this.#cell(0, 0, cornerTexture(''));
    this.cellGroup.add(this.corner);

    MEALS.forEach((meal, i) => {
      this.cellGroup.add(this.#cell(i + 1, 0, mealHeadTexture(meal)));
    });

    DAYS.forEach((_, day) => {
      const mesh = this.#cell(0, day + 1, null);
      this.cellGroup.add(mesh);
      this.dayHeads.push(mesh);
    });
  }

  #buildSlots() {
    for (let day = 0; day < DAYS.length; day += 1) {
      MEALS.forEach((meal, mealIndex) => {
        const mesh = this.#cell(mealIndex + 1, day + 1, this.emptyTexture);
        mesh.userData = { day, meal: meal.id, mealIndex };
        this.cellGroup.add(mesh);
        this.slots.set(slotId(day, meal.id), mesh);
      });
    }
  }

  // ---------------------------------------------------- Abgleich mit Store

  /** Bringt Felder und Köpfe auf den Stand des Wochenplans. */
  sync() {
    const week = store.week;
    const kcal = store.kcalPerDay();
    const today = new Date().setHours(0, 0, 0, 0);

    this.corner.material.map?.dispose();
    this.corner.material.map = cornerTexture(`KW ${isoWeekNumber(store.weekStart)}`);
    this.corner.material.needsUpdate = true;

    this.dayHeads.forEach((mesh, day) => {
      const date = store.dateOf(day);
      mesh.material.map?.dispose();
      mesh.material.map = dayHeadTexture(
        DAYS[day],
        date,
        kcal[day],
        date.setHours(0, 0, 0, 0) === today,
      );
      mesh.material.needsUpdate = true;
    });

    const seen = new Set();

    for (let day = 0; day < DAYS.length; day += 1) {
      MEALS.forEach((meal, mealIndex) => {
        const id = slotId(day, meal.id);
        const entry = week[id];
        if (!entry) return;

        const recipe = recipeById.get(entry.recipeId);
        if (!recipe) return;

        seen.add(id);
        let card = this.cards.get(id);

        if (!card) {
          card = this.#createCard();
          this.cards.set(id, card);
          this.cardGroup.add(card);
          card.position.set(slotX(mealIndex), Y_CARD, slotZ(day));
          card.scale.setScalar(0.9);
        }

        const stamp = `${entry.recipeId}|${entry.servings}`;
        if (card.userData.stamp !== stamp) {
          card.material.map?.dispose();
          card.material.map = recipeCellTexture(recipe, entry.servings);
          card.material.needsUpdate = true;
          card.userData.stamp = stamp;
        }

        card.userData.day = day;
        card.userData.meal = meal.id;
        card.userData.mealIndex = mealIndex;
        card.userData.recipeId = entry.recipeId;
        card.userData.home = new THREE.Vector3(slotX(mealIndex), Y_CARD, slotZ(day));

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

    // Felder können wandern, daher die Zuordnung neu aufbauen
    const remapped = new Map();
    for (const card of this.cards.values()) {
      remapped.set(slotId(card.userData.day, card.userData.meal), card);
    }
    this.cards = remapped;
  }

  #createCard() {
    if (!this._cardGeo) {
      this._cardGeo = new THREE.PlaneGeometry(CELL_W - LINE, CELL_H - LINE);
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

  #bindPointer() {
    const el = this.stage.renderer.domElement;

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.#ndc(e);
      const hit = this.#intersect([...this.cards.values()]);
      if (!hit) return;

      // Verschieben der Ansicht sofort stilllegen, sonst wandert der Plan mit.
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

      this.#ndc(e);
      const hit = this.#intersect([...this.cards.values()]);
      this.hoverCard = hit ? hit.object : null;
      if (!this.stage.controls.dragging) {
        el.style.cursor = hit ? 'grab' : 'default';
      }
    });

    const finish = (e) => {
      if (!this.drag) return;
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
    el.addEventListener('pointercancel', finish);

    // Doppelklick auf leere Fläche stellt Ausschnitt und Zoom wieder her.
    el.addEventListener('dblclick', (e) => {
      this.#ndc(e);
      if (!this.#intersect([...this.cards.values()])) this.stage.resetView();
    });
  }

  /** Aufnahme von Gerichten, die aus der Bibliothek gezogen werden. */
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

  /**
   * Legt ein Gericht in das erste freie passende Feld; Rückfallebene für
   * Zeigegeräte ohne Drag-Unterstützung.
   */
  placeInFirstFreeSlot(recipe) {
    const preferred = MEALS.filter((m) => (recipe.meals || []).includes(m.id));
    const order = preferred.length ? preferred : MEALS;

    for (let day = 0; day < DAYS.length; day += 1) {
      for (const meal of order) {
        if (!store.entry(day, meal.id)) {
          store.place(day, meal.id, recipe.id);
          return { day, meal: meal.id };
        }
      }
    }
    return null;
  }

  // ------------------------------------------------------------ Animation

  #animate(dt) {
    const k = 1 - Math.exp(-16 * dt); // rahmenratenunabhängige Annäherung

    for (const card of this.cards.values()) {
      const held = this.drag?.card === card;
      const hovered = this.hoverCard === card && !this.drag;

      card.position.lerp(card.userData.target, k);

      const want = held ? 1.05 : hovered ? 1.015 : 1;
      const s = card.scale.x + (want - card.scale.x) * k;
      card.scale.set(s, s, s);
    }

    // Zielfeld hell einfärben, solange etwas darüber schwebt
    for (const slot of this.slots.values()) {
      const active = this.hoverSlot === slot;
      const target = active ? new THREE.Color(0xffe2d4) : new THREE.Color(0xffffff);
      slot.material.color.lerp(target, k);
    }
  }

  dispose() {
    this.unsubscribe?.();
  }
}
