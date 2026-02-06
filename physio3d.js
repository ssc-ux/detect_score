/**
 * DETECT Physio-Engine 3D (Three.js) - Advanced Edition
 * Includes Heart, Lungs, Capillary Diffusion and ECG Simulation
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
        ecgPhase: 0,
        time: 0
    },

    scene: null,
    camera: null,
    renderer: null,
    clock: null,

    // Meshes
    heartGroup: null,
    lungGroup: null,
    rvMesh: null,
    raMesh: null,
    lungLeft: null,
    lungRight: null,

    // Systems
    jetSystem: null,
    diffusionSystem: null,

    uniforms: {
        uTime: { value: 0 },
        uPapsNorm: { value: 0.0 }
    },

    init: function () {
        if (this.state.isInit) return;
        console.log("Initializing Advanced 3D Physio Engine...");

        this.els.slider = document.getElementById('master-paps');
        this.els.valDisplay = document.getElementById('paps-val');
        this.els.container = document.getElementById('heart-3d-container');

        this.els.data.trVel = document.getElementById('phy-tr-vel');
        this.els.data.raArea = document.getElementById('phy-ra-area');
        this.els.data.dlco = document.getElementById('phy-dlco');
        this.els.data.bnp = document.getElementById('phy-bnp');

        this.els.bars.tr = document.getElementById('bar-tr');
        this.els.bars.ra = document.getElementById('bar-ra');
        this.els.bars.dlco = document.getElementById('bar-dlco');

        this.els.detectScore = document.getElementById('phy-detect-score');
        this.els.detectDecision = document.getElementById('phy-detect-decision');

        this.els.ecgCanvas = document.getElementById('ecg-canvas');
        this.els.ecgLabel = document.getElementById('ecg-label');

        this.setupScene();

        if (this.els.slider) {
            this.els.slider.addEventListener('input', (e) => {
                this.state.paps = parseInt(e.target.value);
                this.updatePaps();
            });
            this.updatePaps();
        }

        this.state.isInit = true;
        this.animate();
    },

    setupScene: function () {
        const width = this.els.container.clientWidth;
        const height = this.els.container.clientHeight;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b1121);

        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        this.camera.position.set(0, 1, 14);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.els.container.appendChild(this.renderer.domElement);

        this.clock = new THREE.Clock();

        const ambLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambLight);

        const pointLight = new THREE.PointLight(0x3b82f6, 2);
        pointLight.position.set(5, 5, 5);
        this.scene.add(pointLight);

        // 1. HEART GROUP (Left Side)
        this.heartGroup = new THREE.Group();
        this.heartGroup.position.set(-3.5, 0, 0);
        this.scene.add(this.heartGroup);
        this.createHeartMaterials();
        this.createHeartMeshes();

        // 2. LUNG GROUP (Right Side)
        this.lungGroup = new THREE.Group();
        this.lungGroup.position.set(3.5, 0, 0);
        this.scene.add(this.lungGroup);
        this.createLungMeshes();

        // 3. JET & DIFFUSION Systems
        this.createJet();
        this.createDiffusion();

        window.addEventListener('resize', () => {
            if (!this.els.container) return;
            const w = this.els.container.clientWidth;
            const h = this.els.container.clientHeight;
            this.renderer.setSize(w, h);
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
        });
    },

    createHeartMaterials: function () {
        this.uniforms = {
            uTime: { value: 0 },
            uPapsNorm: { value: 0.0 },
            uBaseColor: { value: new THREE.Color(0x34495e) },
            uStressColor: { value: new THREE.Color(0xe74c3c) }
        };

        const vShader = `
            uniform float uTime;
            uniform float uPapsNorm;
            varying vec3 vNormal;
            varying float vGlow;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                float beatMod = (sin(uTime * 6.0) + 1.0) * 0.5;
                float beat = beatMod * 0.04 * (1.0 + uPapsNorm);
                vec3 newPos = position + normal * beat;
                vec3 viewVector = normalize(cameraPosition - (modelMatrix * vec4(newPos, 1.0)).xyz);
                vGlow = pow(1.0 - dot(vNormal, viewVector), 2.5);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
            }
        `;
        const fShader = `
            uniform vec3 uBaseColor;
            uniform vec3 uStressColor;
            uniform float uPapsNorm;
            varying float vGlow;
            void main() {
                vec3 color = mix(uBaseColor, uStressColor, uPapsNorm * 0.8);
                gl_FragColor = vec4(color + vGlow * 0.8, 0.5 + vGlow * 0.5);
            }
        `;
        this.organMat = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: vShader,
            fragmentShader: fShader,
            transparent: true,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
    },

    createHeartMeshes: function () {
        // RV - Deformed sphere
        const rvGeo = new THREE.SphereGeometry(2, 48, 48);
        this.rvMesh = new THREE.Mesh(rvGeo, this.organMat);
        this.rvMesh.scale.set(0.8, 1.3, 0.6);
        this.rvMesh.position.set(0, -1, 0);
        this.heartGroup.add(this.rvMesh);

        // RA - Small bulb on top
        const raGeo = new THREE.SphereGeometry(1.4, 32, 32);
        this.raMesh = new THREE.Mesh(raGeo, this.organMat);
        this.raMesh.position.set(-0.8, 1.8, 0);
        this.heartGroup.add(this.raMesh);
    },

    createLungMeshes: function () {
        const lungMat = this.organMat.clone();
        lungMat.uniforms.uBaseColor.value = new THREE.Color(0x27ae60);

        const lungGeo = new THREE.SphereGeometry(2.5, 48, 48);

        this.lungLeft = new THREE.Mesh(lungGeo, lungMat);
        this.lungLeft.scale.set(0.6, 1.6, 0.4);
        this.lungLeft.position.set(-1.4, 0, 0);
        this.lungGroup.add(this.lungLeft);

        this.lungRight = new THREE.Mesh(lungGeo, lungMat);
        this.lungRight.scale.set(0.6, 1.6, 0.4);
        this.lungRight.position.set(1.4, 0, 0);
        this.lungGroup.add(this.lungRight);
    },

    createJet: function () {
        const count = 150;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 1.5;
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({ color: 0x5dade2, size: 0.1, transparent: true, opacity: 0.7 });
        this.jetSystem = new THREE.Points(geo, mat);
        this.jetSystem.position.set(-0.3, 0.8, 0.2);
        this.heartGroup.add(this.jetSystem);
    },

    createDiffusion: function () {
        const count = 500;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3);
        const speeds = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 4;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 6;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
            speeds[i] = 0.01 + Math.random() * 0.03;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));
        const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.8 });
        this.diffusionSystem = new THREE.Points(geo, mat);
        this.lungGroup.add(this.diffusionSystem);
    },

    updatePaps: function () {
        const paps = this.state.paps;
        if (this.els.valDisplay) this.els.valDisplay.textContent = paps;
        const norm = Math.min(1, Math.max(0, (paps - 20) / 80));
        this.uniforms.uPapsNorm.value = norm;

        // Hemodynamics
        const rap = 5 + (Math.max(0, paps - 25) * 0.15);
        const dP = Math.max(0, paps - rap);
        const trVel = Math.sqrt(dP / 4);
        const raArea = 16 + (Math.max(0, paps - 25) * 0.4);
        const bnp = 100 + Math.exp(paps * 0.08);

        // DLCO (Simulation of vascular obstruction)
        const dlco = Math.max(15, 85 - (norm * 65));

        // Update Text
        if (this.els.data.trVel) this.els.data.trVel.textContent = trVel.toFixed(1);
        if (this.els.data.raArea) this.els.data.raArea.textContent = raArea.toFixed(1);
        if (this.els.data.dlco) this.els.data.dlco.textContent = Math.round(dlco);
        if (this.els.data.bnp) this.els.data.bnp.textContent = Math.round(bnp);

        // Update Bars
        if (this.els.bars.tr) this.els.bars.tr.style.width = Math.min(100, (trVel / 5) * 100) + '%';
        if (this.els.bars.ra) this.els.bars.ra.style.width = Math.min(100, (raArea / 45) * 100) + '%';
        if (this.els.bars.dlco) this.els.bars.dlco.style.width = dlco + '%';

        // 3D Visual Scaling
        if (this.raMesh) {
            const s = 1.0 + (norm * 0.9);
            this.raMesh.scale.set(s, s, s);
        }
        if (this.rvMesh) {
            const s = 1.0 + (norm * 0.5);
            this.rvMesh.scale.set(0.8 * s, 1.3 * s, 0.6 * s);
        }

        // Lung Visualization (Stiffness/Density)
        if (this.lungLeft) {
            const s = 1.0 - (norm * 0.15);
            this.lungLeft.scale.set(0.6 * s, 1.6 * s, 0.4 * s);
            this.lungRight.scale.set(0.6 * s, 1.6 * s, 0.4 * s);
            // Change color shift as well
            this.lungLeft.material.uniforms.uPapsNorm.value = norm;
            this.lungRight.material.uniforms.uPapsNorm.value = norm;
        }

        this.updateDetectScore(trVel, raArea, bnp);
        this.updateECGInfo(norm);
    },

    updateECGInfo: function (norm) {
        if (!this.els.ecgLabel) return;
        const axis = Math.round(90 + (norm * 120)); // From Normal to Right deviation
        let state = "NORMAL";
        if (axis > 110) state = "DÉVIATION DROITE";
        if (axis > 160) state = "RAD SÉVÈRE";
        this.els.ecgLabel.textContent = `AXE ECG : ${axis}° (${state})`;
        this.els.ecgLabel.style.color = axis > 110 ? "#f87171" : "#4ade80";
    },

    animate: function () {
        requestAnimationFrame(() => this.animate());
        const dt = this.clock.getDelta();
        this.state.time += dt;
        this.uniforms.uTime.value = this.state.time;

        const norm = this.uniforms.uPapsNorm.value;

        // Animate Tricuspid Jet (Backflow to RA)
        if (this.jetSystem) {
            const pos = this.jetSystem.geometry.attributes.position.array;
            for (let i = 0; i < pos.length / 3; i++) {
                pos[i * 3 + 1] += (0.05 + norm * 0.6); // Jet goes up
                if (pos[i * 3 + 1] > 3) {
                    pos[i * 3 + 1] = -1;
                    pos[i * 3] = (Math.random() - 0.5) * 1.0;
                }
            }
            this.jetSystem.geometry.attributes.position.needsUpdate = true;
            this.jetSystem.material.opacity = 0.2 + (norm * 0.6);
        }

        // Animate Lung Diffusion (Particle exchange)
        if (this.diffusionSystem) {
            const pos = this.diffusionSystem.geometry.attributes.position.array;
            const speeds = this.diffusionSystem.geometry.attributes.speed.array;
            for (let i = 0; i < pos.length / 3; i++) {
                // Diffusion slows down drastically as norm increases (Obstruction)
                const flow = speeds[i] * (1.2 - norm * 1.0);
                pos[i * 3] += flow;
                if (pos[i * 3] > 2.5) pos[i * 3] = -2.5;
            }
            this.diffusionSystem.geometry.attributes.position.needsUpdate = true;
            // Diffusion color shift (White to Dull Grey)
            this.diffusionSystem.material.color.setHSL(0, 0, 1.0 - norm * 0.5);
        }

        this.drawECG(dt, norm);

        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    },

    drawECG: function (dt, norm) {
        if (!this.els.ecgCanvas) return;
        const ctx = this.els.ecgCanvas.getContext('2d');
        const w = this.els.ecgCanvas.width;
        const h = this.els.ecgCanvas.height;

        // Trace logic
        ctx.fillStyle = 'rgba(11, 17, 33, 0.15)'; // Trail effect
        ctx.fillRect(0, 0, w, h);

        const x = (this.state.time * 60) % w;
        const hr = 1.0 + norm * 2.5; // Heart rate increases with pressure

        // Simulating a QRS spike
        let spike = 0;
        const cycle = (this.state.time * hr) % 1.0;
        if (cycle > 0.95) spike = (cycle - 0.95) * 600;

        const y = (h / 2) - spike + Math.sin(this.state.time * 20) * 2;

        ctx.beginPath();
        ctx.strokeStyle = norm > 0.5 ? '#f87171' : '#4ade80';
        ctx.lineWidth = 2;
        ctx.moveTo(x - 2, h / 2);
        ctx.lineTo(x, y);
        ctx.stroke();
    },

    updateDetectScore: function (trVel, raArea, bnp) {
        const simInputs = {
            fvc_dlco: 1.6,
            telang: true,
            aca: true,
            ntprobnp: bnp,
            urate: 5.0,
            rad: false,
            ra_area: raArea,
            tr_vel: trVel
        };

        if (window.DETECT) {
            const s1 = window.DETECT.calculateStep1Points(simInputs);
            const s2 = window.DETECT.calculateStep2Points(s1.total, raArea, trVel);
            if (this.els.detectScore) this.els.detectScore.textContent = s2.total;
            if (this.els.detectDecision) {
                if (s2.total > 35) {
                    this.els.detectDecision.textContent = "ALERTE HAUT RISQUE";
                    this.els.detectDecision.className = "live-decision decision-danger";
                    this.els.detectDecision.style.background = "#e11d48";
                } else {
                    this.els.detectDecision.textContent = "Risque Faible";
                    this.els.detectDecision.className = "live-decision decision-safe";
                    this.els.detectDecision.style.background = "#475569";
                }
            }
        }
    }
};

window.Physio = Physio;
console.log("Physio Advanced Engine Loaded");
