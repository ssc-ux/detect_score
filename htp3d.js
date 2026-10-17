/* Vue 3D anatomique (chargée à la demande).
   Modèle : Human Reference Atlas (HuBMAP), homme de référence, CC BY 4.0.
   Repère : x = gauche du patient, y = haut, z = avant. */
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const MODEL = './models/thorax.glb?v=1';
const MODEL_BYTES = 1598204;
const SCALE = 25;                                   // mètres → unités de scène
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Couleurs fixes : la scène est toujours sombre
const COL = {
    v: '#4f6ad8', a: '#cf463f', rh: '#5d74d6', lh: '#cc4f48', muscle: '#a85a50',
    cava: '#3a52bd', cor: '#ef4a37', cvein: '#4a5fb8', lung: '#f7b3ae', air: '#e9dccb',
    alert: '#f08a4b', clot: '#4a1612', hypoxic: '#8a909c'
};

// Rattache chaque pièce du modèle à une structure
function partOf(name) {
    if (/cardiac_vein|coronary_sinus|vein_of_left/.test(name)) return 'cvein';
    if (/coronary|descending_artery|marginal|diagonal/.test(name)) return 'cor';
    if (/pulmonary_trunk|pulmonary_artery/.test(name)) return 'pa';
    if (/pulmonary_vein/.test(name)) return 'pv';
    if (/aort|brachiocephalic_artery|carotid|subclavian/.test(name)) return 'ao';
    if (/vena_cava|brachiocephalic_vein/.test(name)) return 'cava';
    if (/right_cardiac_atrium/.test(name)) return 'ra';
    if (/right_ventricle/.test(name)) return 'rv';
    if (/left_cardiac_atrium/.test(name)) return 'la';
    if (/left_ventricle/.test(name)) return 'lv';
    if (/septum/.test(name)) return 'septum';
    if (/trachea|bronch/.test(name)) return 'air';
    if (/segment|hilum/.test(name)) return /left|_L$/.test(name) ? 'lungL' : 'lungR';
    return null;
}
const LAYER = {
    ra: 'heart', rv: 'heart', la: 'heart', lv: 'heart', septum: 'heart', cor: 'heart', cvein: 'heart',
    pa: 'vessels', pv: 'vessels', ao: 'vessels', cava: 'vessels', air: 'lungs', lungL: 'lungs', lungR: 'lungs'
};
const CHAMBERS = ['ra', 'rv', 'la', 'lv', 'septum'];
// Cible du mode pas à pas → structures à faire briller
const FOCUS = { rv: ['rv'], ra: ['ra'], la: ['la'], lv: ['lv'], pa: ['pa'], vp: ['pv'], endo: ['tree'], alv: ['lungL', 'lungR'] };

