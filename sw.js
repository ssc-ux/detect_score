/* Service worker : l'app fonctionne hors ligne une fois ouverte.
   Page HTML : réseau d'abord ; autres fichiers : cache d'abord, mis à jour en arrière-plan. */
const CACHE = 'detect-v3';
const CORE = [
    './', 'index.html', 'style.css', 'htp.css', 'logic.js', 'app.js', 'fx.js', 'htp.js', 'htp3d.js',
    'vendor/three.module.min.js', 'vendor/OrbitControls.js',
    'icon.svg', 'icon-192.png', 'nomogramme.png', 'manifest.webmanifest'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys()
        .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    const url = new URL(req.url);
    if (req.method !== 'GET' || url.origin !== location.origin) return;
    const key = url.origin + url.pathname;            // ignore ?v=…

    if (req.mode === 'navigate') {
        e.respondWith(fetch(req)
            .then((res) => { caches.open(CACHE).then((c) => c.put('index.html', res.clone())); return res; })
            .catch(() => caches.match('index.html')));
        return;
    }

    e.respondWith(caches.open(CACHE).then((c) => c.match(key).then((hit) => {
        const net = fetch(req).then((res) => {
            if (res.ok) c.put(key, res.clone());
            return res;
        });
        if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
        return net;
    })));
});
