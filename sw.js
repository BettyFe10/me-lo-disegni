// SPDX-License-Identifier: AGPL-3.0-only
// Me lo disegni? - Copyright (C) 2026 Gli autori di Me lo disegni?
/* Me lo disegni? - service worker: funziona anche offline e riceve le immagini dal menu Condividi */
const CACHE = 'matita-v3';
const SHELL = ['./', './index.html', './lineart.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// stessa struttura del database usato dalla pagina
function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('matita', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of ['immagini', 'persone', 'inbox']) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function receiveShare(request) {
  try {
    const form = await request.formData();
    const files = form.getAll('immagine').filter(f => f && f.size && /^image\//.test(f.type || 'image/'));
    if (files.length) {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const t = db.transaction('inbox', 'readwrite');
        const st = t.objectStore('inbox');
        for (const f of files) {
          // si salva come Blob semplice: alcuni Android non conservano gli oggetti File
          st.add({ file: new Blob([f], { type: f.type || 'image/jpeg' }), nome: f.name || '', arrivato: Date.now() });
        }
        t.oncomplete = resolve;
        t.onerror = () => reject(t.error);
      });
    }
  } catch (err) {
    // se qualcosa va storto si apre comunque l'app
  }
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(c => c.postMessage('inbox'));
  return Response.redirect('./?condiviso=1', 303);
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (e.request.method === 'POST' && url.pathname.endsWith('/condividi')) {
    e.respondWith(receiveShare(e.request));
    return;
  }
  if (e.request.method !== 'GET') return;

  // font di Google: dalla cache se c'è, poi aggiornati
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(CACHE).then(async c => {
        const hit = await c.match(e.request);
        const net = fetch(e.request).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(e.request, r.clone()); return r; }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // pagine dell'app: prima la rete (cosi' gli aggiornamenti arrivano), poi la cache se si è offline
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return r;
      })
      .catch(async () => (await caches.match(e.request, { ignoreSearch: true })) || caches.match('./index.html'))
  );
});
