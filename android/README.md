# Lectura Android

Application Android native (`io.github.initdv.lectura`), à partir d’Android 12 (API 31).
L’APK n’embarque ni navigateur ni copie du site : vues et dessin Android, voix de
l’appareil ou Pocket TTS, Kokoro/Sherpa-ONNX et Piper en natif, codecs Android pour la vidéo.

Tous les parcours sont accessibles dès l’installation, sans compte, achat ni clé
produit : 43 personnages, 38 poses, personnalisation du terminal et des mots-clés,
sous-titres SRT/VTT, capture PNG et export vidéo avec « Mes vidéos ».

## Voix locales et animation

Dans **Réglages → Voix Lectura HD hors ligne**, télécharge **Estelle** ou **Siwis · Kokoro**. Aucun modèle n’est installé automatiquement. Les packs publics à empreinte fixe sont téléchargés par HTTPS ; le fichier partiel peut être repris, il n’apparait pas comme une voix disponible. Le Piper d’origine reste installable depuis le catalogue Pages en lecture seule.

| Voix | Téléchargement | Stockage du modèle installé |
|---|---:|---:|
| Estelle (Pocket TTS français, appareil 64 bits) | 193,6 Mo | 403,1 Mo |
| Siwis (Kokoro v1.0 INT8 via Sherpa-ONNX) | 132,4 Mo | 142,4 Mo |

Tailles en millions d’octets, hors caches. Pendant l’installation, il faut en plus pouvoir garder l’archive (environ 622 Mo libres pour Estelle en comptant une réserve de sécurité). Pour le mode **Automatique**, en français, la priorité est Estelle, puis Siwis et Tom de Piper **s’ils sont déjà installés**, enfin une voix système locale. Kokoro se choisit explicitement. Une voix choisie auparavant dans un projet reste inchangée ; le bouton **Utiliser cette voix** permet d’y passer à Estelle. Aucun compte, téléchargement implicite ni voix système réseau.

Le terminal garde le texte exact. Une préparation locale génère l’audio à 1×, y compris pour les voix système compatibles avec `synthesizeToFile`, puis ajoute les huit silences cibles et une légère montée sur la terminaison voisée des questions. La vitesse du lecteur change aussi la durée des silences. Un fichier audio importé n’est pas retouché.

En **Auto**, les expressions prennent en compte le contexte (par ex. « Bravo ! » → enthousiasme), la ponctuation et les négations. Inclinaisons, gestes de bras et de regard, anticipation avant la fin d’une question, retours au calme : les gestes sont lus sur la même horloge que l’audio. Les limites de fragments sont mesurées ; les positions des mots sont estimées lorsque le moteur n’en fournit pas. Les poses manuelles, le réglage d’expressivité et le mode d’animations réduites gardent la priorité.

## Installer un APK de test

Dans **Actions → Lectura Android**, ouvrir l’exécution correspondant au commit et
prendre l’artefact `Lectura-Android-API31+`. Le ZIP contient `Lectura.apk` : l’extraire
avant d’ouvrir l’APK sur Android. Selon le téléphone, Android demandera d’autoriser
l’installation par le gestionnaire de fichiers. Autre possibilité :

```sh
adb install -r Lectura.apk
```

À partir de la phase 0, seuls les APK signés avec le **certificat permanent**
sont publiés. Pour configurer la CI et sauvegarder ta clé, voir
[la procédure de signature](../docs/ANDROID_SIGNATURE.md). GitHub ne permet pas
de récupérer le contenu des secrets après les avoir enregistrés.

Les anciens APK de test ont des certificats différents. Si Android refuse un
remplacement, **ne désinstalle pas l’application actuelle** pour contourner ce
refus : tu perdrais son stockage privé. Teste le premier APK de la nouvelle série
sur un émulateur ou un autre appareil. Les APK suivants de la série utilisent
la même clé. Si tu as installé une version permanente (21 ou 25, par exemple), installe la mise à jour
par-dessus, sans désinstaller. Les anciens champs d’activation sont supprimés à
l’ouverture, sans modifier les projets ni les médias. La signature APK et les notices
MIT/OFL/LGPL des composants sont conservées.

