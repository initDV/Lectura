# Android — bouche et mise en pause du Pro

La référence est le code web de [`39e4295`](https://github.com/initDV/Lectura/commit/39e429522cc715aeda6ce0db9d3eb5690ba1f2fd) et son déploiement [Pages](https://initdv.github.io/Lectura/), laissés intacts. L’APK précédent est celui de [`1aec807`](https://github.com/initDV/Lectura/actions/runs/44295570195).

## Bouche : ce qui change et comment le vérifier

Le terminal, le segment et la bouche partent de la même position UTF-16. La voix système conserve désormais la position fractionnaire entre deux callbacks ; comme dans le web, le terminal et le visème simulé prennent la partie entière, tandis qu’une forme de lettre n’est transmise que si la position est entière. Les découpages, le débit estimé et sa correction par les limites de mots, le plafonnement et les silences suivent les règles de `timeline.js`, `queue.js`, `player.js` et `scene.js`. La fenêtre PCM de 1 024 échantillons ne lit plus en avance au début du fichier ; le seuil, l’enveloppe, le pic adaptatif et l’hystérésis restent ceux de `lipsync.js`. La pause réinitialise l’enveloppe et le niveau, pas le pic. Pendant une recherche Android, le point demandé n’est pas analysé avant le retour du lecteur.

Pas de réduction d’amplitude ajoutée : niveaux `[5, 9, 14, 19]` avec minimum de la pose, oscillation simulée 6–9 Hz et seuils `.12/.40/.72`, lissage du visage 110 ms, des membres 190 ms et du mouvement de parole 250 ms. Les lèvres reprennent les formes, la quantification au quart d’unité et les seuils de visibilité de `mouth.js` ; le rectangle est centré avant d’arrondir ses dimensions comme dans `character.js`.

**Avant/après à 1,25×**, même texte (« Bonjour, ouvre la porte ! Émile écoute.\n$ echo test\nVoilà. »), mêmes instants et entrées. La référence est générée par les modules web non modifiés. Les résultats ci-dessous sont des **rejeux déterministes**, pas des mesures de la voix de l’utilisateur :

| Concordance avec la référence | `1aec807` | Corrigé |
|---|---:|---:|
| Voix système, caractères visibles | 384 / 406 | 406 / 406 |
| Voix système, niveau de visème | 402 / 406 | 406 / 406 |
| Voix système, lettre donnée à la bouche | 111 / 406 | 406 / 406 |
| Même WAV 48 kHz, position et niveau | 289 / 292 | 292 / 292 |

Les deux traces voix rejouent les callbacks avec et sans limites de mots. À 0, 2 et 4 ms du WAV de contrôle (silence), l’ancien niveau était 3 ; le nouveau reste à 0, puis atteint 3 à 6 ms, comme le web. Le test Android vérifie aussi les contours et les parties visibles des lèvres de Wend à partir de `mouth.js`.

**Limites :** Web Speech ne fournit pas le son à l’application. La bouche reste simulée, avec des limites de mots qui dépendent de la voix et du moteur ; le téléphone et Chromium n’ont ni nécessairement la même voix ni la même phase image par image. Web Audio analyse le signal rendu à la fréquence de son contexte, Android le PCM décodé à sa fréquence source, en suivant le lecteur natif. Le rééchantillonnage, l’étirement temporel et la latence ne sont pas identiques. Sans sous-titres alignés, aucun des deux lecteurs ne reconnaît les mots d’un fichier audio pour calculer leur position exacte.

## Lecture réelle en CI (API 31 et Pages)

[Exécution réussie `44304526156`](https://github.com/initDV/Lectura/actions/runs/44304526156), APK du commit `210278a`, Pages `2026-11-16 · 76713dcd32`. Même texte, même vitesse 1,25× et, en mode import, le même fichier WAV parlé (synthétisé avec eSpeak NG, sans la commande muette). Les traces contrôlent la progression du terminal et l’animation de la bouche ; leurs nombres d’images ne sont pas des mesures de fidélité entre plateformes.

| Essai | Android 12 | Pages dans Chromium |
|---|---|---|
| WAV parlé importé | 69 observations ; pause, avance, reprise et animation en mode muet | 151 images jusqu’à la fin |
| Voix système française locale | eSpeak NG `fr-fr`, 48 observations jusqu’à la fin ; commande silencieuse | Voix FR locale via Speech Dispatcher, 179 images jusqu’à la fin, aucune limite de mot remontée par cette voix |
| Rejeux de référence | 406 images TTS, 292 fenêtres PCM et 8 géométries/visibilités de Wend testées | Référence générée à partir du code web inchangé |

Les contrôles du Pro désactivé, de l’interface et des voix HD Piper Gilles/MLS ont passé. L’encodage et le partage sous un autre UID sont vérifiés comme composants internes, sans réactiver l’interface de vidéo. Pas d’essai sur téléphone physique dans cette campagne.

[Rapport et traces](https://github.com/initDV/Lectura/actions/runs/44304526156/artifacts/14427188871) · [Sources correspondantes](https://github.com/initDV/Lectura/actions/runs/44304526156/artifacts/14427332613) · [APK d’essai, installation séparée uniquement](https://github.com/initDV/Lectura/actions/runs/44304526156/artifacts/14427298730).

**Pas une mise à jour de `1aec807`.** La CI a téléchargé l’APK précédent et comparé les certificats SHA-256 :

- Précédent : `5eb15fc26b3c4da32ad615e3ae265bfd6ae65f1bb71f036bcf1b621199565992`
- Nouveau : `ba530020015ebbe1bcc009735d930ad9be4a588815206c08188aac91356c8ebe`

Android refuse ce remplacement ; ne pas désinstaller l’ancienne application, afin de garder son stockage privé et son identifiant. L’artefact de test convient à un émulateur/appareil séparé sans l’ancien paquet. Pour une mise à jour sur la même installation, il faut signer avec la clé privée d’origine (non conservée par le build CI précédent) ; les certificats de licence et la signature APK sont indépendants.

## Pro désactivé sur Android seulement

Pour restaurer les écrans et le contrôle de licence : passer **uniquement** `PRO_ENABLED` à `true` dans [`Features.java`](../android/src/io/github/initdv/lectura/Features.java), puis recompiler. Une licence valide reste nécessaire pour les actions qui la réclamaient. Les ressources, les projets, les licences sauvegardées et les vidéos déjà enregistrées ne sont pas effacés.

| Couverture du commutateur | Comportement quand il est à `false` |
|---|---|
| Personnages | `hacker`, `ninja`, `astronaute`, `detective`, `scientifique`, `pirate`, `cyborg`, `professeur_senior`, `etudiante`, `garde`, `alien` : ni vignette, ni sélection, ni chargement depuis un projet. Repli sur Robot Lectura sans modifier l’identifiant sauvegardé. Les **32** fiches non-Pro du catalogue (43 au total) restent disponibles ; la référence n’en compte pas 33. |
| Expressions et gestes | Les 34 poses Pro ci-dessous ne sont ni proposées (éditeur, touche `E`) ni jouées (lecture automatique, projet importé). Repli sur `neutre`, `content`, `concentre`, `surpris`, sans gestes avancés issus des poses Pro ni mélanges. Les gestes de base et les réactions à la ponctuation restent. |
| Bouche multibande, mots-clés | Pas d’analyse spectrale Pro pour élargir ou arrondir les lèvres. Le dictionnaire `data/keywords_fr_pro.json` et les catégories personnalisées ne sont pas chargés dans le moteur de mots-clés. Le dictionnaire de base et le lip-sync d’amplitude restent actifs. |
| Terminal et sous-titres | Thème Sombre, police JetBrains Mono et défilement de référence 28 car./s à 1× ; les personnalisations de thème/police/débit stockées sont ignorées, pas effacées. Taille du texte et titre restent réglables. Import/export `.srt`/`.vtt` masqués, et les dates de sous-titres enregistrées ne pilotent plus la lecture des fichiers. |
| Vidéo et partage | Ni enregistrement natif ni raccourci `R`, format 16:9/9:16, choix MP4/WebM, export audio MP3 lié à la vidéo, téléchargement/partage ni bibliothèque « Mes vidéos ». La capture PNG et le mode « Capturer l’écran » (masquer les commandes) restent. Le filigrane Lectura reste à l’écran et sur le PNG. |
| Licence et interface | Pas de route Pro, badges, liens, activation/retrait ou UI d’identifiant, notifications d’upsell ni annonces Pro dans le menu, les réglages, les personnages ou les raccourcis. L’aide HD ne promet plus l’enregistrement intégré. |

**Poses Pro** : `enthousiaste`, `rire`, `fier`, `tendre`, `sceptique`, `gene`, `triste`, `fatigue`, `colere`, `peur`, `curieux`, `inquiet`, `emerveille`, `ennuye`, `degoute`, `soulage`, `determine`, `malicieu`, `reconnaissant`, `nostalgique`, `jaloux`, `amuse`, `intimide`, `rassurant`, `impatient`, `compatissant`, `pensif`, `confus`, `resigne`, `excite`, `apaise`, `honteux`, `provocateur`, `contemplatif`.

Les voix système, importées et **Lectura HD** (catalogue, téléchargement et synthèse), le tutoriel, les projets et les autres commandes du menu restent disponibles. La compilation de contrôle avec la seule constante sur `true` a également réussi.
