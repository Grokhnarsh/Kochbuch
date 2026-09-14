/**
 * Das Planungsboard: sieben Tagesspalten mal vier Mahlzeiten als Raster
 * aus Slots, darauf Rezeptkarten. Karten lassen sich per Zeigegeraet
 * zwischen Slots ziehen; aus der Bibliothek kommen sie per HTML-Drag.
 */

import * as THREE from 'three';
import { DAYS, MEALS, recipeById } from '../data/index.js';
import { store, slotId } from '../state/store.js';
import { roundedPlane, roundedCard } from './geometry.js';
import { recipeCardTexture, slotTexture, dayHeaderTexture, mealLabelTexture } from './textures.js';

const CELL_W = 2.16;
const CELL_D = 1.3;
const GAP_X = 0.16;
const GAP_Z = 0.15;
const CARD_W = 2.0;
const CARD_H = 1.19;
const CARD_R = 0.13;

// Mahlzeiten laufen als Spalten von links nach rechts, Wochentage als
// Zeilen nach hinten. Dieses Hochformat nutzt den Bildschirm deutlich
// besser aus als sieben nebeneinanderliegende Tagesspalten.
export const BOARD_WIDTH = MEALS.length * CELL_W + (MEALS.length - 1) * GAP_X;
export const BOARD_DEPTH = DAYS.length * CELL_D + (DAYS.length - 1) * GAP_Z;

// Die Beschriftungen liegen nur links und oben. Damit der sichtbare
// Inhalt trotzdem mittig im Bild steht, wird die gesamte Gruppe um die
// halbe Beschriftungsbreite zurueckgeschoben.
const LABEL_X = 2.35;
const LABEL_Z = 0.95;

export const OFFSET_X = LABEL_X / 2;
export const OFFSET_Z = LABEL_Z / 2;

/** Tatsaechlich sichtbarer Bereich, den die Kamera rahmen muss. */
export const FRAME = {
  boardWidth: BOARD_WIDTH + LABEL_X,
  boardDepth: BOARD_DEPTH + LABEL_Z,
};

const REST_Y = 0.075;
const LIFT_Y = 0.62;
const DRAG_THRESHOLD = 5; // Pixel, ab denen aus einem Klick ein Zug wird

const xFor = (mealIndex) => -BOARD_WIDTH / 2 + CELL_W / 2 + mealIndex * (CELL_W + GAP_X);
const zFor = (day) => -BOARD_DEPTH / 2 + CELL_D / 2 + day * (CELL_D + GAP_Z);

export class Board {
  /**
   * @param {import('./scene.js').Stage} stage
   * @param {{onSelect:(slot:{day:number,meal:string})=>void}} handlers
   */
  constructor(stage, handlers = {}) {
    this.stage = stage;
    this.handlers = handlers;

    this.root = new THREE.Group();
    this.root.position.set(OFFSET_X, 0, OFFSET_Z);
    this.slotGroup = new THREE.Group();
    this.cardGroup = new THREE.Group();
    this.labelGroup = new THREE.Group();
    this.root.add(this.slotGroup, this.cardGroup, this.labelGroup);
    stage.scene.add(this.root);

    /** @type {Map<string, THREE.Mesh>} Karten, nach Slot-Id */
    this.cards = new Map();
    /** @type {Map<string, THREE.Mesh>} Slots, nach Slot-Id */
    this.slots = new Map();
    this.dayHeaders = [];

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -LIFT_Y);

    this.drag = null;
    this.hoverSlot = null;
    this.hoverCard = null;

    this.#buildBase();
    this.#buildSlots();
    this.#buildLabels();

    this.unsubscribe = store.subscribe(() => this.sync());
    this.sync();

    this.#bindPointer();
    this.#bindExternalDrag();
    stage.onTick((dt) => this.#animate(dt));
  }

  // ------------------------------------------------------------ Aufbau

