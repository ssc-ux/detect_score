/**
 * DETECT App Controller
 * Handles UI interactions, input collection, and result display.
 */

const THRESHOLDS = {
    STEP1_PROB: 0.05, // 5% Risk -> Refer to Echo
    STEP2_PROB: 0.10  // 10% Risk -> Refer to RHC
};

const els = {
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
    modal: {
        overlay: document.getElementById('beta-modal'),
        closeBtn: document.getElementById('close-modal')
    },
    s1Bars: {
        points: document.getElementById('s1-points-bar')
    },
    s2Bars: {
        points: document.getElementById('s2-points-bar')
    }
};

let step1Result = null;

function init() {
    // 0. Force Reset on load (clean state)
    document.querySelectorAll('input[type="number"]').forEach(i => i.value = '');
    document.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = false);

    // Clear badges
    document.querySelectorAll('.points-badge').forEach(b => b.textContent = '');

    els.step1.resultBox.classList.add('hidden');
    els.step2.section.classList.add('hidden');
    els.step2.resultBox.classList.add('hidden');
    els.bypassS2.container.classList.add('hidden');
    els.step2.recBox.style.display = 'none';

    els.step1.btn.addEventListener('click', runStep1);
    els.step2.btn.addEventListener('click', runStep2);

    // Live Listeners
    Object.values(els.step1.inputs).forEach(input => {
        if (!input) return;
        input.addEventListener('input', updateLiveStep1);
        input.addEventListener('change', updateLiveStep1);
    });
    Object.values(els.step2.inputs).forEach(input => {
        if (!input) return;
        input.addEventListener('input', updateLiveStep2);
        input.addEventListener('change', updateLiveStep2);
    });

    els.bypassS2.btn.addEventListener('click', () => {
        els.step2.section.classList.remove('hidden');
        els.step2.section.scrollIntoView({ behavior: "smooth", block: "start" });
        els.bypassS2.container.classList.add('hidden');
    });

    els.modal.closeBtn.addEventListener('click', () => {
        els.modal.overlay.classList.add('closing');
        setTimeout(() => {
            els.modal.overlay.style.display = 'none';
        }, 400);
    });

    initTabs();
    initSimulator();
}

// --- TABS LOGIC ---
function initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Add active
            tab.classList.add('active');
            const target = tab.dataset.tab;
            document.getElementById(target).classList.add('active');
        });
    });
}

// --- SIMULATOR LOGIC ---
const simEls = {
    inputs: {
        ratio: document.getElementById('sim-ratio'),
        telang: document.getElementById('sim-telang'),
        aca: document.getElementById('sim-aca'),
        rad: document.getElementById('sim-rad'),
        bnp: document.getElementById('sim-bnp'),
        urate: document.getElementById('sim-urate'),
        ra: document.getElementById('sim-ra'),
        tr: document.getElementById('sim-tr')
    },
    displays: {
        ratio: document.getElementById('sim-val-ratio'),
        bnp: document.getElementById('sim-val-bnp'),
        urate: document.getElementById('sim-val-urate'),
        ra: document.getElementById('sim-val-ra'),
        tr: document.getElementById('sim-val-tr'),
        total: document.getElementById('sim-total-score'),
        decision: document.getElementById('sim-decision')
    }
};

function initSimulator() {
    // Attach listeners to all sim inputs
    Object.values(simEls.inputs).forEach(input => {
        input.addEventListener('input', updateSimulator);
        input.addEventListener('change', updateSimulator);
    });
    // Initial run
    updateSimulator();
}

