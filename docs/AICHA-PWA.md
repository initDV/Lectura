# Aïcha et les lectrices dans Lectura

Le catalogue partagé reprend le dessin articulé de l’atelier. La scène ne contient ni sa réplique, ni sa piste son, ni son minutage. Aïcha joue sur le texte et la source du projet ouvert.

## Essayer la PWA standard

```sh
npm run build
npm run preview -- 4202
```

Dans la scène : **Menu → Personnages**, choisir l’une des cinq lectrices ci-dessous, **Robot Lectura** ou **Robot rouge**, puis **Retour à la scène**. Saisir son propre texte et choisir **Menu → Aperçu sans son**, ou sélectionner une voix puis appuyer sur **Lancer**. La voix **Lectura HD · Siwis** peut être installée dans **Réglages → Voix Lectura HD hors ligne** si le modèle est proposé (`npm run voice` avant la construction si nécessaire).

| Personnage | Style |
| --- | --- |
| Aïcha | Personnage articulé d’origine, avec lunettes |
| Monique | Classique : chignon, lunettes dorées et blazer prune |
| Prisca | Deux houppettes bouclées, bomber cobalt, pantalon cargo et baskets montantes |
| Charlotte | Rétro : carré cuivré, béret, marinière et pantalon évasé |
| Doriane | Sportive : queue de cheval haute, coupe-vent citron vert et chaussures de course |

Les cinq lectrices partagent le même rig et les animations liées au texte, à la voix et à l’attente. Aïcha et Monique portent des lunettes et peuvent jouer le geste d’ajustement. Les deux robots conservent leurs dessins et leurs animations.

Texte utile pour vérifier le salut, la marche, le silence et la reprise :

```text
Bonjour, moi c’est Aïcha ! Je m’avance pour te montrer le chemin qui traverse le quartier, puis je m’arrête au premier carrefour.
# Elle écoute un instant avant de reprendre.
Tu viens au marché ? Oui, je vais te montrer le chemin.
```

La ligne `#` défile sans être prononcée. Même sans ponctuation, une phrase longue est divisée en groupes de mots pour répartir les regards et les hochements. Les mains n’accompagnent que certains groupes, avec des temps de repos entre les gestes. En parlant, Aïcha garde les mains sous la poitrine ; le coude amorce le geste, puis la paume et les doigts suivent. Le salut et l’ajustement des lunettes gardent leur geste distinct. Une longue lecture, une pause assez longue ou une mention explicite peuvent lancer quelques pas **vers l’avant**. La caméra accompagne Aïcha : elle reste centrée, tandis que les dalles et les lumières du couloir reculent en perspective. Le balancement des bras accompagne la marche, puis le décor reste à la position atteinte. Les gestes et le décor suivent le temps de lecture, sans rallonger la source audio. **Personnages → Mouvements** règle l’amplitude (`Calme`, `Normal`, `Vif`).

Même sans lecture, Aïcha respire, cligne des yeux, regarde autour d’elle et change légèrement d’appui. De temps en temps, elle pousse du bout de l’index le bord de sa monture et laisse le bras redescendre. Un peu plus tard, elle reporte son poids sur une jambe et soulève l’autre talon. En le reposant, elle relâche les épaules dans un soupir silencieux et garde les yeux baissés un instant. Le bord intérieur de la pointe reste au même endroit : elle ne fait pas de pas et le décor ne bouge pas. Dans un autre temps d’attente, les yeux se tournent vers la droite, puis la tête suit avant de revenir de face.

Après au moins 1,2 seconde de silence, et si elle est à l’arrêt, Aïcha ouvre légèrement le buste et relève le menton juste avant la prochaine phrase prononcée. Une ligne de commentaire ou de commande n’est pas une reprise de parole. Les lunettes, le soupir et le regard vers le terminal n’ont lieu que s’il reste assez de temps pour terminer le geste avant la reprise ou la marche. Aucun son n’est ajouté et le minutage de lecture ne change pas.

**Arrêter** la ramène au départ ; à la fin d’une lecture elle continue d’attendre sur place. Une **Pause** conserve la pose à l’image près, tout comme la dernière image d’un export. **Réduire les animations** (dans Lectura ou dans le système) coupe aussi ces mouvements.

### Références pour la démarche

