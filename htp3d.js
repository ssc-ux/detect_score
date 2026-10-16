/* Vue 3D stylisée du cœur et de la circulation pulmonaire (chargée à la demande).
   Repère patient : x = gauche du patient, y = haut, z = avant. */
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';

const VIEWS = {
    face: V(0, 0.6, 9),
    gauche: V(9, 0.6, 0.4),
    dos: V(0, 0.6, -9),
    oblique: V(6, 3.2, 6)
};

// Géométrie de repos
const CH = {
    ra: { c: V(-1.0, 0.15, 0.15), s: V(0.55, 0.6, 0.55), col: 'v' },
    rv: { c: V(-0.15, -0.55, 0.55), s: V(0.9, 0.75, 0.5), col: 'v' },
    la: { c: V(0.35, 0.45, -0.75), s: V(0.6, 0.42, 0.5), col: 'a' },
    lv: { c: V(0.65, -0.55, -0.15), s: V(0.72, 1.0, 0.72), col: 'a', rz: 0.45 }
};
const BIF = V(0.3, 1.15, 0.15);
const PA_PTS = {
    trunk: [V(0.05, -0.1, 0.75), V(0.2, 0.6, 0.55), BIF],
    right: [BIF, V(-0.6, 1.25, -0.05), V(-1.55, 1.05, -0.25)],
    left: [BIF, V(1.0, 1.35, -0.05), V(1.6, 1.15, -0.3)]
};
const LABELS = [
    ['OD', V(-1.25, 0.3, 0.55)], ['VD', V(-0.2, -0.6, 1.0)], ['OG', V(0.95, 0.65, -1.1)],
    ['VG', V(1.0, -0.9, 0.3)], ['AP', V(-0.25, 0.55, 0.95)], ['Aorte', V(0.1, 1.95, -0.2)],
    ['Poumon D', V(-2.6, 2.1, 0.2)], ['Poumon G', V(2.6, 2.0, 0.2)]
];

