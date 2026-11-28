Lectura Android — composants distribués

Lectura : MIT. Même code source de référence pour les dessins, lexiques, icônes et tables. JetBrains Mono : SIL OFL 1.1 (`OFL-JetBrainsMono.txt`).

ONNX Runtime Android 1.24.3 (Microsoft) : MIT. AAR officiel Maven Central `com.microsoft.onnxruntime:onnxruntime-android`. Sources et notices : https://github.com/microsoft/onnxruntime. Ce composant est présent dans l’APK CI ; les fichiers Piper sont téléchargés à la demande depuis le catalogue Pages. Ne pas confondre la licence du moteur avec celles des modèles et corpus.

Export MP3 : cœur Java LAME du dépôt https://github.com/zhuker/lamejs, révision `582bbba6a12f981b984d8fb9e1874499fed85675`. Les fichiers `src/main/java/mp3` et `src/main/java/mpg` employés ne sont pas modifiés. Les notices dans les sources précisent LGPL version 2 ou suivante ; le texte LGPL 2.1 et la notice upstream sont joints. LAME : https://lame.sourceforge.io/.

Sources du cœur et du port (et recette de recompilation avec un cœur modifié) : voir `Lectura-Android-sources` dans la même exécution CI et `android/README.md`. Recompile et signe avec ta propre clé pour tester une version modifiée. Les notices ne constituent pas une approbation de distribution commerciale ni un changement de la liste de licences du projet web.

Kokoro 82M v1.0 INT8 : téléchargement officiel Sherpa-ONNX, 132 353 410 octets. Sherpa-ONNX 2.0.1, Apache-2.0 (`SHERPA-APACHE-2.0.txt`), [code source et recette Android](https://github.com/k2-fsa/sherpa-onnx/tree/v2.0.1). La voix `ff_siwis` du [modèle Kokoro](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) utilise SIWIS French Speech Synthesis Database, University of Edinburgh (CC BY 4.0). Lectura utilise sa propre phonétisation locale : ni binaire eSpeak, ni données eSpeak embarquées ou installées avec Kokoro. Licence et README du modèle conservés avec le pack installé.

Pocket TTS French / Estelle : Kyutai, modèle et préréglage CC BY 4.0 ; export ONNX et conversion du préréglage par [Okuvia](https://github.com/ByBrawe/Okuvia-models/releases/tag/pocket-multilingual-preset-20261026). Les fichiers `MODEL_LICENSE.txt`, `VOICE_ATTRIBUTION.md` et le manifeste d’origine sont conservés avec la voix. Aucun enregistrement de référence, ni encodeur vocal, ni clonage installé. La synthèse n’est pas un enregistrement authentique ni une approbation des auteurs.

Kotlin standard library 2.2.21, Apache Commons Compress 1.27.1 et Commons IO 2.16.1 : Apache-2.0. Notices Maven jointes à l’APK. Ces bibliothèques servent au pont Sherpa et à la décompression bzip2 ; aucun script ni binaire trouvé dans les packs n’est exécuté.
