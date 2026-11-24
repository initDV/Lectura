# Les quatre gestes du Robot Lectura

Dans la scène, le **Robot Lectura** est le seul à utiliser ce rig articulé. L’aperçu sans son, un WAV avec sous-titres
ou une voix HD permettent d'essayer la même mise en scène. Exemple :

> Demain, on part à 8 h 30. Tu seras là ? Oui ! D’où est-ce qu’on part ? De la gare. Parfait !

1. Au début de la première plage parlée en pose Auto, le robot fait un pas de côté. Les deux pieds se déplacent
   successivement et les genoux s’articulent sans allonger les jambes.
2. Au premier horaire reconnu, il regarde et désigne le cadran. L'horaire peut être écrit `8 h 30`, `08:30`,
   « huit heures trente » ou « une heure et quart ». Avec les sources sans alignement par mot, le moment du
   geste est estimé **à l’intérieur de la phrase**, pas à partir d’une seconde fixe.
3. Sur la première question en pose Auto, le buste et la tête s’inclinent.
4. Après la dernière phrase en pose Auto, il porte la main au torse et salue. La scène réutilise le silence déjà
   disponible et prolonge si nécessaire l'horloge de présentation ; elle ne réécrit ni le fichier importé ni ses sous-titres.

Les commandes `$` et les commentaires `#` restent muets. Une pose explicite par phrase empêche le déclenchement
sur cette phrase. Couper les émotions automatiques ou activer la réduction des animations désactive cette mise en
scène et sa marge finale. Pause, reprise, recherche et ralenti agissent sur la même position que celle de l’export.

## Implémentation et contrôle

- `characters/robot_lectura_scene.svg` contient les pièces communes aux deux rendus. Le SVG de vignette reste intact.
- `src/modules/robot-motion.js` et `RobotChoreo.java` donnent la pose à un instant de la source, avec des fixtures de
  parité. Le cadran vectoriel ne dépend ni d'une police distante ni d'un fichier vidéo de démonstration.
- La PWA sérialise le SVG vivant, Android utilise les mêmes matrices dans le rendu de la scène, la capture et la vidéo.
- `npm test` vérifie les appuis, le minutage des gestes, la diction et la marge muette. L’instrumentation Android
  exerce le rendu d'export, les recherches, le ralenti et la réduction des animations. Ces essais n’impliquent pas de
  validation sur un téléphone physique.
