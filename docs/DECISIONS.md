# Décisions techniques

Chaque fois que le cahier des charges laissait un choix, ou qu'une consigne ne pouvait pas être suivie telle quelle,
la solution la plus simple, gratuite et hors ligne a été retenue. Tout est noté ici.

## 0. Refonte « robot + écran unique » (parties B et D révisées)

Les parties B (personnage) et D (interface) du cahier des charges ont été remplacées. Ce qui a changé :

- **Personnage** : le bonhomme pictogramme est supprimé. `robot_lectura.svg` reproduit la référence B2 à l'identique.
  Les 12 autres robots en dérivent (même corps, couleur et accessoires différents).
- **Catalogue** : le [catalogue commun actuel](AICHA-PWA.md) compte sept personnages. La vignette de `robot_lectura` reste intacte ; la scène utilise un SVG articulé distinct.
- **Anciens projets** : `professor_1` devient `robot_lectura`, `robot` devient `robot_rouge`, l'ancien fond devient `#0d0d12`.
- **`character.js`** : le code de référence B3 est repris (hauteurs de bouche, respiration, bras, clignement,
  expressions). Ajouts, sans le contourner : style de mouvement lu dans la fiche JSON, geste sur les mots-clés,
  expressions et largeur de bouche. Correction : les reflets des yeux sont masqués pendant le clignement
  (sinon un point blanc reste affiché).
- **Export (B5)** : le robot n'est plus redessiné à la main. Son SVG vivant est sérialisé puis dessiné sur le canvas,
  une image sur deux, sans jamais lancer deux conversions à la fois. Précaution ajoutée : largeur et hauteur sont
  écrites dans le SVG sérialisé, car Firefox est connu pour ne pas dessiner un SVG sans dimensions (non testé ici).
- **Écran principal unique** (D2) : scène en deux colonnes même en vertical (robot 38 %, terminal 62 %), puis
  « Capturer l'écran », « Vitesse », ligne voix, zone de texte, barre d'actions. Les anciens écrans Accueil et
  Éditeur n'existent plus.
- **Hauteur de la scène** : 70 % de l'écran au plus, réduite juste assez pour que le bouton « Lancer » reste visible
  sans faire défiler la page (64 % sur un téléphone de 844 px de haut).
- **Menu discret** : un bouton « ⋮ » en haut à gauche de la scène. C'est le seul élément ajouté à l'écran de la
  capture ; sans lui, les réglages avancés seraient inaccessibles. Il ouvre : projet (titre, enregistrer, importer,
  exporter), aperçu sans son, capture PNG, export vidéo, puis Personnages, Réglages et À propos.
- **Bouton « Lancer »** : pendant la lecture il devient « Pause », puis « Reprendre ». « Arrêter » coupe la voix,
  remet le robot au repos et garde le texte affiché ; « Lancer » repart alors du début.
- **Lignes « $ » et « # »** : affichées, jamais prononcées. Avec une voix, elles défilent en silence à la vitesse de
  frappe du terminal (28 caractères/s × vitesse) puis la voix reprend. Avec un fichier audio, elles apparaissent d'un
  coup entre deux phrases, car elles ne sont pas dans l'enregistrement. Pendant ces lignes, la bouche reste fermée.
- **Plus de prompt automatique** : seules les lignes « $ » portent un prompt, celui écrit dans le texte.
- **Vitesse** : pas de 0,25 entre 0,5x et 2,0x. Elle agit sur la voix et sur le défilement des lignes « $ » et « # ».
- **Couleurs** : les variables D1 sont appliquées telles quelles. Deux teintes dérivées ont été ajoutées pour rester
  lisible (contraste AA) : `--muted-text` `#8a8a98` pour les petits textes gris (`--muted` `#6b6b78` reste pour le
  décor et l'interrupteur éteint) et `--accent-text` `#c08cf5` pour le texte des commandes (le violet `#9b45e0` reste
  pour le prompt, les contours et les boutons).
- **Police** : tout est en JetBrains Mono ; Inter a été retirée du projet.
- **Taille du texte du terminal** : la taille réglée est plafonnée pour garder une trentaine de colonnes dans la
  colonne étroite d'un téléphone.
- **Messages** : affichés en haut de l'écran. En bas, ils recouvraient « Lancer » et « Arrêter ».
- **Brouillon** : enregistré toutes les 5 s, il est rouvert automatiquement au démarrage (plus de question
  « reprendre le brouillon ? »). L'avertissement avant fermeture n'apparaît que si la dernière modification n'est pas
  encore sauvegardée.
- **Titre du terminal** : `rhak_override@sentinel: ~/cours` par défaut, modifiable dans Réglages.

## 1. Écarts par rapport au cahier des charges (à lire en premier)

