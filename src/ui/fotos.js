/**
 * Fotos zu eigenen Rezepten. Sie liegen in IndexedDB dieses Browsers —
 * fuer den localStorage sind Bilder zu gross —, verkleinert auf hoechstens
 * 1200 Pixel Kantenlaenge als JPEG. Nichts verlaesst das Geraet, ausser
 * man nimmt sie bewusst in eine Sicherung mit.
 */

const DB = 'kochbuch';
const LAGER = 'fotos';
const KANTE = 1200;

function oeffnen() {
  return new Promise((ok, fehler) => {
    if (!('indexedDB' in window)) { fehler(new Error('Kein IndexedDB')); return; }
    const anfrage = indexedDB.open(DB, 1);
    anfrage.onupgradeneeded = () => anfrage.result.createObjectStore(LAGER);
    anfrage.onsuccess = () => ok(anfrage.result);
    anfrage.onerror = () => fehler(anfrage.error);
  });
}

async function mitLager(modus, fn) {
  const db = await oeffnen();
  return new Promise((ok, fehler) => {
    const tx = db.transaction(LAGER, modus);
    const ergebnis = fn(tx.objectStore(LAGER));
    tx.oncomplete = () => { db.close(); ok(ergebnis?.result ?? ergebnis); };
    tx.onerror = () => { db.close(); fehler(tx.error); };
  });
}

/** Verkleinert ein Bild aus einer Datei zu einer JPEG-data:-Adresse. */
export async function verkleinern(datei) {
  if (!/^image\//.test(datei?.type || '')) throw new Error('Das ist kein Bild.');
  const bild = await createImageBitmap(datei);
  const massstab = Math.min(1, KANTE / Math.max(bild.width, bild.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bild.width * massstab);
  canvas.height = Math.round(bild.height * massstab);
  canvas.getContext('2d').drawImage(bild, 0, 0, canvas.width, canvas.height);
  bild.close?.();
  return canvas.toDataURL('image/jpeg', 0.82);
}

export async function fotoSpeichern(id, dataUrl) {
  await mitLager('readwrite', (s) => s.put(dataUrl, id));
}

export async function fotoLaden(id) {
  try {
    return (await mitLager('readonly', (s) => s.get(id))) || null;
  } catch {
    return null;
  }
}

export async function fotoLoeschen(id) {
  try { await mitLager('readwrite', (s) => s.delete(id)); } catch { /* nichts zu loeschen */ }
}

/** Alle Fotos als {id: dataUrl}, fuer die Sicherung */
export async function alleFotos() {
  try {
    const db = await oeffnen();
    return await new Promise((ok, fehler) => {
      const out = {};
      const tx = db.transaction(LAGER, 'readonly');
      const cursor = tx.objectStore(LAGER).openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return;
        out[c.key] = c.value;
        c.continue();
      };
      tx.oncomplete = () => { db.close(); ok(out); };
      tx.onerror = () => { db.close(); fehler(tx.error); };
    });
  } catch {
    return {};
  }
}
