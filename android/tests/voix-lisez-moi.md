# Comparer les voix françaises de Lectura Android

Les cinq WAV ont été produits par Lectura Android à **1×**, avec le même texte (`texte.txt`). Écoute-les au même volume. Compare l’enchaînement après la virgule, « les enfants », le « gn » de « montagne », « pluie », la fin de la question et le « Oui ! » isolé.

| Fichier | Voix dans Lectura |
| --- | --- |
| `01-siwis-douce.wav` | Siwis · F · douce (Piper, référence) |
| `02-estelle.wav` | Estelle · F · Pocket TTS |
| `03-siwis-kokoro.wav` | Siwis · F · Kokoro |
| `04-mls-1.wav` | MLS 1 · F · claire (Piper) |
| `05-mls-4.wav` | MLS 4 · M · clair (Piper) |

Les deux Siwis utilisent le même corpus avec des modèles différents. Estelle et Kokoro sont générées hors ligne sur l’émulateur ; les pistes n’ont pas été égalisées ni accélérées. Les tests vérifient le texte, les pauses et le signal PCM, pas une préférence à l’écoute ni le rendu des haut-parleurs du téléphone.

**Attributions.** Siwis : *SIWIS French Speech Synthesis Database*, Université d’Édimbourg ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), modèles Piper et [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M). Estelle : Kyutai Pocket TTS et préréglage Estelle (CC BY 4.0), [conversion ONNX d’Okuvia](https://github.com/ByBrawe/Okuvia-models/releases/tag/pocket-multilingual-preset-20261026). MLS : [Multilingual LibriSpeech](https://www.openslr.org/94/), CC BY 4.0, [modèle Piper français](https://huggingface.co/rhasspy/piper-voices/tree/main/fr/fr_FR/mls/medium).
