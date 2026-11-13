# Architecture

## Vue d'ensemble

```
index.html ── src/boot.js (garde de démarrage)
           └─ src/main.js → src/app.js (états, réglages, licence)
                              ├─ src/router.js  → src/ui/<écran>.js   (chargés à la demande)
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
| `keywords.js` | Repère les mots-clés et choisit l'expression automatique d'une phrase. |
| `terminal.js` | Faux terminal ; ne garde que 40 lignes dans la page. |
| `timeline.js` | Découpe en phrases, minutage automatique, conversion temps ↔ caractères. |
| `subtitles.js` | Lecture et écriture `.srt` / `.vtt`. |
| `project.js` | Format `.lectura` (création, validation, export, import). |
| `audio.js` | Un seul `AudioContext`, lecture par `<audio>`, analyse du volume, encodage WAV. |
| `lipsync.js` | Volume → ouverture de bouche (4 niveaux), formes de bouche par bandes (Pro). |
| `character.js`, `character-loader.js` | Chargement, nettoyage et animation des personnages. |
| `capture.js`, `recorder.js`, `svgcanvas.js` | Capture PNG et enregistrement vidéo sur canvas. |
| `voice/webspeech.js`, `voice/queue.js` | Voix du système, file de phrases, reprise, chien de garde. |
| `voice/piper.js`, `piper-store.js`, `piper-worker.js` | Voix HD : téléchargement, cache, synthèse dans un worker. |
| `voice/g2p_fr.js`, `g2p_lexique.js`, `nombres.js` | Texte français → phonèmes. |
| `license.js`, `license-key.js` | Vérification hors ligne de la clé Pro. |
| `storage.js` | IndexedDB : réglages, projets, audio, brouillon. |
| `pwa.js` | Service worker, installation, quota, verrou d'écran. |
| `errors.js` | Journal local et messages à l'écran. |
| `i18n.js` + `src/i18n/` | Textes français et anglais. |

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
