# Lectura Android — suivi de la version finale

Périmètre : branche `arena/d2229c4f-lectura`, application native (`io.github.initdv.lectura`, pas de WebView), sans comptes ni activation produit, avec les 43 personnages, les 38 poses et tous les exports accessibles. La référence reste le code web [`39e4295`](https://github.com/initDV/Lectura/commit/39e429522cc715aeda6ce0db9d3eb5690ba1f2fd) et [GitHub Pages](https://initdv.github.io/Lectura/) en lecture seule. Ni déploiement ni fusion. Les données des projets restent compatibles ; seuls les anciens champs d’activation Android sont retirés. Internet sert uniquement au téléchargement des modèles de voix demandé par l’utilisateur.

| Phase | État et critère de livraison |
|---|---|
| 0 — Signature | **Livrée** : [APK signé permanent](https://github.com/initDV/Lectura/actions/runs/44329414529/artifacts/14438028918), build `70b1ff2`, `versionCode` 21. [CI et instrumentation API 31 réussies](https://github.com/initDV/Lectura/actions/runs/44329414529). Aucun repli sur une clé de débogage. |
| 1 — Parité | Comparaison des surfaces et parcours Android avec la référence web. Tout le catalogue est disponible sur Android ; la différence de politique d’accès et les voix système locales uniquement sont voulues. |
| 2 — Texte → voix | Mise en œuvre native : fragments PCM, huit silences, prononciation et montée douce sur les questions. Le texte affiché n’est jamais nettoyé. |
| 3 — Voix | `synthesizeToFile`, Estelle (priorité Auto), Kokoro sélectionnable, Siwis/Tom et voix système locales en secours. Les modèles restent hors de l’APK. |
| 4 — Vérification | **APK d’essai v28 signé et publié** après la campagne Android 12 ci-dessous. Essai physique ARM64 et appréciation du jeu et des voix encore à faire. |

## Phase 0 — premier APK à clé permanente

Empreinte SHA-256 du **certificat**, vérifiée par la CI sur l’APK final et égale à [`android/signing-cert.sha256`](../android/signing-cert.sha256) : `b6873c0f1a2f447163fb9af7e6f4181280b31fd1f5c45b0535993075b3dc7d8b`. Le keystore est resté dans les secrets `android-signing`, avec nettoyage du fichier temporaire du runner. L’APK de test antérieur n’a pas le même certificat : suivre les [précautions pour l’installation initiale](ANDROID_SIGNATURE.md#3-vérifier-avant-installation).

Sur l’émulateur Android 12 : installation, tutoriel/lecture/commandes, WAV importé, voix système FR, synthèse Piper et Pro désactivé contrôlés. [Rapport et captures](https://github.com/initDV/Lectura/actions/runs/44329414529/artifacts/14438761976) ; [sources correspondantes](https://github.com/initDV/Lectura/actions/runs/44329414529/artifacts/14437678702). Sur Pages, le WAV commun a passé ; la voix système Chromium n’a pas été testée sur ce run (moteur Linux indisponible). Pas d’essai sur téléphone réel ni de mise à jour entre deux installations permanentes à ce stade.

## Phase 1 — Parité et accès intégral Android

**APK livré :** [Lectura.apk dans le ZIP Android 12+](https://github.com/initDV/Lectura/actions/runs/44339482883/artifacts/14444465087), `versionCode` 25, code `2939a5d`, [CI verte](https://github.com/initDV/Lectura/actions/runs/44339482883). [Rapport de comparaison et tests](https://github.com/initDV/Lectura/actions/runs/44339482883/artifacts/14442604396) · [sources correspondantes](https://github.com/initDV/Lectura/actions/runs/44339482883/artifacts/14442518306).

| Contrôle du build 25 | Résultat |
|---|---|
| Mise à jour depuis le premier APK permanent | Même certificat et `versionCode` 21 → 25 via `adb install -r`, sans effacement. Brouillon, projet, audio, pose, terminal et réglages conservés ; anciens champs d’activation retirés. |
| Installation vierge en mode avion | Aucun réseau actif. Tutoriel et navigation natifs, 43 personnages sélectionnés, 38 poses + Auto, interface FR/EN sans offre ni clé, réglages de terminal et lexiques. Voix système locale FR et lecture WAV contrôlées. |
| Sous-titres et PNG | Parcours du menu avec résultat simulé du sélecteur Android ; import SRT et VTT, round-trip exact, timecodes sur WAV, PNG 1080×1920. |
| Vidéo et partage | Formats 16:9 et 9:16 ; capsule MP4 portrait avec son dans le parcours natif, téléchargement et lecture dans « Mes vidéos ». Tests de fichiers MP4, WebM, MP3, MediaStore et partage entre deux UID. |
| Voix HD | Modèle Gilles réellement téléchargé avec interruption et reprise ; deux locuteurs MLS synthétisés. Puis arrêt du processus, retour en avion sans réseau actif, sélection de Gilles et synthèse d’un **nouveau** texte. Son PCM non nul et lecture terminée avec animation. Démarrage en 9,8 s sur ce run, pas un benchmark de téléphone. |
| Référence web inchangée | Pages HTTP 200, build `76713dcd32`, 10 voix, WAV commun et Web Speech FR à 1,25×. Comparaison des trois images : MAE RVB 1,77 (scène), 6,22 (menu), 2,98 (tutoriel), ni égalité stricte ni mesure de synchronisation audio. |

Résultats d’émulateur Android 12, pas d’essai physique. Les formats vidéo restent liés aux codecs du téléphone ; la voix système directe ne fournit pas de piste à l’encodeur, contrairement à une voix HD ou à un fichier importé.

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

## Phase 2 — pauses, symboles et intonation

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

L’original affiché et enregistré ne doit pas passer par le nettoyeur vocal. `SpeechPlan` utilise des fragments distincts pour le moteur, avec une carte vers les positions UTF-16 du texte original. Garder des offsets du texte d’origine pour chaque fragment audio/phrase, y compris les expansions (`%` → « pour cent ») et les caractères ignorés. Ne jamais transmettre directement un offset de TTS nettoyé au terminal. Fermer la bouche sur les pauses et les commandes muettes ; vérifier sur pause/reprise/recherche/vitesse. Pour un moteur système sans limites de mots, la correspondance des offsets peut être vérifiée, mais pas la précision acoustique par phonème.

Dictionnaire : fichier UTF-8 versionné côté Android, par langue, avec remplacements de mots entiers, entrées FR ciblant `sudo`, `Linux`, `GitHub`, `API` et autres sigles, et règles de lecture de nombres locales. Ex. `sudo` → « soudo », `API` → « a pé i », `3,14` → « trois virgule quatorze ». Tester les entrées sur les moteurs ; ne pas modifier la chaîne dans le projet ou le terminal.

Le rendu assemble du PCM mono à 1×, retire les bords silencieux déjà produits par le moteur et ajoute les silences cibles en échantillons nuls. Le changement de vitesse du lecteur est sans transposition volontaire et applique aussi le facteur aux silences. La montée locale des interrogations est une recomposition synchrone à la période sur la fin voisée (jusqu’à trois demi-tons), sans changer la durée. Elle ne s’applique ni aux consonnes finales non voisées ni à un fichier audio importé. Si la terminaison n’a pas de zone voisée fiable, elle est laissée intacte.

## Phase 3 — voix et mise en scène Android

- **Estelle / V2** : interprétation française Kyutai, ONNX `202610`, préréglage officiel. Poids et état vocal CC BY 4.0 ; [pack public Okuvia](https://github.com/ByBrawe/Okuvia-models/releases/tag/pocket-multilingual-preset-20261026) authentifié par une empreinte fixe. Seuls le tokenizer, les quatre graphes de synthèse, le préréglage et les notices sont installés. L’encodeur vocal et le clonage ne sont pas utilisés. Avec le port Java, [trois phrases sur CI Linux](https://github.com/initDV/Lectura/actions/runs/44348824762) ont produit du PCM fini de 1,12 à 1,92 s. Ce n’est pas une preuve d’intelligibilité ou de performance sur téléphone.
- **Kokoro / V1** : v1.0 INT8 avec `ff_siwis` (ID 30). Sherpa-ONNX 2.0.1, [bibliothèque Android officielle](https://github.com/k2-fsa/sherpa-onnx/releases/tag/v2.0.1). Dans cette version, le runtime a séparé la phonétisation : le port fournit le français avec le lexique local Lectura. Les fichiers eSpeak/lexiques non français de l’archive ne sont pas installés. Kokoro ne fournit pas une nouvelle personne : c’est une synthèse différente d’une voix SIWIS.
- **Préparation et secours** : seuls les modèles sélectionnés sont ouverts, hors du thread UI. Conservation d’une session, cache borné de phrases et du WAV, préchargement local après ouverture. Ordre Auto en français : Estelle, Siwis, Tom, voix système installée ; aucun téléchargement automatique et aucun remplacement d’une sélection manuelle. Moteur système : rendu asynchrone en fichier (`synthesizeToFile`), analyse de la bouche sur le PCM et export sonore possible si le moteur le permet. Les voix réseau restent exclues. Le moteur direct servait de référence en v25 ; pas de mesure acoustique avant/après au microphone.
- **Jeu du personnage / E2** : 38 poses dont 37 détectées par des tournures et le contexte FR/EN. 28 mouvements associés à ces poses, et des accents explicites de salut, d’explication ou de silence. À la fin réellement prononcée, les questions hésitantes, curieuses ou sceptiques ont une expression distincte ; une réussite ne déclenche pas automatiquement une réaction de surprise. Les gestes peuvent commencer sur une estimation de la position d’un mot ; la fin des fragments PCM est mesurée. Pose et geste sont échantillonnés sur le temps lu, aussi pour la reprise, les sauts et la vidéo. Les poses manuelles et les animations réduites restent prioritaires.
- **Limites connues** : préparation en fichier avant lecture, pas de mesure physique ARM64 ni de comparatif d’écoute demandé. La mémoire, la latence des longues scènes, l’intonation perçue et l’expressivité à l’écran restent à vérifier sur téléphone. Les notices et les deux tailles de pack figurent dans [le guide Android](../android/README.md).

Le [contrôle PCM Linux ARM64 et x86_64](https://github.com/initDV/Lectura/actions/runs/44351287017) a exercé le port Java Estelle avec le pack épinglé et ONNX Runtime 1.24.3 sur les deux architectures. Sur « Tu veux venir ce soir ? », les deux exécutions ont généré 36 480 échantillons à 24 kHz. Le traitement de la finale a modifié 3 063 échantillons sur ARM64 et 3 782 sur x86_64, sans changer la durée ni l’attaque. Cette mesure complète le test de fréquence sur signal synthétique ; elle ne remplace ni un essai Android ARM64 ni une évaluation du naturel à l’écoute.

## Phase 4 — APK d’essai v28 et résultats

**[Télécharger le ZIP Android 12+](https://github.com/initDV/Lectura/actions/runs/44352577013/artifacts/14448758839)**, en extraire `Lectura.apk`, puis installer **par-dessus la v25 sans la désinstaller**. `versionCode` 28, build `47278ac`, [CI](https://github.com/initDV/Lectura/actions/runs/44352577013), [rapport et captures](https://github.com/initDV/Lectura/actions/runs/44352577013/artifacts/14448369668), [sources correspondantes](https://github.com/initDV/Lectura/actions/runs/44352577013/artifacts/14448133987). Certificat SHA-256 : `b6873c0f1a2f447163fb9af7e6f4181280b31fd1f5c45b0535993075b3dc7d8b`.

| Contrôle | Résultat |
|---|---|
| Mise à jour 25 → 28 | Même certificat, `adb install -r`, brouillon, projet, audio, pose, terminal et réglages conservés. |
| Installation et réseau | Aucun réseau en avion sur une installation vierge. Téléchargements explicites, empreintes vérifiées, reprise d’Estelle à 529 484 octets, installation de Kokoro. Pas de poids ONNX/preset dans l’APK. |
| Relecture après arrêt du processus, sans réseau | Textes inédits, Estelle choisie en Auto et Kokoro choisi dans le sélecteur. Les deux ont produit du PCM 24 kHz à 1,25× ; environ 19,4 s et 44,4 s de préparation à froid sur cet émulateur x86_64. Cache WAV : 2 ms et 1 ms ; édition de la ponctuation finale en réutilisant le PCM de phrase : 187 ms et 100 ms. Ces temps, surtout à froid, varient et ne prédisent pas ceux d’un téléphone. |
| Prosodie et bouche | 8 silences mesurés dans le WAV à 1×, 320 → 256 ms à 1,25× sur l’horloge de lecture, exceptions de nombres/fichiers, texte source intact, bouche fermée lors des pauses. Android eSpeak locale rendue en PCM ; Gilles/Piper et les deux locuteurs MLS du test restent utilisables. La référence v25 pour la voix système était le curseur de `speak`, pas un enregistrement de la sortie sonore. |
| Jeu du personnage | 43 rigs, 38 poses, 28 mouvements dans la palette contextuelle. Images du robot et de Wend identiques au même repère audio après pause/saut, différentes à un autre repère ; priorité manuelle. La mesure n’est pas un avis sur l’expressivité. |
| Exports et interface | Tutoriel, menu, vitesses, WAV, SRT/VTT, PNG 1080×1920, MP4 et WebM avec piste audio, MP3, MediaStore et partage. Le sélecteur de fichiers a été simulé ; codecs OEM non essayés. |
| Comparaison en lecture seule | Pages `76713dcd32`, WAV et voix FR à 1,25×. MAE RVB sur scène/menu/tutoriel : 1,83 / 6,22 / 2,98. `main`, les sources de la PWA et le déploiement Pages restent inchangés. |

Les binaires ONNX et Sherpa pour ARM64 et x86_64 ont été contrôlés dans l’APK. Une synthèse Estelle sur **Linux ARM64** ne vérifie pas les bibliothèques Android sur le téléphone. Les performances, le naturel des deux voix et la synchronisation image/son perçue restent à évaluer sur appareil.

### Essai sur téléphone

1. Installer sur image propre ; mode avion avec Wi-Fi et données réellement coupés. Tutoriel, scènes et 43 personnages, 38 expressions, navigation, fichiers locaux, écran/PNG, `.lectura`, voix système **locale installée** et relance avec données conservées. Une voix réseau n’est pas une voix disponible hors ligne ; sans voix système locale fournie par l’appareil, n’annoncer une voix hors ligne qu’après installation HD ou système. Vérifier les messages plutôt que basculer de moteur en secret.
2. En ligne : télécharger une voix, interrompre à une taille non nulle, reprendre en vérifiant les octets et intégrer une seconde voix ; tester champs de choix/écoute. Redémarrer puis répéter en avion avec voix et fichier téléchargés. Tester encore les deux types de voix à vitesse différente, transport, texte spécial et pauses, absence d’activation et sorties compatibles.
3. Mettre à jour **entre deux APK à clé permanente** et contrôler signature, version croissante, brouillon, projet, voix et exports existants. Pour toute différence ou test non fait (OEM/codec, voix, sélecteur), consigner raison, variante, build PWA/Android et preuve, sans l’estimer comme « passé ».
