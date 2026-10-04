/*
 * Calcul DETECT reproduisant à l'identique le classeur de l'auteur (DETECT_Algo_V4.xlsm).
 * Chaque fonction correspond à une cellule de la colonne D ; une valeur absente
 * (null) reçoit la valeur par défaut du classeur.
 */

// D2 : rapport CVF % prédite / DLCO % prédite (absent → 50)
function pointsFvcDlco(ratio) {
    if (ratio == null) return 50;
    return 28 + (ratio * 14.4);
}

// D3 : No = 50, Yes = 65
function pointsTelang(present) {
    return present ? 65 : 50;
}

// D4 : No = 50, Yes = 59
function pointsAca(present) {
    return present ? 59 : 50;
}

// D5 : NT-proBNP en pg/mL (absent → 50)
function pointsNtproBnp(val) {
    if (val == null) return 50;
    return 27.5 + (Math.log10(val) * 11.3);
}

// D6 : urate en mg/dL (absent → 50)
function pointsUrate(val) {
    if (val == null) return 50;
    if (val < 2)   return 0;
    if (val <= 3)  return 12.5 + (val - 2) * 15;
    if (val <= 4)  return 27.5 + (val - 3) * 16;
    if (val <= 5)  return 43.5 + (val - 4) * 10.5;
    if (val <= 10) return 54   + (val - 5) * 1.2;
    return 60;
}

// D7 : No = 50, Yes = 73
function pointsRad(present) {
    return present ? 73 : 50;
}

// D8 : somme ; « unable to calculate » si plus d'une donnée manque
function calculateStep1Points(inputs) {
    const details = {
        fvc_dlco: pointsFvcDlco(inputs.fvc_dlco),
        telang:   pointsTelang(inputs.telang),
        aca:      pointsAca(inputs.aca),
        ntprobnp: pointsNtproBnp(inputs.ntprobnp),
        urate:    pointsUrate(inputs.urate),
        rad:      pointsRad(inputs.rad)
    };

    const missing = [inputs.fvc_dlco, inputs.ntprobnp, inputs.urate].filter(v => v == null).length;

    const total = details.fvc_dlco + details.telang + details.aca +
                  details.ntprobnp + details.urate + details.rad;

    const displayDetails = {};
    for (const key in details) {
        displayDetails[key] = Math.round(details[key]);
    }

    return {
        unable:     missing > 1,
        missing:    missing,
        total:      Math.round(total),
        totalExact: total,
        details:    displayDetails,
        detailsExact: details,
        threshold:  300,
        isHighRisk: total > 300
    };
}

// D11 : conversion du total de l'étape 1
function pointsStep1Conversion(step1Total) {
    return 10 + ((step1Total - 300) * 0.357);
}

// D12 : surface OD en cm² (absente → 10)
function pointsRaArea(val) {
    if (val == null) return 10;
    return 4 + (val * 0.375);
}

// D13 : vélocité IT en m/s (absente → 10)
function pointsTrVel(v) {
    if (v == null) return 10;
    if (v <= 1.5) return 6.5 + ((v - 0)   / 1.5) * (8 - 6.5);
    if (v <= 2.5) return 8   + ((v - 1.5) / 1)   * (10 - 8);
    if (v <= 3)   return 10  + ((v - 2.5) / 0.5) * (15 - 10);
    if (v <= 3.5) return 15  + ((v - 3)   / 0.5) * (22.5 - 15);
    if (v <= 4)   return 22.5 + ((v - 3.5) / 0.5) * (30 - 22.5);
    if (v <= 4.5) return 30  + ((v - 4)   / 0.5) * (37.5 - 30);
    if (v <= 5)   return 37.5 + ((v - 4.5) / 0.5) * (45 - 37.5);
    return 45;
}

// D15 : somme D11 + D12 + D13
function calculateStep2Points(s1Result, raArea, trVel) {
    const s1Total = (typeof s1Result === 'object') ? s1Result.totalExact : s1Result;

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

    return {
        total:        Math.round(totalExact),
        totalExact:   totalExact,
        details:      displayDetails,
        detailsExact: detailsExact,
        threshold:    35,
        isReferral:   totalExact > 35
    };
}

window.DETECT = {
    calculateStep1Points,
    calculateStep2Points,

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
