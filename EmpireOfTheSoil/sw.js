// Offline support: caches the whole game so it runs without a connection
// (used when the game is hosted on a website and added to the Home Screen).
const CACHE = 'empire-of-the-soil-v6';
const FILES = ["./", "index.html", "manifest.webmanifest", "build/icon.png", "build/icon-180.png", "build/icon-192.png", "build/icon-512.png", "build/icon-maskable-512.png", "js/audio.js", "js/data.js", "js/main.js", "js/noise.js", "js/scene_battle.js", "js/scene_colony.js", "js/scene_map.js", "js/scene_menu.js", "js/scene_screens.js", "js/sprites.js", "js/terrain.js", "js/ui.js", "js/world.js", "js/gl/battle3d.js", "js/gl/colony3d.js", "js/gl/engine.js", "js/gl/math3d.js", "js/gl/models.js", "js/gl/scenes3d.js", "js/gl/world3d.js"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// network first (so updates arrive), falling back to the cache when offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