| Demandé | Fait | Pourquoi |
|---|---|---|
| Piper + espeak-ng pour la voix HD | Piper + convertisseur texte → phonèmes écrit pour Lectura (`g2p_fr.js`) | espeak-ng est sous GPLv3, hors de la liste de licences autorisées. |
| ffmpeg.wasm à la demande pour le MP4 | MP4 produit directement par le navigateur (`MediaRecorder`) quand il le sait, sinon WebM | ffmpeg.wasm : cœur GPL/LGPL, ≈ 30 Mo, lent sur téléphone. Chrome récent enregistre le MP4 seul. |
| Voix C de secours (Kokoro-js ou meSpeak) | Non incluse | meSpeak dérive d'espeak (GPL). Kokoro n'a pas de voix française de qualité et pèse plus de 80 Mo. |
| Icônes Lucide | Icônes redessinées dans `src/ui/icons.js` | Zéro dépendance, zéro fichier externe. |
| `img.decode()` à chaque image (B5) | Une conversion toutes les 2 images, jamais deux à la fois | Le décodage est asynchrone : l'attendre dans la boucle d'animation bloquerait la vidéo. |
| Vite pour la production | Vite seulement pour le développement et les tests ; production sans bundler | Voir point 2. |
| Terminal virtualisé « 80 lignes » | 40 lignes montées, paragraphes de plus de 600 caractères affichés une phrase par ligne | Mesure : 25 000 caractères passent de 10 à 60 images/s. |
| Voix HD multilingue | Voix HD en français uniquement | Le convertisseur maison ne couvre que le français. L'interface anglaise utilise la voix du système. |

Ordre de repli de la voix : voix du système → voix Lectura HD → fichier audio de l'utilisateur → aperçu sans son.
Chaque échec affiche un message en français avec les boutons pour passer à la solution suivante.

## 2. Production sans bundler

- Le JavaScript publié reste en modules ES natifs, sans compilation.
- `tools/build.mjs` copie les fichiers dans `dist/`, calcule une empreinte, réécrit `VERSION` et `SHELL` dans `sw.js`
  et `BUILD` dans `src/version.js`. Les cinq feuilles CSS du shell sont regroupées dans l’ordre de la cascade, dans le même
  dossier pour garder leurs URL relatives. Seuls les en-têtes documentaires `//` du code maison sont retirés (sans modifier
  les numéros de ligne) ; licences, bibliothèques et police restent intactes. Aucune dépendance npm n'est nécessaire pour construire.
- `tools/serve.mjs` est un serveur statique sans dépendance : on peut développer sans `npm install`.
- Budget au build : moins de 300 Kio pour le code, les styles et la police du shell, mesurés en gzip (la police WOFF2 est déjà compressée).
  Le module optionnel `src/modules/atlas/` et ses planches sont comptés à part : le service worker les précache pour le hors-ligne,
  mais la scène ne les importe qu’en mode Atlas.
- Conséquence : ~70 petits fichiers au premier chargement. Sur HTTP/2 (GitHub Pages, Cloudflare) c'est sans effet
  mesurable, et le service worker les garde ensuite hors ligne.

## 3. Voix

- **Trois sources de lecture, une seule interface** (`src/modules/player.js`) : fichier audio, voix du système,
  aperçu sans son. La scène ne connaît que `timeMs()`, `play()`, `pause()`, `seek()`.
- **La position du texte vient toujours du temps audio**, jamais d'une minuterie séparée. Pour la voix du système,
  qui ne donne pas de temps, la position vient des événements de mots (`boundary`) ; sur Android où ils manquent,
  elle est estimée phrase par phrase à 14 caractères/s.
- **Voix du système (Web Speech)** : pause = arrêt puis reprise au début du mot ; un chien de garde signale une voix
  qui ne démarre pas ou se bloque ; couper le son relance le morceau à volume 0.
- **Voix Lectura HD (Piper)** : synthèse dans un Web Worker, phrase par phrase, puis lecture comme un fichier audio.
  Avantages : lip-sync réel, dates exactes par phrase, son enregistrable dans la vidéo.
- **Voix retenue : `fr_FR-siwis-medium`** (CC BY 4.0). `upmc` (CC BY-SA) et `tom` (AGPLv3) sont écartées. Détail dans
  `THIRD_PARTY_LICENSES.md`.
- **Aucun CDN** : le modèle et onnxruntime-web sont servis par notre propre site, dossier `models/`. Ce dossier n'est
  pas dans Git ; GitHub Actions le remplit au déploiement, donc la connexion du développeur n'est pas utilisée.
- **Modèle coupé en morceaux de 8 Mio** avec empreinte SHA-256 : un téléchargement interrompu reprend au morceau
  manquant, un fichier abîmé est détecté, et la limite de 25 Mio par fichier de Cloudflare Pages est respectée.
- **Limite de 12 000 caractères** pour la voix HD (≈ 14 minutes) : au-delà, la mémoire d'un téléphone d'entrée de
  gamme ne suffit plus. Le message propose de couper le texte ou d'utiliser la voix du système.
