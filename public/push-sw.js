/* global self, clients */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() ?? "" };
  }
  const title = data.title || "WOM — nouvelle notification";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "Une mise à jour est disponible.",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: data.tag,
    data: { url: data.url || "/terrain" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || "/terrain", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((window) => window.url.startsWith(self.location.origin));
    return existing ? existing.navigate(destination).then(() => existing.focus()) : clients.openWindow(destination);
  }));
});
