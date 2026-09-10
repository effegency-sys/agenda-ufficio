// Service worker minimo: serve solo a rendere l'app installabile come PWA
// (Chrome lo richiede). Non mette in cache nulla di proposito — i dati del
// calendario devono sempre arrivare freschi dalla rete.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Nessuna cache: lascia passare ogni richiesta direttamente alla rete.
});
