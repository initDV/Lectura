# Lectura

Un personnage animé parle à côté d'un faux terminal où ton texte s'affiche comme des sous-titres, avec les mots
importants colorés. Tu filmes l'écran ou tu exportes la vidéo. Application web gratuite, installable, qui fonctionne
hors ligne. Aucun compte, aucun serveur, aucune statistique.

## Démarrer (Ubuntu, terminal)

```bash
cd lectura
node tools/serve.mjs          # ouvre http://localhost:5173  (aucune installation nécessaire)
```

Pour les tests, la vérification du code et le build :

```bash
npm install                   # une seule fois (≈ 60 Mo, outils de développement uniquement)
npm test                      # 49 tests
npm run lint
npm run build                 # crée dist/
npm run preview               # sert dist/ sur http://localhost:5173
```

## Mettre en ligne sur GitHub Pages

```bash
git remote add origin https://github.com/Rakfyh-debug/lectura.git
git push -u origin main
```

Puis, une seule fois sur GitHub : **Settings → Pages → Source : « GitHub Actions »**.
Chaque `git push` lance les tests, télécharge la voix HD côté GitHub, construit `dist/` et publie le site sur
`https://rakfyh-debug.github.io/lectura/`. Ta connexion ne sert qu'à envoyer le code (moins de 1 Mo).

### Cloudflare Pages (autre possibilité)

Commande de build : `npm ci && npm run voice && npm run build` — dossier de sortie : `dist`.

## Commandes

| Commande | Effet |
|---|---|
| `npm start` | Serveur local sans dépendance. |
| `npm run dev` | Serveur Vite (rechargement automatique). |
| `npm test` | Tests Vitest. |
| `npm run lint` / `npm run format` | ESLint / Prettier. |
| `npm run build` | Construit `dist/`, numérote la version, vérifie le poids. |
| `npm run voice` | Télécharge la voix HD dans `models/` (≈ 71 Mo). Inutile en local si tu ne testes pas la voix HD. |
| `npm run characters` | Vérifie les personnages et met à jour `characters/index.json`. |
| `npm run icons` | Régénère les icônes de l'application. |
| `npm run keygen` | Crée la paire de clés des licences Pro. |

## Utilisation

1. **Accueil** : nouveau projet, ouvrir un fichier `.lectura`, ou essayer l'exemple.
2. **Éditeur** : colle ton texte, choisis « Mon fichier audio » ou « Voix Lectura », choisis un personnage.
3. **Scène** : Lecture, puis filme l'écran (mode présentation) ou enregistre la vidéo (Pro).

Raccourcis dans la scène : `Espace` lecture/pause · `←` `→` ±5 s · `P` présentation · `S` capture PNG ·
`R` enregistrer · `M` couper le son · `F` plein écran · `E` expression suivante.

### Le son

- **Mon fichier audio** (mp3, wav, ogg, m4a, webm) : le texte suit exactement ton enregistrement.
- **Voix du système** : rien à télécharger. Sur Android, il faut une voix française installée dans les réglages
  du téléphone.
- **Voix Lectura HD** : voix naturelle hors ligne, à télécharger une fois depuis Réglages (≈ 71 Mo, Wi-Fi conseillé).
  Elle peut être enregistrée dans la vidéo.
- Si rien ne marche, l'**aperçu sans son** fait quand même défiler le texte.

## Gratuit et Pro

| Gratuit | Pro |
|---|---|
| 2 personnages (Professeur, Robot) | 11 personnages de plus |
| Fichier audio, voix du système, voix HD | Voix HD enregistrée dans la vidéo |
| Terminal coloré, mode présentation, raccourcis | Thèmes, police et vitesse du terminal |
| Capture PNG | Export vidéo MP4 ou WebM, en 16:9 et 9:16 |
| Projets locaux, export/import `.lectura` | Import/export `.srt` et `.vtt` |
| Lip-sync à 4 niveaux | Lip-sync plus fin, expressions avancées |
| Filigrane « Lectura » sur les captures | Sans filigrane, mots-clés personnalisés |

**Avant de vendre une licence**, crée ta propre clé (celle du dépôt est une clé de démonstration) :

```bash
node tools/generate_license.mjs keygen --force
git add src/modules/license-key.js && git commit -m "Licence : clé publique de production" && git push
node tools/generate_license.mjs sign <identifiant-du-client>
```

`private.pem` ne doit jamais quitter ta machine. Détails et limites : [docs/PRO_LICENSE.md](docs/PRO_LICENSE.md).

## Mises à jour et hors-ligne

- Avec une connexion, l'application charge toujours la dernière version. Sans connexion (ou si le réseau met plus de
  5 secondes), elle utilise la copie gardée sur l'appareil.
- Quand une nouvelle version est prête, un bandeau « Nouvelle version disponible : recharger » apparaît.
- Les projets restent dans le navigateur de l'appareil. Exporte tes projets importants en `.lectura` : effacer les
  données du site les supprime.

## Limites connues

- La voix du système ne peut pas être enregistrée dans une vidéo (limite des navigateurs) : utilise un fichier audio
  ou la voix HD.
- La voix HD est en français seulement, limitée à 12 000 caractères par projet, et peut mal prononcer certains noms
  propres étrangers.
- L'export vidéo demande Chrome, Edge ou Samsung Internet. Sur iPhone, l'installation et la vidéo sont au mieux.
- Les fichiers audio importés ne sont pas inclus dans le fichier `.lectura` exporté.

## Documentation

- [docs/DECISIONS.md](docs/DECISIONS.md) : choix techniques et écarts par rapport au cahier des charges.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) : organisation du code.
- [docs/ADD_CHARACTER.md](docs/ADD_CHARACTER.md) : ajouter un personnage sans toucher au code.
- [docs/PRO_LICENSE.md](docs/PRO_LICENSE.md) : licences Pro.
- [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) : licences des composants tiers.

## Licence

MIT. Voir `LICENSE`.
