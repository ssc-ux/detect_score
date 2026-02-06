/**
 * DETECT Physio-Engine
 * Vector-based Heart Simulation & Hemodynamic Calculator
 */

const Physio = {
    els: {
        slider: null,
        valDisplay: null,
        heart: {
            septum: null,
            ra: null,
            rv: null,
            jet: null,
            jetParticles: null
        },
        data: {
            trVel: null,
            raArea: null,
            bnp: null,
            dlco: null,
            ecgAxis: null
        },
        detectScore: null
    },

    state: {
        paps: 25 // Default mmHg
    },

    init: function () {
        this.els.slider = document.getElementById('master-paps');
        this.els.valDisplay = document.getElementById('paps-val');

        // Heart SVG Elements
        this.els.heart.septum = document.getElementById('svg-septum');
        this.els.heart.ra = document.getElementById('svg-ra');
        this.els.heart.jet = document.getElementById('svg-tr-jet');
        this.els.heart.jetParticles = document.querySelectorAll('.jet-particle');

        // Data Display Elements
        this.els.data.trVel = document.getElementById('phy-tr-vel');
        this.els.data.raArea = document.getElementById('phy-ra-area');
        this.els.data.bnp = document.getElementById('phy-bnp');
        this.els.detectScore = document.getElementById('phy-detect-score');
        this.els.detectDecision = document.getElementById('phy-detect-decision');

        if (this.els.slider) {
            this.els.slider.addEventListener('input', (e) => {
                this.state.paps = parseInt(e.target.value);
                this.update();
            });
            // Initial call
            this.update();
        }
    },

    update: function () {
        // 1. Calculate Hemodynamics based on PAPs
        const paps = this.state.paps;
        this.els.valDisplay.textContent = paps;

        // Approx formula: RAP increases slightly with PAPs in failure
        const rap = 5 + (Math.max(0, paps - 25) * 0.15);

        // Bernoulli: dP = 4v^2  =>  v = sqrt(dP / 4)
        // dP = PAPs - RAP
        const dP = Math.max(0, paps - rap);
        const trVel = Math.sqrt(dP / 4); // m/s (! Simplified Bernoulli)
        // Note: Real formula v = sqrt( (PAPs - RAP) / 4 ) is correct approximation.

        // RA Area: Dilates with pressure
        // Base 16cm2. Max at ~45cm2
        let raArea = 16 + (Math.max(0, paps - 25) * 0.4);

        // NT-proBNP: Wall stress. Exponential.
        let bnp = 100 + Math.exp(paps * 0.08);
        if (bnp > 3000) bnp = 3000 + (paps * 10); // Linear cap for extreme values

        // 2. Update Visuals (SVG Manipulation)
        this.animateHeart(paps, trVel);

        // 3. Update Data Panel
        this.els.data.trVel.textContent = trVel.toFixed(1);
        this.els.data.raArea.textContent = raArea.toFixed(1);
        this.els.data.bnp.textContent = Math.round(bnp);

        // 4. Update DETECT Score (Live Calculation)
        this.updateDetectScore(trVel, raArea, bnp);
    },

    animateHeart: function (paps, trVel) {
        // A. SEPTUM PARADOX
        // Normal curvature vs Flattened vs Paradoxical (Inverted)
        // SVG Path Q control point manipulation
        // Format: M x,y Q cx,cy x,y
        // Normal cx for Septum ~ 140. Paradoxical moves towards LV (left < 140)

        /* 
           Assuming SVG Septum Path like: M 100,50 Q 140,100 100,150 
           Standard curve to right (into RV) is normal (LV pressure > RV pressure).
           As RV pressure rises, curve flattens (cx decreases).
        */

        // Map 20-100mmHg to Curve Factor
        // 20mmHg -> Cx 140 (Normal)
        // 80mmHg -> Cx 100 (Flat/Inverted)
        const maxDeflection = 40; // Pixels to move
        const pressureFactor = Math.min(1, Math.max(0, (paps - 20) / 80));
        const currentCx = 140 - (pressureFactor * maxDeflection * 1.5);

        if (this.els.heart.septum) {
            // Example path construction, ajust to match actual SVG coordinates provided in HTML
            this.els.heart.septum.setAttribute('d', `M 100,60 Q ${currentCx},120 100,180`);
        }

        // B. RA DILATION (Scale)
        if (this.els.heart.ra) {
            // Scale varies from 1.0 to 1.5
            const scale = 1 + (Math.max(0, paps - 30) * 0.008);
            // Transform origin should be set in CSS or attribute
            this.els.heart.ra.style.transform = `scale(${scale})`;
        }

        // C. TR JET ANIMATION
        // Color: Blue (Low Vel) -> Yellow -> Red (High Vel)
        // Opacity/Length: Increases with pressure
        // Speed: Animation duration decreases

        const hue = Math.max(0, 240 - (trVel * 60)); // 240(Blue) -> 0(Red) at 4m/s
        const color = `hsl(${hue}, 100%, 50%)`;

        this.els.heart.jetParticles.forEach(p => {
            p.style.stroke = color;
            // Speed: 2s (slow) -> 0.2s (fast)
            const dur = Math.max(0.2, 2 - (trVel * 0.5));
            p.style.animationDuration = `${dur}s`;
            p.style.opacity = trVel > 1.5 ? 0.8 : 0.3;
        });
    },

    updateDetectScore: function (trVel, raArea, bnp) {
        // Use Global DETECT logic
        // We simulate "Step 2" Score primarily, assuming some fixed Step 1 stats 
        // OR we recalculate everything based on "Simulated Patient" defaults.

        const simInputs = {
            fvc_dlco: 1.6, // Default
            telang: true,
            aca: true,
            ntprobnp: bnp,
            urate: 5.0,
            rad: false, // Could link to paps
            ra_area: raArea,
            tr_vel: trVel
        };

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
};

window.Physio = Physio;
