/**
 * Service Worker: die App laeuft auch ohne Netz, in der Kueche wie im Laden.
 *
 * - Die Startseite kommt aus dem Netz, wenn es eins gibt (dann ist sie
 *   aktuell), sonst aus dem Speicher.
 * - Gebuendelte Dateien unter assets/ tragen ihren Inhalt im Namen und
 *   aendern sich nie: einmal geholt, immer aus dem Speicher.
 * - Die Rezeptsammlungen unter korpus/ kommen sofort aus dem Speicher und
 *   werden im Hintergrund erneuert.
 *
 * Fremde Adressen (Wikis, Live-Quellen, REWE) gehen unberuehrt ins Netz.
 */

const VERSION = 'kochbuch-v1';
const START = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(START)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== VERSION) await caches.delete(name);
    await self.clients.claim();
  })());
});

async function ausNetz(request) {
  const cache = await caches.open(VERSION);
  try {
    const antwort = await fetch(request);
    if (antwort.ok) cache.put(request, antwort.clone());
    return antwort;
  } catch (fehler) {
    const gespeichert = await cache.match(request) || (request.mode === 'navigate' && await cache.match('./index.html'));
    if (gespeichert) return gespeichert;
    throw fehler;
  }
}

async function ausSpeicher(request) {
  const cache = await caches.open(VERSION);
  const gespeichert = await cache.match(request);
  if (gespeichert) return gespeichert;
  const antwort = await fetch(request);
  if (antwort.ok) cache.put(request, antwort.clone());
  return antwort;
}

async function sofortUndErneuern(request, event) {
  const cache = await caches.open(VERSION);
  const gespeichert = await cache.match(request);
  const neu = fetch(request).then((antwort) => {
    if (antwort.ok) cache.put(request, antwort.clone());
    return antwort;
  });
  if (gespeichert) {
    event.waitUntil(neu.catch(() => {}));
    return gespeichert;
  }
  return neu;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') event.respondWith(ausNetz(request));
  else if (url.pathname.includes('/assets/')) event.respondWith(ausSpeicher(request));
  else if (url.pathname.includes('/korpus/')) event.respondWith(sofortUndErneuern(request, event));
  else event.respondWith(ausNetz(request));
});
