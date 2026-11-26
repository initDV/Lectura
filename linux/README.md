# Lectura pour Linux

Application de bureau **native** : interface C++/Qt Widgets, dessin SVG avec librsvg et audio avec Qt Multimedia. Pas d’Electron, de WebView, de navigateur, de serveur local ni de Node.js à l’exécution. QuickJS-NG calcule uniquement les poses à partir des modules d’animation partagés ; il n’a aucun module d’accès au Web ou au système.

## Installer le `.deb`

Télécharger l’artefact **Lectura-Linux-amd64-deb** d’une [exécution Linux réussie](https://github.com/initDV/Lectura/actions/workflows/linux.yml). GitHub Actions fournit un ZIP (connexion GitHub requise). Décompresser le ZIP, puis, dans le dossier extrait :

```bash
sha256sum -c lectura_1.1.2-1_amd64.deb.sha256
sudo apt install ./lectura_1.1.2-1_amd64.deb
```

Ouvrir **Lectura** dans le menu des applications, ou lancer `lectura`. Un projet s’ouvre depuis le menu de l’application, par double-clic sur un `.lectura` ou avec `lectura mon-projet.lectura`. Pour retirer le logiciel : `sudo apt remove lectura` (ne supprime pas les projets).

- Cible : PC **x86-64 / amd64**. La recette CI construit sur Debian 12 et installe **le même paquet** sur Debian 12, Debian 13 et Ubuntu 24.04 LTS. Les autres distributions/versions, ARM et les pilotes audio physiques ne font pas partie de cette recette.
- APT installe Qt 6, librsvg, FFmpeg et eSpeak NG depuis les dépôts du système. Une fois installé, la lecture, l’importation et la synthèse fonctionnent hors ligne. Il faut une session graphique et une sortie audio compatible ; **Sans son** ne requiert pas de sortie audio.

## Lire ou importer

1. Remplacer l’exemple par ton texte, ou ouvrir un fichier `.txt` UTF‑8 ou un projet `.lectura`.
2. Choisir **Aïcha, Charlotte, Doriane, Monique, Prisca (dessin original), Robot Lectura ou Robot rouge**. Les sept dessins sont ceux de la PWA et d’Android.
3. Choisir **Voix française locale** (eSpeak NG), **Sans son**, ou **Importer un audio…** (p. ex. WAV, MP3, Ogg, FLAC, M4A). Cliquer sur **Lire**, ou `Ctrl+Entrée`. Les lignes `$ ` et `# ` s’affichent mais ne sont pas prononcées. La barre de lecture et `Alt+←` / `Alt+→` permettent de revenir en arrière ou d’avancer, y compris pendant une pause.
4. **Enregistrer** crée un `.lectura`. Il ne contient ni l’enregistrement audio ni un chemin absolu : réimporter le fichier sonore à la réouverture. Les anciens personnages retirés sont affichés via Robot Lectura sans écraser leur identifiant. Les minutages déjà présents dans un projet `.lectura` sont utilisés avec l’audio importé s’ils correspondent au texte et à la durée ; sinon la synchronisation des phrases est estimée.
5. Dans **Plus**, capturer la scène en PNG ou exporter le son préparé en WAV. Limites de cette première version : 12 000 caractères, 5 minutes et 150 Mio à l’import. Elle n’inclut pas le moteur vocal HD Siwis ni l’export vidéo.

## Compiler et empaqueter

Sur Debian 12 (base du paquet distribué) :

```bash
sudo apt install build-essential cmake pkg-config dpkg-dev qt6-base-dev qt6-multimedia-dev \
  librsvg2-dev libcairo2-dev qt6-qpa-plugins ffmpeg espeak-ng
# Node.js 20+ et npm sont requis pour l’étape de compilation des ressources seulement.
npm ci --prefix linux
cmake -S linux -B linux/build -DCMAKE_BUILD_TYPE=Release
cmake --build linux/build --parallel 2
./linux/build/lectura
bash linux/package.sh
```

`linux/out/` reçoit le `.deb` et son SHA-256. CMake télécharge une archive QuickJS-NG épinglée par commit et vérifie son SHA-256 ; pour compiler sans ce téléchargement, passer `-DFETCHCONTENT_SOURCE_DIR_QUICKJS=/chemin/vers/quickjs-ng-0.18.0`. Aucun modèle vocal ni fichier issu de `google_drive/`, `prototypes/` ou de la PWA compilée n’est ajouté au paquet. Les seules ressources partagées à l’exécution sont les dessins/fiches, l’icône et le module d’animation généré à la compilation.

### Recette

`ctest --test-dir linux/build -V` vérifie les sept rigs et leur rendu SVG, le repli des projets, la lecture muette et son terminal, le décodage WAV/MP3, le minutage des sous-titres d’un projet, la synthèse française et les commandes audio. Pour tester y compris le périphérique audio sur une machine de CI, utiliser `linux/tests/with-desktop.sh ctest --test-dir linux/build -V` comme utilisateur non root avec Xvfb, xauth et PulseAudio installés. Le pipeline installe ensuite le paquet dans des conteneurs propres, valide le lanceur et ouvre une fenêtre X11 qui lit un projet vers une sortie PulseAudio virtuelle.
