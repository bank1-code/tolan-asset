/**
 * Tolan PWA Service Worker
 * يوفر: تخزين مؤقت ذكي، دعم offline، تحديث تلقائي
 */

const CACHE_NAME = 'tolan-v1';
const OFFLINE_URL = '/offline.html';

// الملفات الأساسية للتخزين المؤقت
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
];

// ===== تثبيت Service Worker =====
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {
        // تجاهل أخطاء التخزين المؤقت الأولية
      });
    })
  );
  self.skipWaiting();
});

// ===== تفعيل Service Worker =====
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// ===== استراتيجية الـ Fetch =====
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // تجاهل طلبات API والـ OAuth
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/oauth/') ||
    request.method !== 'GET'
  ) {
    return;
  }

  // للموارد الثابتة: Cache First
  if (
    url.pathname.match(/\.(js|css|svg|png|jpg|jpeg|webp|woff2|woff|ttf)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // للصفحات: Network First مع Fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          return cached || caches.match('/');
        });
      })
  );
});

// ===== إشعارات Push (مستقبلياً) =====
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'Tolan', {
    body: data.body || '',
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    dir: 'rtl',
    lang: 'ar',
  });
});
