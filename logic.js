/**
 * DETECT Logic Module — Strict reproduction of DETECT Algo V4.xlsm
 * ================================================================
 * Every formula below is a direct 1:1 translation of the Excel cell formulas
 * provided by the original DETECT study authors (Coghlan JG et al., Ann Rheum Dis 2014).
 *
 * Source spreadsheet: "DETECT Algo V4.xlsm", Sheet1
 *
 * Step 1 thresholds: >300 points → refer to echocardiography
 * Step 2 thresholds: >35 points → refer to right heart catheterisation
 */

// ==========================================
// 1. STEP 1 — INDIVIDUAL COMPONENT POINTS
// ==========================================

/**
 * FVC/DLCO ratio points.
 * Excel D2: =28+(ratio*14.4)
 * @param {number} ratio - FVC%pred / DLCO%pred
 * @returns {number} points (continuous)
 */
function pointsFvcDlco(ratio) {
    return 28 + (ratio * 14.4);
}

/**
 * Telangiectasia points.
 * Excel D3: No=50, Yes=65
 * @param {boolean} present
 * @returns {number} 50 or 65
 */
function pointsTelang(present) {
    return present ? 65 : 50;
}

/**
 * Anti-centromere antibody (ACA) points.
 * Excel D4: No=50, Yes=59
 * @param {boolean} present
 * @returns {number} 50 or 59
 */
function pointsAca(present) {
    return present ? 59 : 50;
}

/**
 * NT-proBNP points.
 * Excel D5: =27.5+(LOG10(val)*11.3)
 * @param {number} val - NT-proBNP in pg/mL (or ng/L, same unit)
 * @returns {number} points (continuous)
 */
function pointsNtproBnp(val) {
    if (val <= 0) val = 1; // Safety: log10(0) is -Infinity
    return 27.5 + (Math.log10(val) * 11.3);
}

/**
 * Serum urate points — piecewise linear interpolation.
 * Excel D6:
 *   val < 2       → 0
 *   2 ≤ val ≤ 3   → 12.5 + (val-2)*15
 *   3 < val ≤ 4   → 27.5 + (val-3)*16
 *   4 < val ≤ 5   → 43.5 + (val-4)*10.5
 *   5 < val ≤ 10  → 54   + (val-5)*1.2
 *   val > 10      → 60
 * @param {number} val - Urate in mg/dL
 * @returns {number} points (continuous)
 */
function pointsUrate(val) {
    if (val < 2)   return 0;
    if (val <= 3)  return 12.5 + (val - 2) * 15;
    if (val <= 4)  return 27.5 + (val - 3) * 16;
    if (val <= 5)  return 43.5 + (val - 4) * 10.5;
    if (val <= 10) return 54   + (val - 5) * 1.2;
    return 60;
}

/**
 * Right axis deviation (ECG) points.
 * Excel D7: No=50, Yes=73
 * @param {boolean} present
 * @returns {number} 50 or 73
 */
function pointsRad(present) {
    return present ? 73 : 50;
}

// ==========================================
// 2. STEP 1 — TOTAL SCORE
// ==========================================

/**
 * Calculate all Step 1 component points and total.
 * Excel D8: =SUM(D2:D7)
 *
 * @param {object} inputs
 * @param {number} inputs.fvc_dlco  - FVC/DLCO ratio
 * @param {boolean} inputs.telang   - Telangiectasia present
 * @param {boolean} inputs.aca      - Anti-centromere Ab present
 * @param {number} inputs.ntprobnp  - NT-proBNP in pg/mL
 * @param {number} inputs.urate     - Serum urate in mg/dL
 * @param {boolean} inputs.rad      - Right axis deviation on ECG
 * @returns {object} { total, details, isHighRisk }
 */
function calculateStep1Points(inputs) {
    const details = {
        fvc_dlco: pointsFvcDlco(inputs.fvc_dlco),
        telang:   pointsTelang(inputs.telang),
        aca:      pointsAca(inputs.aca),
        ntprobnp: pointsNtproBnp(inputs.ntprobnp),
        urate:    pointsUrate(inputs.urate),
        rad:      pointsRad(inputs.rad)
    };

    const total = details.fvc_dlco + details.telang + details.aca +
                  details.ntprobnp + details.urate + details.rad;

    // Round each component for display (the Excel shows rounded values)
    const displayDetails = {};
    for (const key in details) {
        displayDetails[key] = Math.round(details[key]);
    }

    const totalRounded = Math.round(total);

    return {
        total:      totalRounded,
        totalExact: total,
        details:    displayDetails,
        detailsExact: details,
        linearScore: total,     // Kept for backward compat with app.js
        threshold:  300,
        isHighRisk: totalRounded > 300
    };
}

// ==========================================
// 3. STEP 2 — INDIVIDUAL COMPONENT POINTS
// ==========================================

