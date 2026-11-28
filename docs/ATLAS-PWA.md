# Atlas dans la scène de Lectura

Dans Lectura Web, **Menu → Atlas** affiche le fond bleu nuit, avec le personnage à gauche et **la zone de texte agrandie à droite**. Il n’y a qu’un cadre : l’hologramme y remplace le texte, sans changer ses dimensions ni sa position. La barre du terminal n’est pas affichée. Même lorsqu’une planche masque le texte, il continue à se révéler et à défiler. Il réapparaît à la position de lecture dès que le dessin disparaît. Choisir **Atlas** une seconde fois restaure le terminal classique. Ce choix d’affichage est gardé sur l’appareil, indépendamment du projet.

## Essayer les planches animées

Activer **Menu → Atlas**, coller un des textes ci-dessous dans l’éditeur, puis cliquer sur **Lancer** (ou sur **Menu → Aperçu sans son**) :

- **Condensation** — « La vapeur redevient liquide sur la paroi froide du verre. De petites gouttes se forment. Les gouttes se rejoignent puis glissent le long du verre. La lecture continue. » La paroi s’éclaire, les gouttes se forment à l’extérieur, puis se rejoignent et descendent.
- **Dossier parent** — « Pour remonter au dossier parent, on part du dossier atelier. Deux points consécutifs font remonter d’un niveau vers le dossier qui le contient. » Le tracé remonte d’un seul niveau dans l’arborescence.
- **Tranchée couverte** — « Voici la construction en tranchée couverte. On ouvre la chaussée. On construit le tunnel. Puis on rétablit la chaussée. » La coupe met en avant chaque étape.
- **Réseau local** — « Dans un réseau local, le routeur relie les appareils. Les appareils échangent des données. La lecture continue. » Le routeur s’allume, les liens se dessinent puis un signal circule seulement lorsqu’un échange est lu.

Les **100 planches** ont des étapes propres à leur dessin. Certaines suivent un trajet (un rayon, une flèche, une orbite) ; d’autres éclairent une partie de la planche (une colonne, une couche, une observation). Si la lecture nomme la notion sans en décrire les étapes, les éléments importants sont mis en avant brièvement, sans inventer un trajet ni lancer de boucle.

### Les 21 nouvelles notions

| Domaine | Planches ajoutées |
| --- | --- |
| Astronomie | Phases de la Lune, éclipse de Soleil, saisons |
| Physique | Prisme optique, propagation du son, conduction thermique |
| Le vivant | Germination, photosynthèse, pollinisation, respiration pulmonaire |
| Mathématiques | Symétrie axiale, pourcentage, moyenne arithmétique, aire et périmètre |
| Terre et techniques | Bassin versant, dorsale océanique, filtration d’un mélange, panneau photovoltaïque, recyclage du papier |
| Terminal | Copier ou déplacer un fichier, tube entre commandes |

Pour voir le rayon et les couleurs se séparer :

> Dans un prisme optique, le rayon de lumière blanche arrive sur le verre. À la sortie, les couleurs se séparent : du rouge au violet. La lecture continue.

## Calage et ressources

- Le catalogue `src/modules/atlas/planches.json` contient les 79 planches du prototype et 21 nouvelles illustrations, avec leurs expressions, variantes et descriptions. Le repérage se fait sur les **segments préparés par Lectura**, sans les redécouper : plages importées (SRT/VTT) si valides, sinon minutage habituel de la source. Le calage d’un fichier sans sous-titres reste une estimation comme pour le terminal.
- Les zones, tracés et locutions propres à chaque planche sont dans `src/modules/atlas/scenarios.js` (le réseau conserve son tracé dédié). Les gestes sont datés en fonction de la position de ces locutions dans le segment et, si la source le fournit, de la fin de parole. Les sous-titres bornent les segments, sans alignement audio mot à mot.
- Une seule planche à la fois. Les commandes et commentaires, les notions sans planche, deux sujets concurrents ou une mention incertaine ne déclenchent pas de nouveau dessin. Une locution de suite peut prolonger une planche déjà active dans le passage contigu ; elle ne la déclenche jamais seule. Un blanc ou un autre sujet rend la place au texte. Pause, reprise et sauts utilisent la même position de lecture pour tous les gestes. En mouvements réduits, les étapes restent indiquées par des poses fixes, sans déplacement ni survol d’introduction.
- Le fond et les planches sont locaux et précachés. Le code Atlas est importé seulement si le mode est actif. Le PNG et la vidéo utilisent le même compositeur, qui alterne texte et hologramme dans un seul cadre. Ni l’éditeur ni le menu ne sont capturés.

## Atlas Android natif

Dans la scène Android, le même choix **Menu → Atlas** fonctionne sans changer de projet ni relancer la lecture. Les boutons **−5 s** et **+5 s** sont disponibles pendant la lecture ou la pause. La largeur réservée à l’Atlas (66 %) ne modifie pas les réglages du cadrage classique. La capture PNG et la vidéo reprennent le même rendu Atlas que la scène, avec des marges si le format change.

`android/atlas-assets.mjs` embarque les SVG et prépare un index des expressions et des gestes depuis les fichiers Web. L’application ne charge aucun site ni script. La sélection des planches est préparée dans le worker à partir de `Reading.timeline`, les vecteurs sont lus à la demande, et le texte reste visible si un dessin n’est pas disponible. Les gestes du prisme, du réseau ou du verre utilisent toujours le temps source, pas un compteur d’images. Le lecteur natif prend en charge le sous-ensemble SVG du catalogue (formes, libellés, dégradés et tirets) ; les ornements tels que les motifs et marqueurs SVG ne sont pas reproduits à l’identique.

Le scénario d’instrumentation `atlas-natif` compare le calage Android aux fixtures calculées par la PWA, rend toutes les planches en mode avion, puis vérifie le menu, la pause, les sauts et le retour au texte sur un WAV avec SRT. Il compare aussi les surfaces PNG et vidéo. `bash android/build.sh --check` compile l’instrumentation sans l’exécuter ; le workflow Android la lance sur API 31.

## Vérification Web

```sh
npm run build
npm run preview -- 4314
# Dans un autre terminal, avec Playwright et Chromium disponibles :
PLAYWRIGHT_MODULE=playwright node tests/atlas-pwa.browser.mjs
```

La recette utilise le build sous `/Lectura/` en portrait 320 × 568 et à 1440 × 900. Elle vérifie les phases du réseau, du verre et du prisme, la pause, les mouvements réduits, le cadre commun en présentation, la continuité du WAV, le défilement, les sauts et le PNG. Après redémarrage avec accès HTTP coupé, elle parcourt également les 100 planches et compare leurs poses sur le canvas de projection. `LECTURA_URL` indique une autre adresse HTTP locale du build, `CHROMIUM` un autre exécutable, `ATLAS_CAPTURES` le dossier de captures et `ATLAS_VIDEO=1` ajoute un enregistrement vidéo réel.
