/* ============================================================
   四川高考倒计时 · Service Worker v2

   相比 v1 的改动：
   1. 缓存名带版本号，且与页面版本绑定 —— 原实现固定 'gaokao-cache-v1'
      且对 .js 采用「缓存优先」，导致更新代码后用户可能长期拿到旧脚本。
   2. HTML / JS / JSON 一律「网络优先」：改完即生效，离线时回退缓存。
   3. 导航请求失败时回退到缓存中的 index.html（离线可用）。
   ============================================================ */

const CACHE_PREFIX = 'gaokao-cache-';
const ASSETS = ['./', './index.html', './style.css', './time.js', './lunar.js',
                './gaokao.js', './manifest.json', './data/holidays.json',
                './data/solar-terms.json'];

/** 取当前 SW 的版本（sw.js 自身 URL 上的查询串，由 index.html 注册时带上） */
function currentVersion() {
    try {
        const v = new URL(self.location.href).searchParams.get('v');
        if (v) return v;
    } catch (_) {}
    return 'dev';
}

const CACHE = CACHE_PREFIX + currentVersion();

// 安装：预缓存核心文件，并立即接管
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
            .catch((err) => {
                console.warn('[sw] 预缓存失败:', err);
                return self.skipWaiting();
            })
    );
});

// 激活：清掉所有旧版本缓存
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

/** 网络优先：成功则顺手更新缓存，失败回退缓存 */
function networkFirst(request, fallbackUrl) {
    return fetch(request)
        .then((response) => {
            if (response && response.ok && response.type === 'basic') {
                const copy = response.clone();
                caches.open(CACHE)
                    .then((cache) => cache.put(request, copy))
                    .catch(() => {});
            }
            return response;
        })
        .catch(() =>
            caches.match(request).then((hit) => {
                if (hit) return hit;
                if (fallbackUrl) return caches.match(fallbackUrl);
                return Response.error();
            })
        );
}

/** 缓存优先：静态资源 */
function cacheFirst(request) {
    return caches.match(request).then((hit) => {
        if (hit) return hit;
        return fetch(request).then((response) => {
            if (response && response.ok && response.type === 'basic') {
                const copy = response.clone();
                caches.open(CACHE)
                    .then((cache) => cache.put(request, copy))
                    .catch(() => {});
            }
            return response;
        });
    });
}

self.addEventListener('fetch', (event) => {
    const request = event.request;

    // 只处理同源 GET
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // 页面导航：网络优先，离线回退到缓存的 index.html
    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request, './index.html'));
        return;
    }

    // HTML / JS / JSON：网络优先，保证改动能立刻生效
    if (/\.(?:html|js|json)$/.test(url.pathname)) {
        event.respondWith(networkFirst(request));
        return;
    }

    // 其余静态资源（图标等）：缓存优先
    event.respondWith(cacheFirst(request));
});
