# Ajouter un personnage

Aucun code à modifier : deux fichiers à créer, une commande à lancer.

## 1. Copier un personnage existant

```bash
cd characters
cp robot.svg mon_perso.svg
cp robot.json mon_perso.json
```

## 2. Dessiner le SVG

Règles de style (identiques pour tous) : pictogramme plat, sans dégradé, corps `#3a3f4b`, mêmes proportions.
Seuls changent la couleur d'accent et un ou deux accessoires.

Le fichier doit garder cette structure, avec ces identifiants exacts :

```xml
<svg id="lectura-char" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400">
  <g id="char" fill="#3a3f4b">
    <g id="leg-l">…</g>   <g id="leg-r">…</g>
    <g id="arm-l">…</g>   <g id="arm-r">…</g>
    <g id="torso">…</g>
    <g id="head">
      …
      <rect id="visor" x="124" y="47" width="52" height="14" rx="7" fill="#ff4d4d"/>
      <path id="visor-happy" …/>
    </g>
  </g>
</svg>
```

- Pièces obligatoires : `#char`, `#head`, `#visor`, `#torso`, `#arm-l`, `#arm-r`, `#leg-l`, `#leg-r`.
  S'il en manque une, l'application affiche un message qui la nomme.
- Un groupe `<g id="back">` placé avant les jambes peut porter un accessoire dans le dos (cape, sac).
- Interdits : scripts, liens externes, images incorporées. Ils sont retirés au chargement.
- Repères par défaut : épaules (115,122) et (185,122), cou (150,95), hanches (135,200) et (165,200),
  centre de la visière (150,54).

## 3. Remplir le JSON

```json
{
  "id": "mon_perso",
  "nom": "Mon perso",
  "role": "base",
  "pro": false,
  "svg": "mon_perso.svg",
  "couleurCorps": "#3a3f4b",
  "couleurAccent": "#ff4d4d",
  "pieces": ["torse", "tete", "bras_g", "bras_d", "jambe_g", "jambe_d"],
  "pivots": { "epaule_g": [115, 122], "epaule_d": [185, 122], "cou": [150, 95], "hanche_g": [135, 200], "hanche_d": [165, 200] },
  "visiere": { "centre": [150, 54], "largeur": 52, "hauteur": 14 },
  "mouvements": { "vitesseIdle": 1, "amplitudeBras": 1, "style": "fluide" },
  "voixSuggeree": { "hauteur": 1, "vitesse": 1 },
  "accessoires": []
}
```

- `id` doit être identique au nom du fichier.
- `pro: true` réserve le personnage à Lectura Pro.
- `mouvements.style` : `fluide`, `saccade`, `sec`, `frappe`, `flottant`, `ondulant`, `calme` ou `expressif`.
- Réglages facultatifs : `vitesseGestes`, `amplitudeTete`, `paliers`, `flottement`, `ondulation`,
  et `posture` (`inclinaison` en degrés, `brasRepos`).

## 4. Enregistrer et vérifier

```bash
npm run characters        # vérifie chaque personnage et met à jour characters/index.json
npm start                 # puis ouvrir http://localhost:5173/tests/manual/personnages.html
```

La planche montre tous les personnages côte à côte, en SVG et en rendu d'export. Paramètres utiles dans l'adresse :
`?expr=content`, `?parle=1`, `?fige=1`.
