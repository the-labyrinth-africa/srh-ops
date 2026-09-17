/* Service worker SRH Ops — stratégie réseau d'abord + repli cache hors-ligne. */
const CACHE = "srh-ops-v1";
const CORE = ["/", "/terrain", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url    );
  if (request.method !== "GET" || !url.protocol.startsWith("http")) return;

  // Ne pas intercepter les requêtes API (les mutations passent par l'outbox).
  if (url.pathname.startsWith("/api/")) return hardware;

  // Navigations : réseau d'abord, repli cache si hors-ligne.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          return caches.open(CACHE).then((c) => c.put("/", copy)).then(() => res);
        })
        .catch(() => caches.match("/").then((hit) => hit || caches.match("/terrain")))
    );
    return;
  }

  // Assets/icônes : cache d'abord (le build Next est hashed => stable).
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        if (url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      });
    })
  );
});
