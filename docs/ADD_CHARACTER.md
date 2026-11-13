# Ajouter un personnage

Aucun code à modifier : deux fichiers à créer, une commande à lancer.
Tous les personnages partagent le même robot (mêmes proportions, mêmes articulations, même style « contour »).
Seuls changent la couleur du contour et des yeux, et un ou deux accessoires en traits simples.

## 1. Copier le robot de référence

```bash
cd characters
cp robot_lectura.svg mon_robot.svg
cp robot_lectura.json mon_robot.json
```

`robot_lectura.svg` est la référence exacte : ne le modifie pas, pars toujours d'une copie.

## 2. Adapter le SVG

Style : contour fin (épaisseur 3) sur remplissage sombre `#1c1830`, aucun dégradé, aucune ombre floue.
Repère : `viewBox="0 0 240 600"`.

Le fichier doit garder ces groupes et ces identifiants, que l'animation utilise :

| Identifiant | Rôle | Animation |
|---|---|---|
| `#body` | torse, antenne, tête et visage | respiration |
| `#arm-l`, `#arm-r` | bras gauche et droit | balancement pendant la parole, gestes |
| `#legs` | jambes (facultatif) | suit le corps pour les styles flottant et ondulant |
| `#mouth` | bouche (`rect`) | hauteur selon le son |
| `#eye-l`, `#eye-r` | yeux (`circle`) | taille selon l'expression, clignement |
| `#brow-l`, `#brow-r` | sourcils | montent ou descendent selon l'expression |

S'il manque `#body`, `#arm-l`, `#arm-r`, `#mouth`, `#eye-l`, `#eye-r`, `#brow-l` ou `#brow-r`, l'application
affiche un message qui nomme la pièce manquante.

Règles pratiques :

- **Changer la couleur** : remplace `#9b45e0` (contour) partout, et `#3ddc84` (yeux) si tu veux.
- **Accessoire qui suit un bras** (loupe, crochet) : place-le dans `#arm-l` ou `#arm-r`.
- **Accessoire sur la tête ou le torse** : place-le dans `#body`. Dessiné avant le cercle de la tête il passe
  derrière, dessiné après il passe devant.
- **Reflets des yeux** : les petits cercles sans identifiant placés juste après les yeux (rayon 4 ou moins) sont
  masqués pendant le clignement. Ne mets pas d'autre petit cercle sans identifiant à cet endroit.
- **Fichier autonome** : aucune image, police ou feuille de style externe, aucun script. Le dessin est converti en
  image pour la capture et la vidéo ; une référence externe casserait l'export. Les balises non autorisées sont
  retirées au chargement.
- Pivots des épaules par défaut : (34,224) et (208,224).

## 3. Remplir le JSON

```json
{"id":"mon_robot","nom":"Mon robot","role":"pro","pro":true,"svg":"mon_robot.svg",
 "couleurContour":"#ff4d4d","couleurRemplissage":"#1c1830","couleurYeux":"#ffd23f","couleurBouche":"#38bdf8",
 "pivots":{"epaule_g":[34,224],"epaule_d":[208,224]},
 "mouvements":{"vitesseIdle":1,"amplitudeBras":1,"style":"fluide"},
 "voixSuggeree":{"hauteur":1,"vitesse":1}}
```

- `id` doit être identique au nom du fichier.
- `pro: true` réserve le personnage à Lectura Pro. Gratuits aujourd'hui : `robot_lectura` et `robot_rouge`.
- `mouvements.style` : `fluide`, `saccade`, `sec`, `frappe`, `flottant`, `ondulant`, `calme` ou `expressif`.
- `vitesseIdle` et `amplitudeBras` multiplient la vitesse et l'ampleur des mouvements.

## 4. Enregistrer et vérifier

```bash
npm run characters        # vérifie chaque personnage et met à jour characters/index.json
npm start                 # puis ouvrir http://localhost:5173/tests/manual/personnages.html
```

La planche montre chaque personnage deux fois : le SVG animé, et l'image produite pour l'export. Les deux doivent
être identiques. Paramètres utiles dans l'adresse : `?expr=surpris`, `?parle=1`, `?fige=1`.
