# DETECT — notes pour reprendre le travail

App web statique (GitHub Pages, branche `main`, sans build) : calculateur DETECT (dépistage de l'HTAP dans
la sclérodermie) + onglet pédagogique « Comprendre l'HTP » (bêta). Tout en français, vouvoiement.

## Fichiers
- `index.html` : les 3 onglets (Calculateur, Comprendre l'HTP, Source).
- `logic.js`, `app.js` : calculateur DETECT. **Ne pas modifier le calcul** sans test de non-régression.
- `htp.js` : onglet HTP (données GROUPS/STEPS/PRESETS/QUIZ/GLOSSARY, simulateur 2D, mode pas à pas,
  quiz, lexique, lien depuis le calculateur). `htp.css` : styles de l'onglet.
- `htp3d.js` : vue 3D (module ES chargé à la demande). Three.js r160 vendorisé dans `vendor/`.
  Modèle `models/thorax.glb` (Human Reference Atlas / HuBMAP, CC BY 4.0 — crédit obligatoire, déjà
  dans l'onglet). Déformation HTP + battement dans le shader (`DEFORM_GLSL`, `deformable()`),
  qualité réduite automatique sur appareil lent.
- `sw.js` : service worker (hors ligne). La 3D n'est jamais préchargée (seulement à l'ouverture).

## Conventions
- À chaque modification d'un fichier JS/CSS : incrémenter son `?v=` — dans `index.html` (style, logic,
  app, fx), dans `app.js` (`HTP_ASSETS` : htp.css et htp.js, chargés à la demande), dans `htp.js`
  (`htp3d.js?v=`), dans `htp3d.js` (`models/thorax.glb?v=`) — **et** le nom du cache `detect-vN` dans `sw.js`.
- Travailler sur la branche `claude/onglet-htp`, tester, puis fusion rapide (`--ff-only`) dans `main`.
- Commits en français.

## Tests (Playwright global, Chromium préinstallé)
- Serveur : `python3 -m http.server 8765` à la racine du dépôt.
- `npm test` lance le serveur et les deux tests (voir `tests/run.js`) ; en CI : `.github/workflows/tests.yml`.
- `node tests/e2e.js [dossier_captures]` : parcours complet de l'onglet HTP (1366 px + 320 px) → `TOUT OK`.
  Lent en rendu logiciel (~5 min) : le lancer en arrière-plan.
- `node tests/regression-detect.js` : compare le calculateur à une version de référence servie sur le
  port 8766 (ex. `git worktree add /tmp/old 47f8f76` puis serveur dans ce dossier) → `identiques: true`.

## État au 17/10/2026
- En ligne sur `main` : tout, y compris le lot « accessibilité (audit WCAG 2.2) et ergonomie »
  (tests de bout en bout verts).
- Tous les audits sont rendus et appliqués (voir `docs/audits/`).
- Idées en attente : liens de partage vers un cas (`#htp=g4`), HTP d'effort, fiche imprimable,
  déformation en « D » plus franche, validation par un spécialiste avant de retirer la mention bêta.
