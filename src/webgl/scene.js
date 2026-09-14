/**
 * WebGL-Buehne: Renderer, Kamera, Licht, Untergrund und Renderschleife.
 * Die Kamera rahmt das Board so, dass die Bibliothek links nichts verdeckt.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const BG = 0xf6f7f9;

/** Weicher radialer Verlauf als Tischflaeche. */
function groundTexture() {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');

  const g = ctx.createRadialGradient(size / 2, size * 0.42, size * 0.05, size / 2, size / 2, size * 0.62);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.55, '#f7f8fa');
  g.addColorStop(1, '#e9ecf1');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Stage {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{boardWidth:number, boardDepth:number}} frame Groesse, die sichtbar bleiben muss
   */
  constructor(canvas, frame) {
    this.frame = frame;
    this.canvas = canvas;
    this.tickers = new Set();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(BG, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(BG, 34, 62);

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    this.camera.position.set(0, 13, 13);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.42;
    this.controls.zoomSpeed = 0.7;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = 1.12;
    this.controls.minAzimuthAngle = -0.52;
    this.controls.maxAzimuthAngle = 0.52;

    this.#addLights();
    this.#addGround();

    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.#tick());
  }

  #addLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd9dee7, 1.25));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.42));

    const key = new THREE.DirectionalLight(0xffffff, 1.45);
    key.position.set(7, 16, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 4;
    key.shadow.bias = -0.0012;
    key.shadow.normalBias = 0.02;

    const s = key.shadow.camera;
    s.left = -16;
    s.right = 16;
    s.top = 14;
    s.bottom = -14;
    s.near = 1;
    s.far = 44;
    s.updateProjectionMatrix();
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xfff4ec, 0.34);
    fill.position.set(-9, 7, -6);
    this.scene.add(fill);
  }

  #addGround() {
    const geo = new THREE.PlaneGeometry(90, 90);
    const mat = new THREE.MeshStandardMaterial({
      map: groundTexture(),
      roughness: 0.98,
      metalness: 0,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.04;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  /** Wie viele Weltmeter ein Bildschirmpixel auf Boardhoehe abdeckt. */
  #worldPerPixel() {
    const dist = this.camera.position.distanceTo(this.controls.target);
    const h = 2 * dist * Math.tan((this.camera.fov * Math.PI) / 360);
    return h / this.renderer.domElement.clientHeight;
  }

  /** Die acht Eckpunkte des Bereichs, der sichtbar bleiben muss. */
  #frameCorners() {
    const x = this.frame.boardWidth / 2;
    const z = this.frame.boardDepth / 2;
    const y = 0.7;
    const out = [];
    for (const sx of [-x, x]) {
      for (const sz of [-z, z]) {
        out.push(new THREE.Vector3(sx, 0, sz), new THREE.Vector3(sx, y, sz));
      }
    }
    return out;
  }

  /**
   * Setzt Kameradistanz und Blickziel so, dass das Board vollstaendig in
   * dem Bereich liegt, den Bibliothek und Wochenbilanz frei lassen.
   * Die Passung wird iterativ ermittelt, damit sie unabhaengig von
   * Blickwinkel und Seitenverhaeltnis stimmt.
   */
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    const compact = w < 900;
    const padLeft = compact ? 16 : 386;   // Bibliothek
    const padRight = compact ? 16 : 48;   // Wochenbilanz sitzt nur oben rechts
    const padTop = 78;                    // Kopfzeile
    const padBottom = compact ? 24 : 72;  // Hinweiszeile

    const usableW = Math.max(280, w - padLeft - padRight);
    const usableH = Math.max(240, h - padTop - padBottom);

    // Mittelpunkt des freien Bereichs, in normalisierten Gerätekoordinaten
    const centreX = ((padLeft + usableW / 2) / w) * 2 - 1;
    const centreY = -(((padTop + usableH / 2) / h) * 2 - 1);

    const limitX = (usableW / w) * 0.97;
    const limitY = (usableH / h) * 0.97;

    const corners = this.#frameCorners();
    const dir = new THREE.Vector3(0, 0.86, 0.51).normalize();
    let dist = 20;

    for (let i = 0; i < 8; i += 1) {
      const wpp = (2 * dist * Math.tan((this.camera.fov * Math.PI) / 360)) / h;
      const shiftX = (centreX * w) / 2 * wpp;

      this.controls.target.set(-shiftX, 0, 0);
      this.camera.position.copy(dir).multiplyScalar(dist).add(this.controls.target);
      this.camera.lookAt(this.controls.target);
      this.camera.updateMatrixWorld(true);

      let maxX = 0;
      let maxY = 0;
      for (const corner of corners) {
        const p = corner.clone().project(this.camera);
        maxX = Math.max(maxX, Math.abs(p.x - centreX));
        maxY = Math.max(maxY, Math.abs(p.y - centreY));
      }

      const scale = Math.max(maxX / limitX, maxY / limitY);
      if (Math.abs(scale - 1) < 0.005) break;
      dist = THREE.MathUtils.clamp(dist * scale, 9, 60);
    }

    this.controls.minDistance = dist * 0.55;
    this.controls.maxDistance = dist * 1.8;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  /** Registriert eine Funktion, die je Frame laeuft. */
  onTick(fn) {
    this.tickers.add(fn);
    return () => this.tickers.delete(fn);
  }

  #tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    for (const fn of this.tickers) fn(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
