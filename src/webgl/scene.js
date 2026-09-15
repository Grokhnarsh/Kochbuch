/**
 * WebGL-Bühne für den Stundenplan.
 *
 * Orthografische Draufsicht statt Perspektive: keine Fluchtpunkte, keine
 * Kippung, keine Schatten. Das Raster erscheint flach und maßstabsgetreu,
 * wie ein gedruckter Plan. Gerendert wird weiterhin über WebGL.
 */

import * as THREE from 'three';

const BG = 0xffffff;
const CAMERA_HEIGHT = 60;

/** Pan und Zoom für eine feste Draufsicht. */
class FlatControls {
  constructor(stage, canvas) {
    this.stage = stage;
    this.enabled = true;
    this.dragging = null;

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      stage.setZoom(stage.zoom * Math.exp(-e.deltaY * 0.0012));
    }, { passive: false });

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      this.dragging = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging || !this.enabled) return;
      const unit = stage.worldPerPixel();
      stage.panBy(
        -(e.clientX - this.dragging.x) * unit,
        -(e.clientY - this.dragging.y) * unit,
      );
      this.dragging.x = e.clientX;
      this.dragging.y = e.clientY;
      canvas.style.cursor = 'grabbing';
    });

    const stop = () => {
      this.dragging = null;
      canvas.style.cursor = 'default';
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('pointerleave', stop);
  }
}

export class Stage {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{width:number, height:number}} frame Ausdehnung des Plans in Welteinheiten
   */
  constructor(canvas, frame) {
    this.frame = frame;
    this.canvas = canvas;
    this.tickers = new Set();

    this.zoom = 1;
    this.pan = { x: 0, z: 0 };
    this.fitHeight = 12;
    this.centreX = 0;
    this.centreY = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(BG, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG);

    // Draufsicht: Blick entlang -Y, Weltrichtung -Z zeigt nach oben.
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(0, CAMERA_HEIGHT, 0);

    this.controls = new FlatControls(this, canvas);

    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.#tick());
  }

  /**
   * Setzt die Ausdehnung, die im Bild bleiben muss, und rahmt neu.
   * Die Ansicht wechselt zwischen Wochenraster und Tagesansicht, dabei
   * ändert sich das Seitenverhältnis des Plans grundlegend.
   */
  setFrame(frame) {
    this.frame = frame;
    this.zoom = 1;
    this.pan.x = 0;
    this.pan.z = 0;
    this.resize();
  }

  /** Welteinheiten je Bildschirmpixel beim aktuellen Zoom. */
  worldPerPixel() {
    return this.fitHeight / this.zoom / this.renderer.domElement.clientHeight;
  }

  setZoom(value) {
    this.zoom = THREE.MathUtils.clamp(value, 0.55, 4);
    this.#applyCamera();
  }

  panBy(dx, dz) {
    this.pan.x += dx;
    this.pan.z += dz;
    this.#applyCamera();
  }

  resetView() {
    this.zoom = 1;
    this.pan.x = 0;
    this.pan.z = 0;
    this.#applyCamera();
  }

  /**
   * Rahmt den Plan so, dass er vollständig in dem Bereich liegt, den
   * Bibliothek und Wochenbilanz frei lassen.
   */
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);

    // Auf dem Handy liegt die Bibliothek als Blatt unten, nicht seitlich;
    // der Plan bekommt die volle Breite und endet über dem Blattgriff.
    const phone = w < 760;
    const padLeft = phone ? 12 : 384;     // Bibliothek
    const padRight = phone ? 12 : 40;     // Wochenbilanz sitzt in der Kopfzeile
    const padTop = phone ? 150 : 74;      // Kopfzeile plus Tagesleiste
    const padBottom = phone ? 124 : 64;   // Blattgriff und Aufnahmeleiste

    const usableW = Math.max(260, w - padLeft - padRight);
    const usableH = Math.max(220, h - padTop - padBottom);

    const aspect = w / h;
    const byHeight = this.frame.height * (h / usableH);
    const byWidth = (this.frame.width * (w / usableW)) / aspect;
    this.fitHeight = Math.max(byHeight, byWidth) * 1.03;

    // Mitte des freien Bereichs in normalisierten Gerätekoordinaten
    this.centreX = ((padLeft + usableW / 2) / w) * 2 - 1;
    this.centreY = -(((padTop + usableH / 2) / h) * 2 - 1);

    this.#applyCamera();
  }

  #applyCamera() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const viewH = this.fitHeight / this.zoom;
    const viewW = viewH * (w / h);

    this.camera.top = viewH / 2;
    this.camera.bottom = -viewH / 2;
    this.camera.left = -viewW / 2;
    this.camera.right = viewW / 2;

    const x = -this.centreX * (viewW / 2) + this.pan.x;
    const z = this.centreY * (viewH / 2) + this.pan.z;

    this.camera.position.set(x, CAMERA_HEIGHT, z);
    this.camera.lookAt(x, 0, z);
    this.camera.updateProjectionMatrix();
  }

  /** Registriert eine Funktion, die je Frame läuft. */
  onTick(fn) {
    this.tickers.add(fn);
    return () => this.tickers.delete(fn);
  }

  #tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    for (const fn of this.tickers) fn(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
