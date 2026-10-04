/*
 * Nomogramme DETECT (Coghlan et al., Ann Rheum Dis 2014;73:1340-9, figure 3).
 *
 * Étape 1 : modèle logistique du tableau 2, représenté par le nomogramme « centré »
 * de l'annexe 6 du supplément : chaque variable vaut 50 points à sa valeur de
 * référence (CVF/DLCO 1,5 ; NT-proBNP 100 pg/mL ; urate ≈ 4,5 mg/dL ; absence),
 * et 1 unité du prédicteur linéaire vaut K1 points, où K1 est fixé par la figure :
 * CVF/DLCO = 5 ↔ 100 points. Total étape 1 = somme des 6 points.
 *
 * Étape 2 : points de chaque axe tels que tracés sur la figure 3 (pente et origine
 * mesurées sur la figure, forme de la spline issue du tableau 2).
 *
 * Splines cubiques restreintes à 3 nœuds (Harrell, fonction lrm du package R Design) :
 * urate 3,3 / 4,7 / 7,1 mg/100 mL ; vélocité IT 2 / 2,5 / 3,4 m/s.
 */

// Coefficients du tableau 2
const BETA = {
    fvcDlco: 1.149,
    telang: 1.156,
    aca: 0.753,
    ntprobnpLog10: 0.915,
    urate: 1.247,
    urateSpline: -1.132,
    rad: 1.850,
    step1Lp: 0.891,
    raArea: 0.075,
    trVel: 0.209,
    trVelSpline: 2.656
};
const KNOTS_URATE = [3.3, 4.7, 7.1];
const KNOTS_TR = [2, 2.5, 3.4];

// Points par unité de prédicteur linéaire (étape 1) : CVF/DLCO 1,5 → 50 et 5 → 100.
const K1 = 50 / (BETA.fvcDlco * (5 - 1.5));
// Prédicteur linéaire de l'urate valant 50 points (centrage lu sur la figure 3).
const URATE_REF_LP = 5.4966;

function rcsTerm(x, knots) {
    const [t1, t2, t3] = knots;
    const c = (u) => (u > 0 ? u * u * u : 0);
    return (c(x - t1) - c(x - t2) * (t3 - t1) / (t3 - t2) + c(x - t3) * (t2 - t1) / (t3 - t2)) /
        ((t3 - t1) * (t3 - t1));
}

function pointsFvcDlco(ratio) {
    return 50 + K1 * BETA.fvcDlco * (ratio - 1.5);
}

function pointsTelang(present) {
    return 50 + (present ? K1 * BETA.telang : 0);
}

function pointsAca(present) {
    return 50 + (present ? K1 * BETA.aca : 0);
}

function pointsNtproBnp(val) {
    if (val < 1) val = 1;
    return 50 + K1 * BETA.ntprobnpLog10 * (Math.log10(val) - 2);
}

// Urate en mg/dL (= mg/100 mL)
function pointsUrate(val) {
    const lp = BETA.urate * val + BETA.urateSpline * rcsTerm(val, KNOTS_URATE);
    return 50 + K1 * (lp - URATE_REF_LP);
}

function pointsRad(present) {
    return 50 + (present ? K1 * BETA.rad : 0);
}

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
        linearScore: total,     
        threshold:  300,
        isHighRisk: total > 300
    };
}

// Étape 2 : axe « Total risk points from Step 1 » (300 → 10 points, 440 → 60 points)
function pointsStep1Conversion(step1Total) {
    return 10 + (step1Total - 300) * 50 / 140;
}

// Surface OD en cm² (0 → 4,49 points, 40 → 19,16 points sur la figure)
function pointsRaArea(val) {
    return 4.49 + 0.3668 * val;
}

// Vélocité IT en m/s (0 → 6,74 points, 5 → 45,75 points sur la figure)
function pointsTrVel(v) {
    const lp = BETA.trVel * v + BETA.trVelSpline * rcsTerm(v, KNOTS_TR);
    return 6.74 + 5.018 * lp;
}

function calculateStep2Points(s1Result, raArea, trVel) {

    const s1Total = (typeof s1Result === 'object') ? (s1Result.totalExact ?? s1Result.total) : s1Result;

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
        linearScore:  totalExact,   
        threshold:    35,
        isReferral:   totalExact > 35
    };
}

function calculateStep1Exact(inputs) {
    const res = calculateStep1Points(inputs);
    return {
        step1_score_linear: res.totalExact,
        refer_to_echo: res.isHighRisk,
        points: res.total
    };
}

window.DETECT = {
    calculateStep1Points,
    calculateStep2Points,
    calculateStep1Exact,

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
