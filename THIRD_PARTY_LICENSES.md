# Licences des composants tiers

Lectura est distribué sous licence MIT (fichier `LICENSE`). Ce document liste tout ce qui ne vient pas du projet.
Règle du projet : uniquement des licences MIT, Apache-2.0, BSD, ISC, MPL, OFL ou domaine public pour le logiciel.

## 1. Livré avec l'application

| Composant | Rôle | Licence | Source |
|---|---|---|---|
| JetBrains Mono (variable, sous-ensemble latin) | Police de toute l'interface | SIL Open Font License 1.1 (`fonts/OFL-JetBrainsMono.txt`) | https://github.com/JetBrains/JetBrainsMono, paquet `@fontsource-variable/jetbrains-mono` 5.3.0 |

Tout le reste du dossier publié (code, robots SVG, icônes de l'interface, icônes de l'application, dictionnaires de
mots-clés, textes d'exemple, convertisseur texte → phonèmes) a été écrit ou dessiné pour Lectura : licence MIT.
Aucune bibliothèque JavaScript tierce n'est chargée au démarrage.

## 2. Chargé seulement si l'utilisateur télécharge la voix « Lectura HD »

Ces fichiers ne sont pas dans le dépôt Git. `tools/fetch_voice.mjs` les place dans `models/` au moment du déploiement.

| Composant | Rôle | Licence | Source |
|---|---|---|---|
| onnxruntime-web 1.20.1 (`ort.wasm.min.mjs`, `ort-wasm-simd-threaded.mjs`, `.wasm`) | Exécute le modèle de voix dans le navigateur | MIT | https://github.com/microsoft/onnxruntime |
| Voix Piper `fr_FR-siwis-medium` (fichier `.onnx` + `.onnx.json`) | Modèle de la voix française | Voir ci-dessous | https://huggingface.co/rhasspy/piper-voices (révision `6b9cfaac…`) |

### Voix `fr_FR-siwis-medium` : licence vérifiée

- Modèle publié dans le dépôt `rhasspy/piper-voices` (dépôt sous licence MIT), entraîné avec Piper (MIT).
- Sa fiche (`MODEL_CARD`) indique le jeu de données : **SIWIS French Speech Synthesis Database**, Université d'Édimbourg,
  licence **Creative Commons Attribution 4.0 (CC BY 4.0)** — https://datashare.is.ed.ac.uk/handle/10283/2353
- CC BY 4.0 autorise la redistribution et l'usage commercial, à condition de citer la source. C'est une licence de
  données, pas une licence logicielle : elle ne figure pas dans la liste du projet, mais elle en respecte l'esprit
  (gratuit, redistribuable, utilisable dans des vidéos monétisées). Ce choix est noté dans `docs/DECISIONS.md`.
- **Mention à conserver** (affichée dans Réglages et dans À propos) :
  « Voix Piper fr_FR-siwis-medium, entraînée sur le corpus SIWIS French Speech Synthesis Database (Université
  d'Édimbourg), CC BY 4.0. »
- Pour une vidéo publiée, citer cette mention dans la description est la manière sûre de respecter l'attribution.

### Voix examinées et écartées

| Voix | Licence du jeu de données | Décision |
|---|---|---|
| `fr_FR-upmc-medium` | CC BY-SA 4.0 | Écartée par défaut : la clause « partage à l'identique » crée un doute pour les vidéos. |
| `fr_FR-tom-medium` | AGPLv3 | Écartée : licence hors de la liste autorisée. |

### Composants volontairement non utilisés

| Composant | Raison |
|---|---|
| espeak-ng (phonétisation habituelle de Piper) | GPLv3. Remplacé par un convertisseur français écrit pour Lectura (`src/modules/voice/g2p_fr.js`, MIT). |
| meSpeak.js | Dérivé d'espeak (GPL). |
| ffmpeg.wasm | Cœur compilé sous GPL/LGPL et ≈ 30 Mo. Le MP4 est produit par le navigateur quand il le sait, sinon WebM. |
| Lucide (icônes) | Licence ISC acceptable, mais les icônes ont été redessinées pour n'avoir aucune dépendance. |

## 3. Outils de développement (jamais envoyés à l'utilisateur)

| Outil | Licence |
|---|---|
| Vite | MIT |
| Vitest | MIT |
| ESLint | MIT |
| Prettier | MIT |
| onnxruntime-web (source des fichiers copiés dans `models/ort/`) | MIT |

Seules les dépendances directes déclarées dans `package.json` sont listées ; leurs propres dépendances restent sur la
machine de développement et ne sont jamais publiées.