export function mount(root) {
    const wrap = root.querySelector('.htp3d-canvas');
    const labelLayer = root.querySelector('.htp3d-labels');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    wrap.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.copy(VIEWS.face);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 4.5;
    controls.maxDistance = 16;
    controls.target.set(0, 0.3, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8888aa, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 5, 6);
    scene.add(sun);

    // Matériaux (couleurs reprises du thème)
    const mat = {
        v: new THREE.MeshStandardMaterial({ roughness: 0.55, transparent: true }),
        a: new THREE.MeshStandardMaterial({ roughness: 0.55, transparent: true }),
        vVessel: new THREE.MeshStandardMaterial({ roughness: 0.45, transparent: true }),
        aVessel: new THREE.MeshStandardMaterial({ roughness: 0.45 }),
        distal: new THREE.MeshStandardMaterial({ roughness: 0.45 }),
        lung: new THREE.MeshStandardMaterial({ roughness: 0.9, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
        clot: new THREE.MeshStandardMaterial({ color: 0x5a1f1a, roughness: 0.8 }),
        alert: new THREE.MeshStandardMaterial({ roughness: 0.4, transparent: true, opacity: 0.85 })
    };

    const groups = { heart: new THREE.Group(), lungs: new THREE.Group(), vessels: new THREE.Group(), ov: new THREE.Group() };
    Object.values(groups).forEach((g) => scene.add(g));

    // Cavités
    const sphere = new THREE.SphereGeometry(1, 40, 28);
    const chambers = {};
    for (const [k, d] of Object.entries(CH)) {
        const m = new THREE.Mesh(sphere, d.col === 'v' ? mat.v : mat.a);
        m.position.copy(d.c);
        m.scale.copy(d.s);
        if (d.rz) m.rotation.z = d.rz;
        m.renderOrder = 2;
        groups.heart.add(m);
        chambers[k] = m;
    }

    // Poumons
    const lungs = [
        [V(-2.35, 0.5, -0.35), V(1.15, 2.0, 1.15)],
        [V(2.35, 0.45, -0.35), V(1.0, 1.9, 1.05)]
    ].map(([c, s]) => {
        const m = new THREE.Mesh(sphere, mat.lung);
        m.position.copy(c);
        m.scale.copy(s);
        m.renderOrder = 3;
        groups.lungs.add(m);
        return m;
    });

    // Vaisseaux fixes
    const tube = (pts, r, material, parent = groups.vessels) => {
        const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, r, 14), material);
        parent.add(m);
        return m;
    };
    tube([V(0.45, 0.05, -0.1), V(0.2, 0.9, 0.0), V(0.1, 1.7, -0.2), V(0.5, 1.95, -0.6), V(0.8, 1.4, -1.0), V(0.85, 0, -1.05), V(0.85, -2.2, -1.0)], 0.17, mat.aVessel);
    tube([V(-1.0, 2.2, 0), V(-1.0, 0.6, 0.1)], 0.13, mat.vVessel);
    tube([V(-1.0, -2.2, -0.2), V(-1.0, -0.35, 0.1)], 0.14, mat.vVessel);
    tube([V(-1.6, 0.2, -0.6), V(-0.6, 0.35, -0.8), V(0.05, 0.42, -0.8)], 0.09, mat.aVessel);
    tube([V(-1.5, -0.3, -0.5), V(-0.6, 0.15, -0.8), V(0.05, 0.38, -0.78)], 0.08, mat.aVessel);
    tube([V(1.6, 0.25, -0.6), V(1.0, 0.4, -0.85), V(0.6, 0.45, -0.8)], 0.09, mat.aVessel);
    tube([V(1.5, -0.25, -0.5), V(1.0, 0.2, -0.85), V(0.62, 0.4, -0.78)], 0.08, mat.aVessel);

    // Artère pulmonaire (rayon variable)
    let paMeshes = [];
    let paRadius = 0;
    function buildPA(r) {
        if (Math.abs(r - paRadius) < 0.004) return;
        paRadius = r;
        paMeshes.forEach((m) => { groups.vessels.remove(m); m.geometry.dispose(); });
        paMeshes = [tube(PA_PTS.trunk, r, mat.vVessel), tube(PA_PTS.right, r * 0.72, mat.vVessel), tube(PA_PTS.left, r * 0.72, mat.vVessel)];
    }

    // Arbre artériel intrapulmonaire
    const branches = [];
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
    const up = V(0, 1, 0);
    function grow(start, dir, len, r, depth, side) {
        const end = start.clone().addScaledVector(dir, len);
        const m = new THREE.Mesh(cyl, depth >= 2 ? mat.distal : mat.vVessel);
        m.position.copy(start).lerp(end, 0.5);
        m.quaternion.setFromUnitVectors(up, dir);
        m.userData = { r, len, depth };
        groups.vessels.add(m);
        branches.push(m);
        if (depth === 4) return;
        const axis = depth % 2 === 0 ? V(0, 0, 1) : dir.clone().cross(V(0, 1, 0)).normalize().cross(dir).normalize();
        if (axis.lengthSq() < 0.01) axis.set(1, 0, 0);
        [-1, 1].forEach((sgn) => {
            const a = (depth === 0 ? 0.95 : 0.55) * sgn;
            const d = dir.clone().applyAxisAngle(axis, a).normalize();
            grow(end, d, len * 0.74, r * 0.7, depth + 1, side);
        });
    }
    grow(PA_PTS.right[2], V(-1, 0, 0), 0.6, 0.085, 0, -1);
    grow(PA_PTS.left[2], V(1, 0, 0), 0.6, 0.085, 0, 1);

    // Calques des mécanismes
    const ov = {};
    ov['4'] = new THREE.Group();
    [V(-0.9, 1.2, -0.1), V(1.15, 1.3, -0.12), V(-1.95, 1.0, -0.25), V(2.0, 1.05, -0.3)].forEach((p, i) => {
        const c = new THREE.Mesh(new THREE.SphereGeometry(i < 2 ? 0.13 : 0.09, 16, 12), mat.clot);
        c.position.copy(p);
        c.scale.set(1.3, 0.8, 0.9);
        ov['4'].add(c);
    });
    ov['5'] = new THREE.Group();
    [V(-0.4, 1.6, 0.3), V(0.9, 1.6, -0.4), V(-2.3, 0.4, 0.6)].forEach((p) => {
        const s = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 10, 32), mat.alert);
        s.position.copy(p);
        ov['5'].add(s);
    });
    Object.values(ov).forEach((g) => { g.visible = false; groups.ov.add(g); });

    // Étiquettes HTML projetées
    const labels = LABELS.map(([txt, p]) => {
        const el = document.createElement('span');
        el.className = 'htp3d-label';
        el.textContent = txt;
        labelLayer.appendChild(el);
        return { el, p };
    });

    let st = { pvr: 1.2, pawp: 9, co: 5.5, mpap: 15, pod: 4, ov: null };
    let heartOpacity = 0.85;

    function applyColors() {
        const v = new THREE.Color(css('--htp-veineux'));
        const a = new THREE.Color(css('--htp-arteriel'));
        mat.v.color.copy(v);
        mat.a.color.copy(a);
        mat.vVessel.color.copy(v);
        mat.aVessel.color.copy(a);
        mat.alert.color.set(css('--htp-alerte'));
        applyState();
    }

    function applyState() {
        const k = clamp((st.mpap - 20) / 30, 0, 1);
        const rvF = 1 + 0.5 * k;
        chambers.rv.scale.set(CH.rv.s.x * rvF, CH.rv.s.y * (1 + 0.25 * k), CH.rv.s.z * rvF);
        chambers.rv.position.set(CH.rv.c.x - 0.25 * k, CH.rv.c.y, CH.rv.c.z + 0.1 * k);
        const raF = 1 + 0.6 * clamp((st.pod - 4) / 12, 0, 1);
        chambers.ra.scale.copy(CH.ra.s).multiplyScalar(raF);
        const laF = 1 + 0.6 * clamp((st.pawp - 8) / 20, 0, 1);
        chambers.la.scale.copy(CH.la.s).multiplyScalar(laF);
        // Le VG est comprimé quand le VD se dilate
        const lvF = 1 - 0.18 * k;
        chambers.lv.scale.set(CH.lv.s.x * lvF, CH.lv.s.y, CH.lv.s.z * lvF);

        buildPA(0.17 + clamp((st.mpap - 15) / 35, 0, 1) * 0.13);
        const lumen = clamp(1 - (st.pvr - 1) / 15, 0.3, 1);
        branches.forEach((b) => {
            const { r, len, depth } = b.userData;
            const f = depth >= 2 ? lumen : 0.5 + 0.5 * lumen;
            b.scale.set(r * f, len, r * f);
        });

        mat.distal.color.set(st.ov === '1' ? css('--htp-alerte') : css('--htp-veineux'));
        mat.lung.color.set(st.ov === '3' ? '#8a8f99' : '#e89b9b');
        mat.lung.opacity = st.ov === '3' ? 0.3 : 0.16;
        mat.a.emissive.set(st.ov === '2' ? css('--htp-alerte') : '#000000');
        mat.a.emissiveIntensity = st.ov === '2' ? 0.35 : 0;
        // Groupe 4 : artères translucides pour voir les caillots
        mat.vVessel.opacity = st.ov === '4' ? 0.35 : 1;
        mat.vVessel.depthWrite = st.ov !== '4';
        mat.v.opacity = mat.a.opacity = heartOpacity;
        mat.v.depthWrite = mat.a.depthWrite = heartOpacity > 0.95;
        Object.entries(ov).forEach(([key, g]) => { g.visible = st.ov === key; });
    }

    // Vues animées
    let camAnim = null;
    function setView(name) {
        const to = VIEWS[name];
        if (!to) return;
        if (reduce.matches) { camera.position.copy(to); controls.update(); return; }
        camAnim = { from: camera.position.clone(), to, t0: performance.now() };
    }

    function resize() {
        const w = wrap.clientWidth || 600;
        const h = Math.max(280, Math.min(520, w * 0.66));
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = h + 'px';
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const tmp = new THREE.Vector3();
    let raf = 0;
    function loop(now) {
        raf = requestAnimationFrame(loop);
        if (!wrap.offsetParent || document.hidden) return;
        if (camAnim) {
            const t = clamp((now - camAnim.t0) / 800, 0, 1);
            const e = 1 - Math.pow(1 - t, 3);
            camera.position.lerpVectors(camAnim.from, camAnim.to, e);
            if (t === 1) camAnim = null;
        }
        controls.update();
        // Battement discret (≈ 70/min)
        if (!reduce.matches) {
            const beat = 1 + 0.025 * Math.max(0, Math.sin(now / 1000 * 2 * Math.PI * 70 / 60));
            groups.heart.scale.setScalar(beat);
            ov['5'].children.forEach((m, i) => { m.rotation.x = now / 900 + i; m.rotation.y = now / 1300; });
        }
        renderer.render(scene, camera);
        const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
        labels.forEach((l) => {
            tmp.copy(l.p).project(camera);
            l.el.style.transform = `translate(-50%,-50%) translate(${((tmp.x + 1) / 2) * w}px,${((1 - tmp.y) / 2) * h}px)`;
            l.el.style.opacity = tmp.z < 1 ? '' : 0;
        });
    }
    raf = requestAnimationFrame(loop);

    // Changement de thème
    const mo = new MutationObserver(applyColors);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyColors);
    applyColors();

    return {
        update(s) { st = s; applyState(); },
        setView,
        setLayer(name, on) {
            if (name === 'labels') labelLayer.hidden = !on;
            else if (groups[name]) groups[name].visible = on;
        },
        setHeartOpacity(o) { heartOpacity = o; applyState(); },
        dispose() { cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); renderer.dispose(); }
    };
}
