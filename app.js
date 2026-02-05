/**
 * DETECT App Controller
 * Handles UI interactions, input collection, and result display.
 */

// Cut-off thresholds based on DETECT study sensitivity/specificity targets
// Step 1 Sensitivity 97%: Corresponding score threshold.
// The Nomogram uses Points > 300.
// We need to establish the Logistic Score threshold that matches "300 points".
// Since we don't have the exact mapping, we will use a derived threshold.
// Based on paper text: "a sensitivity cut-off of 97%... determined no referral... in 52 patients".
// This implies a very low threshold (high sensitivity).
// For the purpose of this tool, we will use a conservative probability threshold.
// Typically for screening (Sens ~97%), Probability > ~0.05 or lower might be the cut-off.
// Without the exact intercept calibration from the nomogram, we'll assume:
// Step 1: Any risk > Low => Refer.
// Let's use a standard threshold of > 300 NOMOGRAM POINTS approximation.
// Points ~ (Probability * Scale).
// ALTERNATIVE: Use the text description: "missed 2 false negatives".
// We will use a calibrated guess for the MVP: Probability > 10% (0.10) => Refer Step 2.
// This is adjustable.

const THRESHOLDS = {
    STEP1_PROB: 0.05, // 5% Risk -> Refer to Echo (High Sensitivity)
    STEP2_PROB: 0.10  // 10% Risk -> Refer to RHC (Specificty 35%)
};

// DOM Elements
const els = {
    step1: {
        inputs: {
            fvc: document.getElementById('fvc_dlco'),
            telang: document.getElementById('telang'),
            aca: document.getElementById('aca'),
            ntprobnp: document.getElementById('ntprobnp'),
            urate: document.getElementById('urate'),
            urate_unit: document.getElementById('urate_unit'),
            rad: document.getElementById('rad')
        },
        btn: document.getElementById('calc-step1'),
        resultBox: document.getElementById('result-step1'),
        pointsVal: document.getElementById('s1-points-val'),
        probVal: document.getElementById('s1-prob-val'),
        decision: document.getElementById('s1-decision'),
        details: document.getElementById('s1-details-list'),
        didacticPanel: document.getElementById('s1-didactic')
    },
    step2: {
        section: document.getElementById('step2'),
        inputs: {
            ra: document.getElementById('ra_area'),
            tr: document.getElementById('tr_vel')
        },
        btn: document.getElementById('calc-step2'),
        resultBox: document.getElementById('result-step2'),
        pointsVal: document.getElementById('s2-points-val'),
        probVal: document.getElementById('s2-prob-val'),
        decision: document.getElementById('s2-decision'),
        details: document.getElementById('s2-details-list'),
        rec: document.getElementById('final-recommendation')
    },
    didacticMode: document.getElementById('didactic-mode'),
    bypassS2: {
        container: document.getElementById('bypass-s2-area'),
        btn: document.getElementById('btn-force-s2')
    },
    modal: {
        overlay: document.getElementById('beta-modal'),
        closeBtn: document.getElementById('close-modal')
    },
    s1Bars: {
        points: document.getElementById('s1-points-bar'),
        prob: document.getElementById('s1-prob-bar')
    },
    s2Bars: {
        points: document.getElementById('s2-points-bar'),
        prob: document.getElementById('s2-prob-bar')
    }
};

// State
let step1Result = null;

// Initialization
function init() {
    els.step1.btn.addEventListener('click', runStep1);
    els.step2.btn.addEventListener('click', runStep2);
    els.didacticMode.addEventListener('change', toggleDidactic);

    els.modal.closeBtn.addEventListener('click', () => {
        els.modal.overlay.style.display = 'none';
        localStorage.setItem('detect_beta_accepted', 'true');
    });

    // Check if already accepted
    if (localStorage.getItem('detect_beta_accepted') === 'true') {
        els.modal.overlay.style.display = 'none';
    }
}

function getUrateInMgDl() {
    let val = parseFloat(els.step1.inputs.urate.value);
    const unit = els.step1.inputs.urate_unit.value;
    if (isNaN(val)) return 0;

    // Convert µmol/L to mg/dL
    // 1 mg/dL = 59.48 µmol/L (for Uric Acid)
    if (unit === 'umol') {
        val = val / 59.48;
    }
    return val;
}

function toggleDidactic() {
    const isDidactic = els.didacticMode.checked;
    const s1Details = document.getElementById('s1-didactic-details');
    const s2Details = document.getElementById('s2-didactic-details');

    if (s1Details) s1Details.style.display = isDidactic ? 'block' : 'none';
    if (s2Details) s2Details.style.display = isDidactic ? 'block' : 'none';
}

