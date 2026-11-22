# Architecture

## Vue d'ensemble

Lectura existe en deux incarnations :

- **Web (PWA)** : application installable basée sur HTML/JS/CSS, service worker et IndexedDB.
- **Android native** : application Java (`io.github.initdv.lectura`), minSdk 31, sans WebView.

Les deux s’appuient sur un socle de ressources et de formats, tout en disposant de moteurs de lecture, de rendu et de stockage spécifiques.

### Ressources et formats

| Élément | Nature | Commentaire |
|---------|--------|-----------|
| Personnages (SVG + JSON) | Ressource partagée | Même source. `android/assets.mjs` l’adapte à la compilation Android. |
| Poses, pivots, lexiques d’émotions | Ressource partagée (en partie) | Même origine. Une partie est transformée lors de la préparation Android. |
| Traductions (FR/EN) | Ressource partagée (en partie) | Même source, adaptée pour Android via `android/assets.mjs`. |
| Format de projet `.lectura` v1 | Contrat commun | Mis en œuvre séparément en JavaScript et en Java. Ne transporte pas le fichier audio. Ne garantit pas que la même voix soit disponible sur les deux plateformes. |

**Clarification :**

- **Partagé** : le Web et Android partent de la même source, même si Android l’adapte à la compilation.
- **Contrat commun** : format ou règle défini une fois et implémenté de façon indépendante sur chaque plateforme (cas du `.lectura` v1).

La vérification de licence Pro (ECDSA) est actuellement spécifique au Web. L’Android n’active plus ce mécanisme. Elle est distincte du certificat qui signe les APK.

## Architecture Web

```
index.html ── src/boot.js (garde de démarrage)
           └─ src/main.js → src/app.js (états, réglages, licence)
                              ├─ src/router.js  → src/ui/<écran>.js   (chargés à la demande)
                              │    scene (écran principal) · projets · personnages · reglages · pro · apropos
                              ├─ src/state.js     bus d'événements + état partagé
                              └─ src/modules/*    logique sans interface
sw.js        service worker (réseau d'abord, copie locale hors ligne)
characters/  1 SVG + 1 JSON par personnage, index.json
data/        dictionnaires de mots-clés, textes d'exemple
models/      voix HD (hors Git, créé par tools/fetch_voice.mjs)
tools/       serveur, build, icônes, licences, voix
tests/       tests Vitest
```

## Machine à états (`src/app.js`)

```
IDLE → PREPARATION → PRET → LECTURE ⇄ PAUSE → FIN
ERREUR est accessible depuis tout état ; elle affiche le message et un bouton « Réessayer ».
```

Une transition interdite est refusée et écrite dans le journal d'erreurs.

## La règle centrale : le texte suit le son

```
source audio ──timeMs()──▶ Timeline.charAt(ms) ──▶ Terminal.revealTo(n)
                    │                         └──▶ segment courant ──▶ expression du personnage
                    └─ viseme() ──▶ bouche du personnage
```

Les lignes « $ » (commande) et « # » (commentaire) sont affichées mais jamais prononcées : `timeline.js` les repère
(`typeLigne`), la file de la voix les fait défiler en silence, et la bouche du robot reste fermée.

À chaque image (`requestAnimationFrame`, dans `src/ui/scene.js`), la scène demande le temps à la source, en déduit le
nombre de caractères à montrer, puis met à jour le terminal et le personnage. Reculer, avancer, mettre en pause ou
tourner l'écran ne peut donc jamais désynchroniser le texte.

## Les sources de lecture (`src/modules/player.js`)

| Source | Quand | Temps | Bouche | Enregistrable en vidéo |
|---|---|---|---|---|
| `FileSource` | fichier audio, ou voix HD déjà synthétisée | élément `<audio>` | volume réel (analyseur) | oui |
| `SpeechSource` | voix du système | position des mots, sinon estimation | simulée | non (limite des navigateurs) |
| `SilentSource` | aperçu sans son | horloge à la vitesse du terminal | simulée | oui, sans son |

`src/modules/prepare.js` choisit la source, charge le personnage et les mots-clés, et lève une erreur en français si
quelque chose manque.

## Modules principaux

