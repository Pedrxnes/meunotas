/* MeuNotas — service worker: rede primeiro, cache como rede reserva (funciona offline) */
var CACHE = 'meunotas-v2';
var ARQUIVOS = [
  './', 'index.html', 'css/app.css',
  'js/util.js', 'js/parse.js', 'js/store.js', 'js/github.js', 'js/app.js',
  'icone.svg', 'manifest.webmanifest'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(ARQUIVOS).catch(function () { /* algum arquivo faltando não impede instalar */ });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (chaves) {
    return Promise.all(chaves.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // GitHub API sempre direto na rede

  ev.respondWith(
    fetch(req).then(function (resp) {
      if (resp && resp.ok) {
        var copia = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copia); });
      }
      return resp;
    }).catch(function () {
      return caches.match(req).then(function (achou) {
        return achou || caches.match('index.html');
      });
    })
  );
});