function updateSimulator() {
    // 1. Update Value Displays
    simEls.displays.ratio.textContent = simEls.inputs.ratio.value;
    simEls.displays.bnp.textContent = simEls.inputs.bnp.value;
    simEls.displays.urate.textContent = simEls.inputs.urate.value;
    simEls.displays.ra.textContent = simEls.inputs.ra.value;
    simEls.displays.tr.textContent = simEls.inputs.tr.value;

    // 2. Prepare Inputs for Calculation
    const simData = {
        fvc_dlco: parseFloat(simEls.inputs.ratio.value),
        telang: simEls.inputs.telang.checked,
        aca: simEls.inputs.aca.checked,
        ntprobnp: parseFloat(simEls.inputs.bnp.value),
        urate: parseFloat(simEls.inputs.urate.value),
        rad: simEls.inputs.rad.checked,
        ra_area: parseFloat(simEls.inputs.ra.value),
        tr_vel: parseFloat(simEls.inputs.tr.value)
    };

    // 3. Calc Step 1 Points
    const s1Points = window.DETECT.calculateStep1Points(simData);

    // 4. Calc Step 2 Points (using Step 1 Total as base)
    const s2Points = window.DETECT.calculateStep2Points(s1Points.total, simData.ra_area, simData.tr_vel);

    // 5. Update Gauge
    const total = s2Points.total;
    simEls.displays.total.textContent = total + " pts";

    if (total > 35) {
        simEls.displays.decision.textContent = "⚠️ RHC INDIQUÉ";
        simEls.displays.decision.style.background = "var(--danger-color)";
        simEls.displays.decision.style.color = "white";
    } else {
        simEls.displays.decision.textContent = "✅ SURVEILLANCE";
        simEls.displays.decision.style.background = "var(--success-color)";
        simEls.displays.decision.style.color = "white";
    }
}

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
    // Only calculate ratio if both are present
    let ratio = 1.0;
    if (!isNaN(fvc) && !isNaN(dlco) && dlco !== 0) {
        ratio = fvc / dlco;
    }

    const inputs = {
        fvc_dlco: ratio,
        telang: els.step1.inputs.telang.checked,
        aca: els.step1.inputs.aca.checked,
        ntprobnp: parseFloat(els.step1.inputs.ntprobnp.value) || 0, // Default 0 for live calc
        urate: getUrateInMgDl(),
        rad: els.step1.inputs.rad.checked
    };
    if (inputs.ntprobnp < 1) inputs.ntprobnp = 1;
    return inputs;
}

function updateLiveStep1() {
    const inputs = getStep1Inputs();
    const points = window.DETECT.calculateStep1Points(inputs);

    // Update Step 1 Badges
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
    const ra = parseFloat(els.step2.inputs.ra.value) || 0;
    const tr = parseFloat(els.step2.inputs.tr.value) || 0;

    // Use 0 as base points since we just want to see the contribution of Step 2 variables
    const points = window.DETECT.calculateStep2Points(0, ra, tr);

    if (els.step2.inputs.ra.value) els.step2.badges.ra_area.textContent = `+${points.details.ra_area} pts`;
    else els.step2.badges.ra_area.textContent = '';

    if (els.step2.inputs.tr.value) els.step2.badges.tr_vel.textContent = `+${points.details.tr_vel} pts`;
    else els.step2.badges.tr_vel.textContent = '';
}

function runStep1() {
    const inputs = getStep1Inputs();

    // Calculate
    step1Result = window.DETECT.calculateStep1Exact(inputs);
    const step1Points = window.DETECT.calculateStep1Points(inputs);
    step1Result.points = step1Points.total;

    // Display
    els.step1.resultBox.classList.remove('hidden');
    els.step1.pointsVal.textContent = step1Points.total;

    updateBar(els.s1Bars.points, step1Points.total, 300, 600);

    const isHighRisk = step1Points.total > 300;

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
        els.step2.decision.textContent = "PAS D'INDICATION RHC IM MÉDIATE";
        els.step2.decision.className = "score-decision decision-safe";
        els.step2.rec.textContent = "Le risque calculé est faible. Continuer la surveillance annuelle.";
    }

    els.step2.recBox.style.display = 'block';
}

function updateBar(barEl, value, threshold, max) {
    let percent = (value / max) * 100;
    if (percent > 100) percent = 100;
    if (percent < 0) percent = 0;
    barEl.style.width = percent + '%';
    if (value > threshold) {
        barEl.style.backgroundColor = 'var(--danger-color)';
    } else {
        barEl.style.backgroundColor = 'var(--success-color)';
    }
}

init();
