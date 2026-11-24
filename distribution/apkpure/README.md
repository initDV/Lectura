# Dossier APKPure — Lectura Android 1.0.0

Cette fiche correspond à l’APK public `Lectura.apk`, paquet `io.github.initdv.lectura`, **versionCode 32**, Android 12 ou ultérieur. Ce n’est pas l’APK candidat de la branche.

- [APK officiel signé](https://github.com/initDV/Lectura/releases/download/v1.0.0/Lectura.apk)
- [Politique de confidentialité FR/EN](https://initdv.github.io/Lectura/privacy/)
- [Archive du dossier vérifié en CI](https://github.com/initDV/Lectura/actions/runs/45340528636/artifacts/14895733194) (artefact GitHub Actions, disponible dans la limite de sa rétention)
- [Recette Android des visuels et de la signature](https://github.com/initDV/Lectura/actions/runs/45290163867) · [publication ciblée de la politique](https://github.com/initDV/Lectura/actions/runs/45285924735)

Les fiches [FR](Fiche-FR.txt) et [EN](Fiche-EN.txt) sont prêtes à copier. Le ZIP contient aussi un guide mobile, l’icône de fiche 512 × 512 (le [robot 3D de la page de présentation](../../app/assets/lectura-robot.webp)), les cinq écrans Android 1080 × 1920 dans chaque langue et les bannières facultatives 1024 × 500. Les captures sont celles de la Release, prises sans retouche sur un émulateur avec un projet de démonstration. Les instructions pour la soumission sont dans [LIRE-MOI.txt](LIRE-MOI.txt).

L’icône de fiche n’altère pas l’icône intégrée à l’APK public.

Pour une nouvelle version, revalider la fiche, les captures et la politique. Garder le même identifiant et le même certificat permanent, et augmenter `versionCode`. Ne jamais transmettre le keystore à la boutique.

La politique est ajoutée aux futurs builds statiques par `tools/build.mjs`, sans changer le précache ou l’empreinte de la PWA. Les circuits de capture et de publication ciblée sont ponctuels : leurs définitions restent consultables dans les runs ci-dessus.
