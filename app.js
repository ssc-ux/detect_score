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
        btn: document.getElementById('calc-step1'),
        resultBox: document.getElementById('result-step1'),
        pointsVal: document.getElementById('s1-points-val'),
        decision: document.getElementById('s1-decision'),
        details: document.getElementById('s1-details')
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
        decision: document.getElementById('s2-decision'),
        rec: document.getElementById('final-recommendation'),
        recBox: document.getElementById('s2-rec-box'),
        details: document.getElementById('s2-details')
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
    els.step1.resultBox.classList.add('hidden');
    els.step2.section.classList.add('hidden');
    els.step2.resultBox.classList.add('hidden');
    els.bypassS2.container.classList.add('hidden');
    els.step2.recBox.style.display = 'none';

    els.step1.btn.addEventListener('click', runStep1);
    els.step2.btn.addEventListener('click', runStep2);

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
}

function getUrateInMgDl() {
    let val = parseFloat(els.step1.inputs.urate.value);
    const unit = els.step1.inputs.urate_unit.value;
    if (isNaN(val)) return 0;
    if (unit === 'umol') val = val / 59.48;
    return val;
}

function renderDetails(container, details, step) {
    container.innerHTML = '';
    const labels = {
        fvc_dlco: "Ratio CVF/DLCO",
        telang: "Télangiectasies",
        aca: "Ac. Anti-Centromère",
        ntprobnp: "NT-proBNP",
        urate: "Acide Urique",
        rad: "Déviation Axiale Droite",
        step1_points: "Points Étape 1 (Report)",
        ra_area: "Surface OD",
        tr_vel: "Vélocité IT"
    };

    let html = '';
    for (const [key, val] of Object.entries(details)) {
        if (key === 'total') continue;
        if (val === 0 && key !== 'fvc_dlco') continue;

        const label = labels[key] || key;
        html += `
            <div class="details-row">
                <span>${label}</span>
                <span class="details-points">+${val} pts</span>
            </div>
        `;
    }
    container.innerHTML = html;
}

function runStep1() {
    // 1. Gather Inputs
    const fvc = parseFloat(els.step1.inputs.fvc.value) || 100;
    const dlco = parseFloat(els.step1.inputs.dlco.value) || 100;
    const ratio = dlco !== 0 ? fvc / dlco : 1.0;

    const inputs = {
        fvc_dlco: ratio,
        telang: els.step1.inputs.telang.checked,
        aca: els.step1.inputs.aca.checked,
        ntprobnp: parseFloat(els.step1.inputs.ntprobnp.value) || 10,
        urate: getUrateInMgDl(),
        rad: els.step1.inputs.rad.checked
    };

    if (inputs.ntprobnp < 1) inputs.ntprobnp = 1;

    // 2. Calculate
    step1Result = window.DETECT.calculateStep1Exact(inputs);
    const step1Points = window.DETECT.calculateStep1Points(inputs);
    step1Result.points = step1Points.total;

    // 3. Display
    els.step1.resultBox.classList.remove('hidden');
    els.step1.pointsVal.textContent = step1Points.total;

    updateBar(els.s1Bars.points, step1Points.total, 300, 600);
    renderDetails(els.step1.details, step1Points, 1);

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

    const res = window.DETECT.calculateStep2Exact(step1Result.step1_score_linear, inputs.ra_area, inputs.tr_vel);
    const resPoints = window.DETECT.calculateStep2Points(step1Result.points, inputs.ra_area, inputs.tr_vel);

    els.step2.resultBox.classList.remove('hidden');
    els.step2.pointsVal.textContent = resPoints.total;

    updateBar(els.s2Bars.points, resPoints.total, 35, 100);
    renderDetails(els.step2.details, resPoints, 2);

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
