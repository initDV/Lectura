# Licence Pro : fonctionnement et limites

## Principe

- Pas de compte, pas de serveur. Chaque installation crée une fois un identifiant aléatoire (écran **Pro**).
- Le client envoie cet identifiant. Le vendeur signe une clé avec sa clé privée. Le client colle la clé.
- L'application vérifie la signature avec la clé publique incluse dans le code. Tout se passe hors ligne.

## Mise en place (une seule fois, sur la machine du vendeur)

```bash
node tools/generate_license.mjs keygen --force
git add src/modules/license-key.js
git commit -m "Licence : clé publique de production"
git push
```

- `private.pem` est créé à la racine. **Il ne doit jamais quitter cette machine** : il est dans `.gitignore`.
  En faire une copie sur une clé USB rangée à part. S'il est perdu, plus aucune clé ne peut être créée ;
  s'il est volé, n'importe qui peut en créer.
- Le dépôt est livré avec une clé de **démonstration**. Tant que `keygen --force` n'a pas été lancé, le build affiche
  un avertissement et les clés de test ne doivent pas être vendues.
- Changer de clé publique annule toutes les licences déjà vendues.

## Vendre une licence

```bash
node tools/generate_license.mjs sign <identifiant-du-client>
# vérifier avant d'envoyer :
node tools/generate_license.mjs verify <clé> <identifiant-du-client>
```

La clé est liée à un appareil et à un navigateur. Si le client efface les données du site ou change de téléphone,
son identifiant change : il faut lui signer une nouvelle clé.

## Limites, dites honnêtement

**Une vérification faite dans le navigateur ne peut pas être inviolable.**

- Le code est public. Une personne à l'aise avec les outils du navigateur peut modifier la vérification et débloquer
  les fonctions Pro sans payer. Aucune technique côté client ne l'empêche vraiment.
- Ce que la signature garantit : personne ne peut **fabriquer une clé valide** sans `private.pem`, et une clé
  ne fonctionne pas sur une autre installation.
- L'identifiant n'est pas une empreinte du matériel (choix volontaire, pour la vie privée). Il peut être copié
  avec les données du site.

Conséquence pratique : cette licence arrête le partage simple de clés, pas un pirate décidé. Elle convient à un
produit vendu à prix modeste à des clients de bonne foi. Une protection plus forte demanderait un serveur, ce que
le projet refuse par principe.

## Ce que Pro débloque

11 personnages supplémentaires, expressions avancées, lip-sync par bandes, catégories de mots-clés personnalisées,
export vidéo en 16:9 et 9:16, thèmes et police du terminal, import/export `.srt` et `.vtt`, suppression du filigrane.
