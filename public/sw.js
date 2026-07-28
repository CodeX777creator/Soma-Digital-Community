/**
 * Service Worker for Soma Digital Community
 * Provides offline support and caching strategies
 */

// Update this version string when deploying breaking changes
const APP_VERSION = '1.1.4';

// Cache name includes version to force fresh cache on updates
const CACHE_NAME = 'soma-cache-' + APP_VERSION;
const STATIC_ASSETS = [
  '/manifest.json',
  '/offline.html',
  '/icon-72x72.png',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  // Stay waiting until the user confirms an update.
  event.waitUntil(precacheStaticAssets());
});

async function precacheStaticAssets() {
  const cache = await caches.open(CACHE_NAME);

  await Promise.all(
    STATIC_ASSETS.map(async (asset) => {
      try {
        const response = await fetch(asset, { cache: 'no-cache' });
        if (response.ok) {
          await cache.put(asset, response);
        }
      } catch (error) {
        // One unavailable asset must not prevent the worker from installing.
        console.warn('Precache skipped:', asset);
      }
    })
  );
}

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'VERSION_CHECK') {
    // Send current version to client
    event.ports[0]?.postMessage({ version: APP_VERSION });
  }
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    // Skip waiting and activate the new service worker immediately
    self.skipWaiting();
  }
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip API requests
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Skip Firebase and other external requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never cache documents or personalized Next.js payloads.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (
    request.destination === 'document' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/data/') ||
    url.searchParams.has('_rsc') ||
    url.searchParams.has('__nextDefaultLocale')
  ) {
    return;
  }

  // Cache only static, publicly shareable assets.
  if (isStaticAsset(request) || url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
  }
});

function isStaticAsset(request) {
  return request.destination === 'image' ||
         request.destination === 'style' ||
         request.destination === 'script' ||
         request.destination === 'font';
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const offlinePage = await cache.match('/offline.html');
    if (offlinePage) {
      return offlinePage;
    }
    throw error;
  }
}

// Cache-first strategy
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  
  if (cached) {
    // Return cached and fetch update in background
    fetch(request).then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
    }).catch(() => {
      // Network failed, cached version is already returned
    });
    return cached;
  }

  // Not in cache, fetch and cache
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Return offline fallback for images
    if (request.destination === 'image') {
      return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    }
    throw error;
  }
}

// Background sync for offline operations
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-posts') {
    event.waitUntil(syncPendingPosts());
  }
});

async function syncPendingPosts() {
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_POSTS' });
  });
}

// Push notification support
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/icon-192x192.png',
      badge: '/icon-72x72.png',
      data: data.data,
      actions: data.actions || [],
      requireInteraction: false,
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  } catch (error) {
    // Invalid push data, ignore
  }
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const notificationData = event.notification.data;
  const urlToOpen = getSafeNotificationUrl(notificationData?.url);

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

function getSafeNotificationUrl(rawUrl) {
  try {
    const parsed = new URL(typeof rawUrl === 'string' ? rawUrl : '/', self.location.origin);
    if (parsed.origin !== self.location.origin || !parsed.pathname.startsWith('/')) {
      return '/';
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (error) {
    return '/';
  }
}