- **Convertisseur de phonèmes** : règles du français + lexique d'exceptions et de mots techniques + nombres en
  lettres + sigles épelés. Mesuré contre espeak-ng sur 37 phrases : 2,7 % d'écart (surtout des liaisons). Sur un texte d'essai,
  une reconnaissance vocale automatique a transcrit la sortie comme celle du Piper d'origine (test unique, pas une
  mesure de qualité à grande échelle : écouter la voix sur de vrais textes reste nécessaire). Les noms propres
  étrangers peuvent être mal prononcés : ajouter le mot dans `g2p_lexique.js` (format `mot=phonèmes`).
- La hauteur de voix n'est pas réglable avec la voix HD (le modèle ne le permet pas).

## 4. Minutage

- Champ `timing` du projet : `auto` ou `sous-titres`. En `auto`, les phrases sont toujours redécoupées et datées
  automatiquement (au prorata de leur longueur et de leur ponctuation). Les dates d'un `.srt`/`.vtt` importé sont
  gardées tant que le texte correspond ; sinon retour à `auto` avec un avertissement.

## 5. Stockage et hors-ligne

- IndexedDB natif, sans bibliothèque, avec repli en mémoire (navigation privée) et avertissement.
- Service worker : réseau d'abord avec course de 5 s contre la copie locale. Correctif par rapport à la référence :
  s'il n'existe aucune copie locale, on attend le réseau au lieu d'échouer (première visite sur connexion lente).
- Les voix HD vivent dans un cache séparé (`lectura-models`) qui n'est jamais effacé par une mise à jour.
- `src/boot.js` : si l'application n'a pas démarré après 12 s, un message clair remplace l'écran vide.
- Journal d'erreurs dans `localStorage` (50 dernières entrées), jamais envoyé.

## 6. Personnages et rendu

- Les SVG sont nettoyés par liste blanche avant d'être insérés dans la page.
- L'export image/vidéo dessine le SVG vivant sérialisé (`svgframe.js`), voir la section 0.
- Thèmes du terminal : sombre, matrix, ambre, océan.

### Émotions du robot (ajout)

- **Détection par lexique, pas par IA.** `sentiment.js` cherche dans chaque phrase les mots et expressions de
  `data/sentiments_fr.json` (ou `_en`). Raison : gratuit, hors ligne, instantané, quelques Ko, et l'auteur peut
  corriger la liste lui-même. Limite assumée : pas de compréhension du sens (ironie, double sens).
- Le lexique est fait maison (aucune liste tierce reprise), donc aucune licence à citer.
- **L'émotion suit la position du texte**, donc le temps de la voix : avant le mot déclencheur le robot ne montre
  que 35 % de l'expression, puis il réagit quand le mot est prononcé.
- **Expressions combinées.** Une expression est un jeu de nombres (yeux, sourcils, bouche, tête, bras, corps). On
  peut donc glisser de l'une à l'autre et en mélanger deux. Exception pour les bras : une demi-pose ne ressemble à
  rien, ils prennent la pose entière de l'expression principale dès que la force dépasse 0,56.
- **Accès complet** : les 38 expressions, les mélanges et les gestes sont disponibles pour tout le monde.
- **Le SVG de référence n'est pas modifié.** La tête et les avant-bras n'y sont pas des groupes séparés : `rig.js`
  les regroupe à la volée au chargement (`#head`, `#forearm-l`, `#forearm-r`) et place les bras devant le corps.
  Au repos le dessin est identique.
- **Bras levés par devant.** Sur téléphone le robot touche le bord gauche de l'écran : un bras qui se lève par le
  côté sortait de l'image. Les poses passent donc devant le corps.
- **Capture et vidéo.** Le SVG est rendu avec une marge de 70 unités autour du cadre 240 x 600 pour qu'un bras levé
  ou un sursaut ne soit pas coupé.
- Réglage par projet `reglages.emotions` (coché par défaut), dans l'écran Personnages.

## 7. Scène

- Touche E : fait défiler une expression forcée, puis revient en automatique.
- Mode capture (« Capturer l'écran ») : un appui = lecture/pause, deux appuis ou Échap = réafficher les commandes.
- L'enregistrement vidéo repart toujours du début, pour produire un fichier complet.
- La carte d'erreur propose toujours : réessayer, ouvrir les réglages, aperçu sans son, fermer.
- Liste des expressions par phrase (écran Personnages) limitée à 200 lignes ; les suivantes restent en automatique.

## 8. Accès sans clé

Depuis la 1.1, il n’existe plus de niveau Pro. La migration retire seulement les deux champs de l’ancien système.
Voir [mise à jour des données](PRO_LICENSE.md) et [les quatre gestes](MISE-EN-SCENE.md).

## 9. Réglages ajoutés

`policeTerminal`, `tutorielVu`, `motsPerso`, `formatVideo`, `personnageId`, `titreTerminal`. Événements ajoutés au bus : `app:state`, `ui:toast`,
`settings:changed`, `pwa:installable`, `pwa:installed`.