  #buildBase() {
    const geo = roundedPlane(BOARD_WIDTH + 0.7, BOARD_DEPTH + 0.7, 0.45);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      opacity: 0.62,
    });
    const base = new THREE.Mesh(geo, mat);
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.001;
    base.receiveShadow = true;
    this.root.add(base);
  }

  #buildSlots() {
    const geo = roundedPlane(CARD_W, CARD_H, CARD_R);

    for (let day = 0; day < DAYS.length; day += 1) {
      MEALS.forEach((meal, mealIndex) => {
        const mat = new THREE.MeshStandardMaterial({
          map: slotTexture(meal.label),
          transparent: true,
          roughness: 0.92,
          metalness: 0,
          emissive: new THREE.Color(0xf0653a),
          emissiveIntensity: 0,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(xFor(mealIndex), 0.008, zFor(day));
        mesh.userData = { day, meal: meal.id, mealIndex, baseScale: 1 };
        this.slotGroup.add(mesh);
        this.slots.set(slotId(day, meal.id), mesh);
      });
    }
  }

  #buildLabels() {
    // Tageszeilen links neben dem Raster
    for (let day = 0; day < DAYS.length; day += 1) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(roundedPlane(2.05, 0.8, 0.12), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(-BOARD_WIDTH / 2 - 1.28, 0.012, zFor(day));
      this.labelGroup.add(mesh);
      this.dayHeaders.push(mesh);
    }

    // Mahlzeitenspalten ueber dem Raster
    MEALS.forEach((meal, mealIndex) => {
      const mat = new THREE.MeshBasicMaterial({
        map: mealLabelTexture(meal),
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(roundedPlane(1.62, 0.46, 0.05), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(xFor(mealIndex), 0.012, -BOARD_DEPTH / 2 - 0.52);
      this.labelGroup.add(mesh);
    });
  }

  // ---------------------------------------------------- Abgleich mit Store

  /** Bringt Karten und Kopfzeilen auf den Stand des Stores. */
  sync() {
    const week = store.week;
    const kcal = store.kcalPerDay();
    const today = new Date().setHours(0, 0, 0, 0);

    this.dayHeaders.forEach((mesh, day) => {
      const date = store.dateOf(day);
      mesh.material.map?.dispose();
      mesh.material.map = dayHeaderTexture(
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
          card.position.set(xFor(mealIndex), LIFT_Y, zFor(day));
          card.scale.setScalar(0.82);
        }

        const stamp = `${entry.recipeId}|${entry.servings}`;
        if (card.userData.stamp !== stamp) {
          card.material.map?.dispose();
          card.material.map = recipeCardTexture(recipe, entry.servings);
          card.material.needsUpdate = true;
          card.userData.stamp = stamp;
        }

        card.userData.day = day;
        card.userData.meal = meal.id;
        card.userData.mealIndex = mealIndex;
        card.userData.recipeId = entry.recipeId;
        card.userData.home = new THREE.Vector3(xFor(mealIndex), REST_Y, zFor(day));

        if (this.drag?.card !== card) card.userData.target = card.userData.home.clone();
      });
    }

    // Karten entfernen, die nicht mehr im Plan stehen
    for (const [id, card] of this.cards) {
      if (seen.has(id)) continue;
      this.cardGroup.remove(card);
      card.material.map?.dispose();
      card.material.dispose();
      this.cards.delete(id);
    }

    // Slot-Schluessel der Karten neu aufbauen, da Slots wandern koennen
    const remapped = new Map();
    for (const card of this.cards.values()) {
      remapped.set(slotId(card.userData.day, card.userData.meal), card);
    }
    this.cards = remapped;
  }

  #createCard() {
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.62,
      metalness: 0,
      color: 0xffffff,
    });
    const mesh = new THREE.Mesh(this.#cardGeometry(), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.userData = { target: new THREE.Vector3(), hover: 0 };
    return mesh;
  }

  #cardGeometry() {
    if (!this._cardGeo) this._cardGeo = roundedCard(CARD_W, CARD_H, CARD_R, 0.055);
    return this._cardGeo;
  }

  // ------------------------------------------------------------ Zeigegeraet

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
    const hit = this.#intersect(this.slotGroup.children);
    return hit ? hit.object : null;
  }

  #bindPointer() {
    const el = this.stage.renderer.domElement;

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.#ndc(e);
      const hit = this.#intersect([...this.cards.values()]);
      if (!hit) return;

      this.drag = {
        card: hit.object,
        from: { day: hit.object.userData.day, meal: hit.object.userData.meal },
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        pointerId: e.pointerId,
      };
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener('pointermove', (e) => {
      if (this.drag) {
        const dx = e.clientX - this.drag.startX;
        const dy = e.clientY - this.drag.startY;

        if (!this.drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          this.drag.moved = true;
          this.stage.controls.enabled = false;
          el.style.cursor = 'grabbing';
        }

        if (this.drag.moved) {
          this.#ndc(e);
          this.raycaster.setFromCamera(this.pointer, this.stage.camera);
          const point = new THREE.Vector3();
          if (this.raycaster.ray.intersectPlane(this.dragPlane, point)) {
            // Die Gruppe ist verschoben, der Treffer liegt im Weltraum.
            this.root.worldToLocal(point);
            this.drag.card.userData.target.set(point.x, LIFT_Y, point.z);
          }
          this.#setHoverSlot(this.#slotAt(e));
        }
        return;
      }

      this.#ndc(e);
      const hit = this.#intersect([...this.cards.values()]);
      this.#setHoverCard(hit ? hit.object : null);
      el.style.cursor = hit ? 'grab' : 'default';
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
      this.#setHoverSlot(null);

      if (slot && !(slot.userData.day === from.day && slot.userData.meal === from.meal)) {
        store.move(from, { day: slot.userData.day, meal: slot.userData.meal });
      } else {
        card.userData.target = card.userData.home.clone();
      }
    };

    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);

    el.addEventListener('pointerleave', () => {
      if (!this.drag) this.#setHoverCard(null);
    });
  }

  /** Aufnahme von Rezepten, die aus der Bibliothek gezogen werden. */
  #bindExternalDrag() {
    const el = this.stage.renderer.domElement;

    el.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes('text/x-kochbuch-recipe')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      this.#setHoverSlot(this.#slotAt(e));
    });

    el.addEventListener('dragleave', () => this.#setHoverSlot(null));

    el.addEventListener('drop', (e) => {
      const recipeId = e.dataTransfer?.getData('text/x-kochbuch-recipe');
      if (!recipeId) return;
      e.preventDefault();

      const slot = this.#slotAt(e);
      this.#setHoverSlot(null);
      if (!slot) return;

      store.place(slot.userData.day, slot.userData.meal, recipeId);
      this.handlers.onDrop?.(recipeId);
    });
  }

  #setHoverSlot(slot) {
    if (this.hoverSlot === slot) return;
    this.hoverSlot = slot;
  }

  #setHoverCard(card) {
    if (this.hoverCard === card) return;
    this.hoverCard = card;
  }

  /**
   * Legt ein Rezept in den ersten freien passenden Slot; Rueckfallebene
   * fuer Zeigegeraete ohne Drag-Unterstuetzung.
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
    const k = 1 - Math.exp(-14 * dt); // rahmenratenunabhaengige Annaeherung

    for (const card of this.cards.values()) {
      const lifted = this.drag?.card === card;
      const hovered = this.hoverCard === card && !this.drag;

      if (!lifted) {
        card.userData.target.y = REST_Y + (hovered ? 0.14 : 0);
      }

      card.position.lerp(card.userData.target, k);

      const wantScale = lifted ? 1.06 : hovered ? 1.03 : 1;
      card.scale.lerp(new THREE.Vector3(wantScale, wantScale, wantScale), k);

      const wantTilt = lifted ? -0.06 : 0;
      card.rotation.z += (wantTilt - card.rotation.z) * k;
    }

    for (const slot of this.slots.values()) {
      const active = this.hoverSlot === slot;
      const want = active ? 0.28 : 0;
      const mat = slot.material;
      mat.emissiveIntensity += (want - mat.emissiveIntensity) * k;

      const s = active ? 1.045 : 1;
      slot.scale.x += (s - slot.scale.x) * k;
      slot.scale.y += (s - slot.scale.y) * k;
    }
  }

  dispose() {
    this.unsubscribe?.();
  }
}
