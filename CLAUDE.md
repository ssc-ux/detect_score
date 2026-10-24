# DETECT — notes pour reprendre le travail

App web statique (GitHub Pages, branche `main`, sans build) : calculateur DETECT (dépistage de l'HTAP dans
la sclérodermie) + onglet pédagogique « Comprendre l'HTP » (bêta). Tout en français, vouvoiement.

## Fichiers
- `index.html` : les 3 onglets (Calculateur, Comprendre l'HTP, Source).
- `logic.js`, `app.js` : calculateur DETECT. **Ne pas modifier le calcul** sans test de non-régression.
- `htp.js` : onglet HTP (données GROUPS/STEPS/PRESETS/QUIZ/GLOSSARY, schéma 2D, mode pas à pas,
  quiz, lexique, lien depuis le calculateur). `htp.css` : styles de l'onglet.
- Vue 3D retirée le 24/10/2026 (jugée trop compliquée) : récupérable dans l'historique git
  (`htp3d.js`, `vendor/`, `models/` avant ce commit). Le schéma 2D est la vue principale.
- `sw.js` : service worker (hors ligne).

## Conventions
- À chaque modification d'un fichier JS/CSS : incrémenter son `?v=` — dans `index.html` (style, logic,
  app, fx), dans `app.js` (`HTP_ASSETS` : htp.css et htp.js, chargés à la demande) — **et** le nom du
  cache `detect-vN` dans `sw.js`.
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
- En ligne sur `main` : tout, y compris le lot « reste des audits » (`npm test` vert).
- Tous les audits sont rendus et appliqués (voir `docs/audits/`).
- Idées en attente : liens de partage vers un cas (`#htp=g4`), HTP d'effort, fiche imprimable,
  déformation en « D » plus franche, validation par un spécialiste avant de retirer la mention bêta.
