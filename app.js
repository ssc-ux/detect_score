/**
 * DETECT App Controller
 * Handles UI interactions, input collection, and result display.
 */

// Global Error Handler for this script
try {

    // DOM Elements Cache
    function getEls() {
        return {
            step1: {
                card: document.getElementById('step1-card'),
                inputs: {
                    fvc: document.getElementById('fvc'),
                    dlco: document.getElementById('dlco'),
                    telang: document.getElementById('telang'),
                    aca: document.getElementById('aca'),
                    ntprobnp: document.getElementById('ntprobnp'),
                    urate: document.getElementById('urate'),
                    urate_unit: document.getElementById('urate_unit'),
                    rad: document.getElementById('rad')
                },
                badges: {
                    fvc_dlco: document.getElementById('pts-fvc_dlco'),
                    telang: document.getElementById('pts-telang'),
                    aca: document.getElementById('pts-aca'),
                    ntprobnp: document.getElementById('pts-ntprobnp'),
                    urate: document.getElementById('pts-urate'),
                    rad: document.getElementById('pts-rad')
                },
                btn: document.getElementById('calc-step1'),
                resultBox: document.getElementById('result-step1'),
                gaugeBar: document.getElementById('s1-gauge-cursor'),
                pointsVal: document.getElementById('s1-points-val'),
                decision: document.getElementById('s1-decision'),
                exactScore: document.getElementById('s1-exact-score'),
                exactProb: document.getElementById('s1-exact-prob')
            },
            step2: {
                card: document.getElementById('step2-card'),
                inputs: {
                    ra: document.getElementById('ra_area'),
                    tr: document.getElementById('tr_vel')
                },
                badges: {
                    ra_area: document.getElementById('pts-ra_area'),
                    tr_vel: document.getElementById('pts-tr_vel')
                },
                btn: document.getElementById('calc-step2'),
                resultBox: document.getElementById('result-step2'),
                gaugeBar: document.getElementById('s2-gauge-cursor'),
                pointsVal: document.getElementById('s2-points-val'),
                decision: document.getElementById('s2-decision'),
                exactScore: document.getElementById('s2-exact-score'),
                exactProb: document.getElementById('s2-exact-prob'),
                rec: document.getElementById('final-recommendation')
            },
            bypassS2: {
                container: document.getElementById('bypass-s2-area'),
                btn: document.getElementById('btn-force-s2')
            },
            resetBtn: document.getElementById('reset-form'),
            step1CarriedScore: document.getElementById('step1-carried-score'),
            physio: {
                slider: document.getElementById('paps-slider'),
                valText: document.getElementById('paps-val'),
                stageTitle: document.getElementById('stage-title'),
                stageDesc: document.getElementById('stage-desc'),
                rvWall: document.getElementById('rv-wall-path'),
                lvWall: document.getElementById('lv-wall-path'),
                septumWall: document.getElementById('septum-wall-path'),
                rvCavity: document.getElementById('rv-cavity-path'),
                lvCavity: document.getElementById('lv-cavity-path'),
                trJet: document.getElementById('tr-jet')
            }
        };
    }

    let step1Result = null;
    let els = {}; // Populated in init

    // --- MAIN INIT ---
    function init() {
        console.log("App Init Started...");
        els = getEls(); // Populate elements

        // 1. Modal Logic (Priority)
        initModal();

        // 2. Tab Navigation
        initTabs();

        // 3. UI Reset
        resetUI();

        // 4. Input Listeners
        attachListeners();
    }

    function initModal() {
        const overlay = document.getElementById('beta-modal');
        const closeBtn = document.getElementById('close-modal');
        if (closeBtn && overlay) {
            closeBtn.onclick = function (e) {
                e.preventDefault();
                overlay.style.display = 'none';
            };
        }
    }

    function initTabs() {
        const tabs = document.querySelectorAll('.tab-btn');
        const contents = document.querySelectorAll('.tab-content');

        if (tabs.length === 0) console.warn("No tabs found!");

        tabs.forEach(tab => {
            tab.onclick = function () {
                // UI Toggle
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));

                this.classList.add('active');

                const targetId = this.getAttribute('data-tab');
                const targetEl = document.getElementById(targetId);
                if (targetEl) targetEl.classList.add('active');
            };
        });
    }

    function resetUI() {
        document.querySelectorAll('input[type="number"]').forEach(i => i.value = '');
        document.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = false);
        document.querySelectorAll('.points-value').forEach(b => b.textContent = '--');
        document.querySelectorAll('.result-box').forEach(b => b.classList.add('hidden'));

        if (els.step2.card) els.step2.card.classList.add('hidden');
        if (els.bypassS2.container) els.bypassS2.container.classList.add('hidden');

        // Reset gauges
        if (els.step1.gaugeBar) els.step1.gaugeBar.style.left = '0%';
        if (els.step2.gaugeBar) els.step2.gaugeBar.style.left = '0%';
    }

    function attachListeners() {
        if (els.step1.btn) els.step1.btn.onclick = runStep1;
        if (els.step2.btn) els.step2.btn.onclick = runStep2;
        if (els.bypassS2.btn) els.bypassS2.btn.onclick = function () {
            els.step2.card.classList.remove('hidden');
            els.step2.card.scrollIntoView({ behavior: "smooth" });
            els.bypassS2.container.classList.add('hidden');
        };
        if (els.resetBtn) els.resetBtn.onclick = resetForm;

        // Live updates
        if (els.step1.inputs.fvc) {
            Object.values(els.step1.inputs).forEach(inp => {
                if (inp) inp.addEventListener('input', updateLiveStep1);
            });
        }
        if (els.step2.inputs.ra) {
            Object.values(els.step2.inputs).forEach(inp => {
                if (inp) inp.addEventListener('input', updateLiveStep2);
            });
        }

        // 5. Physio Slider Listener
        if (els.physio.slider) {
            els.physio.slider.addEventListener('input', updatePhysioViz);
            updatePhysioViz(); // Initial state
        }
    }

    function resetForm() {
        // Reset all inputs
        document.querySelectorAll('input[type="number"]').forEach(i => i.value = '');
        document.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = false);
        document.querySelectorAll('.points-value').forEach(b => {
            b.textContent = '--';
            b.classList.remove('active');
            b.style.color = '';
        });

        // Hide result boxes
        document.querySelectorAll('.result-box').forEach(b => b.classList.add('hidden'));
        if (els.step2.card) els.step2.card.classList.add('hidden');
        if (els.bypassS2.container) els.bypassS2.container.classList.add('hidden');

        // Reset gauges
        if (els.step1.gaugeBar) els.step1.gaugeBar.style.left = '0%';
        if (els.step2.gaugeBar) els.step2.gaugeBar.style.left = '0%';

        // Reset Step 1 result
        step1Result = null;
        if (els.step1CarriedScore) els.step1CarriedScore.textContent = '--';

        // Scroll to top
        els.step1.card.scrollIntoView({ behavior: "smooth" });
    }

    function updatePhysioViz() {
        const paps = parseInt(els.physio.slider.value);
        els.physio.valText.textContent = paps;

        // Medical descriptions
        let stage = { title: "", desc: "", color: "" };
        if (paps < 40) {
            stage = {
                title: "Cœur Normal (Pression Basse)",
                desc: "Hémodynamique normale. Le VD est de faible épaisseur et éjecte sans contrainte. Le septum est courbé vers le VD (concavité normale).",
                color: "#2ecc71"
            };
        } else if (paps < 55) {
            stage = {
                title: "Phase Compensatrice (Hypertrophie)",
                desc: "Le muscle du VD s'épaissit (hypertrophie concentrique) pour lutter contre la post-charge. La fonction systolique est préservée. Début d'aplatissement septal.",
                color: "#f39c12"
            };
        } else if (paps < 75) {
            stage = {
                title: "Décompensation & Dilatation",
                desc: "Le mécanisme de Frank-Starling est dépassé. Le VD se dilate, l'anneau tricuspide s'élargit (fuite). Le septum devient paradoxal.",
                color: "#e67e22"
            };
        } else {
            stage = {
                title: "Insuffisance Cardiaque Droite Sévère",
                desc: "Ventricule droit sphérique et hypokinétique. Compression majeure du VG ('D-shape') réduisant le débit cardiaque. Risque vital.",
                color: "#c0392b"
            };
        }

        els.physio.stageTitle.textContent = stage.title;
        els.physio.stageDesc.textContent = stage.desc;
        els.physio.stageTitle.style.color = stage.color;

        // Normalized 0 to 1
        const t = (paps - 30) / (70); // 30 to 100 range

        // --- PATH MORPHING MATH FOR MEDICAL SVG ---

        // 1. RV Wall Morphing (Thickening + Dilation)
        // Outer Curve Control Point X: Starts at 120, moves out to 80 (dilation)
        // Inner Curve (Cavity) Control Point X: Starts at 135, moves out to 90 (dilation)
        // BUT thickness (gap) increases then decreases (thinning in failure)

        const dilationFactor = t * 60; // Max 60px expansion
        const hypertrophyFactor = t < 0.5 ? t * 15 : (0.5 * 15) - ((t - 0.5) * 5); // Thicken then thin

        const rvOuterControlX = 120 - dilationFactor;
        const rvInnerControlX = 135 - dilationFactor + hypertrophyFactor; // Less shift = thicker wall

        // RV Wall Path
        els.physio.rvWall.setAttribute('d',
            `M 160,200 Q ${rvOuterControlX},200 ${rvOuterControlX},300 Q ${rvOuterControlX},380 230,350 L 230,200 Z`
        );
        // RV Cavity Path
        els.physio.rvCavity.setAttribute('d',
            `M 160,200 Q ${rvInnerControlX},200 ${rvInnerControlX},300 Q ${rvInnerControlX},360 230,350 L 230,200 Z`
        );

        // 2. Septum Shift (The hallmark of PH)
        // Normal: Curves towards RV (Control X ~ 210)
        // Flat: Control X ~ 230
        // D-Shape/Inverted: Control X ~ 280 (Invading LV)

        const septumShift = t * 70; // 0 -> 70
        const septControlX = 210 + septumShift;

        // Septum Wall Path
        els.physio.septumWall.setAttribute('d',
            `M 230,180 Q ${septControlX},280 230,350 L 245,350 Q ${septControlX + 15},280 260,180 Z`
        );

        // 3. LV Compression (Cavity reduced by Septum)
        // LV Outer wall stays relatively stable or shrinks slightly due to low filling
        const lvOuterControl = 350 - (t * 10);

        // LV Cavity Path
        // Inner edge follows septum+thickness
        els.physio.lvCavity.setAttribute('d',
            `M 260,180 Q ${lvOuterControl},180 ${lvOuterControl},320 Q ${lvOuterControl},390 290,380 Q 250,390 245,350 L 245,180 Z`
        );

        // 4. TR Jet Animation
        if (paps > 45) {
            els.physio.trJet.style.opacity = (paps - 45) / 55;
            els.physio.trJet.setAttribute('stroke-width', (paps - 45) / 10);
        } else {
            els.physio.trJet.style.opacity = 0;
            els.physio.trJet.setAttribute('stroke-width', 0);
        }
    }

    // --- CALCULATION LOGIC ---

    function getUrateInMgDl() {
        let val = parseFloat(els.step1.inputs.urate.value);
        const unit = els.step1.inputs.urate_unit.value;
        if (isNaN(val)) return 0;
        if (unit === 'umol') val = val / 59.48;
        return val;
    }

    function getStep1Inputs() {
        const fvc = parseFloat(els.step1.inputs.fvc.value);
        const dlco = parseFloat(els.step1.inputs.dlco.value);
        let ratio = 1.0;
        if (!isNaN(fvc) && !isNaN(dlco) && dlco !== 0) {
            ratio = fvc / dlco;
        }

        const inputs = {
            fvc_dlco: ratio,
            telang: els.step1.inputs.telang.checked,
            aca: els.step1.inputs.aca.checked,
            ntprobnp: parseFloat(els.step1.inputs.ntprobnp.value) || 0,
            urate: getUrateInMgDl(),
            rad: els.step1.inputs.rad.checked
        };
        // Safety for log stats
        if (inputs.ntprobnp < 1) inputs.ntprobnp = 1;

        return inputs;
    }

    function updateLiveStep1() {
        if (!window.DETECT) return;
        const inputs = getStep1Inputs();
        const points = window.DETECT.calculateStep1Points(inputs);

        const fvc = parseFloat(els.step1.inputs.fvc.value);
        const dlco = parseFloat(els.step1.inputs.dlco.value);
        if (!isNaN(fvc) && !isNaN(dlco)) {
            els.step1.badges.fvc_dlco.textContent = `${points.details.fvc_dlco} pts`;
            els.step1.badges.fvc_dlco.classList.add('active');
        } else {
            els.step1.badges.fvc_dlco.textContent = '--';
            els.step1.badges.fvc_dlco.classList.remove('active');
        }

        updateBadge(els.step1.badges.telang, points.details.telang, els.step1.inputs.telang.checked);
        updateBadge(els.step1.badges.aca, points.details.aca, els.step1.inputs.aca.checked);

        if (els.step1.inputs.ntprobnp.value) {
            updateBadge(els.step1.badges.ntprobnp, points.details.ntprobnp, true);
        } else {
            updateBadge(els.step1.badges.ntprobnp, 0, false);
        }

        if (els.step1.inputs.urate.value) {
            updateBadge(els.step1.badges.urate, points.details.urate, true);
        } else {
            updateBadge(els.step1.badges.urate, 0, false);
        }

        updateBadge(els.step1.badges.rad, points.details.rad, els.step1.inputs.rad.checked);
    }

    function updateBadge(el, points, isActive) {
        if (isActive) {
            el.textContent = `${points} pts`;
            el.classList.add('active');
            if (points > 0) el.style.color = 'var(--primary-color)';
        } else {
            el.textContent = '--';
            el.classList.remove('active');
            el.style.color = '';
        }
    }

    function updateLiveStep2() {
        if (!window.DETECT) return;
        const ra = parseFloat(els.step2.inputs.ra.value) || 0;
        const tr = parseFloat(els.step2.inputs.tr.value) || 0;

        // We pass 0 for Step 1 Score just to get component points
        const points = window.DETECT.calculateStep2Points(0, ra, tr);

        if (els.step2.inputs.ra.value) updateBadge(els.step2.badges.ra_area, points.details.ra_area, true);
        else updateBadge(els.step2.badges.ra_area, 0, false);

        if (els.step2.inputs.tr.value) updateBadge(els.step2.badges.tr_vel, points.details.tr_vel, true);
        else updateBadge(els.step2.badges.tr_vel, 0, false);
    }

    function runStep1() {
        const inputs = getStep1Inputs();

        if ((!els.step1.inputs.fvc.value || !els.step1.inputs.dlco.value) && !confirm("Certaines valeurs (CVF/DLCO) semblent manquantes. Continuer ?")) {
            return;
        }

        const result = window.DETECT.calculateStep1Points(inputs);
        step1Result = result;

        els.step1.resultBox.classList.remove('hidden');
        els.step1.pointsVal.textContent = result.total;

        // Gauge Animation
        const maxPoints = 500; // Step 1 theoretical max is around 500-600
        let pct = (result.total / maxPoints) * 100;
        if (pct > 100) pct = 100;
        if (els.step1.gaugeBar) {
            els.step1.gaugeBar.style.left = pct + '%';
        }

        // Decision Display
        const statusClass = result.isHighRisk ? 'danger' : 'safe';
        const label = result.isHighRisk ? 'RISQUE ÉLEVÉ' : 'RISQUE FAIBLE';
        // Add color dot
        const icon = `<span class="status-indicator ${statusClass}"></span>`;

        els.step1.decision.innerHTML = `${icon} ${label} (Seuil > 300)`;

        // Populate precise values
        if (els.step1.exactScore) els.step1.exactScore.textContent = result.linearScore.toFixed(2);
        if (els.step1.exactProb) {
            const prob = 1 / (1 + Math.exp(-result.linearScore));
            els.step1.exactProb.textContent = (prob * 100).toFixed(1);
        }

        if (result.isHighRisk) {
            els.step2.card.classList.remove('hidden');
            // Display Step 1 score in Step 2 card
            if (els.step1CarriedScore) els.step1CarriedScore.textContent = result.total;
            setTimeout(() => els.step2.card.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
            els.bypassS2.container.classList.add('hidden');
        } else {
            els.step2.card.classList.add('hidden');
            els.bypassS2.container.classList.remove('hidden');
            // Also update for bypass case
            if (els.step1CarriedScore) els.step1CarriedScore.textContent = result.total;
        }
    }

    function runStep2() {
        if (!step1Result) {
            alert("Veuillez d'abord calculer l'étape 1.");
            return;
        }
        const inputs = {
            ra_area: parseFloat(els.step2.inputs.ra.value) || 0,
            tr_vel: parseFloat(els.step2.inputs.tr.value) || 0
        };

        const result = window.DETECT.calculateStep2Points(step1Result.total, inputs.ra_area, inputs.tr_vel);

        els.step2.resultBox.classList.remove('hidden');
        els.step2.pointsVal.textContent = result.total;

        // Gauge Animation
        const maxPoints = 80;
        let pct = (result.total / maxPoints) * 100;
        if (pct > 100) pct = 100;
        if (els.step2.gaugeBar) {
            els.step2.gaugeBar.style.left = pct + '%';
        }

        const statusClass = result.isReferral ? 'danger' : 'safe';
        const label = result.isReferral ? 'CATHÉTÉRISME INDIQUÉ' : 'CATHÉTÉRISME NON INDIQUÉ';
        const icon = `<span class="status-indicator ${statusClass}"></span>`;

        if (els.step2.exactScore) els.step2.exactScore.textContent = result.linearScore.toFixed(2);
        if (els.step2.exactProb) els.step2.exactProb.textContent = (result.probability * 100).toFixed(1);

        // Display decision with icon
        els.step2.decision.innerHTML = `${icon} ${label} (Seuil > 35)`;

        if (result.isReferral) {
            els.step2.rec.textContent = "Indication de Cathétérisme Cardiaque Droit : Le patient présente un risque significatif d'HTAP.";
        } else {
            els.step2.rec.textContent = "Surveillance annuelle : Le risque d'HTAP est actuellement faible sous le seuil de décision.";
        }
    }

    // FIRE INIT DIRECTLY
    init();

} catch (err) {
    console.error("FATAL APP ERROR:", err);
}
