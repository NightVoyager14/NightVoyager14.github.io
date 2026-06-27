/* 四川高考倒计时 · Service Worker v1 */

const CACHE = 'gaokao-cache-v1';

const ASSETS = [
  './gaokao_schedule.html',
  './manifest.json',
];

// 安装时缓存核心文件
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 激活时清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 网络优先，缓存作为后备
self.addEventListener('fetch', (event) => {
  // 只缓存同源请求
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // HTML 和 manifest：网络优先（保证内容最新）
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 其他资源：缓存优先
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
