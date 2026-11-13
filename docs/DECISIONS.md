# Décisions techniques

Chaque fois que le cahier des charges laissait un choix, ou qu'une consigne ne pouvait pas être suivie telle quelle,
la solution la plus simple, gratuite et hors ligne a été retenue. Tout est noté ici.

## 1. Écarts par rapport au cahier des charges (à lire en premier)

| Demandé | Fait | Pourquoi |
|---|---|---|
| Piper + espeak-ng pour la voix HD | Piper + convertisseur texte → phonèmes écrit pour Lectura (`g2p_fr.js`) | espeak-ng est sous GPLv3, hors de la liste de licences autorisées. |
| ffmpeg.wasm à la demande pour le MP4 | MP4 produit directement par le navigateur (`MediaRecorder`) quand il le sait, sinon WebM | ffmpeg.wasm : cœur GPL/LGPL, ≈ 30 Mo, lent sur téléphone. Chrome récent enregistre le MP4 seul. |
| Voix C de secours (Kokoro-js ou meSpeak) | Non incluse | meSpeak dérive d'espeak (GPL). Kokoro n'a pas de voix française de qualité et pèse plus de 80 Mo. |
| Icônes Lucide | Icônes redessinées dans `src/ui/icons.js` | Zéro dépendance, zéro fichier externe. |
| Vite pour la production | Vite seulement pour le développement et les tests ; production sans bundler | Voir point 2. |
| Terminal virtualisé « 80 lignes » | 40 lignes montées, paragraphes de plus de 600 caractères affichés une phrase par ligne | Mesure : 25 000 caractères passent de 10 à 60 images/s. |
| Voix HD multilingue | Voix HD en français uniquement | Le convertisseur maison ne couvre que le français. L'interface anglaise utilise la voix du système. |

Ordre de repli de la voix : voix du système → voix Lectura HD → fichier audio de l'utilisateur → aperçu sans son.
Chaque échec affiche un message en français avec les boutons pour passer à la solution suivante.

## 2. Production sans bundler

- Le site publié est le code source lui-même : modules ES natifs, aucun fichier généré à part le numéro de version.
- `tools/build.mjs` copie les fichiers dans `dist/`, calcule une empreinte, réécrit `VERSION` et `SHELL` dans `sw.js`
  et `BUILD` dans `src/version.js`. Aucune dépendance npm n'est nécessaire pour construire.
- `tools/serve.mjs` est un serveur statique sans dépendance : on peut développer sans `npm install`.
- Poids mesuré : 189 Ko compressés pour tout le code, les styles et les deux polices (objectif : moins de 300 Ko).
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

- Le fichier JSON d'un personnage accepte des champs en plus de la référence : `posture`, mouvements détaillés,
  `renduCanvas`. Les SVG sont nettoyés par liste blanche avant d'être insérés dans la page.
- L'export image/vidéo redessine le SVG vivant sur un canvas (`svgcanvas.js`). `professor_1` garde la fonction de
  dessin de référence.
- Expressions Pro : sceptique, fatigué, triste. Thèmes du terminal : sombre, matrix, ambre, océan.

## 7. Scène

- Touche E : fait défiler une expression forcée, puis revient en automatique.
- Mode présentation : un appui = lecture/pause, deux appuis = réafficher les commandes.
- L'enregistrement vidéo repart toujours du début, pour produire un fichier complet.
- La carte d'erreur propose toujours : réessayer, ouvrir les réglages, aperçu sans son, retour à l'éditeur.
- Liste des expressions par phrase limitée à 200 lignes dans l'éditeur ; les suivantes restent en automatique.

## 8. Licence Pro

- Clé = `base64url(données).base64url(signature)`, signature ECDSA P-256 / SHA-256 vérifiée par Web Crypto.
- La clé publique livrée est une clé de **démonstration** (`DEMO = true`) ; le build affiche un avertissement tant
  qu'elle n'a pas été remplacée. Voir `docs/PRO_LICENSE.md`.

## 9. Réglages ajoutés

`policeTerminal`, `tutorielVu`, `motsPerso`, `formatVideo`. Événements ajoutés au bus : `app:state`, `ui:toast`,
`settings:changed`, `pwa:installable`, `pwa:installed`.
