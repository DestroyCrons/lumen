const REVISION = 'v5100-7a2753c4';
const CACHE_NAME = `lumen-reader-${REVISION}`;
const PRECACHE_ASSETS = [
  "./",
  "./assets/index-Bc816Kp_.js",
  "./assets/index-Czgt5j4T.css",
  "./assets/rolldown-runtime-pP25SEvz.js",
  "./assets/vendor-icons-BB2HJt6W.js",
  "./assets/vendor-react-CoE5mB34.js",
  "./icons/favicon-32.png",
  "./icons/favicon-64.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-app-180.png",
  "./index.html",
  "./manifest.webmanifest"
];

const FALLBACK_CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/favicon-64.png',
  './icons/icon-app-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

const INITIAL_PRECACHE_LIST = Array.from(
  new Set([
    ...FALLBACK_CORE_ASSETS,
    ...(Array.isArray(PRECACHE_ASSETS) ? PRECACHE_ASSETS : []),
  ]),
);

function isPhononModelAsset(pathname) {
  return pathname.includes('/models/phonon/') || pathname.startsWith('models/phonon/');
}

function isCacheableAppAsset(pathname) {
  if (isPhononModelAsset(pathname)) return false;
  return (
    pathname.includes('/assets/') ||
    pathname.includes('/samples/') ||
    pathname.includes('/icons/') ||
    pathname.includes('/phonon-runtime/') ||
    /\.(?:js|mjs|css|wasm|webmanifest|png|svg|ico|woff2?)$/i.test(pathname)
  );
}

function withCrossOriginIsolationHeaders(response) {
  if (!response) return response;
  if (response.status === 0 || response.type === 'opaque' || response.type === 'opaqueredirect') {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(INITIAL_PRECACHE_LIST))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          // Restrict cleanup strictly to old `lumen-reader-*` caches so phonon-tts model caches are NEVER deleted
          keys
            .filter((k) => k.startsWith('lumen-reader-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Let phonon-tts manage large on-demand model weights/voices under models/phonon/ directly
  if (isPhononModelAsset(url.pathname)) {
    return;
  }

  // Network-first for HTML navigations with offline fallback to precached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const isolated = withCrossOriginIsolationHeaders(res);
          if (isolated.ok) {
            const clone = isolated.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', clone));
          }
          return isolated;
        })
        .catch(() =>
          caches
            .match('./index.html')
            .then((hit) => hit || caches.match('./'))
            .then((hit) => (hit ? withCrossOriginIsolationHeaders(hit) : hit)),
        ),
    );
    return;
  }

  // Cache-first for static built assets, icons, samples, and phonon-runtime
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return withCrossOriginIsolationHeaders(cached);
      return fetch(request).then((res) => {
        const isolated = withCrossOriginIsolationHeaders(res);
        if (isolated.ok && isCacheableAppAsset(url.pathname)) {
          const clone = isolated.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return isolated;
      });
    }),
  );
});
