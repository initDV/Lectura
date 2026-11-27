# Lectura Android — référence, vérifications et limites

Référence de départ : le déploiement de `initDV/Lectura` à [`39e4295`](https://github.com/initDV/Lectura/commit/39e429522cc715aeda6ce0db9d3eb5690ba1f2fd), build Pages `2026-11-16 · 76713dcd32`. Les captures de CI interrogent [Pages](https://initdv.github.io/Lectura/) directement et consignent le build effectivement servi. Le code de référence prime sur le README. Cette référence historique précède le [catalogue commun de sept personnages](AICHA-PWA.md).

## Correspondances

| Référence web | Équivalent Android |
|---|---|
| Scène 38/62 sur écran large ou paysage ; dessin au-dessus du terminal en portrait étroit ou allongé dans le candidat Web | Terminal en haut à droite, même en portrait. Personnage agrandi en portrait et dessiné au premier plan, sans découpe à la limite du terminal. Cinq réglages d’écran indépendants avec aperçu direct. |
| Cinq lectrices et deux robots ; poses, gestes, lèvres et clignements | Le même catalogue de SVG ; rendu et animations Canvas natifs, sans WebView |
| 38 expressions, détection FR/EN et réglage par phrase | Tables de poses et lexiques partagés ; sélections, mélanges et réactions en lecture |
| Terminal `rhak_override@sentinel: ~/cours`, œil, 40 lignes, curseur, mots-clés, Markdown, `$ ` et `# ` silencieux | Dessin natif, coloration et horloges de lecture |
| Présentation simple/double toucher, vitesse par paliers, lecture, muet, volume et raccourcis | Commandes natives ; clavier, plein écran et insets gérés par Android |
| Synthèse système Web Speech | `TextToSpeech` Android ; les voix dépendent de l’appareil. Ce flux n’est pas capturé dans la vidéo. |
| Fichier audio ou 10 voix Lectura HD (5 modèles) | Sélecteur et décodage Android, lip-sync sur PCM ; Piper par ONNX Android et modèles Pages à la demande |
| PNG, vidéo 16:9/9:16, MP3 et Mes vidéos | PNG de la scène ; MP4 H.264/AAC ou WebM VPx/Opus selon les encodeurs, MP3 LAME ; MediaStore, bibliothèque privée et partage par URI |
| Projets, Personnages, Réglages, À propos et tutoriel | Vues natives FR/EN ; stockage privé, import/export via le sélecteur système |
| JSON `.lectura`, `.txt`/`.md`, `.srt`/`.vtt`, brouillon, exemple | Format de projet v1 repris ; fichiers importés par Android. Pas de reprise automatique des données du navigateur. |
| 10 apparences, 4 thèmes du terminal, 2 polices, décor, mots-clés et journal | Réglages et persistance natifs |
| Tout accessible sans compte ni licence d’accès | Tout accessible sans compte ni licence d’accès |
| Installation et mise à jour PWA | APK Android ; ressources de base embarquées, pas de service worker ni mise à jour silencieuse |

L’inventaire des ressources et les dimensions de référence se trouvent dans [ANDROID_INVENTAIRE.md](ANDROID_INVENTAIRE.md). Le [rapport bouche et Pro](ANDROID_BOUCHE_PRO.md) est historique. Depuis la 1.1, le Web n’a plus de niveau d’accès ; Android conserve l’accès complet. Les [quatre gestes du Robot Lectura](MISE-EN-SCENE.md) sont intégrés aux deux moteurs.

## Mesures sur l’émulateur Android 12

Les tests installent un APK de test signé et un APK d’instrumentation séparé. Le rapport `Lectura-comparaison` rassemble les captures non retouchées, les écarts RVB et le journal des contrôles. Les trois surfaces de départ sont comparées à 390 × 780, DPR 1, FR. La présence des paires est contrôlée, pas l’égalité des pixels. Si Pages et le candidat ne partagent pas encore le même cadrage, l’écart de composition est attendu. Les polices rasterisées, les animations et les surfaces système peuvent différer.

Le cadrage rapproché Android s’applique en portrait jusqu’à 480 dp de large, ou jusqu’à 720 dp si la largeur ne dépasse pas 3/5 de la hauteur. Le terminal reste à droite dans les deux cadres. À 390 × 780 dp, `surfaces` vérifie entre autres que le cadrage ne relance pas la lecture. À 1080 × 2400 px et 288 dpi (600 dp), `portrait-allonge` vérifie les cinq curseurs, le geste de défilement, l’œil, la persistance, le retour aux valeurs par défaut et la rotation. Il compare les pixels de la main animée d’Aïcha là où elle recouvre le terminal. À 320 × 568 dp, `portrait-court` vérifie l’accès aux commandes par défilement et le retour depuis la présentation.

Le PNG et la vidéo conservent leur composition 38/62, indépendante de ces préférences d’écran. Le terminal est composé avant le personnage, et le dessin n’est pas rogné à la frontière du terminal.

Android propose un [choix de résolution HD ou 4K UHD](../android/README.md#enregistrer-en-hd-ou-en-4k-android) distinct du ratio. La recette UHD exerce les deux ratios à leur taille native : sur un appareil compatible, elle contrôle les dimensions encodées et le son du fichier téléchargé ; sinon, elle contrôle le refus explicite sans changement automatique de résolution. Un refus sur l’émulateur ne valide pas l’encodage 4K sur un téléphone.

### Réactivité et cadence

L’aperçu suit l’horloge de lecture, avec moins de redessins au repos. Il réutilise les lignes terminées du terminal et prépare la coloration du script en arrière-plan. En vidéo, l’interface ne transmet que les commandes de dessin d’une image à la fois ; le fil d’encodage les dessine dans un seul bitmap à la résolution choisie. Une image peut être sautée si l’encodeur ne suit pas, sans ralentir l’horloge audio ni passer en HD.

Dans `Lectura-comparaison`, `android-cadence.txt` relève le temps d’ouverture et de préparation sans voix, les redessins de la fenêtre au repos et sur un long texte, et vérifie pause, avance/recul, reprise et fin. Le contrôle HD rapporte la cadence des images et sépare le dessin du bitmap, son transfert GL et la soumission au codec. Le contrôle UHD compare les pixels du dessin direct au résultat des commandes jouées hors interface et mesure ces deux étapes même sans codec UHD. Ces mesures sont propres à l’émulateur et ne garantissent ni une cadence minimale sur téléphone ni un débit d’encodage UHD.

Campagne sur l’APK [`1aec807`](https://github.com/initDV/Lectura/commit/1aec807) : [exécution `44295570195`](https://github.com/initDV/Lectura/actions/runs/44295570195) réussie. Résultats API 31 :

| Contrôle | Résultat observé |
|---|---|
| Démarrage et commandes | Tutoriel, scène et menu ; aperçu silencieux, pause/reprise/arrêt, vitesse, œil et cinq destinations |
| Ressources et formats | 43 rigs dessinés, 38 expressions, fixtures G2P, chronologies, SRT/VTT et JSON v1 |
| Fichier audio | Import et lecture d’un WAV, pause, avance, vitesse et lip-sync en mode muet |
| Piper | Gilles : téléchargement original interrompu et repris, inférence PCM non muette, cache et suppression. Le contrôle MLS exerce deux locuteurs (0 et 3) du modèle original partagé. |
| Enregistrement depuis la scène | Actions Enregistrer/Arrêter, MP4 portrait 720 × 1280 avec du son alors que l’écoute était muette, téléchargement et lecture dans Mes vidéos. |
| Encodage contrôlé | MP4 paysage 1280 × 720 H.264/AAC, WebM portrait 720 × 1280 VPx/Opus et MP3 ; pistes relues, hauteur de la tonalité contrôlée à 1,25× ; enregistrement MediaStore et bibliothèque privée |
| Partage | Lecture des URI MP4, WebM et MP3 par l’APK récepteur, sous un autre UID ; ce n’est pas un essai dans WhatsApp ou dans une galerie |
| Voix Android | Test de lecture FR non exécuté : aucune voix française locale utilisable sur cette image |

Mesures de cette campagne : scène **82,99 % / 1,60**, menu **92,27 % / 3,39**, tutoriel **82,93 % / 2,83** (pixels identiques / erreur RVB moyenne par canal, sur 255). Sur la [campagne précédente](https://github.com/initDV/Lectura/actions/runs/44294633406), l’erreur du menu était de 6,98 ; après ajustement des espacements, le décalage vertical des rangées échantillonnées est de 0,52 à 2,53 px. Ces chiffres ne démontrent pas une parité pixel à pixel, ni la parité de toutes les pages et de tous les thèmes.

## Avant diffusion

- Sur un téléphone réel, comparer le même projet à Pages en portrait et paysage, avec clavier et barres système. Tester également un appareil plus récent qu’Android 12.
- Installer une voix Android locale FR et tester une lecture complète. Essayer les autres modèles HD, ainsi que plusieurs fichiers audio (MP3, WAV, Ogg, M4A/AAC, WebM) : le décodage dépend de l’appareil. Vérifier l’attribution de chaque modèle/corpus avant de publier de l’audio dérivé.
- Enregistrer en 16:9 et en 9:16, modifier la vitesse, couper le son d’écoute, puis rouvrir le MP4 et contrôler image, piste audio et synchronisation. Tester « Mes vidéos », la galerie du téléphone et le partage vers un compte WhatsApp de test. WebM est une alternative de fichiers, sans garantie d’ouverture par le destinataire. Le repli de l’encodage essaie d’autres codecs à l’initialisation ; une défaillance plus tard n’est pas une conversion automatique du même enregistrement.
- Le circuit signé vérifie le certificat de distribution permanent et teste la mise à jour depuis l’APK public de référence (1.1.4 pour le candidat de cadrage réglable). Valider les [composants et leurs licences](../android/licenses/COMPOSANTS.md), notamment le cœur MP3 LGPL ; les notices et sources correspondantes ne modifient pas la liste de licences autorisées du projet. Voir [installation et recompilation](../android/README.md).