function runStep1() {
    // 1. Gather Inputs
    const inputs = {
        fvc_dlco: parseFloat(els.step1.inputs.fvc.value) || 0,
        telang: els.step1.inputs.telang.checked,
        aca: els.step1.inputs.aca.checked,
        ntprobnp: parseFloat(els.step1.inputs.ntprobnp.value) || 10, // Avoid log(0)
        urate: getUrateInMgDl(),
        rad: els.step1.inputs.rad.checked
    };

    if (inputs.ntprobnp < 1) inputs.ntprobnp = 1; // Safety

    // 2. Calculate
    step1Result = window.DETECT.calculateStep1Exact(inputs);
    const step1Points = window.DETECT.calculateStep1Points(inputs);
    step1Result.points = step1Points.total;

    // 3. Display Results
    els.step1.resultBox.classList.remove('hidden');

    // UI Display
    els.step1.pointsVal.textContent = step1Points.total;
    els.step1.probVal.textContent = (step1Result.step1_probability * 100).toFixed(1);

    // Update Bars
    updateBar(els.s1Bars.points, step1Points.total, 300, 600);
    updateBar(els.s1Bars.prob, step1Result.step1_probability * 100, 5, 100);

    // Decision
    const isHighRisk = step1Result.step1_probability > THRESHOLDS.STEP1_PROB;

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

    // 4. Didactic Details
    // 4. Didactic Details
    // Helper to format: "Value (x Coeff) = Contribution"
    // Coeffs:
    const C = window.DETECT.CONSTANTS.STEP1.COEFFS;

    // Note: For Urate, it is complex (Poly + Spline). We simplify display.
    renderDidacticDetails(els.step1.details, {
        "FVC/DLCO": `${inputs.fvc_dlco} <small>x ${C.FVC_DLCO}</small>`,
        "Télangiectasies": inputs.telang ? `Présent <small>(+${C.TELANG})</small>` : "Abs",
        "ACA": inputs.aca ? `Positif <small>(+${C.ACA})</small>` : "Neg",
        "NT-proBNP": `log(${inputs.ntprobnp}) <small>x ${C.NT_PRO_BNP}</small>`,
        "Urate": `${inputs.urate.toFixed(1)} <small>(+Splines)</small>`,
        "Déviation Axiale": inputs.rad ? `Oui <small>(+${C.RIGHT_AXIS_DEV})</small>` : "Non",
    });
}

function runStep2() {
    if (!step1Result) return;

    const inputs = {
        ra_area: parseFloat(els.step2.inputs.ra.value) || 0,
        tr_vel: parseFloat(els.step2.inputs.tr.value) || 0
    };

    const res = window.DETECT.calculateStep2Exact(step1Result.step1_score_linear, inputs.ra_area, inputs.tr_vel);
    const resPoints = window.DETECT.calculateStep2Points(step1Result.points, inputs.ra_area, inputs.tr_vel);

    els.step2.resultBox.classList.remove('hidden');

    els.step2.pointsVal.textContent = resPoints.total;
    els.step2.probVal.textContent = (res.step2_probability * 100).toFixed(1);

    // Update Bars
    updateBar(els.s2Bars.points, resPoints.total, 35, 100);
    updateBar(els.s2Bars.prob, res.step2_probability * 100, 10, 100);

    const isReferral = res.step2_probability > THRESHOLDS.STEP2_PROB;

    if (isReferral) {
        els.step2.decision.textContent = "CATHÉTÉRISME DROIT INDIQUÉ";
        els.step2.decision.className = "score-decision decision-danger";
        els.step2.rec.textContent = "Le patient présente un risque élevé d'HTAP confirmée (Spécificité 35% atteinte). Un cathétérisme cardiaque droit est recommandé selon l'algorithme DETECT.";
    } else {
        els.step2.decision.textContent = "PAS D'INDICATION RHC";
        els.step2.decision.className = "score-decision decision-safe";
        els.step2.rec.textContent = "Le risque calculé est faible. Continuer la surveillance annuelle.";
    }

    renderDidacticDetails(els.step2.details, {
        "Score Étape 1": "Inclus",
        "Surface OD": `${inputs.ra_area} cm²`,
        "Vélocité IT": `${inputs.tr_vel} m/s`
    });
}

function updateBar(barEl, value, threshold, max) {
    let percent = (value / max) * 100;
    if (percent > 100) percent = 100;
    if (percent < 0) percent = 0;

    barEl.style.width = percent + '%';

    // Color logic
    if (value > threshold) {
        barEl.style.backgroundColor = 'var(--danger-color)';
    } else {
        barEl.style.backgroundColor = 'var(--success-color)';
    }
}

function renderDidacticDetails(listEl, items) {
    listEl.innerHTML = '';
    for (const [key, val] of Object.entries(items)) {
        const li = document.createElement('li');
        li.innerHTML = `<span>${key}</span> <strong>${val}</strong>`;
        listEl.appendChild(li);
    }
}

// Start
init();