- [Jacquelin Perry, *Normal Gait*](https://www.oandplibrary.org/alp/chap13-01.asp) : double appui entre deux pas, déroulé du talon vers la pointe. Dans le rig, le point de contact reste fixe dans le décor, même quand la cheville pivote. Le pied qui avance rase le sol plutôt que de monter à chaque pas.
- [Collins, Adamczyk et Kuo, 2009](https://pubmed.ncbi.nlm.nih.gov/19640879/) : balancement des bras en opposition. Les bras d’Aïcha avancent et reculent près du corps, pas de côté.
- [Bruening et al., 2020](https://pubmed.ncbi.nlm.nih.gov/32817696/) : les amplitudes observées varient, notamment selon la vitesse et la taille. Les pas intermédiaires d’Aïcha se posent plus près de l’axe sans croiser les pieds ni décrire d’arc vers l’extérieur. Le bassin accompagne chaque appui sans balancer le buste. C’est un choix d’animation pour Aïcha, pas un modèle unique de démarche féminine.
- [Repères de dessin de figure](https://www.proko.com/course-lesson/human-proportions-average-figure) : les manches et leurs articulations ont une longueur intermédiaire entre le premier dessin et la version aux bras longs. Au repos, les coudes sont près de la taille et les doigts arrivent au haut des cuisses. Les manches sont affinées dans le rig, sans déplacer les articulations ni allonger les bras. La profondeur ramène les gestes ouverts vers le spectateur plutôt que de déployer les bras jusqu’au bord du cadre.

## Catalogue commun PWA et Android

- `characters/index.json` liste les sept personnages dans l’ordre du menu. `npm run build` et `android/assets.mjs` n’empaquettent que leurs fiches et dessins référencés. Le précache PWA comprend ces mêmes fichiers, dont les deux dessins distincts de Robot Lectura (vignette et scène).
- Les cinq dessins validés sont repris à l’octet, y compris la première version de Prisca. Pour un projet créé avec un personnage retiré, les deux applications affichent Robot Lectura sans réécrire l’identifiant du personnage ni modifier le texte ou les médias.
- Le rig 2,5D Web est dans `src/modules/aicha/` ; Android utilise `AichaMotion`, `AichaGeometry`, `AichaRig` et `AichaStage` sur Canvas natif. Vignette avec les mêmes courbes SVG au repos, scène et export avec le rig animé. Les chemins des deux robots restent distincts.
- Les visèmes sont estimés d’après le texte et modulés par l’enveloppe des audios courts (≤ 60 s et ≤ 10 Mio à analyser). Pour les longs fichiers, le niveau est pris sur la lecture sans charger l’intégralité de l’audio en mémoire. Sur la PWA, une voix système ne fournit pas de piste à exporter ; Android utilise le WAV synthétisé localement par une voix compatible.
- Les échantillons d’animation, appuis, visèmes et enveloppes Web sont produits par `android/tests/{aicha,lips}.mjs`, puis comparés au port natif par l’instrumentation Android.

## Cadrage sur téléphone

Sur la PWA, en portrait jusqu’à 480 px, la scène donne toute la largeur aux personnages et place le terminal dessous. Elle utilise aussi ce cadrage jusqu’à 720 px si le rapport largeur/hauteur est d’au plus 3:5. Sur Android, les mêmes seuils en dp agrandissent le personnage mais gardent le terminal à droite, derrière lui. Sur un écran court, les commandes de lecture restent accessibles en faisant défiler la page. La vidéo Android reprend le cadrage affiché et les ajustements en cours de prise, sans filmer l’interface. Le PNG Android et les exports Web gardent leur propre composition.

## Recette PWA et Android

1. `npm run lint` et `npm test` ; les tests vérifient les appuis, les longueurs des membres, l’avance monotone, la projection des dalles, les visèmes et la réduction des animations. Sans lancer de lecture, vérifier le contact avec la monture vers 4 s, le talon et le soupir vers 7–8 s, puis le regard vers le terminal vers 10–11 s. Pour voir le redressement sans marche, faire précéder la toute première phrase d’un commentaire `#` d’environ deux secondes. Les pieds et le décor ne bougent pas pendant le regard ni le redressement.
2. Essayer l’aperçu silencieux et Siwis avec le texte ci-dessus, puis avec une seule longue phrase sans ponctuation. Mettre en pause en pleine marche : le personnage et le décor doivent se figer ensemble. Hors des champs de saisie, faire **→** puis **←** (±5 s) et retrouver la même pose au même endroit. Essayer aussi un WAV importé et des sous-titres datés.
3. Tester le portrait en 320–430 puis à 600 × 1243 (px sur le Web, dp sur Android). Vérifier le terminal dessous sur le Web, à droite sur Android, puis tourner en paysage. Tester aussi sur ordinateur et avec **Réduire les animations** dans Lectura et dans le système : pas de locomotion ni de défilement, mais les lèvres restent animées.
4. Capturer un PNG et une vidéo depuis le menu. Le PNG doit garder la position du décor à la capture ; la vidéo repart du début, avec les deux pieds au sol. Sur Android, modifier la taille du personnage et la largeur du terminal pendant la prise, puis vérifier ces changements dans la vidéo. Contrôler aussi le mouvement du sol, le son avec Siwis ou un fichier, et la lecture depuis **Mes vidéos**.
5. Après une première visite complète, recharger hors ligne, retrouver Aïcha et relancer l’aperçu. Avec Siwis installé à l’avance, synthétiser un texte inédit hors ligne. Vérifier aussi le pas et le cadran du Robot Lectura, et le choix d’un autre personnage.

Pour contrôler le cadrage des sept personnages dans Chromium, lancer `npm run build && npm run preview`, puis dans un second terminal :

```sh
recette=$(mktemp -d)
npm install --prefix "$recette" --no-save playwright@1.57.0
"$recette/node_modules/.bin/playwright" install chromium
cp tests/manual/portrait.mjs "$recette/"
node "$recette/portrait.mjs"
```

Pour Android, utiliser le [circuit signé](../android/README.md) et le test API 31 avant distribution. Un essai sur téléphone réel reste utile pour la voix système et les encodeurs disponibles.