| Fichier | Rôle |
|---|---|
| `keywords.js` | Repère les mots-clés du terminal ; expression de secours d'une phrase (alerte, commande). |
| `sentiment.js` | Lexique des sentiments : mots, expressions, négation, intensifs, émojis → émotion et position. |
| `humeur.js` | Expression à jouer à chaque instant : imposée > sentiment > mots-clés ; version gratuite ou Pro. |
| `expressions.js` | Table des expressions (yeux, sourcils, bouche, tête, bras, corps), force, mélange, transition. |
| `rig.js` | Regroupe à la volée la tête et les avant-bras du SVG, place les bras devant le corps. |
| `terminal.js` | Faux terminal ; ne garde que 40 lignes dans la page. |
| `timeline.js` | Découpe en phrases, minutage automatique, conversion temps ↔ caractères. |
| `subtitles.js` | Lecture et écriture `.srt` / `.vtt`. |
| `project.js` | Format `.lectura` (création, validation, export, import). |
| `audio.js` | Un seul `AudioContext`, lecture par `<audio>`, analyse du volume, encodage WAV. |
| `lipsync.js` | Volume → ouverture de bouche (4 niveaux), formes de bouche par bandes (Pro). |
| `character.js`, `character-loader.js` | Chargement, nettoyage et animation des robots. |
| `capture.js`, `recorder.js`, `svgframe.js` | Capture PNG et enregistrement vidéo sur canvas ; le robot vient du SVG vivant sérialisé. |
| `voice/webspeech.js`, `voice/queue.js` | Voix du système, file de phrases, reprise, chien de garde. |
| `voice/piper.js`, `piper-store.js`, `piper-worker.js` | Voix HD : téléchargement, cache, synthèse dans un worker. |
| `voice/g2p_fr.js`, `g2p_lexique.js`, `nombres.js` | Texte français → phonèmes. |
| `license.js`, `license-key.js` | Vérification hors ligne de la clé Pro. |
| `storage.js` | IndexedDB : réglages, projets, audio, brouillon. |
| `pwa.js` | Service worker, installation, quota, verrou d'écran. |
| `errors.js` | Journal local et messages à l'écran. |
| `i18n.js` + `src/i18n/` | Textes français et anglais. |

## Interface (`src/ui/`)

| Fichier | Rôle |
|---|---|
| `scene.js` | Écran principal : préparation, boucle d'animation, Lancer / Arrêter, raccourcis. |
| `scene-controls.js` | Les lignes sous la scène : capture, vitesse, voix, texte, actions. |
| `scene-export.js` | Capture PNG et enregistrement vidéo. |
| `voix-liste.js` | Liste des voix françaises et import d'un fichier audio. |
| `menu.js`, `modale.js` | Menu discret et fenêtre modale accessible. |
| `projet-actions.js` | Enregistrer, importer, exporter le projet et les sous-titres. |
| `projets.js`, `personnages.js`, `reglages.js`, `pro.js`, `apropos.js` | Écrans ouverts depuis le menu. |
| `styles/tokens.css` | Variables de design (D1). |

## Bus d'événements (`src/state.js`)

`audio:ready/play/pause/end/error`, `tts:sentence-start/sentence-end/boundary`, `timeline:tick`, `terminal:line`,
`character:expression`, `license:changed`, `net:online/offline`, `sw:update-available`, plus `app:state`, `ui:toast`,
`settings:changed`, `pwa:installable`, `pwa:installed`.

## Sécurité

- Politique CSP stricte dans `index.html` : scripts, styles, images et connexions limités à notre propre origine.
- Aucun `eval`, aucun style ou script en ligne. Le texte de l'utilisateur passe toujours par `textContent`.
- Les SVG de personnages sont filtrés par liste blanche avant insertion.

## Ajouter une langue

1. Copier `src/i18n/en.js` et `src/i18n/en-settings.js`, traduire les valeurs.
2. Déclarer la langue dans `CHARGEURS` et `LANGUES` de `src/modules/i18n.js`.
3. `npm test` vérifie que les clés et les variables correspondent au français.

## Architecture Android

Point d’entrée unique : `MainActivity`.

### Carte des classes principales

| Classe | Rôle | Relation avec MainActivity |
|--------|------|---------------------------|
| `Stage`, `ScenePage`, `Screens`, `ExportUi`, `Ui` | Interface / présentation | Référencent **directement** l’activité |
| `Reading`, `Talk`, `Hd` | Moteurs (lecture, voix système, voix HD) | Pilotés par MainActivity, reçoivent aussi d’autres dépendances |
| `Project`, `MediaExport`, `Refs`… | Données, export, utilitaires | Utilisés par l’activité et les moteurs |

### Stockage Android

- Réglages → `SharedPreferences`
- Projets et audio importé → stockage privé de l’application
- Voix HD → doivent être téléchargées avant leur première utilisation hors ligne

`MainActivity` concentre actuellement la navigation, le cycle de vie de la lecture, la coordination des téléchargements HD et l’accès aux services système. Les rôles existent déjà dans des classes séparées, mais le couplage reste élevé sur certaines classes d’interface.

## Intégration et branches

Le code Android vit actuellement sur une branche de travail dédiée. La compilation Android y est configurée.

Une future intégration dans `main` devra distinguer :

### Compilation de contrôle

- Vérifier que le projet Android compile (notamment lorsque les ressources communes changent).
- Sans clé de signature.
- Devra pouvoir s’exécuter aussi depuis `main`.

### Production d’APK signé

- Reste protégée (secrets + certificat permanent).

### Contrôles de non-régression

- Exécuter les tests et le build Web
- Vérifier la compilation Android sans signature
- Tester l’échange d’un projet `.lectura` dans les deux sens (Web → Android et Android → Web)
- Vérifier une lecture hors ligne après mise à jour
- Respecter les critères de mise à jour :
  - Même `applicationId`
  - Même certificat de signature
  - `versionCode` supérieur
  - Conservation des projets, réglages et médias locaux

## Principes d’évolution

1. Les ressources partagées restent la source de vérité quand c’est pertinent.
2. Chaque plateforme garde la liberté de ses moteurs (voix, rendu, stockage).
3. On documente d’abord les frontières (partagé / contrat commun / spécifique) avant de découpler davantage le code.
4. Tout refactoring de packages Java est reporté après stabilisation de l’intégration.
