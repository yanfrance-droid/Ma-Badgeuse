// Custom Service Worker script for Ma Badgeuse notifications
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.action === 'quick-badge' ? '/?quick_badge=auto' : '/?quick_badge=today';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
