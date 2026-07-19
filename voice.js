
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

    const GUIDED_STEPS = [
        { id: 'fvc', type: 'number', label: 'CVF', unit: '% prédit' },
        { id: 'dlco', type: 'number', label: 'DLCO', unit: '% prédit' },
        { id: 'telang', type: 'bool', label: 'Télangiectasies', unit: 'oui / non' },
        { id: 'aca', type: 'bool', label: 'Anti-centromère', unit: 'ACA · oui / non' },
        { id: 'ntprobnp', type: 'number', label: 'NT-proBNP', unit: 'pg/mL' },
        { id: 'urate', type: 'number', label: 'Acide urique', unit: 'mg/L' },
        { id: 'rad', type: 'bool', label: 'Déviation axiale droite', unit: 'ECG · oui / non' },
        { id: 'ra_area', type: 'number', label: 'Surface OD', unit: 'cm²', step2: true },
        { id: 'tr_vel', type: 'number', label: 'Vélocité IT', unit: 'm/s', step2: true }
    ];

    const YES_RE = /\b(oui|ouais|yes|presentes?|presents?|present|positifs?|positives?|affirmatif|exact)\b/;
    const NO_RE = /\b(non|absentes?|absents?|absent|negatifs?|negatives?|aucune?|nan)\b|\bpas\b/;
    const NUMBER_RE = /\d+(?:\.\d+)?/;

    const WORD_NUMS = {
        zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6,
        sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13,
        quatorze: 14, quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30,
        quarante: 40, cinquante: 50, soixante: 60, cent: 100, cents: 100
    };

    let recognition = null;
    let listening = false;
    let hasWorkedOnce = false;
    let blockedOnce = false;
    let micStream = null;
    let guidedIndex = -1;
    let interimTimer = null;
    let lastInterim = '';
    let consumedAnswer = '';
    let consumedAt = 0;
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

    function unitLabel(unit) {
        if (unit === 'umol') return ' µmol/L';
        if (unit === 'mgl') return ' mg/L';
        if (unit === 'mgdl') return ' mg/dL';
        return '';
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

    function showQuestion(opts) {
        if (!voiceQuestion) return;
        voiceQuestion.innerHTML = '';
        const h = document.createElement('div');
        h.className = 'voice-q-header';
        h.textContent = opts.header;
        voiceQuestion.appendChild(h);
        if (opts.varName) {
            const v = document.createElement('div');
            v.className = 'voice-q-var';
            v.textContent = opts.varName;
            if (opts.unit) {
                const u = document.createElement('span');
                u.className = 'voice-q-unit';
                u.textContent = opts.unit;
                v.appendChild(u);
            }
            voiceQuestion.appendChild(v);
        }
        if (opts.text) {
            const q = document.createElement('div');
            q.className = 'voice-q-text';
            q.textContent = opts.text;
            voiceQuestion.appendChild(q);
        }
        if (opts.hint) {
            const hi = document.createElement('div');
            hi.className = 'voice-q-hint';
            hi.textContent = opts.hint;
            voiceQuestion.appendChild(hi);
        }
        if (typeof opts.progress === 'number') {
            const bar = document.createElement('div');
            bar.className = 'voice-progress';
            const fill = document.createElement('div');
            fill.className = 'voice-progress-fill';
            fill.style.width = Math.round(opts.progress * 100) + '%';
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
        const hint = (step.type === 'bool' ? '« oui » ou « non »' : 'dites la valeur') +
            ' — ou « passer », « retour », « stop »';
        showQuestion({
            header: 'Question ' + pos + '/' + avail.length,
            varName: step.label,
            unit: step.unit,
            hint: hint,
            progress: (pos - 1) / avail.length
        });
        if (listening && voiceStatus) voiceStatus.textContent = '🎙️ J\'écoute votre réponse…';
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
        releaseMic();
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
        showQuestion({ header: '✅ Terminé', text: msg, hint: 'Réappuyez sur le bouton pour recommencer.', progress: 1 });
        if (voiceStatus) voiceStatus.textContent = '✅ Questionnaire terminé.';
    }

    function isInstantAnswer(normText) {
        if (guidedIndex < 0 || guidedIndex >= GUIDED_STEPS.length) return false;
        if (/^(stop|passer?|suivante?|retour)[\s.!]*$/.test(normText)) return true;
        const step = GUIDED_STEPS[guidedIndex];
        return step.type === 'bool' && /^(oui|ouais|non)[\s.!]*$/.test(normText);
    }

    function isActionableAnswer(normText) {
        if (guidedIndex < 0 || guidedIndex >= GUIDED_STEPS.length) return false;
        if (/\b(stop|passer?|passez|suivante?|retour|precedente?|repete\w*)\b/.test(normText)) return true;
        const step = GUIDED_STEPS[guidedIndex];
        if (step.type === 'bool') {
            return YES_RE.test(normText) || NO_RE.test(normText);
        }
        const num = extractNumber(normText);
        return num != null && !isNaN(num);
    }

    function handleGuidedAnswer(rawTranscript) {
        if (guidedIndex < 0 || guidedIndex >= GUIDED_STEPS.length) return;
        const text = normalize(rawTranscript);

        if (/\b(stop|arrete\w*|termine\w*|fini)\b/.test(text)) {
            stopListening();
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
                    'Touchez le bouton <strong>« aA »</strong> (ou l\'icône de réglages) à gauche de la barre d\'adresse → <strong>« Réglages du site web »</strong> → <strong>Micro → Autoriser</strong>.',
                    'Vérifiez : <strong>Réglages iOS → Apps → Safari → Micro</strong> → « Autoriser » (ou « Demander »).',
                    'Vérifiez la dictée : <strong>Réglages → Général → Claviers → Activer la dictée</strong>. La reconnaissance vocale de Safari en dépend.',
                    'Vérifiez le réglage système : <strong>Réglages → Confidentialité et sécurité → Micro</strong> — Safari doit y être autorisé s\'il apparaît.',
                    'Si Écran de temps est actif : <strong>Réglages → Écran de temps → Restrictions relatives au contenu et à la confidentialité → Micro</strong> → « Autoriser les modifications ».',
                    'Puis <strong>fermez complètement l\'onglet</strong> (pas seulement recharger), rouvrez le site et réappuyez sur le bouton. Acceptez la demande d\'accès si elle s\'affiche.'
                ],
                note: 'Sur iOS, la permission peut sembler activée mais rester bloquée tant que l\'onglet n\'a pas été fermé et rouvert après le changement de réglage.'
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

    function showMicTutorial(dictationIssue) {
        if (!voiceTutorial) return;
        const tuto = getMicTutorial();
        let html = '';
        if (dictationIssue) {
            html += '<div class="voice-tuto-title">⚠️ Le micro est autorisé, mais le service de reconnaissance est bloqué</div>' +
                '<p class="voice-tuto-note">Cause la plus fréquente sur iPhone : la dictée Apple est désactivée, ou l\'onglet doit être fermé et rouvert. Suivez les étapes 3 à 6 ci-dessous.</p>';
        }
        html += '<div class="voice-tuto-title">📋 Réactiver le micro — ' + tuto.title + '</div><ol>';
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
                        const nf = normalize(lastFinal);
                        if (consumedAnswer && Date.now() - consumedAt < 3000 &&
                            (nf === consumedAnswer || nf.indexOf(consumedAnswer) === 0 || consumedAnswer.indexOf(nf) === 0)) {
                            consumedAnswer = '';
                        } else {
                            handleGuidedAnswer(lastFinal);
                        }
                    }
                } else {
                    interim += res[0].transcript;
                }
            }
            const interimTrim = interim.trim();
            showTranscript(interimTrim, lastFinal);
            if (interimTrim && interimTrim !== lastInterim) {
                lastInterim = interimTrim;
                if (interimTimer) clearTimeout(interimTimer);
                const norm = normalize(interimTrim);
                if (isInstantAnswer(norm)) {
                    consumedAnswer = norm;
                    consumedAt = Date.now();
                    handleGuidedAnswer(interimTrim);
                } else {
                    const delay = /\.$|virgule\s*$/.test(norm) ? 700 : 350;
                    interimTimer = setTimeout(function () {
                        if (!listening || guidedIndex < 0) return;
                        if (lastInterim !== interimTrim) return;
                        if (isActionableAnswer(normalize(interimTrim))) {
                            consumedAnswer = normalize(interimTrim);
                            consumedAt = Date.now();
                            handleGuidedAnswer(interimTrim);
                        }
                    }, delay);
                }
            }
        };

        rec.onerror = function (event) {
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                listening = false;
                updateButtonState();
                clearHighlight();
                if (hasWorkedOnce) {
                    if (voiceStatus) {
                        voiceStatus.textContent = '⏸️ Dictée en pause. Réappuyez sur « 🎤 Saisie vocale » pour continuer.';
                    }
                } else if (!blockedOnce) {
                    blockedOnce = true;
                    if (voiceStatus) {
                        voiceStatus.textContent = '🎤 Autorisez l\'accès au micro dans la fenêtre qui vient de s\'afficher, puis réappuyez sur « Saisie vocale ».';
                    }
                } else {
                    if (voiceStatus) {
                        voiceStatus.textContent = '🚫 Le micro reste bloqué par le navigateur. Voir les étapes 👇';
                    }
                    showMicTutorial(true);
                }
            } else if (event.error === 'audio-capture') {
                listening = false;
                updateButtonState();
                clearHighlight();
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
                }, IS_IOS ? 50 : 0);
            } else {
                updateButtonState();
            }
        };

        return rec;
    }

    function releaseMic() {
        if (micStream) {
            try {
                micStream.getTracks().forEach(function (t) { t.stop(); });
            } catch (e) { /* déjà libéré */ }
            micStream = null;
        }
    }

    function beginSession() {
        if (!recognition) recognition = buildRecognition();
        listening = true;
        blockedOnce = false;
        updateButtonState();
        startGuided();
        try {
            recognition.start();
        } catch (e) { /* déjà démarré */ }
    }

    function startListening() {
        hideMicTutorial();
        if (voicePanel) voicePanel.classList.remove('hidden');
        // iOS Safari : webkitSpeechRecognition n'affiche PAS de fenêtre
        // d'autorisation par lui-même. On demande donc explicitement le micro
        // via getUserMedia — c'est CE qui déclenche le pop-up « Autoriser le
        // micro » et accorde l'accès. On garde le flux audio ouvert pendant
        // toute la session (le libérer ferait perdre l'accès à la
        // reconnaissance vocale sur iOS).
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            beginSession();
            return;
        }
        if (voiceStatus) voiceStatus.textContent = '🎤 Autorisation du micro…';
        navigator.mediaDevices.getUserMedia({ audio: true }).then(
            function (stream) {
                micStream = stream;
                beginSession();
            },
            function (err) {
                listening = false;
                updateButtonState();
                const name = (err && err.name) ? err.name : '';
                if (voiceStatus) {
                    voiceStatus.textContent = (name === 'NotAllowedError' || name === 'SecurityError')
                        ? '🚫 Accès au micro refusé. Voir les étapes ci-dessous 👇'
                        : '🚫 Micro indisponible (' + (name || 'erreur') + '). Voir les étapes 👇';
                }
                showMicTutorial(true);
            }
        );
    }

    function stopListening() {
        listening = false;
        guidedIndex = -1;
        if (recognition) {
            try { recognition.stop(); } catch (e) { /* déjà arrêté */ }
        }
        releaseMic();
        hideQuestion();
        clearHighlight();
        if (voiceStatus) voiceStatus.textContent = 'Saisie en pause. Appuyez sur le bouton pour reprendre.';
        updateButtonState();
    }

    if (voiceBtn) {
        voiceBtn.onclick = function () {
            if (listening) {
                stopListening();
            } else if (!SR) {
                if (voicePanel) voicePanel.classList.remove('hidden');
                if (voiceStatus) {
                    voiceStatus.textContent = '❌ La reconnaissance vocale n\'est pas disponible sur ce navigateur. Utilisez Safari (iPhone/iPad), Chrome ou Edge.';
                }
            } else {
                startListening();
            }
        };
    }

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
        normalize: normalize,
        extractNumber: extractNumber,
        wordsToNumber: wordsToNumber,
        handleGuidedAnswer: handleGuidedAnswer,
        startGuided: startGuided,
        getGuidedIndex: function () { return guidedIndex; },
        showMicTutorial: showMicTutorial,
        getMicTutorial: getMicTutorial
    };
} catch (err) {
    console.error('VOICE MODULE ERROR:', err);
}
