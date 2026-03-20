
const CACHE_NAME = 'livematch-v1';
const ICON_URL = 'https://cdn-icons-png.flaticon.com/512/53/53283.png';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// NOTA: O listener de 'fetch' foi removido para evitar o erro "Failed to fetch" 
// causado por interceptação incorreta de requisições de API em ambientes cross-origin.
// O navegador cuidará das requisições de rede nativamente.

// 1️⃣ Handler para Push Notifications (Backend -> App)
self.addEventListener('push', (event) => {
  let data = {};
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'LiveMatch Alert ⚽';
  const options = {
    body: data.body || 'Evento detectado no radar!',
    icon: ICON_URL,
    badge: ICON_URL,
    vibrate: [200, 100, 200, 100, 200],
    tag: 'live-match-alert',
    renotify: true,
    requireInteraction: true,
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// 2️⃣ Handler para Clique na Notificação (Abre o App)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Tenta abrir a URL raiz ou a URL enviada no payload
  const urlToOpen = new URL(event.notification.data?.url || '/', self.location.origin).href;

  const promiseChain = self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  }).then((windowClients) => {
    // Se já existe uma janela aberta do app, foca nela
    for (let i = 0; i < windowClients.length; i++) {
      const client = windowClients[i];
      if (client.url === urlToOpen && 'focus' in client) {
        return client.focus();
      }
    }
    // Se não, abre uma nova
    if (self.clients.openWindow) {
      return self.clients.openWindow(urlToOpen);
    }
  });

  event.waitUntil(promiseChain);
});
