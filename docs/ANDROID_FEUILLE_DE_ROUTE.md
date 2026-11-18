# Lectura Android — suivi de la version finale

Périmètre : branche `arena/d2229c4f-lectura`, application native (`io.github.initdv.lectura`, pas de WebView), `PRO_ENABLED = false` à toutes les étapes. La référence reste le code web [`39e4295`](https://github.com/initDV/Lectura/commit/39e429522cc715aeda6ce0db9d3eb5690ba1f2fd) et [GitHub Pages](https://initdv.github.io/Lectura/) en lecture seule. Ni déploiement ni fusion. Aucune suppression des fonctions, assets ou données Pro.

| Phase | État et critère de livraison |
|---|---|
| 0 — Signature | Le build n’accepte plus les clés de secours. Compilation locale application + instrumentation vérifiée, sans APK. **Bloquée sur la configuration du keystore permanent** : [procédure](ANDROID_SIGNATURE.md). L’APK de phase 0 attend un run signé et vert. |
| 1 — Parité | Inventaire de départ ci-dessous. Comparer les surfaces et les parcours visibles, corriger les écarts hors Pro, puis compiler, nettoyer, committer et livrer l’APK signé et son rapport. |
| 2 — Texte → voix | Pauses proposées ci-dessous ; attend la validation du tableau des symboles avant toute modification de leur lecture. Le nouveau flux de voix reste Android seul. |
| 3 — Voix | Mesures à faire ; études de faisabilité ci-dessous. Aucun changement de moteur ou de catalogue à ce stade. Kotlin/Java et moteurs natifs, pas de WebView. |
| 4 — Vérification | Passages instrumentés hors ligne puis en ligne, et test sur un téléphone réel pour ce que l’émulateur ne prouve pas. APK final et rapport seulement après vérifications, sans substitution silencieuse. |

## Phase 1 — Parité à contrôler (Pro désactivé)

Point de départ : [run API 31/Pages `44304526156`](https://github.com/initDV/Lectura/actions/runs/44304526156), avant la clé permanente. Le [rapport précédent](ANDROID_BOUCHE_PRO.md) distingue les rejeux déterministes des lectures réelles. La campagne ne vaut pas validation de tous les parcours : elle sert de référence pour les tests suivants.

| Surface visible | Contrôles déjà documentés | À vérifier ou à comparer en phase 1 |
|---|---|---|
| Premier lancement, tutoriel, navigation | Premier écran, « Passer », quatre destinations de base testés | Trois étapes FR/EN, exemple, retour, focus, portrait/paysage et persistance après relance |
| Scène et terminal | Capture FR 390 × 780 ; œil, curseur et lecture | Décor, repères, texte et boutons, gestes, masquage, chacun des réglages de taille/titre/décor, états clavier/insets et petite fenêtre |
| 32 personnages de base | Vignettes de base présentes, 11 Pro absents ; 43 rigs dessinés en instrumentation interne | Sélection et rendu en scène pour chaque base, remplacement Robot sans altération de l’ID Pro importé, transitions et sauvegarde |
| 4 expressions de base + Auto | Poses Pro exclues de l’interface et du moteur | `neutre`, `content`, `concentre`, `surpris`, manuel/par phrase/Auto, raccourci `E`, mouvement et clignements |
| Menu, plein écran, présentation, raccourcis | Menu FR et destinations, aperçu silencieux, œil ; contrôle de refus `R` | Liste et ordre hors Pro, étiquettes, états/alertes, bouton et touches/touchers autorisés, visibilité de l’état réseau |
| Projets & exports gratuits | Format `.lectura` v1 testable et menu présent | Titre, brouillon, nouveau/exemple, enregistrement/réouverture/suppression ; imports `.txt`/`.md` et `.lectura`, réouverture d’un véritable export `.lectura` via le sélecteur. Ni vidéo/MP3 ni sous-titres publics. |
| Capture PNG | Commande visible avec Pro désactivé, pas de validation de fichier par le test `pro` | Refus avant préparation ; exporter et relire le fichier, comparer la scène, le texte et le filigrane ; 1080×1920 portrait / 1280×720 paysage |
| Transport | Démarrer, pause, reprise, arrêt, vitesse, lecture de WAV, muet | Toutes les commandes et vitesses, déplacements, fin, volume/muet et interruption/reprise, raccourcis et progression cohérents |
| Voix système | FR locale eSpeak avec texte de contrôle ; Web Speech FR local avec le même texte | Choix de voix, réglages/écoute, mémoire du choix, cas voix absente, locale et réseau ; moteurs différents, pas d’égalité de timbre garantie |
| Voix HD | Piper Gilles et 2 locuteurs MLS ; interruption/reprise de téléchargement, PCM et cache observés | Catalogue, installation, choix, écoute et suppression ; toutes les voix en phase 3. Les modèles partagés MLS ne doivent être installés qu’une fois. |
| Fichier audio | WAV parlé, import natif, animation, pause et recherche | Sélecteur système, identité du fichier après relance, erreurs, formats courants ; décodage selon les codecs présents |
| Réglages / À propos | Accès FR ; pas d’invite Pro ; aide HD de base | FR/EN, thèmes de l’app, décor, émotions, réglages audio, aide/attributions, retour scène, réinitialisations sans perte non demandée |
| Aucun accès Pro | Refus route/spectre/poses/terminal Pro, import avec métadonnées, vidéos et raccourci `R` | Répéter les essais et ajouter navigation directe, import premium, persistance et tous les exports disponibles. Garder les fichiers et le code Pro. |

Comparaison à faire avec le même texte/projet, rythme, thème, langue et orientation. Ne pas compter comme écart inattendu les entrées retirées par `PRO_ENABLED = false`. Sur le dernier run, l’erreur RVB moyenne brute du menu incluait ces rangées retirées (6,90/255) ; il faut isoler les contrôles communs. Android fournit le sélecteur de fichiers, les barres et le clavier natifs à la place de ceux du navigateur : comparer l’action et la sortie, pas prétendre que ces surfaces système sont identiques. Écarts de rendu à mesurer et à expliquer (texte rasterisé, insets, phase d’animation), pas à cacher.

## Phase 2 — pauses et symboles proposés, pas encore appliqués

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

Silence ajusté à la vitesse (`durée / vitesse`) ; aux frontières contiguës (`!` suivi d’un retour), garder la pause la plus longue, pas la somme. Ne pas transformer la virgule décimale, un point d’abréviation ou une version en fin de phrase. La ponctuation peut affecter l’intonation ; vérifier le silence effectivement mesuré, car le moteur peut déjà produire son propre silence de fin.

| Proposition | Voix (FR) |
|---|---|
| `#`, `*`, accent grave, `_`, `~`, barre verticale, contre-oblique, `/`, `<`, `>`, `{`, `}`, `[`, `]`, `=`, guillemets, parenthèses et emoji décoratifs | Ignorer le symbole (pas de fusion de deux mots). En particulier `## Titre` prononce « Titre ». |
| `%`, `@`, `&`, `+` | « pour cent », « arobase », « et », « plus » |
| `€`, `$` accolés à un montant ; signe moins devant un nombre | « euro(s) », « dollar(s) », « moins ». Un `$` décoratif isolé n’est pas lu. |
| Apostrophes et traits d’union internes | Garder le mot comme unité (`l’heure`, `rendez-vous`), ne pas prononcer le nom du signe. |
| Ligne `$ commande` ou `# commentaire` | Rester entièrement muette comme dans la référence, affichage intact. |

L’original affiché et enregistré ne doit pas passer par le nettoyeur vocal. Aujourd’hui `Script.clean()` retire aussi des marqueurs Markdown utilisés en lecture : il faut découpler ce chemin de la source à afficher. Garder des offsets du texte d’origine pour chaque fragment audio/phrase, y compris les expansions (`%` → « pour cent ») et les caractères ignorés. Ne jamais transmettre directement un offset de TTS nettoyé au terminal. Fermer la bouche sur les pauses et les commandes muettes ; vérifier sur pause/reprise/recherche/vitesse. Pour un moteur système sans limites de mots, la correspondance des offsets peut être vérifiée, mais pas la précision acoustique par phonème.

Dictionnaire prévu : fichier UTF-8 versionné côté Android, par langue, avec remplacements de mots entiers, entrées FR ciblant `sudo`, `Linux`, `GitHub`, `API` et autres sigles, et règles de lecture de nombres locales. Ex. `sudo` → « soudo », `API` → « a pé i », `3,14` → « trois virgule quatorze ». Tester les entrées sur les moteurs ; ne pas modifier la chaîne dans le projet ou le terminal.

## Phase 3 — état et faisabilité

- **Piper** : le code actuel garde une session ONNX pour le modèle chargé, des caches de phrases en RAM et sur disque et un cache du WAV complet. Il préchauffe déjà à la sélection et après une édition, mais ne charge pas systématiquement la voix d’un brouillon restauré à l’ouverture. Comparer avant/après avec le même texte, même voix (notamment Siwis/Tom), même vitesse et même appareil : ouverture → scène utilisable, clic → premier son et temps de synthèse (modèle/caches froids, modèle chaud sans phrase, phrase en cache, WAV complet). Répéter, donner médiane et p95, temps de chargement et pic mémoire ; ne pas compter le téléchargement dans l’inférence. Aucune mesure avant/après n’a encore été effectuée dans cette phase.
- **Voix à écouter** : Siwis et Tom sont les références indiquées ; UPMC, Gilles, `mls_f1/f2/f3` et `mls_m1/m2/m3` à tester une par une sur le même texte, pas seulement un test de signal non nul. Noter français, intelligibilité, sigles, prosodie, coupures et stabilité en téléchargement/synthèse. Ne pas retirer une voix ni dégrader un projet sauvegardé sans résultats. Les licences des modèles/données sont distinctes de celle du moteur Piper.
- **Voix système dans un fichier : faisable**. L’[API `TextToSpeech.synthesizeToFile`](https://github.com/aosp-mirror/platform_frameworks_base/blob/android-12.0.0_r34/core/java/android/speech/tts/TextToSpeech.java) (depuis API 21 pour `File`) met la synthèse en file ; attendre `onDone` et vérifier un WAV lisible avant d’utiliser l’analyse PCM native sur l’horloge de lecture. Limiter chaque requête à `getMaxSpeechInputLength()` ; traiter le refus/l’absence de voix, l’annulation et le dossier privé. Les [limites de mots sont facultatives](https://github.com/aosp-mirror/platform_frameworks_base/blob/android-12.0.0_r34/core/java/android/speech/tts/UtteranceProgressListener.java) même vers un fichier. L’ouverture peut suivre l’audio **réel**, pas promettre une reconnaissance exacte des mots ni des phonèmes. Sur réseau requis, la synthèse peut échouer en mode avion ; utiliser une voix locale installée pour le test. **Pas implémenté** : attendre l’accord avant de changer cette voie.
- **Kokoro via Sherpa-ONNX : étude uniquement.** Le [pack v1.0](https://github.com/k2-fsa/sherpa/blob/master/docs/source/onnx/tts/pretrained_models/kokoro.rst) contient `ff_siwis` (ID 30), une voix française ; vérifier sélection du frontend français, inflexions et qualité avant choix. Le pack multilingue [INT8 v1.0](https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_0.tar.bz2) pèse environ 132 Mo compressés. Le [benchmark publié](https://github.com/k2-fsa/sherpa/blob/master/docs/source/onnx/tts/pretrained_models/rtf.rst) donne pour v1.0 non quantifié un RTF de 3,19 à 4 threads sur Raspberry Pi 4 (plus de 3 s de calcul par seconde d’audio) ; ce n’est ni l’INT8 ni un téléphone. Pas de chiffre honnête pour un téléphone d’entrée de gamme sans mesure ARM64 réelle (premier son, RTF, mémoire, chauffe). [Sherpa-ONNX](https://github.com/k2-fsa/sherpa-onnx) et [poids Kokoro](https://github.com/hexgrad/kokoro) annoncés Apache-2.0 ; audit séparé du pack, de la voix et du frontend eSpeak NG ([GPL-3.0](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING)) avant distribution. **Rien ajouté** à Lectura (ni runtime ni modèle ni téléchargement).

## Phase 4 — protocole pour le rapport final

1. Installer sur image propre ; mode avion avec Wi-Fi et données réellement coupés. Tutoriel, scènes et 32 personnages, 4 expressions, navigation, fichiers locaux, écran/PNG, `.lectura`, voix système **locale installée** et relance avec données conservées. Une voix réseau n’est pas une voix disponible hors ligne ; sans voix système locale fournie par l’appareil, n’annoncer une voix hors ligne qu’après installation HD ou système. Vérifier les messages plutôt que basculer de moteur en secret.
2. En ligne : télécharger une voix, interrompre à une taille non nulle, reprendre en vérifiant les octets et intégrer une seconde voix ; tester champs de choix/écoute. Redémarrer puis répéter en avion avec voix et fichier téléchargés. Tester encore les deux types de voix à vitesse différente, transport, texte spécial et pauses, pro inaccessible, sorties compatibles.
3. Mettre à jour **entre deux APK à clé permanente** et contrôler signature, version croissante, brouillon, projet, voix, identifiant et exports existants. Pour toute différence ou test non fait (OEM/codec, voix, sélecteur), consigner raison, variante, build PWA/Android et preuve, sans l’estimer comme « passé ».
