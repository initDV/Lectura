# Lectura Android — suivi de la version finale

Périmètre : branche `arena/d2229c4f-lectura`, application native (`io.github.initdv.lectura`, pas de WebView), sans comptes ni activation produit, avec les 43 personnages, les 38 poses et tous les exports accessibles. La référence reste le code web [`39e4295`](https://github.com/initDV/Lectura/commit/39e429522cc715aeda6ce0db9d3eb5690ba1f2fd) et [GitHub Pages](https://initdv.github.io/Lectura/) en lecture seule. Ni déploiement ni fusion. Les données des projets restent compatibles ; seuls les anciens champs d’activation Android sont retirés. Internet sert uniquement au téléchargement des modèles de voix demandé par l’utilisateur.

| Phase | État et critère de livraison |
|---|---|
| 0 — Signature | **Livrée** : [APK signé permanent](https://github.com/initDV/Lectura/actions/runs/44329414529/artifacts/14438028918), build `70b1ff2`, `versionCode` 21. [CI et instrumentation API 31 réussies](https://github.com/initDV/Lectura/actions/runs/44329414529). Aucun repli sur une clé de débogage. |
| 1 — Parité | Comparaison des surfaces et parcours Android avec la référence web. Tout le catalogue est disponible sur Android ; la différence de politique d’accès et les voix système locales uniquement sont voulues. |
| 2 — Texte → voix | Durées et règles de symboles validées avec les exceptions ci-dessous. Pas encore implémentées ; le nouveau flux de voix reste Android seul. |
| 3 — Voix | `synthesizeToFile` approuvé pour cette phase avec mesure de l’alignement de la bouche avant/après ; Kokoro reste une étude sans ajout. Aucun changement de moteur ou de catalogue à ce stade. |
| 4 — Vérification | Passages instrumentés hors ligne puis en ligne, et test sur un téléphone réel pour ce que l’émulateur ne prouve pas. APK final et rapport seulement après vérifications, sans substitution silencieuse. |

## Phase 0 — premier APK à clé permanente

Empreinte SHA-256 du **certificat**, vérifiée par la CI sur l’APK final et égale à [`android/signing-cert.sha256`](../android/signing-cert.sha256) : `b6873c0f1a2f447163fb9af7e6f4181280b31fd1f5c45b0535993075b3dc7d8b`. Le keystore est resté dans les secrets `android-signing`, avec nettoyage du fichier temporaire du runner. L’APK de test antérieur n’a pas le même certificat : suivre les [précautions pour l’installation initiale](ANDROID_SIGNATURE.md#3-vérifier-avant-installation).

Sur l’émulateur Android 12 : installation, tutoriel/lecture/commandes, WAV importé, voix système FR, synthèse Piper et Pro désactivé contrôlés. [Rapport et captures](https://github.com/initDV/Lectura/actions/runs/44329414529/artifacts/14438761976) ; [sources correspondantes](https://github.com/initDV/Lectura/actions/runs/44329414529/artifacts/14437678702). Sur Pages, le WAV commun a passé ; la voix système Chromium n’a pas été testée sur ce run (moteur Linux indisponible). Pas d’essai sur téléphone réel ni de mise à jour entre deux installations permanentes à ce stade.

## Phase 1 — Parité et accès intégral Android

Point de départ : [run API 31/Pages `44304526156`](https://github.com/initDV/Lectura/actions/runs/44304526156), avant la clé permanente. Le [rapport précédent](ANDROID_BOUCHE_PRO.md) distingue les rejeux déterministes des lectures réelles. La campagne ne vaut pas validation de tous les parcours : elle sert de référence pour les tests suivants.

| Surface visible | Contrôles déjà documentés | À vérifier ou à comparer en phase 1 |
|---|---|---|
| Premier lancement, tutoriel, navigation | Premier écran, « Passer », quatre destinations de base testés | Trois étapes FR/EN, exemple, retour, focus, portrait/paysage et persistance après relance |
| Scène et terminal | Capture FR 390 × 780 ; œil, curseur et lecture | Décor, repères, texte et boutons, gestes, masquage, chacun des réglages de taille/titre/décor, états clavier/insets et petite fenêtre |
| 43 personnages | 43 rigs de la référence, tous sélectionnables | Contrôler le rendu et la persistance pour chaque rig, y compris les 11 auparavant masqués |
| 38 expressions + Auto | Poses, gestes et mélanges, mots-clés étendus et personnalisés | Contrôler chaque pose manuelle/par phrase/Auto, raccourci `E`, mouvement et clignements |
| Menu, plein écran, présentation, raccourcis | Menu FR et destinations, aperçu silencieux, œil ; enregistrement accessible par menu et `R` | Ordre, états/alertes, raccourcis et indication réseau FR/EN |
| Projets | Format `.lectura` v1 et stockage inchangés | Titre, brouillon, nouveau/exemple, enregistrement/réouverture/suppression ; imports `.txt`/`.md` et `.lectura` via le sélecteur |
| Capture PNG | Native, sans filigrane | Refus avant préparation ; relire le fichier, comparer scène et texte ; 1080×1920 portrait / 1280×720 paysage |
| SRT/VTT | Import et export natifs, timecodes sur fichier audio | Import/export dans les deux formats, mêmes cues et horodatages, invalidation des repères si le texte change |
| Export vidéo / audio | Enregistrement et « Mes vidéos » accessibles, 16:9 et 9:16 | Codec et piste vérifiés, partage et stockage natifs ; son du WAV/Piper, pas de piste système avec le moteur direct |
| Transport | Démarrer, pause, reprise, arrêt, vitesse, lecture de WAV, muet | Toutes les commandes et vitesses, déplacements, fin, volume/muet et interruption/reprise, raccourcis et progression cohérents |
| Voix système | FR locale eSpeak avec texte de contrôle ; Web Speech FR local avec le même texte | Choix de voix, réglages/écoute, mémoire du choix, cas voix locale absente, restriction aux voix locales installées ; moteurs différents, pas d’égalité de timbre garantie |
| Voix HD | Piper Gilles et 2 locuteurs MLS ; interruption/reprise de téléchargement, PCM et cache observés | Catalogue, installation, choix, écoute et suppression ; toutes les voix en phase 3. Les modèles partagés MLS ne doivent être installés qu’une fois. |
| Fichier audio | WAV parlé, import natif, animation, pause et recherche | Sélecteur système, identité du fichier après relance, erreurs, formats courants ; décodage selon les codecs présents |
| Réglages / À propos | Aide HD, choix du terminal et édition de mots-clés accessibles | FR/EN, thèmes de l’app, décor, émotions, réglages audio, aide/attributions, retour scène, réinitialisations sans perte non demandée |
| Pas de compte ni de clé | Sans route ou offre commerciale, ni vérification locale ou réseau | Installation vierge en avion, upgrade depuis v21, réglages FR/EN et notices légales conservées |

Comparaison à faire avec le même texte/projet, rythme, thème, langue et orientation. Isoler les contrôles communs des entrées qui diffèrent volontairement, notamment l’activation web et les exports ouverts dans le menu Android. Android fournit le sélecteur de fichiers, les barres et le clavier natifs à la place de ceux du navigateur : comparer l’action et la sortie, pas prétendre que ces surfaces système sont identiques. Écarts de rendu à mesurer et à expliquer (texte rasterisé, insets, phase d’animation), pas à cacher.

## Phase 2 — pauses et symboles validés, pas encore appliqués

| Ponctuation | Silence cible à 1× |
|---|---:|
| Virgule `,` | 140 ms |
| Deux-points `:` | 200 ms |
| Point-virgule `;` | 240 ms |
| Point `.` | 320 ms |
| Interrogation `?` | 360 ms |
| Exclamation `!` | 400 ms |
| Points de suspension `…` ou `...` | 480 ms |
| Retour à la ligne | 560 ms |

Les silences suivent la vitesse (`durée à 1× / vitesse` : le point de fin de phrase passe de 320 à 256 ms à 1,25×). Aux frontières contiguës (`!` suivi d’un retour), garder la pause la plus longue, pas la somme. Un point entre deux lettres contiguës (`script.py`, `github.com`) se lit « point » sans pause longue. Les deux-points dans une heure (`10:30`) ou une adresse (`https://`) ne déclenchent pas de pause. Ne pas transformer la virgule décimale, un point d’abréviation ou une version en fin de phrase. La ponctuation peut affecter l’intonation ; vérifier le silence effectivement mesuré, car le moteur peut déjà produire son propre silence de fin.

| Symbole ou contexte | Voix (FR) |
|---|---|
| `#`, `*`, accent grave, `_`, `~`, barre verticale, contre-oblique, `/`, `<`, `>`, `{`, `}`, `[`, `]`, guillemets, parenthèses et emoji décoratifs | Ignorer le symbole (pas de fusion de deux mots). En particulier `## Titre` prononce « Titre ». |
| `%`, `@`, `&`, `+`, `=` dans le texte normal | « pour cent », « arobase », « et », « plus », « égale ». `=` reste muet dans les lignes de commande. |
| `€`, `$` accolés à un montant ; signe moins devant un nombre | « euro(s) », « dollar(s) », « moins ». Un `$` décoratif isolé n’est pas lu. |
| Apostrophes et traits d’union internes | Garder le mot comme unité (`l’heure`, `rendez-vous`), ne pas prononcer le nom du signe. |
| Ligne `$ commande` ou `# commentaire` | Rester entièrement muette comme dans la référence, affichage intact. |

L’original affiché et enregistré ne doit pas passer par le nettoyeur vocal. Aujourd’hui `Script.clean()` retire aussi des marqueurs Markdown utilisés en lecture : il faut découpler ce chemin de la source à afficher. Garder des offsets du texte d’origine pour chaque fragment audio/phrase, y compris les expansions (`%` → « pour cent ») et les caractères ignorés. Ne jamais transmettre directement un offset de TTS nettoyé au terminal. Fermer la bouche sur les pauses et les commandes muettes ; vérifier sur pause/reprise/recherche/vitesse. Pour un moteur système sans limites de mots, la correspondance des offsets peut être vérifiée, mais pas la précision acoustique par phonème.

Dictionnaire prévu : fichier UTF-8 versionné côté Android, par langue, avec remplacements de mots entiers, entrées FR ciblant `sudo`, `Linux`, `GitHub`, `API` et autres sigles, et règles de lecture de nombres locales. Ex. `sudo` → « soudo », `API` → « a pé i », `3,14` → « trois virgule quatorze ». Tester les entrées sur les moteurs ; ne pas modifier la chaîne dans le projet ou le terminal.

## Phase 3 — état et faisabilité

- **Piper** : le code actuel garde une session ONNX pour le modèle chargé, des caches de phrases en RAM et sur disque et un cache du WAV complet. Il préchauffe déjà à la sélection et après une édition, mais ne charge pas systématiquement la voix d’un brouillon restauré à l’ouverture. Comparer avant/après avec le même texte, même voix (notamment Siwis/Tom), même vitesse et même appareil : ouverture → scène utilisable, clic → premier son et temps de synthèse (modèle/caches froids, modèle chaud sans phrase, phrase en cache, WAV complet). Répéter, donner médiane et p95, temps de chargement et pic mémoire ; ne pas compter le téléchargement dans l’inférence. Aucune mesure avant/après n’a encore été effectuée dans cette phase.
- **Voix à écouter** : Siwis et Tom sont les références indiquées ; UPMC, Gilles, `mls_f1/f2/f3` et `mls_m1/m2/m3` à tester une par une sur le même texte, pas seulement un test de signal non nul. Noter français, intelligibilité, sigles, prosodie, coupures et stabilité en téléchargement/synthèse. Ne pas retirer une voix ni dégrader un projet sauvegardé sans résultats. Les licences des modèles/données sont distinctes de celle du moteur Piper.
- **Voix système dans un fichier : faisable**. L’[API `TextToSpeech.synthesizeToFile`](https://github.com/aosp-mirror/platform_frameworks_base/blob/android-12.0.0_r34/core/java/android/speech/tts/TextToSpeech.java) (depuis API 21 pour `File`) met la synthèse en file ; attendre `onDone` et vérifier un WAV lisible avant d’utiliser l’analyse PCM native sur l’horloge de lecture. Limiter chaque requête à `getMaxSpeechInputLength()` ; traiter le refus/l’absence de voix, l’annulation et le dossier privé. Les [limites de mots sont facultatives](https://github.com/aosp-mirror/platform_frameworks_base/blob/android-12.0.0_r34/core/java/android/speech/tts/UtteranceProgressListener.java) même vers un fichier. L’ouverture peut suivre l’audio **réel**, pas promettre une reconnaissance exacte des mots ni des phonèmes. Sur réseau requis, la synthèse peut échouer en mode avion ; utiliser une voix locale installée pour le test. **Approuvé pour la phase 3, pas encore implémenté**. Comparer la lecture directe (`speak`) et la lecture du fichier avec la même voix, le même texte, la même vitesse et le même appareil ; sur un repère temps commun audio/image, mesurer l’écart des ouvertures/fermetures de bouche avec les débuts/fins de parole et les ouvertures pendant les silences. Noter séparément la latence avant le premier son et les limites de la mesure.
- **Kokoro via Sherpa-ONNX : étude uniquement.** Le [pack v1.0](https://github.com/k2-fsa/sherpa/blob/master/docs/source/onnx/tts/pretrained_models/kokoro.rst) contient `ff_siwis` (ID 30), une voix française ; vérifier sélection du frontend français, inflexions et qualité avant choix. Le pack multilingue [INT8 v1.0](https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_0.tar.bz2) pèse environ 132 Mo compressés. Le [benchmark publié](https://github.com/k2-fsa/sherpa/blob/master/docs/source/onnx/tts/pretrained_models/rtf.rst) donne pour v1.0 non quantifié un RTF de 3,19 à 4 threads sur Raspberry Pi 4 (plus de 3 s de calcul par seconde d’audio) ; ce n’est ni l’INT8 ni un téléphone. Pas de chiffre honnête pour un téléphone d’entrée de gamme sans mesure ARM64 réelle (premier son, RTF, mémoire, chauffe). [Sherpa-ONNX](https://github.com/k2-fsa/sherpa-onnx) et [poids Kokoro](https://github.com/hexgrad/kokoro) annoncés Apache-2.0 ; audit séparé du pack, de la voix et du frontend eSpeak NG ([GPL-3.0](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING)) avant distribution. **Rien ajouté** à Lectura (ni runtime ni modèle ni téléchargement).

## Phase 4 — protocole pour le rapport final

1. Installer sur image propre ; mode avion avec Wi-Fi et données réellement coupés. Tutoriel, scènes et 43 personnages, 38 expressions, navigation, fichiers locaux, écran/PNG, `.lectura`, voix système **locale installée** et relance avec données conservées. Une voix réseau n’est pas une voix disponible hors ligne ; sans voix système locale fournie par l’appareil, n’annoncer une voix hors ligne qu’après installation HD ou système. Vérifier les messages plutôt que basculer de moteur en secret.
2. En ligne : télécharger une voix, interrompre à une taille non nulle, reprendre en vérifiant les octets et intégrer une seconde voix ; tester champs de choix/écoute. Redémarrer puis répéter en avion avec voix et fichier téléchargés. Tester encore les deux types de voix à vitesse différente, transport, texte spécial et pauses, absence d’activation et sorties compatibles.
3. Mettre à jour **entre deux APK à clé permanente** et contrôler signature, version croissante, brouillon, projet, voix et exports existants. Pour toute différence ou test non fait (OEM/codec, voix, sélecteur), consigner raison, variante, build PWA/Android et preuve, sans l’estimer comme « passé ».
