
try {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    const voiceBtn = document.getElementById('voice-btn');
    const voicePanel = document.getElementById('voice-panel');
    const voiceStatus = document.getElementById('voice-status');
    const voiceTutorial = document.getElementById('voice-tutorial');
    const voiceQuestion = document.getElementById('voice-question');
    const voiceTranscript = document.getElementById('voice-transcript');
    const voiceLog = document.getElementById('voice-log');
    const voiceHelp = document.getElementById('voice-help');
    const voiceHelpBtn = document.getElementById('voice-help-btn');
    const voiceCloseBtn = document.getElementById('voice-close-btn');
    const modeGuidedBtn = document.getElementById('voice-mode-guided');
    const modeFreeBtn = document.getElementById('voice-mode-free');

    const NUMERIC_FIELDS = [
        { id: 'ntprobnp', label: 'NT-proBNP', re: /(?:nt[\s-]*)?pro[\s-]*bnp|\bbnp\b|peptide/ },
        { id: 'fvc', label: 'CVF', re: /capacite vitale(?: forcee)?|\bc[\s.]*v[\s.]*f\b/ },
        { id: 'dlco', label: 'DLCO', re: /\bd[\s.]*l[\s.]*c[\s.]*o\b|\bdlc\b|\bdel?co\b|diffusion(?: du co)?/ },
        { id: 'urate', label: 'Acide urique', re: /acide[\s-]*urique|uricemie|\burate\b/ },
        { id: 'ra_area', label: 'Surface OD', re: /surface(?:\s+de)?(?:\s+l['\s])?\s*(?:od\b|auriculaire|oreillette(?:\s+droite)?)|oreillette droite/, step2: true },
        { id: 'tr_vel', label: 'Vélocité IT', re: /velocite(?: tricuspide| it)?|(?:vitesse|flux|fuite|insuffisance|regurgitation)[\s-]*tricuspide|tricuspide|\bit\b/, step2: true }
    ];

    const CHECKBOX_FIELDS = [
        { id: 'telang', label: 'Télangiectasies', re: /telangi\w*|angiectasi\w*/ },
        { id: 'aca', label: 'Anti-centromère', re: /(?:anticorps[\s-]*)?anti[\s-]*(?:\w{1,4}[\s-]+)?centromere|centromere|\ba[\s.]*c[\s.]*a\b/ },
        { id: 'rad', label: 'Déviation axiale droite', re: /deviation[\s-]+(?:axiale?|de l'axe|axe)(?:[\s-]+droite?)?|deviation[\s-]+droite|axe[\s-]+(?:droite?|devie)/ }
    ];

    const NEGATIVE_AFTER_RE = /^[\s,:]*\b(non|pas|absentes?|absents?|absent|absence|negatifs?|negatives?|aucune?|zero)\b/;
    const NEGATIVE_BEFORE_RE = /\b(pas|sans|aucune?|absence|absentes?)\b[\s\S]{0,20}$/;
    const NUMBER_RE = /\d+(?:\.\d+)?/;

    const GUIDED_STEPS = [
        { id: 'fvc', type: 'number', label: 'CVF', question: 'CVF, en pourcentage de la valeur prédite ?' },
        { id: 'dlco', type: 'number', label: 'DLCO', question: 'DLCO, en pourcentage ?' },
        { id: 'telang', type: 'bool', label: 'Télangiectasies', question: 'Télangiectasies, oui ou non ?' },
        { id: 'aca', type: 'bool', label: 'Anti-centromère', question: 'Anticorps anti-centromère, oui ou non ?' },
        { id: 'ntprobnp', type: 'number', label: 'NT-proBNP', question: 'NT pro BNP, en picogrammes par millilitre ?' },
        { id: 'urate', type: 'number', label: 'Acide urique', question: 'Acide urique, en milligrammes par litre ?' },
        { id: 'rad', type: 'bool', label: 'Déviation axiale droite', question: 'Déviation axiale droite à l\'ECG, oui ou non ?' },
        { id: 'ra_area', type: 'number', label: 'Surface OD', question: 'Surface de l\'oreillette droite, en centimètres carrés ?', step2: true },
        { id: 'tr_vel', type: 'number', label: 'Vélocité IT', question: 'Vélocité de l\'insuffisance tricuspide, en mètres par seconde ?', step2: true }
    ];

    const YES_RE = /\b(oui|ouais|yes|presentes?|presents?|present|positifs?|positives?|affirmatif|exact)\b/;
    const NO_RE = /\b(non|absentes?|absents?|absent|negatifs?|negatives?|aucune?|nan)\b|\bpas\b/;

    const WORD_NUMS = {
        zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6,
        sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13,
        quatorze: 14, quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30,
        quarante: 40, cinquante: 50, soixante: 60, cent: 100, cents: 100
    };

    let recognition = null;
    let listening = false;
    let micStream = null;
    let hasWorkedOnce = false;
    let mode = 'guided';
    let guidedIndex = -1;
    const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

    function normalize(text) {
        let t = text.toLowerCase();
        t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        t = t.replace(/(\d)\s*(?:virgule|,)\s*(\d)/g, '$1.$2');
        t = t.replace(/\bvirgule\b/g, '.');
        return t;
    }

    function wordsToNumber(text) {
        const tokens = text.replace(/-/g, ' ').split(/\s+/);
        let started = false;
        let current = 0;
        for (let i = 0; i < tokens.length; i++) {
            const tok = tokens[i];
            if (tok === 'et') continue;
            const v = WORD_NUMS[tok];
            if (v == null) {
                if (started) break;
                continue;
            }
            started = true;
            if (v === 100) {
                current = (current || 1) * 100;
            } else if (v === 20 && current >= 2 && current <= 9) {
                current = current * 20;
            } else {
                current += v;
            }
        }
        return started ? current : null;
    }

    function extractNumber(text) {
        const m = text.match(NUMBER_RE);
        if (m) return parseFloat(m[0]);
        return wordsToNumber(text);
    }

    function detectUrateUnit(segment) {
        if (/micro\s*-?\s*mol|umol|µmol/.test(segment)) return 'umol';
        if (/(?:mg|milligrammes?)\s*(?:par|\/)\s*(?:deci\s*-?\s*litre|dl)/.test(segment)) return 'mgdl';
        if (/(?:mg|milligrammes?)\s*(?:par|\/)\s*litre?\b/.test(segment)) return 'mgl';
        return null;
    }

    function revealStep2IfHidden() {
        const card = document.getElementById('step2-card');
        if (card && card.classList.contains('hidden')) {
            card.classList.remove('hidden');
            const bypass = document.getElementById('bypass-s2-area');
            if (bypass) bypass.classList.add('hidden');
        }
    }

    function setNumberField(spec, value) {
        const input = document.getElementById(spec.id);
        if (!input) return false;
        if (spec.step2) revealStep2IfHidden();
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    function setUrateUnit(unit) {
        const select = document.getElementById('urate_unit');
        if (!select) return;
        select.value = unit;
        select.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function setCheckboxField(spec, checked) {
        const input = document.getElementById(spec.id);
        if (!input) return false;
        input.checked = checked;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    function unitLabel(unit) {
        if (unit === 'umol') return ' µmol/L';
        if (unit === 'mgl') return ' mg/L';
        if (unit === 'mgdl') return ' mg/dL';
        return '';
    }

    function parseAndApply(rawTranscript) {
        const text = normalize(rawTranscript);
        const applied = [];

        const matches = [];
        function collect(spec, kind) {
            const re = new RegExp(spec.re.source, 'g');
            let m;
            while ((m = re.exec(text)) !== null) {
                matches.push({ start: m.index, end: re.lastIndex, spec: spec, kind: kind });
                if (m.index === re.lastIndex) re.lastIndex++;
            }
        }
        NUMERIC_FIELDS.forEach(s => collect(s, 'number'));
        CHECKBOX_FIELDS.forEach(s => collect(s, 'checkbox'));
        matches.sort((a, b) => a.start - b.start || b.end - a.end);

        const deduped = [];
        matches.forEach(m => {
            const last = deduped[deduped.length - 1];
            if (last && m.start < last.end) return;
            deduped.push(m);
        });

        deduped.forEach((m, i) => {
            const segmentEnd = (i + 1 < deduped.length) ? deduped[i + 1].start : text.length;
            const segment = text.slice(m.end, segmentEnd);
            const before = text.slice(Math.max(0, m.start - 24), m.start);

            if (m.kind === 'number') {
                const num = segment.match(NUMBER_RE);
                if (!num) return;
                let unit = null;
                if (m.spec.id === 'urate') {
                    unit = detectUrateUnit(segment);
                    if (unit) setUrateUnit(unit);
                }
                if (setNumberField(m.spec, num[0])) {
                    applied.push(m.spec.label + ' = ' + num[0] + (unit ? unitLabel(unit) : ''));
                }
            } else {
                const negative = NEGATIVE_AFTER_RE.test(segment) || NEGATIVE_BEFORE_RE.test(before);
                if (setCheckboxField(m.spec, !negative)) {
                    applied.push(m.spec.label + (negative ? ' : non ✗' : ' : oui ✓'));
                }
            }
        });

        if (/\b(reinitialise\w*|remise a zero|remets? a zero|efface tout|tout effacer|reset)\b/.test(text)) {
            const resetBtn = document.getElementById('reset-form');
            if (resetBtn) {
                resetBtn.click();
                applied.push('🔄 Formulaire réinitialisé');
            }
        } else if (/\b(calcul\w*|resultat)\b/.test(text)) {
            const step2Card = document.getElementById('step2-card');
            const step2Visible = step2Card && !step2Card.classList.contains('hidden');
            const raVal = document.getElementById('ra_area');
            const trVal = document.getElementById('tr_vel');
            const wantsStep2 = /etape 2|final|echo/.test(text) ||
                (step2Visible && raVal && trVal && raVal.value && trVal.value);
            const targetBtn = document.getElementById(wantsStep2 && step2Visible ? 'calc-step2' : 'calc-step1');
            if (targetBtn) {
                targetBtn.click();
                applied.push('🧮 Calcul lancé');
            }
        }

        return applied;
    }

    function highlightField(id) {
        clearHighlight();
        const input = document.getElementById(id);
        if (!input || !input.closest) return;
        const row = input.closest('.calc-row');
        if (!row) return;
        row.classList.add('voice-target');
        if (row.scrollIntoView) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function clearHighlight() {
        if (!document.querySelectorAll) return;
        document.querySelectorAll('.voice-target').forEach(function (el) {
            el.classList.remove('voice-target');
        });
    }

    function stepAvailable(step) {
        if (!step.step2) return true;
        const card = document.getElementById('step2-card');
        return card && !card.classList.contains('hidden');
    }

    function availableSteps() {
        return GUIDED_STEPS.filter(stepAvailable);
    }

    function showQuestion(header, main, hint, progress) {
        if (!voiceQuestion) return;
        voiceQuestion.innerHTML = '';
        const h = document.createElement('div');
        h.className = 'voice-q-header';
        h.textContent = header;
        const q = document.createElement('div');
        q.className = 'voice-q-text';
        q.textContent = main;
        voiceQuestion.appendChild(h);
        voiceQuestion.appendChild(q);
        if (hint) {
            const hi = document.createElement('div');
            hi.className = 'voice-q-hint';
            hi.textContent = hint;
            voiceQuestion.appendChild(hi);
        }
        if (typeof progress === 'number') {
            const bar = document.createElement('div');
            bar.className = 'voice-progress';
            const fill = document.createElement('div');
            fill.className = 'voice-progress-fill';
            fill.style.width = Math.round(progress * 100) + '%';
            bar.appendChild(fill);
            voiceQuestion.appendChild(bar);
        }
        voiceQuestion.classList.remove('hidden');
    }

    function hideQuestion() {
        if (voiceQuestion) voiceQuestion.classList.add('hidden');
    }

    function startGuided() {
        guidedIndex = 0;
        askCurrent();
    }

    function askCurrent() {
        while (guidedIndex < GUIDED_STEPS.length && !stepAvailable(GUIDED_STEPS[guidedIndex])) {
            guidedIndex++;
        }
        if (guidedIndex >= GUIDED_STEPS.length) {
            finishGuided();
            return;
        }
        const step = GUIDED_STEPS[guidedIndex];
        const avail = availableSteps();
        const pos = avail.indexOf(step) + 1;
        const hint = step.type === 'bool'
            ? 'Dites « oui » ou « non » — ou « passer », « retour », « stop »'
            : 'Dites un nombre — ou « passer », « retour », « stop »';
        showQuestion(pos + '/' + avail.length + ' — ' + step.label, step.question, hint, (pos - 1) / avail.length);
        if (voiceStatus) voiceStatus.textContent = '🎙️ J\'écoute votre réponse…';
        highlightField(step.id);
    }

    function guidedNext() {
        guidedIndex++;
        askCurrent();
    }

    function finishGuided() {
        guidedIndex = -1;
        listening = false;
        if (recognition) {
            try { recognition.stop(); } catch (e) { /* déjà arrêté */ }
        }
        releaseMicStream();
        updateButtonState();
        clearHighlight();
        let msg = 'Questionnaire terminé.';
        const s2box = document.getElementById('result-step2');
        const s1val = document.getElementById('s1-points-val');
        const s2val = document.getElementById('s2-points-val');
        if (s2box && !s2box.classList.contains('hidden') && s2val && s2val.textContent !== '--') {
            msg = 'Score final : ' + s2val.textContent + ' points.';
        } else if (s1val && s1val.textContent !== '--') {
            msg = 'Score étape 1 : ' + s1val.textContent + ' points.';
        }
        showQuestion('✅ Terminé', msg, 'Réappuyez sur le bouton pour recommencer.', 1);
        if (voiceStatus) voiceStatus.textContent = '✅ Questionnaire terminé.';
    }

    function handleGuidedAnswer(rawTranscript) {
        if (guidedIndex < 0 || guidedIndex >= GUIDED_STEPS.length) return;
        const text = normalize(rawTranscript);

        if (/\b(stop|arrete\w*|termine\w*|fini)\b/.test(text)) {
            stopListening();
            hideQuestion();
            return;
        }
        if (/\b(passe|passer|passez|suivante?|sais pas|inconnue?)\b/.test(text)) {
            logApplied(['⏭ ' + GUIDED_STEPS[guidedIndex].label + ' : passé']);
            guidedNext();
            return;
        }
        if (/\b(retour|precedente?|reviens|revenir|corrige\w*)\b/.test(text)) {
            guidedIndex = Math.max(0, guidedIndex - 1);
            while (guidedIndex > 0 && !stepAvailable(GUIDED_STEPS[guidedIndex])) guidedIndex--;
            askCurrent();
            return;
        }
        if (/\b(repete\w*|redis|redites)\b/.test(text)) {
            askCurrent();
            return;
        }

        const step = GUIDED_STEPS[guidedIndex];
        if (step.type === 'bool') {
            const no = NO_RE.test(text);
            const yes = YES_RE.test(text);
            if (no) {
                setCheckboxField(step, false);
                logApplied([step.label + ' : non ✗']);
                guidedNext();
            } else if (yes) {
                setCheckboxField(step, true);
                logApplied([step.label + ' : oui ✓']);
                guidedNext();
            } else {
                if (voiceStatus) voiceStatus.textContent = '🤔 « ' + rawTranscript + ' » — répondez « oui » ou « non » (ou « passer »).';
            }
        } else {
            const num = extractNumber(text);
            if (num != null && !isNaN(num)) {
                let unit = null;
                if (step.id === 'urate') {
                    unit = detectUrateUnit(text);
                    if (unit) setUrateUnit(unit);
                }
                setNumberField(step, num);
                logApplied([step.label + ' = ' + num + (unit ? unitLabel(unit) : '')]);
                guidedNext();
            } else {
                if (voiceStatus) voiceStatus.textContent = '🤔 « ' + rawTranscript + ' » — dites un nombre (ou « passer »).';
            }
        }
    }

    function logApplied(items) {
        if (!voiceLog || items.length === 0) return;
        items.forEach(item => {
            const chip = document.createElement('span');
            chip.className = 'voice-chip';
            chip.textContent = item;
            voiceLog.appendChild(chip);
        });
        while (voiceLog.children.length > 12) {
            voiceLog.removeChild(voiceLog.firstChild);
        }
    }

    function showTranscript(interim, final) {
        if (!voiceTranscript) return;
        const content = (final || '') + (interim ? ' ' + interim : '');
        if (content.trim()) {
            voiceTranscript.classList.remove('hidden');
            voiceTranscript.innerHTML = '';
            if (final) {
                const f = document.createElement('span');
                f.className = 'voice-final';
                f.textContent = final;
                voiceTranscript.appendChild(f);
            }
            if (interim) {
                const it = document.createElement('span');
                it.className = 'voice-interim';
                it.textContent = ' ' + interim;
                voiceTranscript.appendChild(it);
            }
        }
    }

    function getMicTutorial() {
        const ua = navigator.userAgent || '';
        const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
        const isAndroid = /Android/.test(ua);
        const isChromeIOS = /CriOS/.test(ua);
        const isEdge = /Edg(e|iOS|A)?\//.test(ua);
        const isSamsung = /SamsungBrowser/.test(ua);
        const isSafariDesktop = !isIOS && !isAndroid && /Safari\//.test(ua) && !/Chrome|Chromium|Edg/.test(ua);

        if (isIOS && isChromeIOS) {
            return {
                title: 'Chrome sur iPhone / iPad',
                steps: [
                    'Ouvrez <strong>Réglages iOS → Apps → Chrome</strong> et activez le <strong>Micro</strong>.',
                    'Vérifiez que la dictée est activée : <strong>Réglages → Général → Claviers → Activer la dictée</strong>.',
                    'Revenez ici, <strong>rechargez la page</strong>, réappuyez sur « 🎤 Saisie vocale » et touchez « Autoriser » quand Chrome le demande.'
                ]
            };
        }
        if (isIOS) {
            return {
                title: 'Safari sur iPhone / iPad',
                steps: [
                    'Touchez le bouton <strong>« aA »</strong> (ou l\'icône de réglages) à gauche de la barre d\'adresse.',
                    'Choisissez <strong>« Réglages du site web »</strong> puis <strong>Micro → Autoriser</strong>.',
                    'Si l\'option n\'apparaît pas : <strong>Réglages iOS → Apps → Safari → Micro</strong> → « Autoriser ».',
                    'Activez la dictée : <strong>Réglages → Général → Claviers → Activer la dictée</strong>.',
                    '<strong>Rechargez la page</strong> et réappuyez sur « 🎤 Saisie vocale » — acceptez la demande d\'accès au micro qui s\'affiche.',
                    'Si tout est déjà sur « Autoriser » et que le blocage persiste : <strong>fermez l\'onglet</strong>, rouvrez le site et réessayez.'
                ],
                note: 'La reconnaissance vocale de Safari s\'appuie sur la dictée d\'Apple : si elle est désactivée, le micro reste bloqué.'
            };
        }
        if (isAndroid && isSamsung) {
            return {
                title: 'Samsung Internet sur Android',
                steps: [
                    'Touchez l\'icône <strong>🔒</strong> à gauche de l\'adresse, puis <strong>Autorisations → Micro → Autoriser</strong>.',
                    'Sinon : menu <strong>☰ → Paramètres → Sites et téléchargements → Autorisations de site → Micro</strong>.',
                    'Vérifiez aussi : <strong>Paramètres Android → Applications → Samsung Internet → Autorisations → Micro</strong>.',
                    '<strong>Rechargez la page</strong> et réappuyez sur le bouton.'
                ]
            };
        }
        if (isAndroid) {
            return {
                title: 'Chrome sur Android',
                steps: [
                    'Touchez l\'icône <strong>🔒</strong> (ou ⓘ) à gauche de l\'adresse.',
                    'Choisissez <strong>Autorisations → Micro → Autoriser</strong>.',
                    'Si l\'option n\'apparaît pas : menu <strong>⋮ → Paramètres → Paramètres des sites → Micro</strong> et retirez ce site de la liste « Bloqué ».',
                    'Vérifiez aussi : <strong>Paramètres Android → Applications → Chrome → Autorisations → Micro</strong>.',
                    '<strong>Rechargez la page</strong> et réappuyez sur le bouton.'
                ]
            };
        }
        if (isSafariDesktop) {
            return {
                title: 'Safari sur Mac',
                steps: [
                    'Menu <strong>Safari → Réglages pour ce site web…</strong> puis <strong>Micro → Autoriser</strong>.',
                    'Vérifiez côté macOS : <strong>Réglages Système → Confidentialité et sécurité → Micro</strong> → activez Safari.',
                    '<strong>Rechargez la page</strong> et cliquez à nouveau sur « 🎤 Saisie vocale ».'
                ]
            };
        }
        if (isEdge) {
            return {
                title: 'Microsoft Edge',
                steps: [
                    'Cliquez sur l\'icône <strong>🔒</strong> à gauche de l\'adresse.',
                    'Choisissez <strong>Autorisations pour ce site → Micro → Autoriser</strong>.',
                    'Si besoin, ouvrez <strong>edge://settings/content/microphone</strong> et retirez ce site de la liste « Bloqué ».',
                    '<strong>Rechargez la page</strong> et cliquez à nouveau sur le bouton.'
                ]
            };
        }
        return {
            title: 'Chrome sur ordinateur',
            steps: [
                'Cliquez sur l\'icône <strong>🔒</strong> (ou l\'icône de réglages) à gauche de l\'adresse.',
                'Activez <strong>Micro</strong> (ou « Paramètres du site » → Micro → Autoriser).',
                'Si besoin, ouvrez <strong>chrome://settings/content/microphone</strong> et retirez ce site de la liste « Bloqué ».',
                'Vérifiez le micro du système : Windows → Paramètres → Confidentialité → Micro ; macOS → Réglages Système → Confidentialité → Micro.',
                '<strong>Rechargez la page</strong> et cliquez à nouveau sur le bouton.'
            ]
        };
    }

    function showMicTutorial() {
        if (!voiceTutorial) return;
        const tuto = getMicTutorial();
        let html = '<div class="voice-tuto-title">📋 Réactiver le micro — ' + tuto.title + '</div><ol>';
        tuto.steps.forEach(function (step) {
            html += '<li>' + step + '</li>';
        });
        html += '</ol>';
        if (tuto.note) html += '<p class="voice-tuto-note">💡 ' + tuto.note + '</p>';
        html += '<button id="voice-reload-btn" class="voice-reload-btn">🔄 Recharger la page</button>';
        voiceTutorial.innerHTML = html;
        voiceTutorial.classList.remove('hidden');
        const reloadBtn = document.getElementById('voice-reload-btn');
        if (reloadBtn) reloadBtn.onclick = function () { location.reload(); };
    }

    function hideMicTutorial() {
        if (voiceTutorial) voiceTutorial.classList.add('hidden');
    }

    function updateButtonState() {
        if (!voiceBtn) return;
        voiceBtn.classList.toggle('listening', listening);
        voiceBtn.textContent = listening ? '⏹ Arrêter la dictée' : '🎤 Saisie vocale';
        voiceBtn.title = listening ? 'Arrêter la dictée' : 'Saisie vocale';
    }

    function updateModeButtons() {
        if (modeGuidedBtn) modeGuidedBtn.classList.toggle('active', mode === 'guided');
        if (modeFreeBtn) modeFreeBtn.classList.toggle('active', mode === 'free');
    }

    function ensureMicPermission() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return Promise.resolve(true);
        }
        if (micStream) return Promise.resolve(true);
        return navigator.mediaDevices.getUserMedia({ audio: true }).then(
            function (stream) {
                micStream = stream;
                return true;
            },
            function () {
                return false;
            }
        );
    }

    function releaseMicStream() {
        if (micStream) {
            micStream.getTracks().forEach(function (t) { t.stop(); });
            micStream = null;
        }
    }

    function buildRecognition() {
        const rec = new SR();
        rec.lang = 'fr-FR';
        rec.continuous = !IS_IOS;
        rec.interimResults = true;
        rec.maxAlternatives = 1;

        rec.onresult = function (event) {
            let interim = '';
            let lastFinal = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const res = event.results[i];
                if (res.isFinal) {
                    hasWorkedOnce = true;
                    lastFinal = res[0].transcript.trim();
                    if (lastFinal) {
                        if (mode === 'guided' && guidedIndex >= 0) {
                            handleGuidedAnswer(lastFinal);
                        } else {
                            const applied = parseAndApply(lastFinal);
                            logApplied(applied);
                            if (applied.length === 0 && voiceStatus) {
                                voiceStatus.textContent = '🤔 Aucune valeur reconnue dans « ' + lastFinal + ' ». Dites par exemple « CVF 90 ».';
                            } else if (voiceStatus) {
                                voiceStatus.textContent = '🎙️ En écoute — dictez vos valeurs…';
                            }
                        }
                    }
                } else {
                    interim += res[0].transcript;
                }
            }
            showTranscript(interim.trim(), lastFinal);
        };

        rec.onerror = function (event) {
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                listening = false;
                releaseMicStream();
                updateButtonState();
                if (hasWorkedOnce) {
                    if (voiceStatus) {
                        voiceStatus.textContent = '⏸️ Dictée interrompue par le navigateur. Réappuyez sur « 🎤 Saisie vocale » pour continuer.';
                    }
                } else {
                    if (voiceStatus) {
                        voiceStatus.textContent = '🚫 Le navigateur bloque le micro. Suivez les étapes ci-dessous 👇';
                    }
                    showMicTutorial();
                }
            } else if (event.error === 'audio-capture') {
                listening = false;
                releaseMicStream();
                updateButtonState();
                if (voiceStatus) {
                    voiceStatus.textContent = '🚫 Aucun micro détecté sur cet appareil.';
                }
            }
        };

        rec.onend = function () {
            if (listening) {
                setTimeout(function () {
                    if (!listening) return;
                    try { rec.start(); } catch (e) { /* redémarrage déjà en cours */ }
                }, IS_IOS ? 150 : 0);
            } else {
                releaseMicStream();
                updateButtonState();
            }
        };

        return rec;
    }

    function startListening() {
        hideMicTutorial();
        if (voicePanel) voicePanel.classList.remove('hidden');
        if (voiceStatus) voiceStatus.textContent = '🎤 Demande d\'accès au micro…';
        ensureMicPermission().then(function (granted) {
            if (!granted) {
                listening = false;
                updateButtonState();
                if (voiceStatus) {
                    voiceStatus.textContent = '🚫 Le navigateur bloque le micro. Suivez les étapes ci-dessous 👇';
                }
                showMicTutorial();
                return;
            }
            if (!recognition) recognition = buildRecognition();
            listening = true;
            try {
                recognition.start();
            } catch (e) { /* déjà démarré */ }
            updateButtonState();
            if (mode === 'guided') {
                startGuided();
            } else {
                hideQuestion();
                if (voiceStatus) voiceStatus.textContent = '🎙️ En écoute — dictez vos valeurs…';
            }
        });
    }

    function stopListening() {
        listening = false;
        guidedIndex = -1;
        if (recognition) {
            try { recognition.stop(); } catch (e) { /* déjà arrêté */ }
        }
        releaseMicStream();
        hideQuestion();
        clearHighlight();
        if (voiceStatus) voiceStatus.textContent = 'Dictée en pause. Appuyez sur le micro pour reprendre.';
        updateButtonState();
    }

    if (voiceBtn) {
        if (!SR) {
            voiceBtn.classList.add('voice-unsupported');
            voiceBtn.onclick = function () {
                if (voicePanel) voicePanel.classList.remove('hidden');
                if (voiceStatus) {
                    voiceStatus.textContent = '❌ La reconnaissance vocale n\'est pas disponible sur ce navigateur. Utilisez Chrome, Edge ou Safari (iOS 14.5+).';
                }
            };
        } else {
            voiceBtn.onclick = function () {
                if (listening) stopListening(); else startListening();
            };
        }
    }

    if (modeGuidedBtn) {
        modeGuidedBtn.onclick = function () {
            mode = 'guided';
            updateModeButtons();
            if (listening) startGuided();
        };
    }
    if (modeFreeBtn) {
        modeFreeBtn.onclick = function () {
            mode = 'free';
            guidedIndex = -1;
            updateModeButtons();
            hideQuestion();
            if (listening && voiceStatus) voiceStatus.textContent = '🎙️ En écoute — dictez vos valeurs…';
        };
    }
    updateModeButtons();

    if (voiceHelpBtn && voiceHelp) {
        voiceHelpBtn.onclick = function () {
            voiceHelp.classList.toggle('hidden');
        };
    }

    if (voiceCloseBtn && voicePanel) {
        voiceCloseBtn.onclick = function () {
            stopListening();
            voicePanel.classList.add('hidden');
        };
    }

    window.DETECT_VOICE = {
        parseAndApply: parseAndApply,
        normalize: normalize,
        extractNumber: extractNumber,
        wordsToNumber: wordsToNumber,
        handleGuidedAnswer: handleGuidedAnswer,
        startGuided: startGuided,
        getGuidedIndex: function () { return guidedIndex; },
        setMode: function (m) { mode = m; updateModeButtons(); },
        showMicTutorial: showMicTutorial,
        getMicTutorial: getMicTutorial
    };
} catch (err) {
    console.error('VOICE MODULE ERROR:', err);
}
