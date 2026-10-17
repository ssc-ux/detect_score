
// Onglet « Comprendre l'HTP » chargé à la demande (versions à incrémenter ici)
const HTP_ASSETS = { css: 'htp.css?v=13', js: 'htp.js?v=20' };
let htpLoading = null;
function loadHtp() {
    if (htpLoading) return htpLoading;
    htpLoading = new Promise((resolve, reject) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = HTP_ASSETS.css;
        const js = document.createElement('script');
        js.src = HTP_ASSETS.js;
        let n = 0;
        const done = () => { if (++n === 2) resolve(); };
        css.onload = done;
        js.onload = done;
        css.onerror = js.onerror = () => { htpLoading = null; reject(new Error('Chargement de l\'onglet HTP impossible')); };
        document.head.append(css, js);
    });
    return htpLoading;
}

try {
    function getEls() {
        return {
            step1: {
                card: document.getElementById('step1-card'),
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
                gaugeBar: document.getElementById('s1-gauge-cursor'),
                pointsVal: document.getElementById('s1-points-val'),
                decision: document.getElementById('s1-decision'),
                exactScore: document.getElementById('s1-exact-score'),
            },
            step2: {
                card: document.getElementById('step2-card'),
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
                gaugeBar: document.getElementById('s2-gauge-cursor'),
                pointsVal: document.getElementById('s2-points-val'),
                decision: document.getElementById('s2-decision'),
                exactScore: document.getElementById('s2-exact-score'),
                rec: document.getElementById('final-recommendation')
            },
            bypassS2: {
                container: document.getElementById('bypass-s2-area'),
                btn: document.getElementById('btn-force-s2')
            },
            resetBtn: document.getElementById('reset-form'),
            step1CarriedScore: document.getElementById('step1-carried-score')
        };
    }
    let step1Result = null;
    let els = {}; 
    function init() {
        console.log("App Init Started...");
        els = getEls();
        initTabs();
        initHtpLink();
        resetUI();
        attachListeners();
    }
    function initTabs() {
        const tabs = document.querySelectorAll('.tab-btn');
        const contents = document.querySelectorAll('.tab-content');
        if (tabs.length === 0) console.warn("No tabs found!");
        tabs.forEach(tab => {
            tab.onclick = function () {
                // L'onglet pédagogique (bêta) n'est chargé qu'à sa première ouverture
                if (this.dataset.tab === 'tab-htp' && !window.HTP) {
                    const self = this;
                    loadHtp().then(() => self.onclick());
                    return;
                }
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));
                this.classList.add('active');
                tabs.forEach(t => t.setAttribute('aria-current', t === this ? 'page' : 'false'));
                const targetId = this.getAttribute('data-tab');
                const targetEl = document.getElementById(targetId);
                if (targetEl) targetEl.classList.add('active');
                document.body.classList.toggle('is-htp', targetId === 'tab-htp');
                if (window.HTP) window.HTP.onTab(targetId);
            };
        });
        // Lien direct vers l'onglet pédagogique : …/detect_score/#htp
        if (location.hash === '#htp') document.querySelector('.tab-btn[data-tab="tab-htp"]').click();
    }
    // Lien « Comprendre ce résultat » : visible dès qu'une Vmax IT est saisie
    function initHtpLink() {
        const link = document.getElementById('btn-htp-link'), tr = document.getElementById('tr_vel');
        if (!link || !tr) return;
        const sync = () => { link.hidden = !tr.value; };
        tr.addEventListener('input', sync);
        sync();
        link.addEventListener('click', () => loadHtp().then(() => window.HTP.fromPatient()));
    }
    function resetUI() {
        document.querySelectorAll('input[type="number"]').forEach(i => i.value = '');
        document.querySelectorAll('.seg input[value="no"]').forEach(i => i.checked = true);
        document.querySelectorAll('.points-value').forEach(b => b.textContent = '--');
        document.querySelectorAll('.result-box').forEach(b => b.classList.add('hidden'));
        if (els.step2.card) els.step2.card.classList.add('hidden');
        if (els.bypassS2.container) els.bypassS2.container.classList.add('hidden');
        if (els.step1.gaugeBar) els.step1.gaugeBar.style.left = '0%';
        if (els.step2.gaugeBar) els.step2.gaugeBar.style.left = '0%';
    }
    function attachListeners() {
        if (els.step1.btn) els.step1.btn.onclick = function () { runStep1(false); };
        if (els.step2.btn) els.step2.btn.onclick = function () { runStep2(false); };
        if (els.bypassS2.btn) els.bypassS2.btn.onclick = function () {
            els.step2.card.classList.remove('hidden');
            els.step2.card.scrollIntoView({ behavior: "smooth" });
            els.bypassS2.container.classList.add('hidden');
        };
        if (els.resetBtn) els.resetBtn.onclick = resetForm;
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
        attachEnterNavigation();
    }
    function attachEnterNavigation() {
        const chain = ['fvc', 'dlco', 'ntprobnp', 'urate', 'ra_area', 'tr_vel'];
        chain.forEach(function (id, idx) {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('keydown', function (e) {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                for (let j = idx + 1; j < chain.length; j++) {
                    const next = document.getElementById(chain[j]);
                    if (next && next.offsetParent !== null) {
                        next.focus();
                        return;
                    }
                }
                el.blur();
            });
        });
    }
    function resetForm() {
        document.querySelectorAll('input[type="number"]').forEach(i => i.value = '');
        document.querySelectorAll('.seg input[value="no"]').forEach(i => i.checked = true);
        document.querySelectorAll('.points-value').forEach(b => {
            b.textContent = '--';
            b.classList.remove('active');
            b.style.color = '';
        });
        document.querySelectorAll('.result-box').forEach(b => b.classList.add('hidden'));
        if (els.step2.card) els.step2.card.classList.add('hidden');
        if (els.bypassS2.container) els.bypassS2.container.classList.add('hidden');
        if (els.step1.gaugeBar) els.step1.gaugeBar.style.left = '0%';
        if (els.step2.gaugeBar) els.step2.gaugeBar.style.left = '0%';
        step1Result = null;
        if (els.step1CarriedScore) els.step1CarriedScore.textContent = '--';
        els.step1.card.scrollIntoView({ behavior: "smooth" });
    }
    // Non → false, Oui → true, Inconnu → null (case vide du classeur)
    function readChoice(group) {
        const v = group.querySelector('input:checked')?.value;
        return v === 'yes' ? true : v === 'no' ? false : null;
    }
    // Champ vide → null (valeur par défaut du classeur)
    function readNumber(el) {
        const v = parseFloat(el.value);
        return isNaN(v) ? null : v;
    }
    function getUrateInMgDl() {
        let val = parseFloat(els.step1.inputs.urate.value);
        const unit = els.step1.inputs.urate_unit.value;
        if (isNaN(val)) return null;
        if (unit === 'umol') val = val / 59.48;
        if (unit === 'mgl') val = val / 10;
        return val;
    }
    function getStep1Inputs() {
        const fvc = parseFloat(els.step1.inputs.fvc.value);
        const dlco = parseFloat(els.step1.inputs.dlco.value);
        let ratio = null;
        if (!isNaN(fvc) && !isNaN(dlco) && dlco !== 0) {
            ratio = fvc / dlco;
        }
        const inputs = {
            fvc_dlco: ratio,
            telang: readChoice(els.step1.inputs.telang),
            aca: readChoice(els.step1.inputs.aca),
            ntprobnp: getNtproBnpInPgMl(),
            urate: getUrateInMgDl(),
            rad: readChoice(els.step1.inputs.rad)
        };
        return inputs;
    }
    // NT-proBNP en pg/mL
    function getNtproBnpInPgMl() {
        const val = parseFloat(els.step1.inputs.ntprobnp.value);
        return isNaN(val) || val <= 0 ? null : val;
    }
    function updateLiveStep1() {
        if (!window.DETECT) return;
        const inputs = getStep1Inputs();
        const points = window.DETECT.calculateStep1Points(inputs);
        const fvc = parseFloat(els.step1.inputs.fvc.value);
        const dlco = parseFloat(els.step1.inputs.dlco.value);
        if (!isNaN(fvc) && !isNaN(dlco)) {
            els.step1.badges.fvc_dlco.textContent = `${points.details.fvc_dlco} pts`;
            els.step1.badges.fvc_dlco.classList.add('active');
        } else {
            els.step1.badges.fvc_dlco.textContent = '--';
            els.step1.badges.fvc_dlco.classList.remove('active');
        }
        updateBadge(els.step1.badges.telang, points.details.telang, readChoice(els.step1.inputs.telang) !== false);
        updateBadge(els.step1.badges.aca, points.details.aca, readChoice(els.step1.inputs.aca) !== false);
        updateBadge(els.step1.badges.ntprobnp, points.details.ntprobnp, !!els.step1.inputs.ntprobnp.value);
        updateBadge(els.step1.badges.urate, points.details.urate, !!els.step1.inputs.urate.value);
        updateBadge(els.step1.badges.rad, points.details.rad, readChoice(els.step1.inputs.rad) !== false);
        if (!points.unable) {
            runStep1(true);
        }
    }
    function updateBadge(el, points, isActive) {
        if (isActive) {
            el.textContent = `${points} pts`;
            el.classList.add('active');
            if (points > 0) el.style.color = 'var(--primary-color)';
        } else {
            el.textContent = '--';
            el.classList.remove('active');
            el.style.color = '';
        }
    }
    function updateLiveStep2() {
        if (!window.DETECT) return;
        const ra = readNumber(els.step2.inputs.ra);
        const tr = readNumber(els.step2.inputs.tr);
        const points = window.DETECT.calculateStep2Points(0, ra, tr);
        updateBadge(els.step2.badges.ra_area, points.details.ra_area, !!els.step2.inputs.ra.value);
        updateBadge(els.step2.badges.tr_vel, points.details.tr_vel, !!els.step2.inputs.tr.value);
        if (step1Result && (els.step2.inputs.ra.value || els.step2.inputs.tr.value)) {
            runStep2(true);
        }
    }
    function runStep1(auto) {
        const inputs = getStep1Inputs();
        const check = window.DETECT.calculateStep1Points(inputs);
        if (check.unable) {
            if (!auto) alert("Calcul impossible : plus d'une donnée manquante ou inconnue à l'étape 1.");
            return;
        }
        const result = window.DETECT.calculateStep1Points(inputs);
        step1Result = result;
        els.step1.resultBox.classList.remove('hidden');
        els.step1.pointsVal.textContent = result.total;
        const maxPoints = 500; 
        let pct = (result.total / maxPoints) * 100;
        if (pct > 100) pct = 100;
        if (els.step1.gaugeBar) {
            els.step1.gaugeBar.style.left = pct + '%';
        }
        const statusClass = result.isHighRisk ? 'danger' : 'safe';
        const label = result.isHighRisk ? 'RISQUE ÉLEVÉ' : 'RISQUE FAIBLE';
        const icon = `<span class="status-indicator ${statusClass}"></span>`;
        els.step1.decision.innerHTML = `${icon} ${label} (Seuil > 300)`;
        if (els.step1.exactScore) els.step1.exactScore.textContent = result.totalExact.toFixed(1);
        if (result.isHighRisk) {
            els.step2.card.classList.remove('hidden');
            if (els.step1CarriedScore) els.step1CarriedScore.textContent = result.total;
            if (!auto) setTimeout(() => els.step2.card.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
            els.bypassS2.container.classList.add('hidden');
        } else {
            els.step2.card.classList.add('hidden');
            els.bypassS2.container.classList.remove('hidden');
            if (els.step1CarriedScore) els.step1CarriedScore.textContent = result.total;
        }
    }
    function runStep2(auto) {
        if (!step1Result) {
            if (!auto) alert("Veuillez d'abord calculer l'étape 1.");
            return;
        }
        const inputs = {
            ra_area: readNumber(els.step2.inputs.ra),
            tr_vel: readNumber(els.step2.inputs.tr)
        };
        const result = window.DETECT.calculateStep2Points(step1Result, inputs.ra_area, inputs.tr_vel);
        els.step2.resultBox.classList.remove('hidden');
        els.step2.pointsVal.textContent = result.total;
        const maxPoints = 80;
        let pct = (result.total / maxPoints) * 100;
        if (pct > 100) pct = 100;
        if (els.step2.gaugeBar) {
            els.step2.gaugeBar.style.left = pct + '%';
        }
        const statusClass = result.isReferral ? 'danger' : 'safe';
        const label = result.isReferral ? 'CATHÉTÉRISME INDIQUÉ' : 'CATHÉTÉRISME NON INDIQUÉ';
        const icon = `<span class="status-indicator ${statusClass}"></span>`;
        if (els.step2.exactScore) els.step2.exactScore.textContent = result.totalExact.toFixed(1);
        els.step2.decision.innerHTML = `${icon} ${label} (Seuil > 35)`;
        if (result.isReferral) {
            els.step2.rec.textContent = "Indication de Cathétérisme Cardiaque Droit : Le patient présente un risque significatif d'HTAP.";
        } else {
            els.step2.rec.textContent = "Surveillance annuelle : Le risque d'HTAP est actuellement faible sous le seuil de décision.";
        }
    }
    init();
} catch (err) {
    console.error("FATAL APP ERROR:", err);
}

// Thème : clair par défaut ; « sombre » ou « comme l'appareil » (même réglage que CorticoPlan).
(function () {
    const select = document.getElementById('theme-select');
    if (!select) return;
    let theme = 'clair';
    try { theme = localStorage.getItem('theme') || 'clair'; } catch (e) { /* stockage indisponible */ }
    select.value = theme;
    select.addEventListener('change', () => {
        const racine = document.documentElement;
        if (select.value === 'auto') delete racine.dataset.theme;
        else racine.dataset.theme = select.value === 'sombre' ? 'dark' : 'light';
        try { localStorage.setItem('theme', select.value); } catch (e) { /* non mémorisé */ }
    });
})();
