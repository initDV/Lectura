# Écouter Estelle avant et après le réglage de présence

Les trois WAV ont été produits hors ligne par Lectura Android à **1×**, avec le même texte (`texte.txt`). Compare d’abord les deux pistes Estelle au même volume : écoute « les enfants », « montagne », « pluie » et le « Oui ! » isolé.

| Fichier | Voix et réglage |
| --- | --- |
| `01-siwis-douce.wav` | Siwis · F · douce (Piper, référence inchangée) |
| `02-estelle-avant.wav` | Estelle · F · Pocket TTS, réglage du candidat #57 |
| `03-estelle-plus5.wav` | La même prise d’Estelle, avec le renfort de présence |

**Les deux Estelle partent exactement de la même synthèse.** La seconde piste renforce légèrement la zone des consonnes autour de 3 kHz (+5 % d’amplitude au centre, soit environ +0,42 dB). La vitesse, le nombre d’échantillons, les pauses et les repères sont identiques. Ce pourcentage est celui du traitement, pas une note de clarté mesurée à l’oreille.

**Attributions.** Siwis : *SIWIS French Speech Synthesis Database*, Université d’Édimbourg ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), [modèle Piper](https://huggingface.co/rhasspy/piper-voices/tree/main/fr/fr_FR/siwis/medium). Estelle : Kyutai Pocket TTS et préréglage Estelle (CC BY 4.0), [conversion ONNX d’Okuvia](https://github.com/ByBrawe/Okuvia-models/releases/tag/pocket-multilingual-preset-20261026).
