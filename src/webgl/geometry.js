/**
 * Geometrie-Helfer: abgerundete Rechtecke als flache und extrudierte
 * Meshes, mit UVs, die sauber ueber die Bounding-Box laufen.
 */

import * as THREE from 'three';

/** Abgerundetes Rechteck als THREE.Shape, zentriert im Ursprung. */
export function roundedRectShape(width, height, radius) {
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);
  const s = new THREE.Shape();

  s.moveTo(-w + r, -h);
  s.lineTo(w - r, -h);
  s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r);
  s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h);
  s.quadraticCurveTo(-w, h, -w, h - r);
  s.lineTo(-w, -h + r);
  s.quadraticCurveTo(-w, -h, -w + r, -h);

  return s;
}

/**
 * Rechnet UVs so um, dass die Textur genau einmal ueber die
 * Bounding-Box der Geometrie gespannt wird.
 */
function remapUV(geometry, width, height) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i += 1) {
    uv.setXY(i, pos.getX(i) / width + 0.5, pos.getY(i) / height + 0.5);
  }
  uv.needsUpdate = true;
}

/** Flaches abgerundetes Rechteck, liegt in der XY-Ebene. */
export function roundedPlane(width, height, radius, curveSegments = 8) {
  const geo = new THREE.ShapeGeometry(roundedRectShape(width, height, radius), curveSegments);
  remapUV(geo, width, height);
  return geo;
}

/** Abgerundete Karte mit echter Dicke, damit sie Schatten wirft. */
export function roundedCard(width, height, radius, depth = 0.05) {
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(width, height, radius), {
    depth,
    bevelEnabled: false,
    curveSegments: 8,
  });
  geo.translate(0, 0, -depth / 2);
  remapUV(geo, width, height);
  return geo;
}
