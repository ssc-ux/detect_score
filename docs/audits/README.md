# Audits de l'onglet « Comprendre l'HTP » (synthèse)

Audits réalisés par des agents en octobre 2026. ✅ = appliqué, ⏳ = reste à faire.

## Scientifique, 1re relecture (spécialiste HTP)
✅ Définition de l'HTP non classée (ESC/ERS 2022) · avertissement du lien patient · probabilité écho ·
MVO/HCP · critères DETECT (ScS > 3 ans, DLCO < 60 %, CVF ≥ 40 %) · prudence G3 (riociguat et PID) ·
cathétérisme pour l'HTP-TEC · liste du groupe 5 (2022) · vignettes du quiz complétées · NT-proBNP.
⏳ Test de vasoréactivité (peu pertinent dans la ScS).

## Scientifique, 2e relecture
✅ Profil calculé sur la PAPm arrondie · surcharge VD pilotée par le gradient transpulmonaire ·
VD qui gagne l'apex · G5 étapes 4-5 · mises en évidence G2/G3 · TAPSE/PAPs · encart « Modèle et limites ».

## Audit des sites 3D de cœur
✅ Direction confirmée (même architecture que learncoronary.com) · déformation anatomique du VD ·
coupes petit axe / 4 cavités · battement · aspect tissu · qualité adaptative · crédits de licence.
✅ Occlusion ambiante précalculée dans le modèle · boucle pression-volume du VD.

## Accessibilité (WCAG 2.2 AA)
✅ Annonce unique par étape · quiz sur schéma décrit en texte · groupes et
étapes en vrais boutons · onglet actif exposé · focus conservé et visible · contrastes · lexique
(aria-describedby, Échap) · pause des animations · zoom 3D · compteur d'étape, flèches, retour au quiz.
✅ Étapes avant la 3D dans l'ordre de tabulation · aria-pressed sur les vues 3D · schéma agrandissable sur mobile.

## Pédagogie (interne de 3e année)
✅ PAPm qui baisse vraiment en fin de G1/G4 · calque à l'étape citée · termes de l'étape définis ·
« À retenir » · tableau comparatif · questions de prédiction · étapes visibles sans défiler (ordinateur)
et schéma collant (mobile) · légendes des coupes.
✅ Question « Et ensuite ? » par groupe · explication de la mauvaise réponse · G5 en cartes ·
coupe 4 cavités apex en haut (convention écho) · vues 3D liées aux étapes.

## Technique
✅ Coupe et calques pendant le chargement · lecture auto au changement d'onglet · service worker
(clé = URL complète, caches des autres applis préservés) · color-mix avec secours · observateurs.
✅ Arbre artériel en InstancedMesh et pièces fusionnées (141 → ~30 appels de dessin) · onglet HTP chargé
à la demande · `npm test` + intégration continue (GitHub Actions).
