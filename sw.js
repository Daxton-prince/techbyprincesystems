// ============================================================
//  sw.js — Service Worker for Tech_By_Prince POS
//  Caches the app shell so it works offline.
// ============================================================

const CACHE_NAME = 'tb-pos-v6';

// Files that make up the "app shell" — the minimum to boot the app offline.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './service.js',
  './db.js',
  './backup.js',
  './keys.js',
  './system.css',
  // Icons
  './icons/icon.webp',

   // Webfonts
  './webfonts/fa-brands-400.woff2',
  './webfonts/fa-regular-400.woff2',
  './webfonts/fa-solid-900.woff2',
  './webfonts/fa-v4compatibility.woff2',

   // Local libraries
  './dexie.min.js',
  './chart.min.js',
  './xlsx.full.min.js',
  './html2pdf.bundle.min.js',
  './font-awesome.min.css'
];

// ---------- INSTALL ----------
// Runs once when the service worker is first registered.
// Pre-caches the app shell so it's available offline immediately.
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(APP_SHELL).catch(err => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ---------- ACTIVATE ----------
// Runs when a new service worker takes over.
// Deletes old caches from previous versions.
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ---------- FETCH ----------
// Intercepts every network request from the page.
// Strategy: cache-first for app shell, network-first for API/data.
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  // Skip chrome-extension and other non-http schemes
  if (!req.url.startsWith('http')) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      // If cached, return it immediately (fast, works offline)
      if (cached) return cached;

      // Otherwise fetch from network
      return fetch(req).then((response) => {
        // Don't cache non-OK responses or opaque responses
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }

        // Cache a copy for next time (only same-origin or CDN)
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(req, responseClone).catch(() => { /* ignore */ });
        });

        return response;
      }).catch((err) => {
        // Network failed AND nothing in cache.
        // For navigation requests, fall back to cached index.html
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        console.warn('[SW] Fetch failed:', req.url, err);
        throw err;
      });
    })
  );
});

// ---------- MESSAGE ----------
// Allows the page to tell the SW to skip waiting (e.g. on update).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] Service Worker script loaded');
