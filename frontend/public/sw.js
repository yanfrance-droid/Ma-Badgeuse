// Service worker de Ma Badgeuse.
// Il ne met RIEN en cache : les pages et les données viennent toujours du serveur,
// il n'y a donc jamais de version périmée à purger après une mise à jour.
// Rôles : rendre l'application installable, afficher un message clair hors connexion,
// afficher les notifications de rappel sur Android et ouvrir l'application au clic.

const OFFLINE_HTML = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ma Badgeuse — hors connexion</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0D2B52;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px}
button{margin-top:16px;padding:12px 20px;border:0;border-radius:12px;background:#2563eb;color:#fff;font-size:16px;font-weight:700}</style></head>
<body><div><h1 style="font-size:20px">Serveur injoignable</h1>
<p>Vérifiez que le téléphone est connecté au réseau de la maison, puis réessayez.</p>
<button onclick="location.reload()">Réessayer</button></div></body></html>`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) {
          return client.navigate(url).then((c) => (c || client).focus());
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
