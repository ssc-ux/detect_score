/**
 * DETECT Logic Module
 * Implements the DETECT 2013 Algorithm using a strictly calibrated Points system (Nomogram).
 * Calibration Target:
 * - Step 1: 5% Risk (Sensitivity 97%) = 300 Points.
 * - Step 2: 10% Risk (RHC Referral) = 35 Points.
 */

// ==========================================
// 1. CONSTANTS & COEFFICIENTS
// ==========================================
const CONSTANTS = {
    STEP1: {
        INTERCEPT: -12.488,
        COEFFS: {
            FVC_DLCO: 1.149,
            TELANG: 1.156,     // 0 or 1
            ACA: 0.753,        // 0 or 1
            NT_PRO_BNP: 0.915, // log10(val)
            URATE: 1.247,
            URATE_SPLINE: -1.132,
            RIGHT_AXIS_DEV: 1.850 // 0 or 1
        },
        KNOTS_URATE: [3.3, 4.7, 7.1], // mg/100ml
        OFFSETS: {
            fvc_dlco: 11,
            telang: 50,
            aca: 50,
            ntprobnp: 27,
            urate: -15,
            rad: 50
        }
    },
    STEP2: {
        INTERCEPT: -2.452,
        COEFFS: {
            STEP1_LINEAR: 0.891,
            RA_AREA: 0.075,
            TR_VEL: 0.209,
            TR_VEL_SPLINE: 2.656
        },
        KNOTS_TR: [2.0, 2.5, 3.4], // m/s
        OFFSETS: {
            ra_area: 5,
            tr_vel: 2
        }
    }
};

const POINT_SCALING = {
    // Calibrated to match the VISUAL NOMOGRAM (Factor 13.3 for round categorical points)
    STEP1_FACTOR: 13.3,
    STEP2_FACTOR: 5.0,
    STEP1_THRESHOLD: 300,
    STEP2_THRESHOLD: 35
};

// Helper: Restricted Cubic Spline (Harrell's method)
function rcs3(x, knots) {
    const k1 = knots[0];
    const k2 = knots[1];
    const k3 = knots[2];
    const p = (t) => t > 0 ? Math.pow(t, 3) : 0;
    const term1 = p(x - k1);
    const term2 = p(x - k2) * (k3 - k1) / (k3 - k2);
    const term3 = p(x - k3) * (k2 - k1) / (k3 - k2);
    const normalization = Math.pow(k3 - k1, 2);
    return (term1 - term2 + term3) / normalization;
}

// ==========================================
// 2. CALCULATION FUNCTIONS
// ==========================================

function calculateStep1Points(inputs) {
    // Validation
    if (inputs.fvc_dlco < 0 || inputs.ntprobnp < 0 || inputs.urate < 0) {
        console.warn("Negative inputs detected in Step 1");
    }

    const logProBNP = Math.log10(inputs.ntprobnp > 0 ? inputs.ntprobnp : 1);
    const urateSplineTerm = rcs3(inputs.urate, CONSTANTS.STEP1.KNOTS_URATE);

    // Calculate Contributions (Linear Predictor Terms)
    const rawContrib = {
        fvc_dlco: inputs.fvc_dlco * CONSTANTS.STEP1.COEFFS.FVC_DLCO,
        telang: (inputs.telang ? 1 : 0) * CONSTANTS.STEP1.COEFFS.TELANG,
        aca: (inputs.aca ? 1 : 0) * CONSTANTS.STEP1.COEFFS.ACA,
        ntprobnp: logProBNP * CONSTANTS.STEP1.COEFFS.NT_PRO_BNP,
        urate: (inputs.urate * CONSTANTS.STEP1.COEFFS.URATE) + (urateSplineTerm * CONSTANTS.STEP1.COEFFS.URATE_SPLINE),
        rad: (inputs.rad ? 1 : 0) * CONSTANTS.STEP1.COEFFS.RIGHT_AXIS_DEV
    };

    // Convert to Points
    let totalPoints = 0;
    const detailPoints = {};
    let linearScore = CONSTANTS.STEP1.INTERCEPT;

    for (let key in rawContrib) {
        const val = rawContrib[key];
        linearScore += val;
        // Point Formula (Visual Nomogram): round(Contrib * Factor + Offset)
        const p = Math.round((val * POINT_SCALING.STEP1_FACTOR) + CONSTANTS.STEP1.OFFSETS[key]);
        detailPoints[key] = p;
        totalPoints += p;
    }

    return {
        total: totalPoints,
        details: detailPoints,
        linearScore: linearScore, // Needed for Step 2
        threshold: POINT_SCALING.STEP1_THRESHOLD,
        isHighRisk: totalPoints > POINT_SCALING.STEP1_THRESHOLD
    };
}

function calculateStep2Points(s1Result, raArea, trVel) {
    const trSplineTerm = rcs3(trVel, CONSTANTS.STEP2.KNOTS_TR);
    const s1Points = typeof s1Result === 'object' ? s1Result.total : s1Result;
    const s1Score = typeof s1Result === 'object' ? s1Result.linearScore : (s1Result / POINT_SCALING.STEP1_FACTOR); // Using correct factor

    // 1. Points System (Nomogram)
    let s1Contrib = Math.round(s1Points * 0.38 - 104);
    if (s1Contrib < 0) s1Contrib = 0;

    const rawContrib = {
        ra_area: raArea * CONSTANTS.STEP2.COEFFS.RA_AREA,
        tr_vel: (trVel * CONSTANTS.STEP2.COEFFS.TR_VEL) + (trSplineTerm * CONSTANTS.STEP2.COEFFS.TR_VEL_SPLINE)
    };

    let totalPoints = s1Contrib;
    const detailPoints = {
        step1: s1Contrib
    };

    for (let key in rawContrib) {
        const val = rawContrib[key];
        const p = Math.round((val * POINT_SCALING.STEP2_FACTOR) + CONSTANTS.STEP2.OFFSETS[key]);
        detailPoints[key] = p;
        totalPoints += p;
    }

    // 2. Exact Regression Score
    let linearScore = CONSTANTS.STEP2.INTERCEPT;
    linearScore += s1Score * CONSTANTS.STEP2.COEFFS.STEP1_LINEAR;
    linearScore += raArea * CONSTANTS.STEP2.COEFFS.RA_AREA;
    linearScore += (trVel * CONSTANTS.STEP2.COEFFS.TR_VEL) + (trSplineTerm * CONSTANTS.STEP2.COEFFS.TR_VEL_SPLINE);

    return {
        total: totalPoints,
        details: detailPoints,
        linearScore: linearScore,
        probability: 1 / (1 + Math.exp(-linearScore)),
        threshold: POINT_SCALING.STEP2_THRESHOLD,
        isReferral: totalPoints > POINT_SCALING.STEP2_THRESHOLD
    };
}

// Retro-compatibility / Hybrid function (Now just a wrapper)
function calculateStep1Exact(inputs) {
    // We retain this only if external code calls it, but internally we use Points.
    const res = calculateStep1Points(inputs);
    return {
        step1_score_linear: res.linearScore,
        step1_probability: 1 / (1 + Math.exp(-res.linearScore)),
        refer_to_echo: res.isHighRisk,
        points: res.total // Ensure we pass points back
    };
}

// Export
window.DETECT = {
    calculateStep1Points,
    calculateStep2Points,
    calculateStep1Exact,
    CONSTANTS,
    rcs3
};
