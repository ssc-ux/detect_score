
try {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    const voiceBtn = document.getElementById('voice-btn');
    const voicePanel = document.getElementById('voice-panel');
    const voiceStatus = document.getElementById('voice-status');
    const voiceTranscript = document.getElementById('voice-transcript');
    const voiceLog = document.getElementById('voice-log');
    const voiceHelp = document.getElementById('voice-help');
    const voiceHelpBtn = document.getElementById('voice-help-btn');
    const voiceCloseBtn = document.getElementById('voice-close-btn');

    const NUMERIC_FIELDS = [
        { id: 'ntprobnp', label: 'NT-proBNP', re: /(?:nt[\s-]*)?pro[\s-]*bnp|\bbnp\b|peptide/ },
        { id: 'fvc', label: 'CVF', re: /capacite vitale(?: forcee)?|\bc[\s.]*v[\s.]*f\b/ },
        { id: 'dlco', label: 'DLCO', re: /\bd[\s.]*l[\s.]*c[\s.]*o\b|\bdel?co\b|diffusion(?: du co)?/ },
        { id: 'urate', label: 'Acide urique', re: /acide[\s-]*urique|uricemie|\burate\b/ },
        { id: 'ra_area', label: 'Surface OD', re: /surface(?:\s+de)?(?:\s+l['\s])?\s*(?:od\b|auriculaire|oreillette(?:\s+droite)?)|oreillette droite/, step2: true },
        { id: 'tr_vel', label: 'Vélocité IT', re: /velocite(?: tricuspide| it)?|(?:vitesse|flux|fuite|insuffisance|regurgitation)[\s-]*tricuspide|tricuspide|\bit\b/, step2: true }
    ];

    const CHECKBOX_FIELDS = [
        { id: 'telang', label: 'Télangiectasies', re: /telangiectasies?/ },
        { id: 'aca', label: 'Anti-centromère', re: /(?:anticorps[\s-]*)?(?:anti[\s-]*)?centromere|\ba[\s.]*c[\s.]*a\b/ },
        { id: 'rad', label: 'Déviation axiale droite', re: /deviation axiale(?: droite)?|axe (?:droit|devie)/ }
    ];

    const NEGATIVE_AFTER_RE = /^[\s,:]*\b(non|pas|absentes?|absents?|absent|absence|negatifs?|negatives?|aucune?|zero)\b/;
    const NEGATIVE_BEFORE_RE = /\b(pas de|pas d|sans|aucune?|absence de|absence d)\s*['"]?\s*$/;
    const NUMBER_RE = /\d+(?:\.\d+)?/;

    let recognition = null;
    let listening = false;

    function normalize(text) {
        let t = text.toLowerCase();
        t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        t = t.replace(/(\d)\s*(?:virgule|,)\s*(\d)/g, '$1.$2');
        t = t.replace(/\bvirgule\b/g, '.');
        return t;
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
        input.value = value;
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
            const before = text.slice(Math.max(0, m.start - 16), m.start);

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

    function updateButtonState() {
        if (!voiceBtn) return;
        voiceBtn.classList.toggle('listening', listening);
        voiceBtn.textContent = listening ? '⏹ Arrêter la dictée' : '🎤 Saisie vocale';
        voiceBtn.title = listening ? 'Arrêter la dictée' : 'Saisie vocale';
    }

    function buildRecognition() {
        const rec = new SR();
        rec.lang = 'fr-FR';
        rec.continuous = true;
        rec.interimResults = true;
        rec.maxAlternatives = 1;

        rec.onresult = function (event) {
            let interim = '';
            let lastFinal = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const res = event.results[i];
                if (res.isFinal) {
                    lastFinal = res[0].transcript.trim();
                    if (lastFinal) {
                        const applied = parseAndApply(lastFinal);
                        logApplied(applied);
                        if (applied.length === 0 && voiceStatus) {
                            voiceStatus.textContent = '🤔 Aucune valeur reconnue dans « ' + lastFinal + ' ». Dites par exemple « CVF 90 ».';
                        } else if (voiceStatus) {
                            voiceStatus.textContent = '🎙️ En écoute — dictez vos valeurs…';
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
                updateButtonState();
                if (voiceStatus) {
                    voiceStatus.textContent = '🚫 Accès au micro refusé. Autorisez le micro dans les réglages du navigateur, puis réessayez.';
                }
            } else if (event.error === 'audio-capture') {
                listening = false;
                updateButtonState();
                if (voiceStatus) {
                    voiceStatus.textContent = '🚫 Aucun micro détecté sur cet appareil.';
                }
            }
        };

        rec.onend = function () {
            if (listening) {
                try { rec.start(); } catch (e) { /* redémarrage déjà en cours */ }
            } else {
                updateButtonState();
            }
        };

        return rec;
    }

    function startListening() {
        if (!recognition) recognition = buildRecognition();
        listening = true;
        if (voicePanel) voicePanel.classList.remove('hidden');
        if (voiceStatus) voiceStatus.textContent = '🎙️ En écoute — dictez vos valeurs…';
        try {
            recognition.start();
        } catch (e) { /* déjà démarré */ }
        updateButtonState();
    }

    function stopListening() {
        listening = false;
        if (recognition) {
            try { recognition.stop(); } catch (e) { /* déjà arrêté */ }
        }
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

    window.DETECT_VOICE = { parseAndApply: parseAndApply, normalize: normalize };
} catch (err) {
    console.error('VOICE MODULE ERROR:', err);
}
