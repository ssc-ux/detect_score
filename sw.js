/* Service worker : l'app fonctionne hors ligne une fois ouverte.
   La 3D (Three.js, modèle anatomique) n'est mise en cache qu'à sa première ouverture.
   Page HTML : réseau d'abord. Autres fichiers : cache d'abord, la clé étant l'URL complète
   (un nouveau ?v= force donc le réseau, sans mélange de versions après un déploiement). */
const CACHE = 'detect-v8';
const CORE = [
    './', 'index.html', 'style.css', 'htp.css', 'logic.js', 'app.js', 'fx.js', 'htp.js',
    'icon.svg', 'icon-192.png', 'nomogramme.png', 'manifest.webmanifest'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE)
        .then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' }))))
        .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    // Ne supprime que les anciens caches de cette appli (d'autres applis partagent le domaine)
    e.waitUntil(caches.keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith('detect-') && k !== CACHE).map((k) => caches.delete(k))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    const url = new URL(req.url);
    if (req.method !== 'GET' || url.origin !== location.origin) return;

    if (req.mode === 'navigate') {
        e.respondWith(fetch(req)
            .then((res) => {
                if (res.ok) {
                    const copy = res.clone();
                    e.waitUntil(caches.open(CACHE).then((c) => c.put('index.html', copy)));
                }
                return res;
            })
            .catch(() => caches.match('index.html')));
        return;
    }

    e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
            if (res.ok) c.put(req, res.clone());
            return res;
        });
        if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
        return net;
    })));
});
