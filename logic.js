
function pointsFvcDlco(ratio) {
    return 28 + (ratio * 14.4);
}

function pointsTelang(present) {
    return present ? 65 : 50;
}

function pointsAca(present) {
    return present ? 59 : 50;
}

function pointsNtproBnp(val) {
    if (val <= 0) val = 1; 
    return 27.5 + (Math.log10(val) * 11.3);
}

function pointsUrate(val) {
    if (val < 2)   return 0;
    if (val <= 3)  return 12.5 + (val - 2) * 15;
    if (val <= 4)  return 27.5 + (val - 3) * 16;
    if (val <= 5)  return 43.5 + (val - 4) * 10.5;
    if (val <= 10) return 54   + (val - 5) * 1.2;
    return 60;
}

function pointsRad(present) {
    return present ? 73 : 50;
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
        isHighRisk: totalRounded > 300
    };
}

function pointsStep1Conversion(step1Total) {
    return 10 + ((step1Total - 300) * 0.357);
}

function pointsRaArea(val) {
    return 4 + (val * 0.375);
}

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

function calculateStep2Points(s1Result, raArea, trVel) {

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
        linearScore:  totalExact,   
        probability:  totalRounded / 100,  
        threshold:    35,
        isReferral:   totalRounded > 35
    };
}

function calculateStep1Exact(inputs) {
    const res = calculateStep1Points(inputs);
    return {
        step1_score_linear: res.totalExact,
        step1_probability: res.total / 500, 
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
