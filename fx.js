(function () {
    'use strict';

    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
    var hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)');

    /* ---------- Aurora shader background ---------- */

    function initAurora() {
        var canvas = document.getElementById('fx-canvas');
        if (!canvas) return;
        var gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false });
        if (!gl) { canvas.remove(); return; }

        var VERT = [
            'attribute vec2 p;',
            'void main(){ gl_Position = vec4(p, 0.0, 1.0); }'
        ].join('\n');

        var FRAG = [
            'precision mediump float;',
            'uniform vec2 u_res;',
            'uniform float u_t;',
            'uniform vec3 u_c1;',
            'uniform vec3 u_c2;',
            'uniform vec3 u_c3;',
            'uniform float u_gain;',
            'float blob(vec2 uv, vec2 c, float r){',
            '  vec2 d = uv - c;',
            '  return exp(-dot(d, d) / (r * r));',
            '}',
            'void main(){',
            '  vec2 uv = gl_FragCoord.xy / u_res;',
            '  float ar = u_res.x / u_res.y;',
            '  uv.x *= ar;',
            '  float t = u_t * 0.055;',
            '  vec2 c1 = vec2((0.18 + 0.10 * sin(t * 0.70)) * ar, 0.86 + 0.07 * cos(t * 0.90));',
            '  vec2 c2 = vec2((0.85 + 0.09 * cos(t * 0.55)) * ar, 0.78 + 0.09 * sin(t * 0.80));',
            '  vec2 c3 = vec2((0.55 + 0.14 * sin(t * 0.45)) * ar, 0.10 + 0.08 * cos(t * 0.65));',
            '  float b1 = blob(uv, c1, 0.46);',
            '  float b2 = blob(uv, c2, 0.42);',
            '  float b3 = blob(uv, c3, 0.52);',
            '  vec3 col = u_c1 * b1 + u_c2 * b2 + u_c3 * b3;',
            '  float a = clamp(b1 + b2 + b3, 0.0, 1.0) * u_gain;',
            '  gl_FragColor = vec4(col * a, a);',
            '}'
        ].join('\n');

        function compile(type, src) {
            var s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
            return s;
        }

        var prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        gl.useProgram(prog);

        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        var loc = gl.getAttribLocation(prog, 'p');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        var uRes = gl.getUniformLocation(prog, 'u_res');
        var uT = gl.getUniformLocation(prog, 'u_t');
        var uC1 = gl.getUniformLocation(prog, 'u_c1');
        var uC2 = gl.getUniformLocation(prog, 'u_c2');
        var uC3 = gl.getUniformLocation(prog, 'u_c3');
        var uGain = gl.getUniformLocation(prog, 'u_gain');

        function setColors() {
            if (darkScheme.matches) {
                gl.uniform3f(uC1, 0.50, 0.62, 1.00);
                gl.uniform3f(uC2, 0.62, 0.48, 1.00);
                gl.uniform3f(uC3, 0.30, 0.78, 0.72);
                gl.uniform1f(uGain, 0.13);
            } else {
                gl.uniform3f(uC1, 0.14, 0.32, 0.84);
                gl.uniform3f(uC2, 0.48, 0.34, 0.92);
                gl.uniform3f(uC3, 0.05, 0.52, 0.47);
                gl.uniform1f(uGain, 0.08);
            }
        }

        function resize() {
            var scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.5;
            var w = Math.max(1, Math.floor(window.innerWidth * scale));
            var h = Math.max(1, Math.floor(window.innerHeight * scale));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                gl.viewport(0, 0, w, h);
                gl.uniform2f(uRes, w, h);
            }
        }

        gl.clearColor(0, 0, 0, 0);

        var start = performance.now();

        function frame(now) {
            resize();
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.uniform1f(uT, (now - start) / 1000);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        var rafId = null;

        function loop(now) {
            frame(now);
            rafId = requestAnimationFrame(loop);
        }

        function apply() {
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            setColors();
            if (reducedMotion.matches) {
                frame(start + 20000);
            } else {
                rafId = requestAnimationFrame(loop);
            }
        }

        window.addEventListener('resize', function () {
            if (reducedMotion.matches) frame(start + 20000);
        });
        if (darkScheme.addEventListener) darkScheme.addEventListener('change', apply);
        if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', apply);

        apply();
    }

    /* ---------- Score count-up ---------- */

    function attachCountUp(el) {
        var animating = false;
        var rafId = null;
        var shown = null;

        var mo = new MutationObserver(function () {
            if (animating) return;
            var target = parseFloat(el.textContent);
            if (isNaN(target)) { shown = null; return; }
            if (reducedMotion.matches) { shown = target; return; }
            animate(target);
        });
        mo.observe(el, { childList: true, characterData: true, subtree: true });

        function animate(target) {
            animating = true;
            var from = (shown !== null && !isNaN(shown)) ? shown : 0;
            var dur = 900;
            var t0 = performance.now();
            if (rafId) cancelAnimationFrame(rafId);

            function tick(now) {
                var p = Math.min(1, (now - t0) / dur);
                var eased = 1 - Math.pow(1 - p, 3);
                el.textContent = Math.round(from + (target - from) * eased);
                if (p < 1) {
                    rafId = requestAnimationFrame(tick);
                } else {
                    el.textContent = String(target);
                    shown = target;
                    rafId = requestAnimationFrame(function () { animating = false; });
                }
            }
            rafId = requestAnimationFrame(tick);
        }
    }

    /* ---------- Pointer-tracked card glow ---------- */

    function initCardGlow() {
        if (!hoverCapable.matches) return;
        document.addEventListener('pointermove', function (e) {
            var card = e.target.closest && e.target.closest('.card');
            if (!card) return;
            var r = card.getBoundingClientRect();
            card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
            card.style.setProperty('--my', (e.clientY - r.top) + 'px');
        }, { passive: true });
    }

    /* ---------- Button ripple ---------- */

    function initRipples() {
        document.addEventListener('pointerdown', function (e) {
            var btn = e.target.closest && e.target.closest('.btn-primary');
            if (!btn || reducedMotion.matches) return;
            var r = btn.getBoundingClientRect();
            var size = Math.max(r.width, r.height);
            var span = document.createElement('span');
            span.className = 'ripple';
            span.style.width = span.style.height = size + 'px';
            span.style.left = (e.clientX - r.left - size / 2) + 'px';
            span.style.top = (e.clientY - r.top - size / 2) + 'px';
            btn.appendChild(span);
            span.addEventListener('animationend', function () { span.remove(); });
        }, { passive: true });
    }

    /* ---------- Touch tooltips ---------- */

    function initTouchTips() {
        if (hoverCapable.matches) return;
        document.addEventListener('click', function (e) {
            var tip = e.target.closest && e.target.closest('.tooltip');
            document.querySelectorAll('.tooltip.tip-open').forEach(function (t) {
                if (t !== tip) t.classList.remove('tip-open');
            });
            if (tip) tip.classList.toggle('tip-open');
        });
    }

    try { initAurora(); } catch (err) { /* decorative only */ }
    try {
        var s1 = document.getElementById('s1-points-val');
        var s2 = document.getElementById('s2-points-val');
        if (s1) attachCountUp(s1);
        if (s2) attachCountUp(s2);
    } catch (err) { /* decorative only */ }
    try { initCardGlow(); } catch (err) { /* decorative only */ }
    try { initRipples(); } catch (err) { /* decorative only */ }
    try { initTouchTips(); } catch (err) { /* decorative only */ }
})();
