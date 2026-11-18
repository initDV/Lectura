# Lectura Android — référence et inventaire

Référence unique : `initDV/Lectura` à `39e429522cc715aeda6ce0db9d3eb5690ba1f2fd` (dernier déploiement Pages réussi au moment de l’audit). Le comportement du code prime sur le README. Le projet web continue de fonctionner indépendamment du dossier `android/`.

| Référence web | Équivalent Android prévu | État initial |
|---|---|---|
| Scène responsive 38/62, décor en perspective, FAB pulsant, filigrane Gratuit | Canvas et vues Android, gestes et mêmes constantes | À porter |
| `characters/` : 43 couples SVG+JSON (32 gratuits, 11 Pro, 13 cadres 240×600 et 30 cadres 200×330) | Mêmes fichiers, chemins vectoriels et pivots natifs, grille dans le même ordre | À porter |
| Respiration, clignements, regards, balancement, gestes ponctuels/scénarisés, ponctuation, lèvres et visèmes, force des mouvements | Animation par image à partir des équations et tables de `character.js`, `rig.js`, `mouth.js`, `expressions.js` | À porter |
| 4 expressions gratuites, 34 Pro ; détection FR/EN, négations, émojis, intensité, mélanges, réglage par phrase | Mêmes poses et lexiques ; sélection manuelle et automatisme | À porter |
| Terminal « rhak_override@sentinel: ~/cours », œil, curseur à 1 Hz, 40 lignes, mots-clés, `$ ` et `# `, nettoyage Markdown | Canvas/textes formatés et même minutage | À porter |
| Capturer l’écran (toucher simple/double), vitesse 0,50–2,00 par 0,25, voix/import, texte, Lancer/Pause/Reprendre/Arrêter, muet/volume ; raccourcis | Vues natives et mode présentation ; veille inhibée pendant la lecture | À porter |
| Web Speech : liste par langue, voix locale d’abord, estimation 14 caractères/s, événements mot, reprise au début du mot | Android TextToSpeech (catalogue/voix dépendant du moteur de l’appareil) | Adaptation d’API nécessaire |
| Fichier MP3/WAV/Ogg/M4A/AAC/WebM, lecture synchronisée et lip-sync (4 niveaux / 3 bandes Pro) | Décodage et lecture Android ; mêmes règles d’analyse | À porter |
| 10 voix Piper (Siwis, UPMC, Tom, Gilles, 6 MLS), téléchargement à la demande, mémoire/cache des phrases et synthèses, limite à 12 000 caractères | Mêmes modèles/configurations et phonétisation française, inférence ONNX Runtime Android | À porter |
| PNG, vidéo Pro en 16:9/9:16 à 30 i/s, H.264/AAC ou VP9/VP8/Opus, MP3, contrôle de l’export, Mes vidéos | Encodeurs et stockage Android ; partage par le système | À porter ; compatibilité des apps receveuses non garantie |
| Menu de scène, Projets, Personnages, Réglages, Pro, À propos, tutoriel 3 pages | Vues et dialogues Android ; ressources FR et EN reprises | À porter |
| Projets récents, brouillon 5 s, exemple, imports .txt/.md/.lectura, exports .lectura, .srt/.vtt Pro | Stockage privé et sélecteur Android ; même JSON de projet | À porter |
| 10 apparences, 4 thèmes du terminal, 2 polices, mots-clés et décor personnalisables, journal local | Même palette, mêmes valeurs et persistance privée | À porter |
| Pro : clé ECDSA P-256/SHA-256 liée à l’identifiant d’installation | Même clé publique et format ; nouvel identifiant natif | À porter ; pas de transfert de données du navigateur |
| Installer / recharger une mise à jour ; service worker réseau d’abord et cache hors ligne | Installateur/gestionnaire de paquets Android ; toutes les ressources de base dans l’APK | Équivalent OS, pas de boutons PWA ni mise à jour silencieuse |

Les fichiers vidéo MP4 H.264/AAC sont la cible de compatibilité galerie et WhatsApp. WebM peut être partagé comme fichier mais une application tierce décide si elle l’ouvre comme vidéo. MP3 reste de l’audio. Un modèle HD n’est jamais incorporé à l’APK.
