/* Service worker SRH Ops — stratégie réseau d'abord + repli cache hors-ligne. */
const CACHE = "srh-ops-v5";
const CORE = [
  "/manifest.webmanifest",
  "/offline",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("srh-ops-") && key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function cacheResponse(event, request, response) {
  if (!response.ok || response.type !== "basic") return;
  const copy = response.clone();
  const write = caches.open(CACHE).then((cache) => cache.put(request, copy));
  event.waitUntil(write.catch((error) => console.warn("[PWA] Mise en cache impossible:", error)));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || !url.protocol.startsWith("http")) return;

  // 1. Ne pas intercepter les requêtes API (les mutations passent par l'outbox).
  if (url.pathname.startsWith("/api/")) return;

  // 2. Requêtes RSC (React Server Components) : TOUJOURS réseau d'abord, jamais cache-first.
  const isRsc =
    url.searchParams.has("_rsc") ||
    request.headers.get("rsc") === "1" ||
    request.headers.get("accept")?.includes("text/x-component");

  if (isRsc) {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((hit) => hit || new Response("", { status: 503 }))
      )
    );
    return;
  }

  // 3. Navigations : réseau d'abord, enregistre la page spécifique demandée, repli cache si hors-ligne.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (
            !res.redirected &&
            (url.pathname === "/terrain" || url.pathname === "/offline")
          ) {
            cacheResponse(event, request, res);
          }
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(`${url.origin}${url.pathname}${url.search}`);
          if (hit) return hit;
          const offlineHit = await caches.match("/offline");
          if (offlineHit) return offlineHit;
          return new Response(
            "<!DOCTYPE html><html lang='fr'><head><meta charset='utf-8'><title>Hors-ligne - SRH Ops</title><meta name='viewport' content='width=device-width, initial-scale=1.0'></head><body style='font-family:sans-serif;text-align:center;padding:40px;background:#f8fafc;'><h2 style='color:#071e27;'>Mode hors-ligne</h2><p style='color:#475569;'>Vous n'êtes pas connecté à Internet. Vos actions terrain enregistrées seront synchronisées dès le retour du réseau.</p><p><a href='/terrain' style='display:inline-block;margin-top:16px;padding:10px 20px;background:#0d631b;color:#fff;text-decoration:none;border-radius:10px;font-weight:bold;'>Accéder à la Console Terrain</a></p></body></html>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        })
    );
    return;
  }

  // 4. Assets Next.js hachés et icônes : Cache d'abord
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit) return hit;
        return fetch(request).then((res) => {
          if (url.origin === self.location.origin) {
            cacheResponse(event, request, res);
          }
          return res;
        });
      })
    );
    return;
  }

  // 5. Autres requêtes GET : Réseau d'abord avec repli cache
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (url.origin === self.location.origin) {
          cacheResponse(event, request, res);
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
