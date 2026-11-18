# Lectura Android

Application Android native (`io.github.initdv.lectura`), à partir d’Android 12 (API 31).
L’APK n’embarque ni navigateur ni copie du site : vues et dessin Android, voix de
l’appareil ou Piper/ONNX natif, codecs Android pour la vidéo.

Tous les parcours sont accessibles dès l’installation, sans compte, achat ni clé
produit : 43 personnages, 38 poses, personnalisation du terminal et des mots-clés,
sous-titres SRT/VTT, capture PNG et export vidéo avec « Mes vidéos ».

Internet sert uniquement à télécharger les modèles Lectura HD à la demande,
depuis le catalogue Pages. Après téléchargement, choisis la voix HD dans la scène :
la synthèse et la lecture fonctionnent en mode avion. Une voix Android locale déjà
installée ou un fichier audio importé fonctionne également sans réseau. Lectura ne
propose pas les voix système qui nécessitent Internet.

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
la même clé. Si tu as installé la version permanente 21, installe la mise à jour
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
# Facultatif : catalogue réel Pages, seul le JSON sera incorporé à l'APK.
export LECTURA_HD_INDEX=/chemin/models-index.json
bash android/build.sh --check
```

`--check` compile l’application et l’instrumentation sans signer ni laisser
d’APK. Sans `LECTURA_ORT_AAR`, le moteur HD n’est pas compilé dans l’APK. Le
catalogue de secours est interrogé à la demande ; aucun `.onnx` n’est incorporé.
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
choisir le format 16:9 ou 9:16 et enregistrer la vidéo. La vidéo contient le son d’un
fichier audio ou d’une voix HD ; le moteur système direct ne fournit pas sa piste
à l’enregistreur. Le format vidéo dépend des encodeurs disponibles sur l’appareil.