export function mount(root) {
    const wrap = root.querySelector('.htp3d-canvas');
    const labelLayer = root.querySelector('.htp3d-labels');
    const msg = root.querySelector('.htp3d-msg');
    const info = document.createElement('p');
    info.className = 'htp3d-cutinfo';
    info.hidden = true;
    root.querySelector('.htp3d-stage').appendChild(info);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // Netteté plafonnée (PC hospitaliers) ; rendu logiciel détecté → résolution native
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const soft = dbg && /swiftshader|llvmpipe|software/i.test(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
    renderer.setPixelRatio(soft ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.localClippingEnabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    wrap.appendChild(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        cancelAnimationFrame(raf);
        msg.hidden = false;
        msg.textContent = 'Vue 3D interrompue par le navigateur : rechargez la page ou utilisez le schéma 2D.';
    });

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 3.5;
    controls.maxDistance = 22;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x223355, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(3, 5, 7);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fb6ff, 1.4);
    rim.position.set(-5, 2, -7);
    scene.add(rim);

    // Coupes échographiques : petit axe (« sax ») ou 4 cavités (« a4c »)
    const clipList = [];
    const cut = { on: false, mode: 'none', level: 0, plane: new THREE.Plane(), axis: V(0, 1, 0), center: V(), half: 1,
        n4: V(0, 0, 1), rvDir: V(-1, 0, 0), lvR: 0.7 };

    // Déformation du cœur en HTP, calculée dans le shader pour toutes les pièces cardiaques
    // (pas de trou aux jonctions) : paroi libre du VD dilatée, surtout vers la chambre de chasse,
    // septum repoussé vers le VG (VG en « D »), OD et OG dilatées selon leurs pressions.
    const deform = {
        uK: { value: 0 }, uRA: { value: 0 }, uLA: { value: 0 },
        uLvC: { value: V() }, uAxis: { value: V(0, 1, 0) }, uRvDir: { value: V(-1, 0, 0) },
        uLvR: { value: 0.7 }, uHalf: { value: 1 }, uRaC: { value: V() }, uLaC: { value: V() }, uAtR: { value: 0.6 }
    };
    const DEFORM_GLSL = `
        uniform float uK, uRA, uLA, uLvR, uHalf, uAtR;
        uniform vec3 uLvC, uAxis, uRvDir, uRaC, uLaC;
        vec3 htpDeform(vec3 p) {
            vec3 d = p - uLvC;
            float h = dot(d, uAxis);
            vec3 r = d - uAxis * h;
            float rr = max(length(r), 1e-4);
            vec3 rd = r / rr;
            float s = dot(rd, uRvDir);
            // Ancrage progressif vers la base (anneaux, racines des gros vaisseaux)
            float anchor = 1.0 - 0.75 * smoothstep(0.55 * uHalf, 1.25 * uHalf, h);
            // Paroi libre du VD : côté VD et au-delà du VG ; plus marquée vers la chambre de chasse
            float wRv = smoothstep(0.05, 0.6, s) * smoothstep(0.85 * uLvR, 1.35 * uLvR, rr);
            float rvot = 1.0 + 0.5 * smoothstep(-0.2 * uHalf, 0.8 * uHalf, h);
            vec3 disp = rd * (uK * 0.42 * wRv * rvot * (rr - 0.6 * uLvR));
            // Septum (et paroi septale du VG) poussé vers le VG
            float wSep = smoothstep(0.25, 0.85, s) * (1.0 - smoothstep(0.75 * uLvR, 1.3 * uLvR, rr));
            disp -= uRvDir * (uK * 0.38 * uLvR * wSep);
            disp *= anchor;
            // Oreillettes : dilatation autour de leur centre
            vec3 a = p - uRaC;
            disp += a * (uRA * 0.32 * (1.0 - smoothstep(0.4 * uAtR, 1.5 * uAtR, length(a))));
            vec3 l = p - uLaC;
            disp += l * (uLA * 0.3 * (1.0 - smoothstep(0.4 * uAtR, 1.5 * uAtR, length(l))));
            return p + disp;
        }
    `;
    function deformable(m) {
        m.onBeforeCompile = (sh) => {
            Object.assign(sh.uniforms, deform);
            sh.vertexShader = DEFORM_GLSL + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
                vec4 htpW = modelMatrix * vec4(transformed, 1.0);
                htpW.xyz = htpDeform(htpW.xyz);
                transformed = (inverse(modelMatrix) * htpW).xyz;`);
        };
        m.customProgramCacheKey = () => 'htp-deform';
        return m;
    }

    // Myocarde : reflet velouté rasant (aspect « tissu vivant »)
    const MYO = { sheen: 0.45, sheenRoughness: 0.45, sheenColor: new THREE.Color('#ffc9c2') };
    const tissue = (color, extra = {}) => new THREE.MeshPhysicalMaterial({
        color, roughness: 0.48, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.45,
        transparent: true, clippingPlanes: clipList, ...extra
    });
    const mat = {
        ra: tissue(COL.rh, MYO), rv: tissue(COL.rh, MYO), la: tissue(COL.lh, MYO), lv: tissue(COL.lh, MYO),
        septum: tissue(COL.muscle, MYO),
        pa: tissue(COL.v), pv: tissue(COL.a), ao: tissue(COL.a), cava: tissue(COL.cava),
        cor: tissue(COL.cor, { clearcoat: 0.8 }), cvein: tissue(COL.cvein),
        lungL: tissue(COL.lung, { opacity: 0.14, depthWrite: false, roughness: 0.85, clearcoat: 0.15, envMapIntensity: 0.2 }),
        lungR: tissue(COL.lung, { opacity: 0.14, depthWrite: false, roughness: 0.85, clearcoat: 0.15, envMapIntensity: 0.2 }),
        air: tissue(COL.air, { opacity: 0.45, depthWrite: false }),
        tree: tissue(COL.v), treeProx: tissue(COL.v),
        clot: tissue(COL.clot, { transparent: false, roughness: 0.8 }),
        alert: new THREE.MeshBasicMaterial({ color: COL.alert, transparent: true, opacity: 0.85, clippingPlanes: clipList })
    };
    // Section pleine lors de la coupe ; le VG est dessiné par-dessus le VD (croissant du VD)
    const innerMat = {
        ra: new THREE.MeshBasicMaterial({ color: '#5465b8', side: THREE.BackSide, clippingPlanes: clipList }),
        rv: new THREE.MeshBasicMaterial({ color: '#5465b8', side: THREE.BackSide, clippingPlanes: clipList }),
        la: new THREE.MeshBasicMaterial({ color: '#b2433d', side: THREE.BackSide, clippingPlanes: clipList }),
        lv: new THREE.MeshBasicMaterial({ color: '#b2433d', side: THREE.BackSide, clippingPlanes: clipList, depthTest: false }),
        septum: new THREE.MeshBasicMaterial({ color: '#8c4a42', side: THREE.BackSide, clippingPlanes: clipList })
    };
    ['ra', 'rv', 'la', 'lv', 'septum', 'cor', 'cvein'].forEach((k) => deformable(mat[k]));
    Object.values(innerMat).forEach(deformable);

    const groups = { heart: new THREE.Group(), vessels: new THREE.Group(), lungs: new THREE.Group(), flow: new THREE.Group(), ov: new THREE.Group() };
    Object.values(groups).forEach((g) => scene.add(g));
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.78, 72),
        new THREE.MeshBasicMaterial({ color: COL.alert, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    ring.visible = false;
    scene.add(ring);

    const parts = {};           // structure → { pivots, center, box }
    const centerOf = {};        // nom de pièce → centre
    const labels = [];
    let ready = false;
    let st = { pvr: 1.2, pawp: 9, co: 5.5, mpap: 15, pod: 4, ov: null, focus: null };
    let heartOpacity = 1;
    const layerOn = { heart: true, vessels: true, lungs: true, flow: true, ov: true, labels: true };
    const branches = [];
    const flow = {};
    const ov = {};

    // ---------- Chargement du modèle ----------
    msg.hidden = false;
    msg.textContent = 'Chargement du modèle anatomique… 0 %';
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(MODEL, (gltf) => {
        build(gltf.scene);
        ready = true;
        msg.hidden = true;
        applyVisibility();
        applyState();
        setView('face', true);
    }, (e) => {
        msg.textContent = 'Chargement du modèle anatomique… ' + Math.min(99, Math.round(100 * e.loaded / (e.total || MODEL_BYTES))) + ' %';
    }, () => {
        msg.hidden = false;
        msg.textContent = 'Impossible de charger le modèle anatomique.';
    });

    function build(model) {
        // Centrage sur le cœur, mise à l'échelle
        model.updateMatrixWorld(true);
        const heartBox = new THREE.Box3();
        model.traverse((o) => { if (o.isMesh && CHAMBERS.includes(partOf(o.name))) heartBox.expandByObject(o); });
        const c = heartBox.getCenter(V());
        const holder = new THREE.Group();
        holder.scale.setScalar(SCALE);
        holder.position.copy(c).multiplyScalar(-SCALE);
        holder.add(model);
        scene.add(holder);
        holder.updateMatrixWorld(true);

        const meshes = [];
        model.traverse((o) => { if (o.isMesh) meshes.push(o); });
        meshes.forEach((m) => {
            const name = m.name || m.parent.name;
            const p = partOf(name) || partOf(m.parent.name);
            if (!p) { m.visible = false; return; }
            m.material = mat[p];
            m.renderOrder = p.startsWith('lung') || p === 'air' ? 3 : 1;
            const box = new THREE.Box3().setFromObject(m);
            const center = box.getCenter(V());
            centerOf[name] = { center, box };
            // Pivot au centre de la pièce : permet de la dilater sur place
            const pivot = new THREE.Group();
            pivot.position.copy(center);
            groups[LAYER[p]].add(pivot);
            pivot.updateMatrixWorld(true);
            pivot.attach(m);
            if (innerMat[p]) {
                const inner = new THREE.Mesh(m.geometry, innerMat[p]);
                inner.visible = false;
                inner.renderOrder = p === 'lv' ? 10 : 6;
                m.add(inner);
            }
            const P = parts[p] || (parts[p] = { pivots: [], box: new THREE.Box3() });
            P.pivots.push(pivot);
            P.box.union(box);
        });
        scene.remove(holder);
        Object.values(parts).forEach((P) => { P.center = P.box.getCenter(V()); });

        buildTree();
        buildFlow();
        buildOverlays();
        computeLvAxis();
        buildLabels();
    }

    const at = (name, fallback) => (centerOf[name] ? centerOf[name].center.clone() : fallback.clone());

    // ---------- Arbre artériel intrapulmonaire (lumière variable avec la RVP) ----------
    function buildTree() {
        const cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
        const up = V(0, 1, 0);
        function grow(start, dir, len, r, depth) {
            const end = start.clone().addScaledVector(dir, len);
            const m = new THREE.Mesh(cyl, depth >= 2 ? mat.tree : mat.treeProx);
            m.position.copy(start).lerp(end, 0.5);
            m.quaternion.setFromUnitVectors(up, dir);
            m.userData = { r, len, depth, mid: m.position.clone() };
            m.renderOrder = 2;
            groups.lungs.add(m);
            branches.push(m);
            if (depth === 4) return;
            const axis = depth % 2 === 0 ? V(0, 0, 1) : dir.clone().cross(V(0, 1, 0)).normalize().cross(dir).normalize();
            if (axis.lengthSq() < 0.01) axis.set(1, 0, 0);
            [-1, 1].forEach((s) => {
                const d = dir.clone().applyAxisAngle(axis, (depth === 0 ? 0.95 : 0.55) * s).normalize();
                grow(end, d, len * 0.74, r * 0.7, depth + 1);
            });
        }
        const hR = parts.lungR ? at('VH_M_hilum_R', parts.lungR.center) : V(-1.6, 0.6, 0);
        const hL = parts.lungL ? at('VH_M_hilum_L', parts.lungL.center) : V(1.6, 0.6, 0);
        grow(hR, V(-1, 0.05, 0).normalize(), 0.62, 0.11, 0);
        grow(hL, V(1, 0.05, 0).normalize(), 0.62, 0.11, 0);
    }

    // ---------- Flux sanguin ----------
    function buildFlow() {
        const ra = parts.ra.center, rv = parts.rv.center, la = parts.la.center, lv = parts.lv.center;
        const trunk = at('VH_M_pulmonary_trunk', parts.pa.center);
        const svc = centerOf.VH_M_superior_vena_cava, ivc = centerOf.VH_M_inferior_vena_cava_b || centerOf.VH_M_inferior_vena_cava_a;
        const svcTop = svc ? V(svc.center.x, svc.box.max.y, svc.center.z) : ra.clone().add(V(0, 2, 0));
        const ivcBot = ivc ? V(ivc.center.x, ivc.box.min.y, ivc.center.z) : ra.clone().add(V(0, -2, 0));
        const hR = at('VH_M_hilum_R', V(-2, 0.5, 0)), hL = at('VH_M_hilum_L', V(2, 0.5, 0));
        const asc = at('VH_M_ascending_aorta', lv), arch = at('VH_M_aortic_arch', asc);
        const dA = at('VH_M_descending_aorta_a', arch), dB = centerOf.VH_M_descending_aorta_b;
        const dBot = dB ? V(dB.center.x, dB.box.min.y, dB.center.z) : dA.clone().add(V(0, -3, 0));
        const routes = {
            v: [[svcTop, ra, rv, trunk, at('VH_M_pulmonary_artery_R', hR), hR],
                [ivcBot, ra, rv, trunk, at('VH_M_pulmonary_artery_L', hL), hL]],
            a: [[hR, at('VH_M_pulmonary_vein_R_sup', la), la, lv, asc, arch, dA, dBot],
                [hL, at('VH_M_pulmonary_vein_L_sup', la), la, lv, asc, arch, dA, dBot]]
        };
        const geo = new THREE.SphereGeometry(0.055, 8, 6);
        [['v', '#9fb2ff'], ['a', '#ff9b93']].forEach(([k, color]) => {
            const n = 40;
            const inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color, clippingPlanes: clipList }), n);
            inst.renderOrder = 5;
            groups.flow.add(inst);
            flow[k] = { inst, curves: routes[k].map((pts) => new THREE.CatmullRomCurve3(pts)), t: Array.from({ length: n }, (_, i) => i / n) };
        });
        stepFlow(0);
    }
    const dummy = new THREE.Object3D();
    function stepFlow(dt) {
        if (!flow.v) return;
        const speed = (st.co / 5) * 0.07;
        ['v', 'a'].forEach((k) => {
            const f = flow[k];
            f.t.forEach((t, i) => {
                f.t[i] = (t + speed * dt) % 1;
                f.curves[i % f.curves.length].getPointAt(f.t[i], dummy.position);
                dummy.updateMatrix();
                f.inst.setMatrixAt(i, dummy.matrix);
            });
            f.inst.instanceMatrix.needsUpdate = true;
        });
    }

    // ---------- Calques des mécanismes ----------
    function buildOverlays() {
        ov['4'] = new THREE.Group();
        const pR = at('VH_M_pulmonary_artery_R', V(-1, 1, 0)), pL = at('VH_M_pulmonary_artery_L', V(1, 1, 0));
        [pR, pL, ...branches.filter((b) => b.userData.depth === 1).map((b) => b.userData.mid)].forEach((p, i) => {
            const clot = new THREE.Mesh(new THREE.SphereGeometry(i < 2 ? 0.17 : 0.1, 16, 12), mat.clot);
            clot.position.copy(p);
            clot.scale.set(1.3, 0.8, 0.9);
            ov['4'].add(clot);
        });
        ov['5'] = new THREE.Group();
        [at('VH_M_pulmonary_trunk', V(0, 1, 0)).add(V(0, 0.5, 0.4)), at('VH_M_hilum_R', V(-2, 0, 0)), parts.lv.center.clone()].forEach((p) => {
            const t = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 10, 36), mat.alert);
            t.position.copy(p);
            ov['5'].add(t);
        });
        Object.values(ov).forEach((g) => { g.visible = false; groups.ov.add(g); });
    }

    // ---------- Grand axe du VG (coupe petit axe) ----------
    function computeLvAxis() {
        const pts = [];
        parts.lv.pivots.forEach((pv) => pv.traverse((o) => {
            if (!o.isMesh || o.material === innerMat.lv) return;
            o.updateMatrixWorld(true);
            const pos = o.geometry.attributes.position;
            for (let i = 0; i < pos.count; i += 3) pts.push(V(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(o.matrixWorld));
        }));
        const mean = pts.reduce((s, p) => s.add(p), V()).divideScalar(pts.length);
        const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        pts.forEach((p) => {
            const d = [p.x - mean.x, p.y - mean.y, p.z - mean.z];
            for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] += d[r] * d[c];
        });
        let v = V(0, 1, 0);
        for (let it = 0; it < 30; it++) {
            v = V(C[0] * v.x + C[1] * v.y + C[2] * v.z, C[3] * v.x + C[4] * v.y + C[5] * v.z, C[6] * v.x + C[7] * v.y + C[8] * v.z).normalize();
        }
        if (v.dot(parts.la.center.clone().sub(mean)) < 0) v.negate();   // orienté vers la base
        let lo = Infinity, hi = -Infinity;
        pts.forEach((p) => { const t = p.clone().sub(mean).dot(v); lo = Math.min(lo, t); hi = Math.max(hi, t); });
        cut.axis = v;
        cut.center = mean;
        cut.half = (hi - lo) / 2;
        cut.lvR = pts.reduce((sum, p) => { const d = p.clone().sub(mean); return sum + d.sub(v.clone().multiplyScalar(d.dot(v))).length(); }, 0) / pts.length;
        const toRv = parts.rv.center.clone().sub(mean);
        cut.rvDir = toRv.sub(v.clone().multiplyScalar(toRv.dot(v))).normalize();
        // Plan 4 cavités : contient le grand axe et la ligne VG → VD ; normale orientée vers l'avant
        cut.n4 = v.clone().cross(cut.rvDir).normalize();
        if (cut.n4.z < 0) cut.n4.negate();
        deform.uLvC.value.copy(mean);
        deform.uAxis.value.copy(v);
        deform.uRvDir.value.copy(cut.rvDir);
        deform.uLvR.value = cut.lvR;
        deform.uHalf.value = cut.half;
        deform.uRaC.value.copy(parts.ra.center);
        deform.uLaC.value.copy(parts.la.center);
        deform.uAtR.value = parts.ra.box.getSize(V()).length() / 3;
    }

    function applyCut() {
        if (!ready) return;
        cut.on = cut.mode !== 'none';
        let c, n;
        if (cut.mode === 'a4c') {
            // On retire la moitié antérieure ; le curseur déplace le plan d'avant en arrière
            c = cut.center.clone().addScaledVector(cut.n4, cut.level * cut.lvR);
            n = cut.n4.clone().negate();
        } else {
            // Petit axe : on garde la base et on regarde depuis l'apex, comme en échographie
            c = cut.center.clone().addScaledVector(cut.axis, cut.level * cut.half);
            n = cut.axis.clone();
        }
        cut.plane.setFromNormalAndCoplanarPoint(n, c);
        clipList.length = 0;
        if (cut.on) clipList.push(cut.plane);
        ring.quaternion.setFromUnitVectors(V(0, 0, 1), n);
        ring.position.copy(c).addScaledVector(n, 0.01);
        ring.visible = cut.on;
        info.hidden = cut.mode !== 'a4c';
        CHAMBERS.forEach((k) => parts[k] && parts[k].pivots.forEach((pv) => pv.traverse((o) => {
            if (o.isMesh && Object.values(innerMat).includes(o.material)) o.visible = cut.on;
        })));
        applyVisibility();
        applyState();
    }

    // ---------- Étiquettes ----------
    function buildLabels() {
        const lat = (P, s) => V(P.center.x + s * (P.box.max.x - P.box.min.x) * 0.3, P.center.y + 1.1, P.center.z + 0.8);
        const L = [
            ['OD', parts.ra.center], ['VD', parts.rv.center], ['OG', parts.la.center], ['VG', parts.lv.center],
            ['AP', at('VH_M_pulmonary_trunk', parts.pa.center)], ['Aorte', at('VH_M_aortic_arch', parts.ao.center)],
            ['VCS', at('VH_M_superior_vena_cava', parts.cava.center)],
            ['Poumon D', lat(parts.lungR, -1)], ['Poumon G', lat(parts.lungL, 1)]
        ];
        L.forEach(([txt, p]) => {
            const el = document.createElement('span');
            el.className = 'htp3d-label';
            el.textContent = txt;
            labelLayer.appendChild(el);
            labels.push({ el, p, txt });
        });
    }

    // ---------- Visibilité et état ----------
    function applyVisibility() {
        for (const k of Object.keys(groups)) groups[k].visible = layerOn[k] && (!cut.on || k === 'heart');
        labelLayer.hidden = !layerOn.labels;
        const keep = cut.mode === 'a4c' ? ['VD', 'VG', 'OD', 'OG'] : ['VD', 'VG'];
        labels.forEach((l) => { l.el.hidden = cut.on && !keep.includes(l.txt); });
    }

    const scaleParts = (k, sx, sy = sx, sz = sx) => parts[k] && parts[k].pivots.forEach((pv) => pv.scale.set(sx, sy, sz));

    function applyState() {
        if (!ready) return;
        const k = clamp((st.mpap - 20) / 30, 0, 1);              // post-charge du VD
        deform.uK.value = k;
        deform.uRA.value = clamp((st.pod - 4) / 12, 0, 1);
        deform.uLA.value = clamp((st.pawp - 8) / 20, 0, 1);
        scaleParts('pa', 1 + 0.28 * clamp((st.mpap - 15) / 35, 0, 1));
        // Rapport VD/VG en 4 cavités (simulé) : ≈ 0,65 normal, > 1 en HTP sévère
        info.textContent = 'Coupe 4 cavités · rapport VD/VG ≈ ' +
            (0.65 + 0.75 * k).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' (simulé)';

        const lumen = clamp(1 - (st.pvr - 1) / 15, 0.3, 1);
        branches.forEach((b) => {
            const { r, len, depth } = b.userData;
            const f = depth >= 2 ? lumen : 0.5 + 0.5 * lumen;
            b.scale.set(r * f, len, r * f);
        });

        mat.tree.color.set(st.ov === '1' ? COL.alert : COL.v);
        ['lungL', 'lungR'].forEach((l) => {
            mat[l].color.set(st.ov === '3' ? COL.hypoxic : COL.lung);
            mat[l].opacity = st.ov === '3' ? 0.3 : 0.14;
        });
        // Groupe 4 : artères translucides pour voir les caillots
        mat.pa.opacity = st.ov === '4' ? 0.35 : 1;
        mat.pa.depthWrite = st.ov !== '4';
        const op = cut.on ? 1 : heartOpacity;
        ['ra', 'rv', 'la', 'lv', 'septum', 'cor', 'cvein'].forEach((m) => {
            mat[m].opacity = op;
            mat[m].depthWrite = op > 0.95;
        });
        Object.entries(ov).forEach(([key, g]) => { g.visible = st.ov === key; });
        // Base émissive (G2 : OG en surpression) ; la brillance du focus s'ajoute dans la boucle
        Object.keys(mat).forEach((m) => { if (mat[m].emissive) mat[m].emissive.set(0x000000); });
        if (st.ov === '2') {
            mat.la.emissive.set(COL.alert);
            mat.la.emissiveIntensity = 0.35;
        }
    }

    // ---------- Vues animées ----------
    let camAnim = null;
    const TARGET = V(0, 0.45, 0);
    const D = 9.6;
    function viewPos(name) {
        if (name === 'sax') return cut.center.clone().addScaledVector(cut.axis, -7);
        if (name === 'a4c') return cut.center.clone().addScaledVector(cut.n4, 7.5);
        return { face: V(0, 0.8, D), gauche: V(D, 0.8, 0.4), dos: V(0, 0.8, -D), oblique: V(D * 0.68, D * 0.36, D * 0.68) }[name];
    }
    function setView(name, instant) {
        const to = viewPos(name);
        if (!to) return;
        const target = name === 'sax' || name === 'a4c' ? cut.center.clone() : TARGET.clone();
        if (instant || reduce.matches) { camera.position.copy(to); controls.target.copy(target); controls.update(); return; }
        camAnim = { from: camera.position.clone(), to, tFrom: controls.target.clone(), tTo: target, t0: performance.now() };
    }
    camera.position.set(0, 0.8, D);
    controls.target.copy(TARGET);

    function resize() {
        const w = wrap.clientWidth || 600;
        const h = Math.max(300, Math.min(660, w * 0.74));
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = h + 'px';
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    // Rendu seulement quand la scène est à l'écran
    let onScreen = true;
    const io = new IntersectionObserver((e) => { onScreen = e[0].isIntersecting; });
    io.observe(wrap);

    const tmp = new THREE.Vector3();
    const ON_PLANE = { VD: 'rv', VG: 'lv', OD: 'ra', OG: 'la' };
    let raf = 0, prev = 0;
    function loop(now) {
        raf = requestAnimationFrame(loop);
        const dt = prev ? Math.min(0.05, (now - prev) / 1000) : 0;
        prev = now;
        if (!onScreen || !wrap.offsetParent || document.hidden) return;
        if (camAnim) {
            const t = clamp((now - camAnim.t0) / 900, 0, 1);
            const e = 1 - Math.pow(1 - t, 3);
            camera.position.lerpVectors(camAnim.from, camAnim.to, e);
            controls.target.lerpVectors(camAnim.tFrom, camAnim.tTo, e);
            if (t === 1) camAnim = null;
        }
        controls.update();
        if (ready && !reduce.matches) {
            const beat = 1 + 0.02 * Math.max(0, Math.sin(now / 1000 * 2 * Math.PI * 70 / 60));
            groups.heart.scale.setScalar(beat);
            if (groups.flow.visible) stepFlow(dt);
            ov['5'].children.forEach((m, i) => { m.rotation.x = now / 900 + i; m.rotation.y = now / 1300; });
        }
        // Structure mise en avant par le mode pas à pas
        if (ready && st.focus && FOCUS[st.focus]) {
            const glow = reduce.matches ? 0.45 : 0.25 + 0.25 * (1 + Math.sin(now / 260));
            FOCUS[st.focus].forEach((m) => { mat[m].emissive.set(COL.alert); mat[m].emissiveIntensity = glow; });
        }
        renderer.render(scene, camera);
        const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
        labels.forEach((l) => {
            if (cut.on && ON_PLANE[l.txt]) cut.plane.projectPoint(parts[ON_PLANE[l.txt]].center, tmp).project(camera);
            else tmp.copy(l.p).project(camera);
            l.el.style.transform = `translate(-50%,-50%) translate(${((tmp.x + 1) / 2) * w}px,${((1 - tmp.y) / 2) * h}px)`;
            l.el.style.opacity = tmp.z < 1 ? '' : 0;
        });
    }
    raf = requestAnimationFrame(loop);

    return {
        update(s) {
            const focusChanged = s.focus !== st.focus;
            st = s;
            applyState();
            if (focusChanged && ready) applyState();
        },
        setView,
        setLayer(name, on) { layerOn[name] = on; if (ready) applyVisibility(); },
        setHeartOpacity(o) { heartOpacity = o; applyState(); },
        setCut(mode, level) {
            cut.mode = mode;
            if (level !== undefined) cut.level = level;
            applyCut();
        },
        dispose() { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); renderer.dispose(); pmrem.dispose(); }
    };
}
