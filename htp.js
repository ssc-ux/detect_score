/* Onglet « Comprendre l'HTP » : simulateur hémodynamique, mécanismes des groupes, quiz.
   Modèle pédagogique simplifié : PAPm = PAPO + RVP × DC. */
(function () {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
    var fr = function (v, d) {
        return v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
    };
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* ---------- Données ---------- */

    var PRESETS = {
        normal: { pvr: 1.2, pawp: 9, co: 5.5, ov: null,
            hint: "Circulation à basse pression : artérioles larges, VD fin, VG bien circulaire en petit axe." },
        g1: { pvr: 8, pawp: 10, co: 4.0, ov: '1',
            hint: "La lumière des artérioles se rétrécit : la PAPm monte alors que l'OG reste normale (PAPO ≤ 15). Le VD se dilate et aplatit le septum." },
        g2i: { pvr: 1.5, pawp: 22, co: 5.0, ov: '2',
            hint: "L'OG est dilatée : la pression remonte passivement dans les veines puis dans l'AP. Les artérioles restent fines (RVP ≤ 2 UW)." },
        g2c: { pvr: 4.0, pawp: 24, co: 4.5, ov: '2',
            hint: "L'hyperpression prolongée a remodelé les artérioles : une RVP > 2 UW s'ajoute à la PAPO élevée. Pronostic plus sévère." },
        g3: { pvr: 3.5, pawp: 9, co: 5.0, ov: '3',
            hint: "L'hypoxie alvéolaire contracte les artérioles (vasoconstriction hypoxique) et la destruction du lit capillaire réduit la surface vasculaire. HTP souvent modérée." },
        g4: { pvr: 9, pawp: 10, co: 3.8, ov: '4',
            hint: "Des caillots organisés obstruent les artères pulmonaires : la résistance augmente mécaniquement, cœur gauche normal." },
        g5: { pvr: 4.5, pawp: 12, co: 4.8, ov: '5',
            hint: "Plusieurs mécanismes intriqués (compression, atteinte vasculaire, cœur gauche…), souvent dans une même maladie, comme la sarcoïdose." },
        hd: { pvr: 1.5, pawp: 10, co: 9.0, ov: 'hd',
            hint: "Débit élevé (shunt, fistule artérioveineuse, anémie) : la PAPm monte sans hausse de la RVP ni de la PAPO." }
    };

    var PROFILES = {
        none: { label: "Pas d'HTP", cls: 'is-good',
            txt: "PAPm ≤ 20 mmHg : pressions pulmonaires normales." },
        pre: { label: 'HTP précapillaire', cls: 'is-bad',
            txt: "Le problème est en amont des capillaires : les artérioles résistent (RVP > 2 UW) alors que la pression gauche est normale (PAPO ≤ 15). Groupes 1, 3, 4 (et 5)." },
        ipc: { label: 'HTP post-capillaire isolée', cls: 'is-warn',
            txt: "La pression remonte depuis le cœur gauche (PAPO > 15) ; les artérioles sont saines (RVP ≤ 2 UW). Groupe 2." },
        cpc: { label: 'HTP post-capillaire combinée', cls: 'is-bad',
            txt: "Rétro-transmission gauche (PAPO > 15) et composante artériolaire surajoutée (RVP > 2 UW). Groupe 2 évolué." },
        uncl: { label: 'HTP non classée', cls: 'is-info',
            txt: "PAPm élevée par le seul débit, sans résistance ni pression gauche anormale (shunt, hyperdébit)." }
    };

    var GROUPS = {
        '1': {
            title: 'Groupe 1 · Hypertension artérielle pulmonaire (HTAP)',
            site: 'Précapillaire · petites artérioles (< 500 µm)',
            chain: [
                "Agression de l'endothélium : auto-immunité de la ScS, mutation BMPR2, toxique, VIH…",
                "Déséquilibre des médiateurs : endothéline-1 ↑, monoxyde d'azote (NO) ↓, prostacycline ↓",
                "Vasoconstriction, prolifération des cellules musculaires lisses et endothéliales (lésions plexiformes), thrombose in situ",
                "Lumière artériolaire rétrécie → RVP ↑ → PAPm ↑ avec PAPO normale",
                "Post-charge du VD ↑ : hypertrophie, puis dilatation et insuffisance cardiaque droite"
            ],
            ex: "HTAP idiopathique, héritable, médicamenteuse ou toxique, associée aux connectivites (ScS ++), au VIH, à l'hypertension portale, aux cardiopathies congénitales, à la schistosomiase.",
            exam: "Cathétérisme cardiaque droit (profil précapillaire) après avoir écarté les groupes 2, 3 et 4. Dans la ScS : dépistage annuel (DETECT).",
            ttt: "Traitements ciblant les 3 voies (endothéline, NO, prostacycline) ± sotatercept (voie de l'activine).",
            presets: [['g1', 'Voir dans le simulateur']]
        },
        '2': {
            title: 'Groupe 2 · Cardiopathie gauche',
            site: 'Post-capillaire · veines pulmonaires et cœur gauche',
            chain: [
                "Pressions de remplissage du VG ↑ : dysfonction diastolique ou systolique, valvulopathie mitrale ou aortique",
                "Pression de l'OG ↑, transmise passivement aux veines et capillaires pulmonaires (PAPO > 15)",
                "PAPm ↑ par rétro-transmission, RVP normale : HTP post-capillaire isolée",
                "Si l'hyperpression dure : remodelage veineux puis artériel, vasoconstriction → RVP > 2 UW : HTP post-capillaire combinée",
                "Post-charge du VD ↑ → dysfonction VD, de mauvais pronostic"
            ],
            ex: "Cause la plus fréquente d'HTP. Insuffisance cardiaque à FE préservée (surtout) ou réduite, valvulopathies mitrales et aortiques, cardiomyopathies.",
            exam: "Échocardiographie (OG dilatée, dysfonction diastolique) ; cathétérisme droit avec mesure de la PAPO si doute.",
            ttt: "Traiter la cardiopathie gauche ; les traitements spécifiques de l'HTAP ne sont pas recommandés.",
            presets: [['g2i', 'Simuler : isolée'], ['g2c', 'Simuler : combinée']]
        },
        '3': {
            title: 'Groupe 3 · Maladie respiratoire ou hypoxie',
            site: 'Précapillaire · lit vasculaire pulmonaire',
            chain: [
                "Hypoxie alvéolaire : BPCO, pneumopathie interstitielle, hypoventilation, altitude",
                "Vasoconstriction pulmonaire hypoxique (réflexe d'Euler-Liljestrand) étendue à tout le poumon",
                "Destruction du lit capillaire (emphysème, fibrose) : moins de vaisseaux pour le même débit",
                "Remodelage chronique des artérioles → RVP ↑ → PAPm ↑, le plus souvent modérée",
                "HTP sévère (RVP > 5 UW) chez une minorité : pronostic plus réservé"
            ],
            ex: "BPCO, emphysème, pneumopathies interstitielles (dont la PID de la ScS), syndrome emphysème-fibrose, syndrome obésité-hypoventilation, haute altitude.",
            exam: "EFR, gazométrie, scanner thoracique ; cathétérisme droit si la prise en charge en dépend.",
            ttt: "Traiter la maladie respiratoire, oxygène si hypoxémie ; tréprostinil inhalé possible dans l'HTP des PID.",
            presets: [['g3', 'Voir dans le simulateur']]
        },
        '4': {
            title: 'Groupe 4 · Obstruction des artères pulmonaires',
            site: 'Précapillaire · artères proximales et segmentaires',
            chain: [
                "Embolie pulmonaire dont le caillot ne se résorbe pas complètement",
                "Le thrombus s'organise en tissu fibreux adhérent à la paroi (bandes, membranes)",
                "Obstruction mécanique des artères pulmonaires → RVP ↑",
                "Les territoires restés libres reçoivent tout le débit → microvasculopathie secondaire, RVP ↑ encore",
                "Insuffisance cardiaque droite progressive"
            ],
            ex: "HTP thromboembolique chronique (HTP-TEC) ; plus rarement sarcome de l'artère pulmonaire, artérites, parasitoses.",
            exam: "Scintigraphie de ventilation/perfusion (défects de perfusion non concordants) après ≥ 3 mois d'anticoagulation, puis angioscanner et angiographie.",
            ttt: "Anticoagulation au long cours ; endartériectomie pulmonaire (guérison possible), angioplastie par ballonnet, riociguat.",
            presets: [['g4', 'Voir dans le simulateur']]
        },
        '5': {
            title: 'Groupe 5 · Mécanismes multiples ou incertains',
            site: 'Variable selon la maladie',
            chain: [
                "Compression extrinsèque des vaisseaux : médiastinite fibrosante, adénopathies, tumeur",
                "Atteinte vasculaire directe : granulomes (sarcoïdose), microangiopathie thrombotique tumorale",
                "Captation du NO par l'hémoglobine libre : anémies hémolytiques chroniques",
                "Hyperdébit et surcharge : insuffisance rénale chronique avec fistule artérioveineuse",
                "Souvent plusieurs mécanismes intriqués, dont une composante cardiaque gauche ou respiratoire"
            ],
            ex: "Sarcoïdose, histiocytose langerhansienne, syndromes myéloprolifératifs, anémies hémolytiques chroniques, insuffisance rénale chronique, maladies métaboliques (Gaucher, glycogénoses), médiastinite fibrosante, cardiopathies congénitales complexes.",
            exam: "Bilan orienté par la maladie causale ; cathétérisme droit pour préciser la part de chaque mécanisme.",
            ttt: "Traiter la maladie causale ; traitements de l'HTAP au cas par cas, en centre expert.",
            presets: [['g5', 'Voir dans le simulateur']]
        }
    };

    var DETECT = [
        ['Rapport CVF % / DLCO %', '↑', "La vasculopathie réduit le volume sanguin capillaire, donc la DLCO, alors que la CVF reste normale (pas de fibrose)."],
        ['Télangiectasies', '+', "Témoin cutané de la microangiopathie diffuse de la ScS, qui touche aussi les artérioles pulmonaires."],
        ['Anticorps anti-centromère', '+', "Associés à la forme cutanée limitée, le phénotype vasculaire le plus exposé à l'HTAP."],
        ['NT-proBNP', '↑', "Sécrété par les cardiomyocytes étirés : reflète la distension du VD sous post-charge élevée."],
        ['Uricémie', '↑', "Augmente avec l'hypoxie tissulaire et le bas débit (catabolisme des purines) : marqueur de sévérité."],
        ['Déviation axiale droite (ECG)', '+', "Traduit l'hypertrophie du VD face à la post-charge élevée."],
        ['Surface de l\'OD (écho)', '↑', "L'OD se dilate quand la pression de remplissage droite monte.", 'raa'],
        ['Vmax IT (écho)', '↑', "La vitesse du jet d'IT donne le gradient VD-OD (4 V²), donc une estimation de la PAPs.", 'trv']
    ];

    var TOUR = [
        { k: 'normal', t: 'Le circuit normal',
            x: "Le poumon reçoit tout le débit cardiaque sous une pression moyenne d'environ 15 mmHg : son lit vasculaire est immense et très compliant. Le VD, à paroi fine, travaille à basse pression." },
        { v: { pvr: 3.5, pawp: 9, co: 5.2 }, ov: '1', t: 'HTAP débutante',
            x: "Les artérioles se remodèlent : la RVP dépasse 2 UW et la PAPm franchit 20 mmHg. Le VD compense et le débit reste normal ; le patient est encore peu symptomatique, d'où l'intérêt du dépistage (DETECT)." },
        { k: 'g1', t: 'HTAP évoluée (groupe 1)',
            x: "La RVP continue de monter : le VD se dilate, le septum s'aplatit et comprime le VG, le débit chute. Piège : quand le débit baisse, la PAPm peut cesser de monter alors que la maladie s'aggrave." },
        { k: 'g2i', t: 'Cœur gauche : post-capillaire isolée (groupe 2)', x: null },
        { k: 'g2c', t: 'Cœur gauche : post-capillaire combinée (groupe 2)', x: null },
        { k: 'g3', t: 'Poumon et hypoxie (groupe 3)', x: null },
        { k: 'g4', t: 'Obstruction artérielle (groupe 4)', x: null },
        { k: 'g5', t: 'Mécanismes multiples (groupe 5)', x: null },
        { k: 'hd', t: 'Hyperdébit : HTP non classée', x: null },
        { k: 'normal', t: 'À retenir',
            x: "PAPO ≤ 15 et RVP > 2 UW : précapillaire (groupes 1, 3, 4, parfois 5). PAPO > 15 : post-capillaire (groupe 2), combinée si RVP > 2 UW. L'échographie estime une probabilité ; seul le cathétérisme droit tranche." }
    ];

    var GLOSSARY = {
        'PAPm': "Pression artérielle pulmonaire moyenne, mesurée au cathétérisme droit. HTP si > 20 mmHg.",
        'PAPs': "Pression artérielle pulmonaire systolique, estimée en échographie à partir de la Vmax IT.",
        'PAPO': "Pression artérielle pulmonaire d'occlusion (« capillaire ») : reflet de la pression de l'OG. Normale ≤ 15 mmHg.",
        'RVP': "Résistance vasculaire pulmonaire = (PAPm − PAPO) / DC. Anormale si > 2 UW.",
        'GTP': "Gradient transpulmonaire = PAPm − PAPO : la part de pression due au lit vasculaire pulmonaire.",
        'UW': "Unité Wood = mmHg·min/L (1 UW = 80 dyn·s·cm⁻⁵).",
        'DC': "Débit cardiaque, en L/min (environ 4 à 8 L/min au repos).",
        'POD': "Pression de l'oreillette droite, estimée en échographie par la veine cave inférieure.",
        'Vmax IT': "Vitesse maximale du jet d'insuffisance tricuspide. PAPs ≈ 4 × Vmax² + POD.",
        'HTAP': "Hypertension artérielle pulmonaire : HTP précapillaire du groupe 1.",
        'HTP-TEC': "HTP thromboembolique chronique (groupe 4).",
        'ScS': "Sclérodermie systémique.",
        'DLCO': "Capacité de diffusion du monoxyde de carbone : explore la surface d'échange alvéolo-capillaire.",
        'CVF': "Capacité vitale forcée.",
        'PID': "Pneumopathie interstitielle diffuse.",
        'NT-proBNP': "Peptide natriurétique libéré par les cardiomyocytes étirés."
    };
    var GLOSS_RE = new RegExp('(^|[^\\wÀ-ÿ-])(' + Object.keys(GLOSSARY).sort(function (a, b) { return b.length - a.length; })
        .map(function (k) { return k.replace(/[-]/g, '\\-'); }).join('|') + ')(?![\\wÀ-ÿ-])');

    var GROUP_OPTS = ['Groupe 1', 'Groupe 2', 'Groupe 3', 'Groupe 4', 'Groupe 5'];
    var PROFILE_OPTS = ["Pas d'HTP", 'Précapillaire', 'Post-capillaire isolée', 'Post-capillaire combinée', 'Non classée'];

    var QUIZ = [
        { t: 'g', a: 0, h: { pawp: 9, pvr: 6.9, co: 4.2 },
            q: "Femme de 58 ans, ScS cutanée limitée, ACA+, DLCO 38 %, CVF 95 %. Cathétérisme : PAPm 38, PAPO 9 mmHg, DC 4,2 L/min. Quel groupe ?",
            e: "RVP = (38 − 9) / 4,2 ≈ 6,9 UW : profil précapillaire, sans fibrose (CVF normale) ni cardiopathie gauche. HTAP associée à la ScS (groupe 1)." },
        { t: 'p', a: 2, h: { pawp: 22, pvr: 1.9, co: 5.4 },
            q: "Homme de 76 ans, HTA, fibrillation atriale, obésité, FEVG 60 %, OG dilatée. Cathétérisme : PAPm 32, PAPO 22 mmHg, DC 5,4 L/min. Quel profil ?",
            e: "PAPO > 15 et RVP = (32 − 22) / 5,4 ≈ 1,9 UW ≤ 2 : post-capillaire isolée, typique de l'insuffisance cardiaque à FE préservée (groupe 2)." },
        { t: 'g', a: 2, h: { pawp: 10, pvr: 3.4, co: 5.0 },
            q: "BPCO très sévère, PaO₂ 55 mmHg. Cathétérisme : PAPm 27, PAPO 10 mmHg, DC 5 L/min. Quel groupe ?",
            e: "Précapillaire modérée (RVP 3,4 UW) dans un contexte d'hypoxémie chronique : groupe 3." },
        { t: 'g', a: 3, h: { pawp: 11, pvr: 8.5, co: 3.9 },
            q: "Dyspnée persistante 6 mois après une embolie pulmonaire, malgré l'anticoagulation. Scintigraphie V/Q : défects de perfusion multiples non concordants. Quel groupe ?",
            e: "Défects de perfusion non concordants après ≥ 3 mois d'anticoagulation : HTP thromboembolique chronique (groupe 4), parfois curable par endartériectomie." },
        { t: 'p', a: 0, h: { pawp: 8, pvr: 2.2, co: 5.0 },
            q: "Cathétérisme : PAPm 19, PAPO 8 mmHg, DC 5 L/min. Quel profil ?",
            e: "Le seuil est une PAPm > 20 mmHg (ESC/ERS 2022). À 19 mmHg, il n'y a pas d'HTP, même avec une RVP à 2,2 UW." },
        { t: 'p', a: 3, h: { pawp: 25, pvr: 4.2, co: 3.6 },
            q: "Insuffisance cardiaque à FE réduite. Cathétérisme : PAPm 40, PAPO 25 mmHg, DC 3,6 L/min. Quel profil ?",
            e: "PAPO > 15 et RVP = (40 − 25) / 3,6 ≈ 4,2 UW > 2 : post-capillaire combinée, de pronostic plus sombre." },
        { t: 'g', a: 4, h: { pawp: 12, pvr: 4.8, co: 4.8 },
            q: "Sarcoïdose stade IV avec fibrose et adénopathies médiastinales compressives. HTP précapillaire au cathétérisme. Quel groupe ?",
            e: "La sarcoïdose associe compression, fibrose, atteinte vasculaire et parfois cardiaque : groupe 5." },
        { t: 'p', a: 4, h: { pawp: 10, pvr: 1.8, co: 9.0 },
            q: "Hémodialysé avec fistule artérioveineuse à haut débit. Cathétérisme : PAPm 26, PAPO 10 mmHg, DC 9 L/min. Quel profil ?",
            e: "RVP = 16 / 9 ≈ 1,8 UW et PAPO normale : la PAPm monte par le seul débit. HTP non classée (la maladie rénale chronique relève du groupe 5)." },
        // Questions sur schéma : le simulateur est photographié dans l'état du cas
        { t: 'g', a: 3, vis: 'g4',
            q: "Observez le schéma : PAPO normale, RVP élevée et lésions dans l'artère pulmonaire. Quel groupe ?",
            e: "Obstruction mécanique par des thrombus organisés : HTP thromboembolique chronique (groupe 4)." },
        { t: 'p', a: 2, vis: 'g2i',
            q: "Observez le schéma (OG, PAPO, RVP). Quel profil hémodynamique ?",
            e: "OG dilatée, PAPO 22 mmHg, RVP 1,5 UW : la pression remonte du cœur gauche sans atteinte artériolaire. Post-capillaire isolée." },
        { t: 'g', a: 2, vis: 'g3',
            q: "Observez le schéma : alvéoles mal ventilées, HTP précapillaire modérée. Quel groupe ?",
            e: "L'hypoxie alvéolaire entraîne une vasoconstriction et un remodelage artériolaires : groupe 3." },
        { t: 'p', a: 4, vis: 'hd',
            q: "Observez le schéma (DC, RVP, PAPO). Quel profil hémodynamique ?",
            e: "DC 9 L/min, RVP 1,5 UW, PAPO 10 mmHg : la PAPm monte par le seul débit. HTP non classée." }
    ];

    /* ---------- Modèle ---------- */

    function compute(pvr, pawp, co) {
        var mpap = pawp + pvr * co;
        var pod = clamp(4 + 0.3 * Math.max(0, mpap - 25), 3, 22);
        var paps = (mpap - 2) / 0.61;                          // Chemla : PAPm = 0,61 PAPs + 2
        var trv = Math.round(Math.sqrt(Math.max(0, paps - pod) / 4) * 10) / 10;
        var raa = 13 + (pod - 4) * 1.1;
        var prof;
        if (mpap <= 20) prof = 'none';
        else if (pawp <= 15) prof = pvr > 2 ? 'pre' : 'uncl';
        else prof = pvr > 2 ? 'cpc' : 'ipc';
        return { mpap: mpap, pod: pod, paps: paps, trv: trv, raa: raa, prof: prof };
    }

    /* ---------- Simulateur ---------- */

    var el = {};
    var state = { co: 5.5, ov: null };
    var last = null;
    var view3d = null;

    function render() {
        var pvr = +el.pvr.value, pawp = +el.pawp.value, co = +el.co.value;
        var r = compute(pvr, pawp, co);
        state.co = co;

        el.pvrOut.textContent = fr(pvr, 1) + ' UW';
        el.pawpOut.textContent = pawp + ' mmHg';
        el.coOut.textContent = fr(co, 1) + ' L/min';
        el.formula.innerHTML = 'PAPm = ' + pawp + ' + ' + fr(pvr, 1) + ' × ' + fr(co, 1) +
            ' = <strong>' + Math.round(r.mpap) + ' mmHg</strong>';

        el.mpap.textContent = Math.round(r.mpap);
        var p = PROFILES[r.prof];
        el.profile.textContent = p.label;
        el.profile.className = 'htp-badge ' + p.cls;
        if (el.profileTxt.dataset.prof !== r.prof) {
            el.profileTxt.dataset.prof = r.prof;
            el.profileTxt.textContent = p.txt;
            glossify(el.profileTxt);
        }
        el.tpg.textContent = Math.round(r.mpap - pawp) + ' mmHg';

        el.paps.textContent = '≈ ' + Math.round(r.paps) + ' mmHg';
        el.pod.textContent = '≈ ' + Math.round(r.pod) + ' mmHg';
        el.trv.textContent = '≈ ' + fr(r.trv, 1) + ' m/s';
        el.raa.textContent = '≈ ' + Math.round(r.raa) + ' cm²';
        var proba = r.trv <= 2.8 ? ['faible', 'is-good'] : r.trv <= 3.4 ? ['intermédiaire', 'is-warn'] : ['élevée', 'is-bad'];
        el.proba.textContent = 'Probabilité échographique ' + proba[0] + ' (sur la seule Vmax IT)';
        el.proba.className = 'htp-badge htp-badge-sm ' + proba[1];

        // Étiquettes de pression sur le schéma
        el.tPap.textContent = 'PAPm ' + Math.round(r.mpap);
        el.tPod.textContent = 'POD ' + Math.round(r.pod);
        el.tPapo.textContent = 'PAPO ' + pawp;
        el.tRvp.textContent = 'RVP ' + fr(pvr, 1) + ' UW';
        el.tDc.textContent = 'DC ' + fr(co, 1) + ' L/min';
        el.tPap.classList.toggle('is-high', r.mpap > 20);
        el.tPapo.classList.toggle('is-high', pawp > 15);
        el.tRvp.classList.toggle('is-high', pvr > 2);

        // Géométrie
        var k = clamp((r.mpap - 20) / 30, 0, 1);              // post-charge du VD
        el.lumen.setAttribute('height', clamp(20 - (pvr - 1) * 1.25, 3, 20).toFixed(1));
        el.lumen.setAttribute('y', (130 - +el.lumen.getAttribute('height') / 2).toFixed(1));
        el.pa.style.strokeWidth = (10 + clamp((r.mpap - 15) / 35, 0, 1) * 10).toFixed(1);
        el.rv.setAttribute('rx', (40 + k * 22).toFixed(1));
        el.rv.setAttribute('ry', (32 + k * 12).toFixed(1));
        el.rv.style.strokeWidth = (2 + k * 3).toFixed(1);
        var raR = 28 + clamp((r.pod - 4) / 12, 0, 1) * 18;
        el.ra.setAttribute('rx', raR.toFixed(1));
        el.ra.setAttribute('ry', (raR * 0.85).toFixed(1));
        var laR = 28 + clamp((pawp - 8) / 20, 0, 1) * 18;
        el.la.setAttribute('rx', laR.toFixed(1));
        el.la.setAttribute('ry', (laR * 0.85).toFixed(1));
        var jet = clamp((r.trv - 2.6) / 1.4, 0, 1);
        el.jet.style.opacity = jet ? (0.35 + jet * 0.65).toFixed(2) : 0;
        el.jet.style.strokeWidth = (1.5 + jet * 4).toFixed(1);

        renderShortAxis(r.mpap);
        renderDetectLive(r);
        last = { pvr: pvr, pawp: pawp, co: co, mpap: r.mpap, pod: r.pod, ov: state.ov };
        if (el.hud) {
            el.hud.innerHTML = '<b>PAPm ' + Math.round(r.mpap) + '</b> mmHg · RVP ' + fr(pvr, 1) + ' UW · PAPO ' + pawp +
                ' · DC ' + fr(co, 1) + '<span class="htp3d-hud-prof ' + p.cls + '">' + p.label + '</span>';
        }
        if (view3d) view3d.update(last);
    }

    function renderShortAxis(mpap) {
        var k = clamp((mpap - 20) / 30, 0, 1);
        var f = clamp((mpap - 25) / 22, 0, 1.1);              // aplatissement du septum
        var cx = 112, top = 52, bot = 128;
        var sx = (cx - 50.7 * (1 - f)).toFixed(1);
        var w = (64 + k * 50).toFixed(1), h = (6 + k * 16).toFixed(1);
        el.saLv.setAttribute('d', 'M' + cx + ',' + top + ' A38,38 0 0 1 ' + cx + ',' + bot +
            ' C' + sx + ',' + bot + ' ' + sx + ',' + top + ' ' + cx + ',' + top + 'Z');
        el.saRv.setAttribute('d', 'M' + cx + ',' + top + ' C' + (cx - w) + ',' + (top - h) + ' ' + (cx - w) + ',' +
            (bot + +h) + ' ' + cx + ',' + bot + ' C' + sx + ',' + bot + ' ' + sx + ',' + top + ' ' + cx + ',' + top + 'Z');
        el.saRv.style.strokeWidth = (2 + k * 3).toFixed(1);
        el.saCap.textContent = f < 0.3 ? 'Petit axe : septum normal, VG circulaire'
            : f < 0.85 ? 'Petit axe : septum aplati, VG en «\u00a0D\u00a0»'
            : 'Petit axe : septum paradoxal, VG comprimé';
    }

    function setOverlay(ov) {
        state.ov = ov;
        document.querySelectorAll('.htp-ov').forEach(function (g) {
            g.classList.toggle('is-on', g.id === 'htp-ov-' + ov);
        });
        el.svg.classList.toggle('is-hypoxic', ov === '3');
    }

    function setPresetUI(presetKey, ov) {
        var pr = presetKey && PRESETS[presetKey];
        state.preset = presetKey || null;
        setOverlay(ov !== undefined ? ov : pr ? pr.ov : null);
        el.hint.hidden = !pr || tour.on;
        if (pr) {
            el.hint.innerHTML = '<strong>À observer :</strong> ' + pr.hint;
            glossify(el.hint);
        }
        document.querySelectorAll('.htp-chip[data-preset]').forEach(function (c) {
            var on = c.dataset.preset === presetKey;
            c.classList.toggle('is-on', on);
            c.setAttribute('aria-pressed', on);
        });
    }

    var tweenId = 0;
    function applyValues(v, presetKey, ov) {
        cancelAnimationFrame(tweenId);
        setPresetUI(presetKey, ov);
        el.pvr.value = v.pvr;
        el.pawp.value = v.pawp;
        el.co.value = v.co;
        render();
    }

    // Transition animée des curseurs vers de nouvelles valeurs
    function tweenTo(v, presetKey, ov) {
        if (reducedMotion.matches) return applyValues(v, presetKey, ov);
        cancelAnimationFrame(tweenId);
        setPresetUI(presetKey, ov);
        var from = { pvr: +el.pvr.value, pawp: +el.pawp.value, co: +el.co.value };
        var t0 = performance.now();
        (function step(now) {
            var t = Math.min(1, (now - t0) / 1200);
            var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            el.pvr.value = from.pvr + (v.pvr - from.pvr) * e;
            el.pawp.value = Math.round(from.pawp + (v.pawp - from.pawp) * e);
            el.co.value = from.co + (v.co - from.co) * e;
            render();
            if (t < 1) tweenId = requestAnimationFrame(step);
        })(t0);
    }

    function goSim(v, presetKey, ov) {
        stopTour();
        tweenTo(v, presetKey, ov);
        $('htp-sim').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
    }

    /* ---------- Visite guidée ---------- */

    var tour = { on: false, i: 0, play: true, timer: 0 };

    function tourGo(i) {
        tour.i = clamp(i, 0, TOUR.length - 1);
        var s = TOUR[tour.i];
        tweenTo(s.v || PRESETS[s.k], s.k || null, s.ov);
        $('htp-tour-step').textContent = 'Étape ' + (tour.i + 1) + ' / ' + TOUR.length;
        $('htp-tour-title').textContent = s.t;
        $('htp-tour-text').textContent = s.x || PRESETS[s.k].hint;
        glossify($('htp-tour-text'));
        el.tour.querySelector('[data-tour="prev"]').disabled = tour.i === 0;
        el.tour.querySelector('[data-tour="next"]').textContent = tour.i === TOUR.length - 1 ? 'Terminer' : 'Suivant ▶';
        scheduleTour();
    }

    function scheduleTour() {
        clearTimeout(tour.timer);
        $('htp-tour-play').textContent = tour.play ? '⏸ Pause' : '▶ Lecture';
        if (tour.play && tour.i < TOUR.length - 1) tour.timer = setTimeout(function () { tourGo(tour.i + 1); }, 11000);
    }

    function startTour() {
        tour.on = true;
        tour.play = !reducedMotion.matches;
        el.tour.hidden = false;
        el.hint.hidden = true;
        el.patient.hidden = true;
        tourGo(0);
        $('htp-sim').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
    }

    function stopTour() {
        if (!tour.on) return;
        tour.on = false;
        clearTimeout(tour.timer);
        el.tour.hidden = true;
    }

    /* ---------- Depuis le calculateur DETECT ---------- */

    function fromPatient() {
        var trv = parseFloat($('tr_vel').value), raa = parseFloat($('ra_area').value);
        if (isNaN(trv)) return;
        var pod = isNaN(raa) ? 5 : clamp(4 + (raa - 13) / 1.1, 3, 22);
        var paps = 4 * trv * trv + pod;
        var mpap = 0.61 * paps + 2;
        var pvr = clamp(Math.round((mpap - 10) / 5 * 10) / 10, 0.5, 15);
        document.querySelector('.tab-btn[data-tab="tab-htp"]').click();
        goSim({ pvr: pvr, pawp: 10, co: 5 }, null);
        el.patient.hidden = false;
        el.patient.innerHTML = '<button type="button" class="htp-tour-x" aria-label="Fermer">✕</button>' +
            '<strong>Votre patient :</strong> Vmax IT ' + fr(trv, 1) + ' m/s' +
            (isNaN(raa) ? '' : ', surface OD ' + fr(raa, 0) + ' cm²') + ' → PAPs ≈ ' + Math.round(paps) +
            ' mmHg, PAPm ≈ ' + Math.round(10 + pvr * 5) + ' mmHg.<br>PAPO et débit sont inconnus sans cathétérisme : ' +
            'hypothèse PAPO 10 mmHg et DC 5 L/min, d\'où une RVP ≈ ' + fr(pvr, 1) + ' UW. ' +
            'Bougez les curseurs pour voir les autres explications possibles. ' +
            '<small>Les estimations échographiques du simulateur suivent son propre modèle et peuvent différer de vos mesures.</small>';
    }

    /* ---------- Vue 3D ---------- */

    var loading3d = false;
    // Grand écran : 3D et schéma 2D côte à côte ; sinon bascule 2D / 3D
    var wideMQ = window.matchMedia('(min-width: 1100px)');
    function layoutView() {
        if (!document.body.classList.contains('is-htp')) return;
        if (wideMQ.matches) {
            el.d2.hidden = false;
            el.d3.hidden = false;
            load3d();
        } else {
            setViewMode(document.querySelector('input[name="htp-view"]:checked').value);
        }
    }

    function setViewMode(mode) {
        var is3d = mode === '3d';
        el.d2.hidden = is3d;
        el.d3.hidden = !is3d;
        if (is3d) load3d();
    }

    function load3d() {
        if (view3d || loading3d) return;
        var msg = el.d3.querySelector('.htp3d-msg');
        var c = document.createElement('canvas');
        if (!(c.getContext('webgl2') || c.getContext('webgl'))) {
            msg.hidden = false;
            msg.textContent = 'Vue 3D indisponible sur cet appareil (WebGL désactivé).';
            return;
        }
        loading3d = true;
        msg.hidden = false;
        msg.textContent = 'Chargement de la 3D…';
        import('./htp3d.js?v=8').then(function (m) {
            view3d = m.mount(el.d3);
            if (last) view3d.update(last);
            msg.hidden = true;
        }).catch(function (err) {
            console.error(err);
            msg.textContent = 'Impossible de charger la vue 3D.';
        }).then(function () { loading3d = false; });
    }

    /* ---------- Particules (débit) ---------- */

    var FLOW = 'M20,80 H80 L90,170 L112,152 C140,120 170,130 254,130 H374 C420,130 470,100 516,98 ' +
        'L548,96 L550,188 L592,190 H620 V262 H20 Z';
    var flow = { len: 0, sCap: 0, sRet: 0, dots: [], t: null, last: 0 };

    function initParticles() {
        var ns = 'http://www.w3.org/2000/svg';
        var path = document.createElementNS(ns, 'path');
        path.setAttribute('d', FLOW);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'none');
        el.particles.appendChild(path);
        flow.path = path;
        flow.len = path.getTotalLength();
        if (!flow.len) return;
        for (var s = 0; s < flow.len; s += 2) {
            var pt = path.getPointAtLength(s);
            if (!flow.sCap && pt.x >= 345 && pt.y < 200) flow.sCap = s;
            if (!flow.sRet && pt.y > 250 && pt.x <= 320) flow.sRet = s;
        }
        var n = 18;
        for (var i = 0; i < n; i++) {
            var c = document.createElementNS(ns, 'circle');
            c.setAttribute('r', 3);
            c.setAttribute('class', 'htp-dot-p');
            el.particles.appendChild(c);
            flow.dots.push({ c: c, s: (flow.len / n) * i });
        }
        placeDots(0);
        flow.t = requestAnimationFrame(tick);
    }

    function placeDots(dt) {
        var v = state.co * 22;                                 // px/s, proportionnel au débit
        flow.dots.forEach(function (d) {
            d.s = (d.s + v * dt) % flow.len;
            var pt = flow.path.getPointAtLength(d.s);
            d.c.setAttribute('cx', pt.x.toFixed(1));
            d.c.setAttribute('cy', pt.y.toFixed(1));
            var art = d.s >= flow.sCap && d.s < flow.sRet;
            d.c.classList.toggle('is-a', art);
        });
    }

    function tick(now) {
        var dt = flow.last ? Math.min(0.05, (now - flow.last) / 1000) : 0;
        flow.last = now;
        if (!reducedMotion.matches && el.svg.getBoundingClientRect().width > 0 && !document.hidden) placeDots(dt);
        flow.t = requestAnimationFrame(tick);
    }

    /* ---------- Mécanismes ---------- */

    function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

    function renderGroup(g) {
        var d = GROUPS[g];
        var html = '<h3 class="htp-h3">' + esc(d.title) + '</h3>' +
            '<p class="htp-site">' + esc(d.site) + '</p>' +
            '<ol class="htp-chain">' + d.chain.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ol>' +
            '<dl class="htp-facts">' +
            '<div><dt>Causes</dt><dd>' + esc(d.ex) + '</dd></div>' +
            '<div><dt>Examen clé</dt><dd>' + esc(d.exam) + '</dd></div>' +
            '<div><dt>Principe du traitement</dt><dd>' + esc(d.ttt) + '</dd></div></dl>' +
            '<div class="htp-actions">' + d.presets.map(function (p) {
                return '<button type="button" class="btn-secondary" data-go="' + p[0] + '">' + esc(p[1]) + '</button>';
            }).join('') + '</div>';
        el.groupBody.innerHTML = html;
        glossify(el.groupBody);
    }

    /* ---------- DETECT ---------- */

    function renderDetect() {
        el.detect.innerHTML = DETECT.map(function (d) {
            return '<li><div class="htp-detect-head"><strong>' + esc(d[0]) + '</strong><span class="htp-dir">' +
                d[1] + '</span></div><p>' + esc(d[2]) +
                (d[3] ? ' <span class="htp-live">Simulateur : <b id="htp-live-' + d[3] + '">--</b></span>' : '') +
                '</p></li>';
        }).join('');
    }

    function renderDetectLive(r) {
        var a = $('htp-live-raa'), t = $('htp-live-trv');
        if (a) a.textContent = '≈ ' + Math.round(r.raa) + ' cm²';
        if (t) t.textContent = '≈ ' + fr(r.trv, 1) + ' m/s';
    }

    /* ---------- Quiz ---------- */

    var quiz = { i: 0, score: 0, done: false, order: [] };

    function shuffle() {
        quiz.order = QUIZ.map(function (_, i) { return i; });
        for (var i = quiz.order.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1)), t = quiz.order[i];
            quiz.order[i] = quiz.order[j];
            quiz.order[j] = t;
        }
    }
    function item() { return QUIZ[quiz.order[quiz.i]]; }

    function bestScore(v) {
        try {
            if (v !== undefined) localStorage.setItem('htp-quiz-best', v);
            return +localStorage.getItem('htp-quiz-best') || 0;
        } catch (e) { return 0; }
    }

    // Photographie du schéma 2D dans l'état d'un cas, sans les textes qui donnent la réponse
    function snapshot(key) {
        var cur = { pvr: +el.pvr.value, pawp: +el.pawp.value, co: +el.co.value };
        var curPreset = state.preset, curOv = state.ov;
        applyValues(PRESETS[key], key);
        var c = el.svg.cloneNode(true);
        c.querySelector('#htp-particles').remove();
        c.querySelector('title').remove();
        // Dégradé et flèches recopiés sous un autre id : ceux d'origine ne s'affichent pas si la figure est masquée
        c.querySelectorAll('defs [id]').forEach(function (n) { n.id += '-q'; });
        c.querySelectorAll('[marker-end]').forEach(function (n) {
            n.setAttribute('marker-end', n.getAttribute('marker-end').replace(')', '-q)'));
        });
        c.querySelectorAll('.htp-cap path').forEach(function (n) { n.style.stroke = 'url(#htp-grad-cap-q)'; });
        c.querySelectorAll(':not(defs) [id]:not(defs *)').forEach(function (n) { n.removeAttribute('id'); });
        c.removeAttribute('id');
        c.removeAttribute('aria-labelledby');
        c.setAttribute('aria-label', 'Schéma du cas à identifier');
        c.classList.add('htp-quiz-svg');
        applyValues(cur, curPreset, curOv);
        return c;
    }

    function renderQuiz() {
        el.quizScore.textContent = 'Score ' + quiz.score + ' / ' + QUIZ.length;
        if (quiz.i >= QUIZ.length) {
            var best = Math.max(bestScore(), quiz.score);
            bestScore(best);
            el.quizBody.innerHTML = '<p class="htp-quiz-end">Terminé : <strong>' + quiz.score + ' / ' + QUIZ.length +
                '</strong> · meilleur score : ' + best + ' / ' + QUIZ.length + '</p>' +
                '<div class="htp-actions"><button type="button" class="btn-secondary" data-quiz="restart">Recommencer</button></div>';
            return;
        }
        var it = item();
        var opts = it.t === 'g' ? GROUP_OPTS : PROFILE_OPTS;
        quiz.done = false;
        el.quizBody.innerHTML = '<p class="htp-quiz-n">Question ' + (quiz.i + 1) + ' / ' + QUIZ.length + '</p>' +
            '<p class="htp-quiz-q">' + esc(it.q) + '</p>' +
            '<div class="htp-opts">' + opts.map(function (o, j) {
                return '<button type="button" class="htp-opt" data-opt="' + j + '">' + esc(o) + '</button>';
            }).join('') + '</div><div id="htp-quiz-fb" class="htp-quiz-fb" aria-live="polite"></div>';
        if (it.vis) {
            var fig = document.createElement('figure');
            fig.className = 'htp-quiz-fig';
            fig.appendChild(snapshot(it.vis));
            el.quizBody.querySelector('.htp-quiz-q').after(fig);
        }
        glossify(el.quizBody.querySelector('.htp-quiz-q'));
    }

    function answer(j) {
        if (quiz.done) return;
        quiz.done = true;
        var it = item(), ok = j === it.a;
        if (ok) quiz.score++;
        el.quizBody.querySelectorAll('.htp-opt').forEach(function (b) {
            var k = +b.dataset.opt;
            b.disabled = true;
            if (k === it.a) b.classList.add('is-right');
            else if (k === j) b.classList.add('is-wrong');
        });
        $('htp-quiz-fb').innerHTML = '<p><strong>' + (ok ? 'Exact.' : 'Non.') + '</strong> ' + esc(it.e) + '</p>' +
            '<div class="htp-actions"><button type="button" class="btn-secondary" data-quiz="sim">Voir dans le simulateur</button>' +
            '<button type="button" class="btn-primary htp-next" data-quiz="next">' +
            (quiz.i + 1 < QUIZ.length ? 'Question suivante' : 'Voir le score') + '</button></div>';
        el.quizScore.textContent = 'Score ' + quiz.score + ' / ' + QUIZ.length;
        glossify($('htp-quiz-fb'));
    }

    /* ---------- Lexique : sigles expliqués au survol ou au toucher ---------- */

    // Chaque sigle n'est souligné qu'une fois par paragraphe pour ne pas surcharger la lecture
    function glossify(root) {
        if (!root) return;
        var seen = new Map();
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                return n.parentElement.closest('button, svg, .htp-term, .htp-tag, output, script') ?
                    NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
            }
        });
        var nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(function (node) {
            var block = node.parentElement.closest('p, li, dd, dt, label, h3, figcaption') || root;
            if (!seen.has(block)) seen.set(block, {});
            var used = seen.get(block);
            var m;
            while ((m = GLOSS_RE.exec(node.nodeValue))) {
                var term = m[2];
                var start = m.index + m[1].length;
                if (used[term]) {
                    // Déjà expliqué dans ce paragraphe : on continue après ce mot
                    var rest = node.splitText(start + term.length);
                    node = rest;
                    continue;
                }
                used[term] = true;
                var after = node.splitText(start);
                node = after.splitText(term.length);
                var span = document.createElement('span');
                span.className = 'htp-term';
                span.tabIndex = 0;
                span.dataset.tip = GLOSSARY[term];
                span.setAttribute('aria-label', term + ' : ' + GLOSSARY[term]);
                after.parentNode.replaceChild(span, after);
                span.textContent = term;
            }
        });
    }

    /* ---------- Initialisation ---------- */

    function init() {
        if (!$('tab-htp')) return;
        ['pvr', 'pawp', 'co', 'formula', 'mpap', 'profile', 'tpg', 'paps', 'pod', 'trv', 'raa', 'proba', 'hint',
            'svg', 'lumen', 'pa', 'rv', 'ra', 'la', 'jet', 'particles'].forEach(function (k) { el[k] = $('htp-' + k); });
        el.pvrOut = $('htp-pvr-out'); el.pawpOut = $('htp-pawp-out'); el.coOut = $('htp-co-out');
        el.profileTxt = $('htp-profile-txt');
        el.tPap = $('htp-t-pap'); el.tPod = $('htp-t-pod'); el.tPapo = $('htp-t-papo');
        el.tRvp = $('htp-t-rvp'); el.tDc = $('htp-t-dc');
        el.saLv = $('htp-sa-lv'); el.saRv = $('htp-sa-rv'); el.saCap = $('htp-sa-cap');
        el.groupBody = $('htp-group-body'); el.detect = $('htp-detect-list');
        el.quizBody = $('htp-quiz-body'); el.quizScore = $('htp-quiz-score');

        [el.pvr, el.pawp, el.co].forEach(function (s) {
            s.addEventListener('input', function () { stopTour(); el.patient.hidden = true; applyValues({ pvr: +el.pvr.value, pawp: +el.pawp.value, co: +el.co.value }, null); });
        });
        document.querySelectorAll('.htp-chip[data-preset]').forEach(function (c) {
            c.addEventListener('click', function () { stopTour(); tweenTo(PRESETS[c.dataset.preset], c.dataset.preset); });
        });
        el.tour = $('htp-tour');
        el.patient = $('htp-patient');
        el.d2 = $('htp-2d');
        el.d3 = $('htp-3d');
        $('htp-tour-btn').addEventListener('click', startTour);
        el.tour.addEventListener('click', function (e) {
            var b = e.target.closest('[data-tour]');
            if (!b) return;
            var a = b.dataset.tour;
            if (a === 'stop') stopTour();
            else if (a === 'prev') tourGo(tour.i - 1);
            else if (a === 'next') { if (tour.i === TOUR.length - 1) stopTour(); else tourGo(tour.i + 1); }
            else if (a === 'play') { tour.play = !tour.play; scheduleTour(); }
        });
        el.patient.addEventListener('click', function (e) {
            if (e.target.closest('.htp-tour-x')) el.patient.hidden = true;
        });
        var link = $('btn-htp-link'), trInput = $('tr_vel');
        if (link && trInput) {
            var syncLink = function () { link.hidden = !trInput.value; };
            trInput.addEventListener('input', syncLink);
            syncLink();
            link.addEventListener('click', fromPatient);
        }
        el.hud = $('htp3d-hud-txt');
        document.querySelectorAll('.tab-btn').forEach(function (b) {
            b.addEventListener('click', function () {
                document.body.classList.toggle('is-htp', b.dataset.tab === 'tab-htp');
                layoutView();
            });
        });
        wideMQ.addEventListener('change', layoutView);
        document.querySelectorAll('input[name="htp-view"]').forEach(function (r) {
            r.addEventListener('change', function () { setViewMode(r.value); });
        });
        el.d3.addEventListener('click', function (e) {
            var b = e.target.closest('[data-view]');
            if (b && view3d) view3d.setView(b.dataset.view);
        });
        el.d3.addEventListener('change', function (e) {
            if (e.target.dataset.layer && view3d) view3d.setLayer(e.target.dataset.layer, e.target.checked);
        });
        $('htp3d-opacity').addEventListener('input', function (e) {
            if (view3d) view3d.setHeartOpacity(+e.target.value);
        });
        var cutBox = $('htp3d-cut'), cutLvl = $('htp3d-cut-level');
        var syncCut = function () {
            cutLvl.disabled = !cutBox.checked;
            if (view3d) view3d.setCut(cutBox.checked, +cutLvl.value);
        };
        cutBox.addEventListener('change', function () {
            syncCut();
            if (view3d) view3d.setView(cutBox.checked ? 'coupe' : 'face');
        });
        cutLvl.addEventListener('input', syncCut);
        document.querySelectorAll('input[name="htp-group"]').forEach(function (r) {
            r.addEventListener('change', function () { renderGroup(r.value); });
        });
        el.groupBody.addEventListener('click', function (e) {
            var b = e.target.closest('[data-go]');
            if (b) goSim(PRESETS[b.dataset.go], b.dataset.go);
        });
        el.quizBody.addEventListener('click', function (e) {
            var o = e.target.closest('[data-opt]');
            if (o) return answer(+o.dataset.opt);
            var a = e.target.closest('[data-quiz]');
            if (!a) return;
            if (a.dataset.quiz === 'next') { quiz.i++; renderQuiz(); }
            else if (a.dataset.quiz === 'restart') { quiz.i = 0; quiz.score = 0; shuffle(); renderQuiz(); }
            else if (a.dataset.quiz === 'sim') {
                var it = item();
                if (it.vis) goSim(PRESETS[it.vis], it.vis);
                else goSim(it.h, null);
            }
        });

        renderDetect();
        renderGroup('1');
        applyValues(PRESETS.normal, 'normal');
        shuffle();
        renderQuiz();
        ['.htp-intro', '.htp-controls', '.htp-echo-txt', '#htp-detect'].forEach(function (sel) {
            glossify(document.querySelector('#tab-htp ' + sel));
        });
        // La bulle s'aligne sur le bord le plus proche pour rester dans l'écran
        var placeTip = function (e) {
            var t = e.target.closest && e.target.closest('.htp-term');
            if (!t) return;
            var r = t.getBoundingClientRect(), w = document.documentElement.clientWidth;
            t.classList.toggle('tip-l', r.left + r.width / 2 < w * 0.35);
            t.classList.toggle('tip-r', r.left + r.width / 2 > w * 0.65);
        };
        document.addEventListener('pointerover', placeTip);
        document.addEventListener('focusin', placeTip);
        // Toucher : ouvre ou ferme la définition
        document.addEventListener('click', function (e) {
            placeTip(e);
            var t = e.target.closest && e.target.closest('.htp-term');
            document.querySelectorAll('.htp-term.tip-open').forEach(function (x) { if (x !== t) x.classList.remove('tip-open'); });
            if (t) { e.preventDefault(); t.classList.toggle('tip-open'); }
        });
        initParticles();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