## Compiler

Requis : JDK 21, Node ≥ 20, Python 3 + `fonttools` et `brotli`, Android SDK (`ANDROID_HOME`,
plate-forme 37 / outils 37.0.0), `curl`, `unzip`. Les commandes de la CI sont dans
[`.github/workflows/android.yml`](../.github/workflows/android.yml). L’AAR ONNX
Runtime Android 1.24.3 peut être fourni localement :

```sh
export LECTURA_ORT_AAR=/chemin/onnxruntime-android-1.24.3.aar
# Runtimes supplémentaires du build complet. Garder le dossier hors du dépôt.
export LECTURA_VOICE_DEPS=/chemin/voice-runtime
bash android/fetch-voice-runtimes.sh "$LECTURA_VOICE_DEPS"
# Facultatif : catalogue réel Pages, seul le JSON sera incorporé à l'APK.
export LECTURA_HD_INDEX=/chemin/models-index.json
bash android/build.sh --check
```

`--check` compile l’application et l’instrumentation sans signer ni laisser
d’APK. Sans `LECTURA_ORT_AAR`, le moteur HD n’est pas compilé dans l’APK. Le
catalogue de secours est interrogé à la demande ; aucun `.onnx` n’est incorporé.
Sans `LECTURA_VOICE_DEPS`, Kokoro n’est pas disponible dans ce build local.
Pour produire l’APK, retirer `--check` et configurer la clé locale comme décrit
dans [la procédure de signature](../docs/ANDROID_SIGNATURE.md). Aucun repli sur
une clé de débogage.

### Recompiler avec le cœur LAME fourni ou modifié

Décompresser `Lectura-Android-sources`, puis les archives `lectura.tar.gz` et
`lamejs.tar.gz`. Depuis le dossier des sources Lectura, régler
`LECTURA_LAME_SRC` sur le dossier `lamejs-…/src/main/java` (qui contient `mp3/`
et `mpg/`), conserver les notices de licence et lancer le build ci-dessus. Sans
cette variable, le script télécharge la révision LAME épinglée. Le build est à partir
des sources, sans dépendance à une clé privée de l’auteur pour relier le cœur.
Voir [les notices Android](licenses/COMPOSANTS.md) et [l’audit](../docs/ANDROID_PARITE.md).

## Vérifier

Le workflow produit, séparément de l’APK distribué, un APK d’instrumentation signé
avec la même clé. Il installe puis exerce l’APK réel sur une image Android API 31
KVM ; le rapport `Lectura-comparaison` contient les captures Pages et Android, les
mesures et les résultats des contrôles. Les tests de codecs utilisent un son
synthétique connu ; ils ne prétendent pas vérifier une app tierce ou tous les
codecs de tous les téléphones. Les vérifications visuelles ne sont pas un test
d’égalité : consulter les captures et les métriques.

La CI teste une installation vierge en mode avion et un redémarrage après
un téléchargement réel. Si l’APK précédent est disponible, elle exerce aussi
`adb install -r` avec un brouillon, un projet, un WAV et des réglages préexistants.

Sur un téléphone : télécharge une voix dans **Réglages → Lectura HD**, puis coupe
le Wi‑Fi et les données en activant le mode avion. Relance Lectura, sélectionne
la voix HD dans la scène et lis un nouveau texte. Essaie aussi une voix système
locale et un fichier audio. Dans **Menu**, après avoir lancé la scène, tu peux
choisir le format 16:9 ou 9:16 et enregistrer la vidéo. La vidéo peut contenir le son d’un fichier importé ou de la voix synthétisée localement. Le format vidéo dépend des encodeurs disponibles sur l’appareil.