/**
 * Step 1 → Step 2 conversion.
 * Excel D11: =10+((step1Total-300)*0.357)
 * @param {number} step1Total - Total Step 1 points
 * @returns {number} points (continuous)
 */
function pointsStep1Conversion(step1Total) {
    return 10 + ((step1Total - 300) * 0.357);
}

/**
 * Right atrial area points.
 * Excel D12: =4+(val*0.375)
 * @param {number} val - RA area in cm²
 * @returns {number} points (continuous)
 */
function pointsRaArea(val) {
    return 4 + (val * 0.375);
}

/**
 * TR velocity points — piecewise linear interpolation.
 * Excel D13 (exact formula):
 *   0   – 1.5 m/s  → 6.5  + ((v-0)/1.5)   * (8-6.5)      = 6.5  + v*1.0
 *   1.5 – 2.5 m/s  → 8    + ((v-1.5)/1.0)  * (10-8)       = 8    + (v-1.5)*2
 *   2.5 – 3.0 m/s  → 10   + ((v-2.5)/0.5)  * (15-10)      = 10   + (v-2.5)*10
 *   3.0 – 3.5 m/s  → 15   + ((v-3.0)/0.5)  * (22.5-15)    = 15   + (v-3.0)*15
 *   3.5 – 4.0 m/s  → 22.5 + ((v-3.5)/0.5)  * (30-22.5)    = 22.5 + (v-3.5)*15
 *   4.0 – 4.5 m/s  → 30   + ((v-4.0)/0.5)  * (37.5-30)    = 30   + (v-4.0)*15
 *   4.5 – 5.0 m/s  → 37.5 + ((v-4.5)/0.5)  * (45-37.5)    = 37.5 + (v-4.5)*15
 *   > 5.0          → 45
 * @param {number} v - TR velocity in m/s
 * @returns {number} points (continuous)
 */
function pointsTrVel(v) {
    if (v <= 1.5) return 6.5 + ((v - 0)   / 1.5) * (8 - 6.5);
    if (v <= 2.5) return 8   + ((v - 1.5) / 1.0) * (10 - 8);
    if (v <= 3.0) return 10  + ((v - 2.5) / 0.5) * (15 - 10);
    if (v <= 3.5) return 15  + ((v - 3.0) / 0.5) * (22.5 - 15);
    if (v <= 4.0) return 22.5+ ((v - 3.5) / 0.5) * (30 - 22.5);
    if (v <= 4.5) return 30  + ((v - 4.0) / 0.5) * (37.5 - 30);
    if (v <= 5.0) return 37.5+ ((v - 4.5) / 0.5) * (45 - 37.5);
    return 45;
}

// ==========================================
// 4. STEP 2 — TOTAL SCORE
// ==========================================

/**
 * Calculate Step 2 total points.
 * Excel D15: =SUM(D11,D12,D13)
 *
 * @param {number|object} s1Result - Step 1 total points (number) or full result object
 * @param {number} raArea  - Right atrial area in cm²
 * @param {number} trVel   - TR velocity in m/s
 * @returns {object} { total, details, probability, isReferral }
 */
function calculateStep2Points(s1Result, raArea, trVel) {
    // Accept either a raw number or the Step 1 result object
    const s1Total = (typeof s1Result === 'object') ? s1Result.totalExact || s1Result.total : s1Result;

    const detailsExact = {
        step1:   pointsStep1Conversion(s1Total),
        ra_area: pointsRaArea(raArea),
        tr_vel:  pointsTrVel(trVel)
    };

    const totalExact = detailsExact.step1 + detailsExact.ra_area + detailsExact.tr_vel;

    const displayDetails = {};
    for (const key in detailsExact) {
        displayDetails[key] = Math.round(detailsExact[key]);
    }

    const totalRounded = Math.round(totalExact);

    return {
        total:        totalRounded,
        totalExact:   totalExact,
        details:      displayDetails,
        detailsExact: detailsExact,
        linearScore:  totalExact,   // backward compat
        probability:  totalRounded / 100,  // rough estimate for display
        threshold:    35,
        isReferral:   totalRounded > 35
    };
}

// ==========================================
// 5. LEGACY WRAPPER (backward compat)
// ==========================================

function calculateStep1Exact(inputs) {
    const res = calculateStep1Points(inputs);
    return {
        step1_score_linear: res.totalExact,
        step1_probability: res.total / 500, // rough % for display
        refer_to_echo: res.isHighRisk,
        points: res.total
    };
}

// ==========================================
// 6. EXPORT
// ==========================================

window.DETECT = {
    calculateStep1Points,
    calculateStep2Points,
    calculateStep1Exact,
    // Expose individual point functions for testing
    pointsFvcDlco,
    pointsTelang,
    pointsAca,
    pointsNtproBnp,
    pointsUrate,
    pointsRad,
    pointsStep1Conversion,
    pointsRaArea,
    pointsTrVel
};
