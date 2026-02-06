/**
 * DETECT Physio-Engine 3D (Three.js)
 * Real-time Physiological Simulation of PAH
 */

const Physio = {
    els: {
        slider: null,
        valDisplay: null,
        container: null,
        data: {
            trVel: null,
            raArea: null,
            bnp: null
        },
        detectScore: null,
        detectDecision: null
    },

    state: {
        paps: 25, // mmHg
        isInit: false
    },

    scene: null,
    camera: null,
    renderer: null,
    clock: null,

    // Meshes
    rvMesh: null,
    raMesh: null,
    septumMesh: null,

    // Uniforms for Shaders
    uniforms: {
        uTime: { value: 0 },
        uPaps: { value: 0.0 } // Normalized 0-1 (20-100 mmHg)
    },

    init: function () {
        if (this.state.isInit) return;

        console.log("Initializing 3D Physio Engine...");

        // DOM Elements
        this.els.slider = document.getElementById('master-paps');
        this.els.valDisplay = document.getElementById('paps-val');
        this.els.container = document.getElementById('heart-3d-container');

        this.els.data.trVel = document.getElementById('phy-tr-vel');
        this.els.data.raArea = document.getElementById('phy-ra-area');
        this.els.data.bnp = document.getElementById('phy-bnp');
        this.els.detectScore = document.getElementById('phy-detect-score');
        this.els.detectDecision = document.getElementById('phy-detect-decision');

        // Setup Three.js Scene
        this.setupScene();

        // Add Listeners
        if (this.els.slider) {
            this.els.slider.addEventListener('input', (e) => {
                this.state.paps = parseInt(e.target.value);
                this.updatePaps();
            });
            // Initial trigger
            this.updatePaps();
        }

        // Start Loop
        this.state.isInit = true;
        this.animate();
    },

    setupScene: function () {
        const width = this.els.container.clientWidth;
        const height = this.els.container.clientHeight;

        // 1. Scene & Camera
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b1121); // Dark blue/black medical bg without fog artifacts
        this.scene.fog = new THREE.FogExp2(0x0b1121, 0.02);

        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        this.camera.position.set(0, 0, 12);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.els.container.appendChild(this.renderer.domElement);

        this.clock = new THREE.Clock();

        // 2. Lights
        const ambLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambLight);

        const dirLight = new THREE.DirectionalLight(0xaaccff, 0.8);
        dirLight.position.set(5, 5, 5);
        this.scene.add(dirLight);

        const rimLight = new THREE.SpotLight(0xff4444, 2);
        rimLight.position.set(-5, 2, 0);
        this.scene.add(rimLight);

        // 3. Create Heart Components
        this.createHeartMaterials();
        this.createRightVentricle();
        this.createRightAtrium();
        this.createSeptum();

        // Resize Handler
        window.addEventListener('resize', () => {
            if (this.els.container && this.camera && this.renderer) {
                const w = this.els.container.clientWidth;
                const h = this.els.container.clientHeight;
                this.renderer.setSize(w, h);
                this.camera.aspect = w / h;
                this.camera.updateProjectionMatrix();
            }
        });
    },

    createHeartMaterials: function () {
        // Shared Uniforms
        this.uniforms = {
            uTime: { value: 0 },
            uPapsNorm: { value: 0.0 }, // 0 (20mmHg) to 1 (100mmHg)
            uBaseColor: { value: new THREE.Color(0x3b82f6) }, // Blue
            uStressColor: { value: new THREE.Color(0xef4444) } // Red
        };

        // Custom Vertex Shader for Pulsation & Deformation
        const vShader = `
            uniform float uTime;
            uniform float uPapsNorm;
            varying vec3 vNormal;
            varying vec3 vPosition;
            varying float vGlow;

            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = position;
                
                // Beat Logic
                float beat = sin(uTime * 4.0) * 0.02; // Normal beat
                
                // Deformation Logic
                vec3 newPos = position;
                
                // Hypertrophy/Dilation (Simple radial expansion)
                // At high pressure, expand outward
                float dilation = uPapsNorm * 0.3; 
                
                newPos += normal * (beat + dilation);

                // Pass for Rim lighting
                vec3 viewVector = normalize(cameraPosition - (modelMatrix * vec4(newPos, 1.0)).xyz);
                vGlow = 1.0 - dot(vNormal, viewVector);
                vGlow = pow(vGlow, 3.0);

                gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
            }
        `;

        const fShader = `
            uniform vec3 uBaseColor;
            uniform vec3 uStressColor;
            uniform float uPapsNorm;
            varying float vGlow;

            void main() {
                // Color Morph: Blue -> Red based on pressure
                vec3 finalColor = mix(uBaseColor, uStressColor, uPapsNorm);
                
                // Alpha/Glow logic for "Glass" look
                float alpha = 0.3 + (vGlow * 0.7);
                
                gl_FragColor = vec4(finalColor + (vGlow * 0.5), alpha);
            }
        `;

        this.heartMaterial = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: vShader,
            fragmentShader: fShader,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false, // For transparency sorting
            blending: THREE.AdditiveBlending
        });
    },

    createRightVentricle: function () {
        // RV is roughly a triangular/crescent shape. We'll use a deformed Sphere.
        // Geometry
        const geo = new THREE.SphereGeometry(1.5, 64, 64);

        // Deform geometry initially to look less like a beach ball
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const z = pos.getZ(i);

            // Elongate slightly in Y
            pos.setY(i, y * 1.4);
            // Flatten slightly in Z (anterior-posterior)
            pos.setZ(i, z * 0.8);
        }
        geo.computeVertexNormals();

        this.rvMesh = new THREE.Mesh(geo, this.heartMaterial);
        this.rvMesh.position.set(-0.5, -1, 0);
        this.scene.add(this.rvMesh);
    },

    createRightAtrium: function () {
        const geo = new THREE.SphereGeometry(1.0, 32, 32);
        this.raMesh = new THREE.Mesh(geo, this.heartMaterial);
        this.raMesh.position.set(-1.5, 1.5, -0.5);
        this.scene.add(this.raMesh);
    },

    createSeptum: function () {
        // The Septum is the wall. We represent it as a plane/curved surface between RV and LV (implied)
        // For visual simplicity in this schematic, we might just use the RV inner wall or a separate plane.

        // Let's add a "Jet" effect instead which is more visually striking for TR.
        // Particle System for Blood Flow
        const particleCount = 200;
        const partGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const speeds = new Float32Array(particleCount);

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 0.5; // X center
            positions[i * 3 + 1] = (Math.random() - 0.5) * 2; // Y spread
            positions[i * 3 + 2] = (Math.random() - 0.5) * 0.5; // Z center
            speeds[i] = 0.05 + Math.random() * 0.05;
        }

        partGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        partGeo.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));

        const pMaterial = new THREE.PointsMaterial({
            color: 0x88ccff,
            size: 0.15,
            transparent: true,
            opacity: 0.6
        });

        this.jetSystem = new THREE.Points(partGeo, pMaterial);
        this.jetSystem.position.set(-0.5, 0.5, 0); // Tricuspid valve area
        this.jetSystem.rotation.z = Math.PI / 4; // Jet angle back to RA
        this.scene.add(this.jetSystem);
    },

    updatePaps: function () {
        // Logic Layer (Maths)
        const paps = this.state.paps;
        this.els.valDisplay.textContent = paps;

        // Normalize for Uniforms (20mmHg = 0, 100mmHg = 1)
        const norm = Math.min(1, Math.max(0, (paps - 20) / 80));
        this.uniforms.uPapsNorm.value = norm;

        // --- Hemodynamic Calcs (Same as before) ---
        const rap = 5 + (Math.max(0, paps - 25) * 0.15);
        const dP = Math.max(0, paps - rap);
        const trVel = Math.sqrt(dP / 4);
        let raArea = 16 + (Math.max(0, paps - 25) * 0.4);
        let bnp = 100 + Math.exp(paps * 0.08);
        if (bnp > 3000) bnp = 3000 + (paps * 10);

        // Update Text
        this.els.data.trVel.textContent = trVel.toFixed(1);
        this.els.data.raArea.textContent = raArea.toFixed(1);
        this.els.data.bnp.textContent = Math.round(bnp);

        // Update RA Dilation Mesh Scale specifically
        const raScale = 1 + (norm * 0.8); // Scale up to 1.8x
        if (this.raMesh) this.raMesh.scale.set(raScale, raScale, raScale);

        // Update DETECT Score
        this.updateDetectScore(trVel, raArea, bnp);
    },

    animate: function () {
        requestAnimationFrame(() => this.animate());

        const dt = this.clock.getDelta();
        this.uniforms.uTime.value += dt;

        // Animate Jet Particles
        if (this.jetSystem) {
            const positions = this.jetSystem.geometry.attributes.position.array;
            const speeds = this.jetSystem.geometry.attributes.speed.array;

            // Speed increases with pressure (regurgitant jet velocity)
            // Base speed + pressure modifier
            const speedMod = 1 + (this.uniforms.uPapsNorm.value * 2.0);

            for (let i = 0; i < speeds.length; i++) {
                // Move UP (Y)
                positions[i * 3 + 1] += speeds[i] * speedMod * 10 * dt;

                // Reset if out of bounds
                if (positions[i * 3 + 1] > 2) {
                    positions[i * 3 + 1] = -1;
                    positions[i * 3] = (Math.random() - 0.5) * 0.5;
                    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
                }
            }
            this.jetSystem.geometry.attributes.position.needsUpdate = true;

            // Color shift for Jet
            const colorNorm = this.uniforms.uPapsNorm.value;
            // 0 = Blue, 1 = Red/Yellow
            this.jetSystem.material.color.setHSL(0.6 - (colorNorm * 0.6), 1.0, 0.5);
        }

        this.renderer.render(this.scene, this.camera);
    },

    updateDetectScore: function (trVel, raArea, bnp) {
        // Mock DETECT Calc
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

            this.els.detectScore.textContent = s2.total;

            if (s2.total > 35) {
                this.els.detectDecision.textContent = "ALERTE HAUT RISQUE";
                this.els.detectDecision.style.background = "var(--danger-color)";
                this.els.detectDecision.style.color = "white";
            } else {
                this.els.detectDecision.textContent = "Risque Faible";
                this.els.detectDecision.style.background = "#e2e8f0";
                this.els.detectDecision.style.color = "var(--text-primary)";
            }
        }
    }
};

// Expose
window.Physio = Physio;
console.log("Physio3D Module Loaded");
