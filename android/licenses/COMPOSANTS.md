Lectura Android — composants distribués

Lectura : MIT. Même code source de référence pour les dessins, lexiques, icônes et tables. JetBrains Mono : SIL OFL 1.1 (`OFL-JetBrainsMono.txt`).

ONNX Runtime Android 1.24.3 (Microsoft) : MIT. AAR officiel Maven Central `com.microsoft.onnxruntime:onnxruntime-android`. Sources et notices : https://github.com/microsoft/onnxruntime. Ce composant est présent dans l’APK CI ; les fichiers Piper sont téléchargés à la demande depuis le catalogue Pages. Ne pas confondre la licence du moteur avec celles des modèles et corpus.

Export MP3 : cœur Java LAME du dépôt https://github.com/zhuker/lamejs, révision `582bbba6a12f981b984d8fb9e1874499fed85675`. Les fichiers `src/main/java/mp3` et `src/main/java/mpg` employés ne sont pas modifiés. Les notices dans les sources précisent LGPL version 2 ou suivante ; le texte LGPL 2.1 et la notice upstream sont joints. LAME : https://lame.sourceforge.io/.

Sources du cœur et du port (et recette de recompilation avec un cœur modifié) : voir `Lectura-Android-sources` dans la même exécution CI et `android/README.md`. Recompile et signe avec ta propre clé pour tester une version modifiée. Les notices ne constituent pas une approbation de distribution commerciale ni un changement de la liste de licences du projet web.
