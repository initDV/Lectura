# Lectura Android

Application Android native (`io.github.initdv.lectura`), à partir d’Android 12 (API 31).
L’APK n’embarque ni navigateur ni copie du site : vues et dessin Android, voix de
l’appareil ou Piper/ONNX natif, codecs Android pour la vidéo. Rien n’est envoyé à
un serveur par Lectura lors d’une lecture locale ou d’un export. La première
installation d’une voix HD et les voix Android signalées « en ligne » nécessitent
une connexion.

## Installer un APK de test

Dans **Actions → Lectura Android**, ouvrir l’exécution correspondant au commit et
prendre l’artefact `Lectura-Android-API31+`. Le ZIP contient `Lectura.apk` : l’extraire
avant d’ouvrir l’APK sur Android. Selon le téléphone, Android demandera d’autoriser
l’installation par le gestionnaire de fichiers. Autre possibilité :

```sh
adb install -r Lectura.apk
```

La signature de CI est une signature de **test**, pas la clé d’une future release.
Deux exécutions sur des machines neuves peuvent produire des signatures différentes.
Android refuse une mise à jour signée par une autre clé. Désinstaller efface les
projets locaux, l’identifiant d’installation et les voix téléchargées : exporter
les projets avant de le faire. Les fichiers déjà publiés dans la galerie restent
hors du stockage privé. Aucune licence Pro du navigateur n’est transférée : une
licence utilise l’identifiant affiché par l’installation Android.

## Compiler

Requis : JDK 21, Node ≥ 20, Python 3 + `fonttools` et `brotli`, Android SDK (`ANDROID_HOME`,
plate-forme 37 / outils 37.0.0), `curl`, `unzip`. Les commandes de la CI sont dans
[`.github/workflows/android.yml`](../.github/workflows/android.yml). L’AAR ONNX
Runtime Android 1.24.3 peut être fourni localement :

```sh
export LECTURA_ORT_AAR=/chemin/onnxruntime-android-1.24.3.aar
# Facultatif : catalogue réel Pages, seul le JSON sera incorporé à l'APK.
export LECTURA_HD_INDEX=/chemin/models-index.json
bash android/build.sh
```

Sans `LECTURA_ORT_AAR`, l’APK est un contrôle de compilation hors ligne : le moteur
HD est alors absent. Le catalogue de secours est interrogé à la demande ; aucun
`.onnx` n’est incorporé. Pour une signature conservée entre builds, fournir
`LECTURA_KEYSTORE`, `LECTURA_KEY_ALIAS`, `LECTURA_STORE_PASS` et `LECTURA_KEY_PASS`
en environnement local, jamais dans Git. La clé de signature de l’APK et la clé
ECDSA des licences Pro sont deux choses différentes.

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

Sur un téléphone : ouvrir le même projet sur les deux surfaces ; comparer l’aperçu,
la lecture d’un fichier, une voix Android et une voix Piper installée. Avec une
licence Pro valide, enregistrer en 16:9 et 9:16, couper le son d’écoute et accélérer
pendant l’enregistrement, puis contrôler le MP4 (image + son), le MP3, « Mes vidéos »,
la galerie et l’envoi à un destinataire de test. Le WebM dépend des encodeurs
installés et de l’application qui le reçoit.
