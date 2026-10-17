// Service worker : garde l'appli en mémoire pour jouer sans connexion.
const SHELL_CACHE = 'quizculture-shell-v2';
const SHELL = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'questions.js',
  'questions/sciences.js',
  'questions/gastronomie.js',
  'questions/litterature.js',
  'questions/histoire.js',
  'questions/geographie.js',
  'questions/arts.js',
  'questions/cinema.js',
  'questions/musique.js',
  'questions/sport.js',
  'questions/nature.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL.map(url => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Réseau d'abord (pour avoir les nouvelles questions), copie en cache si pas de réseau.
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html')))
  );
});
