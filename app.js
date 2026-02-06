/**
 * DETECT App Controller
 * Handles UI interactions, input collection, and result display.
 */

// Global Error Handler for this script
try {

    const THRESHOLDS = {
        STEP1_PROB: 0.05,
        STEP2_PROB: 0.10
    };

    // DOM Elements Cache
    // We use a function to get them fresh to ensure DOM is ready
    function getEls() {
        return {
            step1: {
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
                pointsVal: document.getElementById('s1-points-val'),
                decision: document.getElementById('s1-decision')
            },
            step2: {
                section: document.getElementById('step2'),
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
                pointsVal: document.getElementById('s2-points-val'),
                decision: document.getElementById('s2-decision'),
                rec: document.getElementById('final-recommendation'),
                recBox: document.getElementById('s2-rec-box')
            },
            bypassS2: {
                container: document.getElementById('bypass-s2-area'),
                btn: document.getElementById('btn-force-s2')
            },
            s1Bars: {
                points: document.getElementById('s1-points-bar')
            },
            s2Bars: {
                points: document.getElementById('s2-points-bar')
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

        // 5. Physio Engine (Safe Mode)
        if (window.Physio) {
            try {
                window.Physio.init();
            } catch (e) {
                console.error("Physio Init Error:", e);
            }
        }
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
        document.querySelectorAll('.points-badge').forEach(b => b.textContent = '');

        if (els.step1.resultBox) els.step1.resultBox.classList.add('hidden');
        if (els.step2.section) els.step2.section.classList.add('hidden');
    }

    function attachListeners() {
        if (els.step1.btn) els.step1.btn.onclick = runStep1;
        if (els.step2.btn) els.step2.btn.onclick = runStep2;
        if (els.bypassS2.btn) els.bypassS2.btn.onclick = function () {
            els.step2.section.classList.remove('hidden');
            els.step2.section.scrollIntoView({ behavior: "smooth" });
            els.bypassS2.container.classList.add('hidden');
        };

        // Live updates
        // Using event delegation or direct attach if inputs exist
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
            els.step1.badges.fvc_dlco.textContent = `+${points.details.fvc_dlco} pts`;
        } else {
            els.step1.badges.fvc_dlco.textContent = '';
        }

        els.step1.badges.telang.textContent = `+${points.details.telang} pts`;
        els.step1.badges.aca.textContent = `+${points.details.aca} pts`;

        if (els.step1.inputs.ntprobnp.value) els.step1.badges.ntprobnp.textContent = `+${points.details.ntprobnp} pts`;
        else els.step1.badges.ntprobnp.textContent = '';

        if (els.step1.inputs.urate.value) els.step1.badges.urate.textContent = `+${points.details.urate} pts`;
        else els.step1.badges.urate.textContent = '';

        els.step1.badges.rad.textContent = `+${points.details.rad} pts`;
    }

    function updateLiveStep2() {
        if (!window.DETECT) return;
        const ra = parseFloat(els.step2.inputs.ra.value) || 0;
        const tr = parseFloat(els.step2.inputs.tr.value) || 0;
        const points = window.DETECT.calculateStep2Points(0, ra, tr);

        if (els.step2.inputs.ra.value) els.step2.badges.ra_area.textContent = `+${points.details.ra_area} pts`;
        else els.step2.badges.ra_area.textContent = '';

        if (els.step2.inputs.tr.value) els.step2.badges.tr_vel.textContent = `+${points.details.tr_vel} pts`;
        else els.step2.badges.tr_vel.textContent = '';
    }

    function runStep1() {
        const inputs = getStep1Inputs();

        // Calculate
        const result = window.DETECT.calculateStep1Exact(inputs);
        const points = window.DETECT.calculateStep1Points(inputs);

        step1Result = result;
        step1Result.points = points.total;

        // Display
        els.step1.resultBox.classList.remove('hidden');
        els.step1.pointsVal.textContent = points.total;

        updateBar(els.s1Bars.points, points.total, 300, 600);

        const isHighRisk = result.refer_to_echo;

        if (isHighRisk) {
            els.step1.decision.textContent = "REFERRER À L'ÉCHO (Risque Élevé)";
            els.step1.decision.className = "score-decision decision-danger";
            els.step2.section.classList.remove('hidden');
            els.step2.section.scrollIntoView({ behavior: "smooth", block: "start" });
            els.bypassS2.container.classList.add('hidden');
        } else {
            els.step1.decision.textContent = "SURVEILLANCE (Risque Faible)";
            els.step1.decision.className = "score-decision decision-safe";
            els.step2.section.classList.add('hidden');
            els.bypassS2.container.classList.remove('hidden');
        }
    }

    function runStep2() {
        if (!step1Result) return;

        const inputs = {
            ra_area: parseFloat(els.step2.inputs.ra.value) || 0,
            tr_vel: parseFloat(els.step2.inputs.tr.value) || 0
        };

        const resPoints = window.DETECT.calculateStep2Points(step1Result.points, inputs.ra_area, inputs.tr_vel);

        els.step2.resultBox.classList.remove('hidden');
        els.step2.pointsVal.textContent = resPoints.total;

        updateBar(els.s2Bars.points, resPoints.total, 35, 100);

        const isReferral = resPoints.total > 35;

        if (isReferral) {
            els.step2.decision.textContent = "CATHÉTÉRISME DROIT INDIQUÉ";
            els.step2.decision.className = "score-decision decision-danger";
            els.step2.rec.textContent = "Le patient présente un risque élevé d'HTAP confirmée. Un cathétérisme cardiaque droit (RHC) est recommandé selon l'algorithme DETECT.";
        } else {
            els.step2.decision.textContent = "PAS D'INDICATION RHC IMMÉDIATE";
            els.step2.decision.className = "score-decision decision-safe";
            els.step2.rec.textContent = "Le risque calculé est faible. Continuer la surveillance annuelle.";
        }

        els.step2.recBox.style.display = 'block';
    }

    function updateBar(barEl, value, threshold, max) {
        if (!barEl) return;
        let percent = (value / max) * 100;
        if (percent > 100) percent = 100;
        if (percent < 0) percent = 0;
        barEl.style.width = percent + '%';
        barEl.style.backgroundColor = value > threshold ? 'var(--danger-color)' : 'var(--success-color)';
    }

    // FIRE INIT DIRECTLY
    init();

} catch (err) {
    console.error("FATAL APP ERROR:", err);
}
