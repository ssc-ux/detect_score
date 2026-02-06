/**
 * DETECT Physio-Engine 3D (Three.js) - Anatomical Edition (RESCUE VERSION)
 * Procedural Heart & Vascular Tree Generation with Robust Initialization
 */

const Physio = {
    els: {
        slider: null,
        valDisplay: null,
        container: null,
        data: {
            trVel: null,
            raArea: null,
            dlco: null,
            bnp: null
        },
        bars: {
            tr: null,
            ra: null,
            dlco: null
        },
        detectScore: null,
        detectDecision: null,
        ecgCanvas: null,
        ecgLabel: null
    },

    state: {
        paps: 25,
        isInit: false,
        time: 0
    },

    scene: null, camera: null, renderer: null, clock: null,

    // Groups
    mainGroup: null,
    heartGroup: null,
    vesselGroup: null,
    lungGroup: null,

    // Dynamic Meshes
    rvMesh: null,
    raMesh: null,
    paMesh: null, // Pulmonary Artery Trunk

    uniforms: {
        uTime: { value: 0 },
        uPapsNorm: { value: 0.0 }
    },

    init: function () {
        if (this.state.isInit) return;
        console.log("Initializing Physio Engine (Rescue Version)...");

        if (!this.cacheElements()) {
            console.error("Physio Engine: Critical DOM elements missing. Aborting init.");
            return;
        }

        this.setupScene();
        this.bindEvents();
        this.updatePaps(); // Initial update

        this.state.isInit = true;
        this.animate();
        console.log("Physio Engine Initialized Successfully.");
    },

    cacheElements: function () {
        // Critical Inputs
        this.els.slider = document.getElementById('master-paps');
        this.els.valDisplay = document.getElementById('paps-val');
        this.els.container = document.getElementById('heart-3d-container');

        if (!this.els.container) {
            console.error("Physio Engine: Container #heart-3d-container not found!");
            return false;
        }

        // Data Outputs (Specific IDs verified from HTML)
        this.els.data.trVel = document.getElementById('phy-tr-vel');
        this.els.data.raArea = document.getElementById('phy-ra-area');
        this.els.data.dlco = document.getElementById('phy-dlco');
        this.els.data.bnp = document.getElementById('phy-bnp');

        // Bars
        this.els.bars.tr = document.getElementById('bar-tr');
        this.els.bars.ra = document.getElementById('bar-ra');
        this.els.bars.dlco = document.getElementById('bar-dlco');

        // Detect Results
        this.els.detectScore = document.getElementById('phy-detect-score');
        this.els.detectDecision = document.getElementById('phy-detect-decision');

        // ECG
        this.els.ecgCanvas = document.getElementById('ecg-canvas');
        this.els.ecgLabel = document.getElementById('ecg-label');

        return true;
    },

    bindEvents: function () {
        if (this.els.slider) {
            this.els.slider.addEventListener('input', (e) => {
                this.state.paps = parseInt(e.target.value);
                this.updatePaps();
            });
        }
        window.addEventListener('resize', this.onResize.bind(this));
    },

    setupScene: function () {
        const w = this.els.container.clientWidth;
        const h = this.els.container.clientHeight;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0f172a); // Dark medical blue

        this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
        this.camera.position.set(0, 1, 15);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.els.container.innerHTML = ''; // Clear previous if any
        this.els.container.appendChild(this.renderer.domElement);

        this.clock = new THREE.Clock();

        // Lighting
        const amb = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(amb);

        const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
        mainLight.position.set(5, 5, 10);
        this.scene.add(mainLight);

        const fillLight = new THREE.DirectionalLight(0x3b82f6, 0.3);
        fillLight.position.set(-5, 0, 5);
        this.scene.add(fillLight);

        // Root Group
        this.mainGroup = new THREE.Group();
        this.scene.add(this.mainGroup);

        this.createMaterials();
        this.buildHeart();
        this.buildVessels();
        this.buildLungs();
    },

    createMaterials: function () {
        this.uniforms = {
            uTime: { value: 0 },
            uPapsNorm: { value: 0.0 },
            uColor: { value: new THREE.Color(0xcd5c5c) }
        };

        // Custom "Plastinated" Shader Material
        // Combines standard lighting with a subtle fresnel glow
        // Using MeshPhysicalMaterial as base logic but manually implemented for control?
        // Let's use MeshStandardMaterial for robustness and add onBeforeCompile to inject pulse

        this.matMuscle = new THREE.MeshStandardMaterial({
            color: 0xe11d48, // Rose-Red
            roughness: 0.3,
            metalness: 0.1,
            side: THREE.DoubleSide
        });

        this.matVein = new THREE.MeshStandardMaterial({
            color: 0x2563eb, // Blue
            roughness: 0.2,
            metalness: 0.2
        });

        this.matArtery = new THREE.MeshStandardMaterial({
            color: 0xdc2626, // Red
            roughness: 0.2,
            metalness: 0.2
        });

        // We will modify the muscle material to pulsate
        this.matMuscle.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = this.uniforms.uTime;
            shader.uniforms.uPapsNorm = this.uniforms.uPapsNorm;
            shader.vertexShader = `
                uniform float uTime;
                uniform float uPapsNorm;
                ${shader.vertexShader}
            `.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                float pulse = (sin(uTime * 6.0) + 1.0) * 0.5;
                float beat = pulse * 0.05 * (1.0 + uPapsNorm);
                transformed += objectNormal * beat;
                `
            );
        };
    },

    buildHeart: function () {
        this.heartGroup = new THREE.Group();
        this.mainGroup.add(this.heartGroup);

        // 1. Right Ventricle (The one that dilates)
        // Deformed Sphere
        const rvGeo = new THREE.SphereGeometry(1.6, 64, 64);
        this.modifyGeo(rvGeo, (p) => {
            p.y *= 1.3; // Elongate
            p.z *= 0.6; // Flatten AP
            p.x -= Math.pow(p.y * 0.5, 2) * 0.2; // Curve
        });
        this.rvMesh = new THREE.Mesh(rvGeo, this.matMuscle);
        this.rvMesh.position.set(-0.8, -1.0, 0.5);
        this.heartGroup.add(this.rvMesh);

        // 2. Left Ventricle (Muscular, behind)
        const lvGeo = new THREE.SphereGeometry(1.5, 64, 64);
        this.modifyGeo(lvGeo, (p) => {
            p.y *= 1.4;
            p.x *= 0.9;
        });
        const lvMesh = new THREE.Mesh(lvGeo, this.matArtery);
        lvMesh.position.set(0.6, -0.8, -0.5);
        this.heartGroup.add(lvMesh);

        // 3. Right Atrium (On top of RV)
        const raGeo = new THREE.SphereGeometry(1.1, 48, 48);
        this.raMesh = new THREE.Mesh(raGeo, this.matMuscle);
        this.raMesh.position.set(-1.4, 1.0, 0);
        this.heartGroup.add(this.raMesh);
    },

    buildVessels: function () {
        this.vesselGroup = new THREE.Group();
        this.mainGroup.add(this.vesselGroup);

        // 1. Pulmonary Trunk (Blue - Coming from RV)
        const pathPA = new THREE.CatmullRomCurve3([
            new THREE.Vector3(-0.6, 0.5, 0.8), // From RV
            new THREE.Vector3(-0.3, 1.5, 0.4),
            new THREE.Vector3(0.0, 2.2, 0.0), // Bifurcation
        ]);
        const paGeo = new THREE.TubeGeometry(pathPA, 20, 0.45, 12, false);
        this.paMesh = new THREE.Mesh(paGeo, this.matVein);
        this.vesselGroup.add(this.paMesh);

        // 2. Left/Right Pulmonary Arteries
        const pathLPA = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 2.2, 0),
            new THREE.Vector3(-1.5, 2.3, -0.5),
            new THREE.Vector3(-3.0, 1.8, -0.8)
        ]);
        const lpaMesh = new THREE.Mesh(new THREE.TubeGeometry(pathLPA, 20, 0.35, 8, false), this.matVein);
        this.vesselGroup.add(lpaMesh);

        const pathRPA = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 2.2, 0),
            new THREE.Vector3(1.5, 2.3, -0.5),
            new THREE.Vector3(3.0, 1.8, -0.8)
        ]);
        const rpaMesh = new THREE.Mesh(new THREE.TubeGeometry(pathRPA, 20, 0.35, 8, false), this.matVein);
        this.vesselGroup.add(rpaMesh);

        // 3. Aorta (Arch - Red)
        const pathAorta = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0.6, 1.0, 0), // From LV
            new THREE.Vector3(0.6, 2.8, 0.2),
            new THREE.Vector3(0, 3.2, 0), // Top Arch
            new THREE.Vector3(-0.6, 2.8, -0.5),
            new THREE.Vector3(-0.6, 0.0, -0.8) // Descending
        ]);
        const aortaMesh = new THREE.Mesh(new THREE.TubeGeometry(pathAorta, 30, 0.42, 12, false), this.matArtery);
        this.vesselGroup.add(aortaMesh);
    },

    buildLungs: function () {
        this.lungGroup = new THREE.Group();
        this.mainGroup.add(this.lungGroup);

        // Procedural Bronchial Trees
        // We simulate a dense tree structure
        const createBranch = (start, dir, length, radius, depth, color) => {
            if (depth === 0) return;

            const end = new THREE.Vector3().copy(start).add(dir.clone().multiplyScalar(length));
            // Add some jitter
            const mid = new THREE.Vector3().lerpVectors(start, end, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3));

            const curve = new THREE.CatmullRomCurve3([start, mid, end]);
            const geo = new THREE.TubeGeometry(curve, 4, radius, 6, false);

            // Lung material changes with depth (tips are lighter)
            const mat = new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.7,
                transparent: true,
                opacity: 0.6 + (depth * 0.1)
            });

            const mesh = new THREE.Mesh(geo, mat);
            this.lungGroup.add(mesh);

            const branchAngle = 0.6;
            const dir1 = dir.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), branchAngle).normalize();
            const dir2 = dir.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), -branchAngle).normalize();

            dir1.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 2);
            dir2.applyAxisAngle(new THREE.Vector3(0, 1, 0), -Math.random() * 2);

            createBranch(end, dir1, length * 0.75, radius * 0.7, depth - 1, color);
            createBranch(end, dir2, length * 0.75, radius * 0.7, depth - 1, color);
        };

        const lungColor = 0xffffff; // Ghostly white/pink for airspaces

        // Left Lung Root
        createBranch(new THREE.Vector3(-3.0, 1.8, -0.8), new THREE.Vector3(-0.8, -1, 0.2).normalize(), 1.6, 0.12, 4, lungColor);

        // Right Lung Root
        createBranch(new THREE.Vector3(3.0, 1.8, -0.8), new THREE.Vector3(0.8, -1, 0.2).normalize(), 1.6, 0.12, 4, lungColor);
    },

    modifyGeo: function (geo, fn) {
        const pos = geo.attributes.position;
        const vec = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            vec.set(pos.getX(i), pos.getY(i), pos.getZ(i));
            fn(vec);
            pos.setXYZ(i, vec.x, vec.y, vec.z);
        }
        geo.computeVertexNormals();
    },

    onResize: function () {
        if (!this.els.container) return;
        const w = this.els.container.clientWidth;
        const h = this.els.container.clientHeight;
        this.renderer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    },

    updatePaps: function () {
        const paps = this.state.paps;
        if (this.els.valDisplay) this.els.valDisplay.textContent = paps;
        const norm = Math.min(1, Math.max(0, (paps - 20) / 80));
        this.uniforms.uPapsNorm.value = norm;

        // --- Simulated Physiology ---
        const rap = 5 + (Math.max(0, paps - 25) * 0.15);
        const dP = Math.max(0, paps - rap);
        const trVel = Math.sqrt(dP / 4);
        const raArea = 16 + (Math.max(0, paps - 25) * 0.4);
        const bnp = 100 + Math.exp(paps * 0.08);
        const dlco = Math.max(15, 85 - (norm * 65));

        // UI Updates (Safe)
        if (this.els.data.trVel) this.els.data.trVel.textContent = trVel.toFixed(1);
        if (this.els.data.raArea) this.els.data.raArea.textContent = raArea.toFixed(1);
        if (this.els.data.dlco) this.els.data.dlco.textContent = Math.round(dlco);
        if (this.els.data.bnp) this.els.data.bnp.textContent = Math.round(bnp);

        // Bars
        if (this.els.bars.tr) this.els.bars.tr.style.width = Math.min(100, (trVel / 5) * 100) + '%';
        if (this.els.bars.ra) this.els.bars.ra.style.width = Math.min(100, (raArea / 45) * 100) + '%';
        if (this.els.bars.dlco) this.els.bars.dlco.style.width = dlco + '%';

        // 3D Morphing
        if (this.rvMesh) {
            const s = 1.0 + (norm * 0.5);
            this.rvMesh.scale.set(s, s, s);
            this.rvMesh.position.x = -0.8 - (norm * 0.3);
        }
        if (this.raMesh) {
            const s = 1.0 + (norm * 0.7);
            this.raMesh.scale.set(s, s, s);
        }
        // Pulmonary artery slight dilation
        if (this.paMesh) {
            this.paMesh.scale.x = 1.0 + norm * 0.2;
            this.paMesh.scale.z = 1.0 + norm * 0.2;
        }

        this.updateECGInfo(norm);
        this.updateDetectScore(trVel, raArea, bnp);
    },

    updateECGInfo: function (norm) {
        if (!this.els.ecgLabel) return;
        const axis = Math.round(90 + (norm * 120));
        let state = "NORMAL";
        if (axis > 110) state = "DÉVIATION DROITE";
        if (axis > 160) state = "RAD SÉVÈRE";
        this.els.ecgLabel.textContent = `AXE ECG : ${axis}° (${state})`;
        this.els.ecgLabel.style.color = axis > 110 ? "#f87171" : "#4ade80";
    },

    updateDetectScore: function (trVel, raArea, bnp) {
        // Safe check for global logic
        if (!window.DETECT) return;

        const simInputs = {
            fvc_dlco: 1.1, telang: false, aca: false, ntprobnp: bnp,
            urate: 4.5, rad: false, ra_area: raArea, tr_vel: trVel
        };
        const s1 = window.DETECT.calculateStep1Points(simInputs);
        const s2 = window.DETECT.calculateStep2Points(s1.total, raArea, trVel);

        if (this.els.detectScore) this.els.detectScore.textContent = s2.total;
        if (this.els.detectDecision) {
            if (s2.total > 35) {
                this.els.detectDecision.textContent = "ALERTE HAUT RISQUE";
                this.els.detectDecision.className = "live-decision";
                this.els.detectDecision.style.background = "#e11d48";
            } else {
                this.els.detectDecision.textContent = "Risque Faible";
                this.els.detectDecision.className = "live-decision";
                this.els.detectDecision.style.background = "#475569";
            }
        }
    },

    animate: function () {
        requestAnimationFrame(this.animate.bind(this));

        const dt = this.clock.getDelta();
        this.state.time += dt;
        this.uniforms.uTime.value = this.state.time;

        // Gentle Rotation
        if (this.mainGroup) {
            this.mainGroup.rotation.y = Math.sin(this.state.time * 0.15) * 0.15;
        }

        // Lung Diffusion (Simulated by opacity/brightness pulse)
        if (this.lungGroup) {
            const norm = this.uniforms.uPapsNorm.value;
            // High pressure = slower breath/diffusion
            const breathFreq = 1.0 - (norm * 0.5);
            const breath = (Math.sin(this.state.time * 2.0 * breathFreq) + 1.0) * 0.5;
            // Opacity shift on lungs
            this.lungGroup.children.forEach(mesh => {
                if (mesh.material) {
                    mesh.material.opacity = 0.5 + (breath * 0.2);
                    // Color shift check
                    if (norm > 0.6) {
                        mesh.material.color.setHex(0xaab7b8); // Greyish (Fibrosis/Edema)
                    } else {
                        mesh.material.color.setHex(0xffffff); // Healthy
                    }
                }
            });
        }

        this.drawECG(dt, this.uniforms.uPapsNorm.value);
        this.renderer.render(this.scene, this.camera);
    },

    drawECG: function (dt, norm) {
        if (!this.els.ecgCanvas) return;
        const ctx = this.els.ecgCanvas.getContext('2d');
        const w = this.els.ecgCanvas.width;
        const h = this.els.ecgCanvas.height;

        ctx.fillStyle = 'rgba(11, 17, 33, 0.2)'; // Fading trail
        ctx.fillRect(0, 0, w, h);

        const x = (this.state.time * 60) % w;
        const hr = 1.0 + norm * 2.5;
        let spike = 0;
        const cycle = (this.state.time * hr) % 1.0;

        // Typical P-QRS-T complex simulation
        if (cycle > 0.90 && cycle < 0.94) spike = (cycle - 0.90) * 100; // P wave
        if (cycle > 0.95 && cycle < 0.96) spike = -200; // Q
        if (cycle > 0.96 && cycle < 0.98) {
            spike = 600; // R (High amplitude)
            if (norm > 0.6) spike = 400; // Lower voltage in localized area? or higher?
        }
        if (cycle > 0.98 && cycle < 0.99) spike = -150; // S (Deep S in lead I for RAD)

        const y = (h / 2) - (spike * 0.3) + Math.sin(this.state.time * 20) * 2;

        ctx.beginPath();
        ctx.strokeStyle = norm > 0.6 ? '#f87171' : '#4ade80';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.moveTo(x - 2, h / 2);
        ctx.lineTo(x, y);
        ctx.stroke();
    }
};

window.Physio = Physio;
console.log("Physio Anatomical Engine (RESCUE) Loaded");
