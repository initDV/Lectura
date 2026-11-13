# Lectura

Un robot animé parle à côté d'un faux terminal où ton texte s'affiche au fil de la lecture. Tu colles ton texte,
tu appuies sur « Lancer », tu filmes l'écran ou tu exportes la vidéo. Application web gratuite, installable, qui
fonctionne hors ligne. Aucun compte, aucun serveur, aucune statistique.

## Démarrer (Ubuntu, terminal)

```bash
cd lectura
node tools/serve.mjs          # ouvre http://localhost:5173  (aucune installation nécessaire)
```

Pour les tests, la vérification du code et le build :

```bash
npm install                   # une seule fois (≈ 60 Mo, outils de développement uniquement)
npm test                      # 81 tests
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

Tout se passe sur un seul écran : la scène en haut (robot à gauche, terminal à droite), les commandes en dessous.

1. **Colle ton texte** dans la zone du bas.
2. **Choisis la voix** dans la ligne voix (la voix de l'appareil est utilisée par défaut, sans fichier audio).
3. **Lancer** : le robot parle et le terminal affiche les lignes dans l'ordre. **Arrêter** coupe la voix.
4. **Capturer l'écran** masque les commandes pour filmer. Un appui = lecture/pause, deux appuis = retour.

### Écrire le texte

| La ligne commence par | Elle est | À l'écran | Prononcée |
|---|---|---|---|
| `$ ` | une commande | prompt violet + commande en couleur d'accent | non |
| `# ` | un commentaire | grise | non |
| autre chose | du texte parlé | texte normal, mots importants colorés | oui |

```text
Aujourd'hui, on apprend à repérer les machines d'un réseau.
# Étape 1 : lister les ports ouverts
$ nmap -sV 192.168.1.10
Bravo, tu as réussi ton premier scan !
```

### Les émotions du robot

Le robot réagit **au moment où il prononce** un mot chargé d'émotion. Chaque émotion fait bouger ensemble les yeux,
les sourcils, la bouche, la tête et les bras.

| Tu écris | Le robot |
|---|---|
| « Bonjour », « Bienvenue », « À bientôt » | sourit et salue de la main |
| « Bravo », « réussi », « parfait », « ça marche » | content, hoche la tête |
| « Attention », « Quoi ?! », « tout à coup » | surpris, sursaute, mains levées |
| « Regarde », « étape », « important », ligne `$ ` | concentré, regarde et montre le terminal |
| « Génial », « incroyable », « c'est parti » (Pro) | enthousiaste, bras en l'air |
| « Haha », « trop drôle », 😂 (Pro) | rit, mains sur le ventre |
| « Je suis fier », « mission accomplie » (Pro) | fier, poings sur les hanches |
| « Merci beaucoup », « ne t'inquiète pas » (Pro) | tendre, mains sur le cœur |
| « Bizarre », « je me demande », « Tu es sûr ? » (Pro) | sceptique, main contre la joue |
| « Oups », « désolé », « erreur » (Pro) | gêné, main derrière la tête |
| « Dommage », « échec », « ça ne marche pas » (Pro) | triste, tête baissée |
| « Épuisé », « ennuyeux », « pff » (Pro) | fatigué, yeux mi-clos |
| « J'en ai marre », « interdit », « inadmissible » (Pro) | en colère, poings serrés |
| « Danger », « au secours », « catastrophe » (Pro) | effrayé, tremble, mains sur les joues |
| « Oui », « d'accord » / « Non », « jamais » | hoche la tête / fait non de la tête |

- La négation est comprise : « pas content » rend triste, « pas grave » rassure.
- « très », « trop », les MAJUSCULES et « ! » renforcent ; « un peu » atténue.
- Deux émotions dans la même phrase se mélangent (« J'en ai marre de ce bug » : colère puis gêne).
- En version gratuite, les émotions Pro sont jouées avec l'expression de base la plus proche (content, concentré,
  surpris).
- Menu « ⋮ » → **Personnages** : coupe les émotions automatiques, ou impose une expression phrase par phrase. La
  liste indique ce que « Auto » a détecté.
- Pour ajouter tes mots : ouvre `data/sentiments_fr.json` et ajoute-les dans la liste de l'émotion voulue
  (`"réuss*"` accepte toutes les terminaisons). Aucun code à modifier.
- Toutes les expressions d'un coup d'œil : `http://localhost:5173/tests/manual/personnages.html?toutes=1`.

### Les autres commandes

- **Vitesse** (0.5x à 2.0x) : agit sur la voix et sur le défilement du terminal.
- **Œil** dans la barre du terminal : masque ou affiche le texte, pour ne montrer que le robot.
- **Menu « ⋮ »** en haut à gauche de la scène : projets, import/export, aperçu sans son, capture PNG, export vidéo,
  personnages, réglages, licence Pro, à propos.

Raccourcis clavier (hors zone de texte) : `Espace` lancer/pause · `←` `→` ±5 s · `P` mode capture · `S` capture PNG ·
`R` enregistrer la vidéo · `M` couper le son · `F` plein écran · `E` expression suivante.

### Le son

- **Fichier audio** en option (bouton à droite de la ligne voix ; mp3, wav, ogg, m4a, webm) : le texte suit exactement ton enregistrement.
- **Voix du système** : rien à télécharger. Sur Android, il faut une voix française installée dans les réglages
  du téléphone.
- **Voix Lectura HD** : voix naturelle hors ligne, à télécharger une fois depuis Réglages (≈ 71 Mo, Wi-Fi conseillé).
  Elle peut être enregistrée dans la vidéo.
- Si rien ne marche, l'**aperçu sans son** fait quand même défiler le texte.

## Gratuit et Pro

| Gratuit | Pro |
|---|---|
| 2 robots (Robot Lectura, Robot rouge) | 11 robots de plus |
| Fichier audio, voix du système, voix HD | Voix HD enregistrée dans la vidéo |
| Terminal coloré, mode capture, raccourcis | Thèmes, police et vitesse du terminal |
| Capture PNG | Export vidéo MP4 ou WebM, en 16:9 et 9:16 |
| Projets locaux, export/import `.lectura` | Import/export `.srt` et `.vtt` |
| Lip-sync à 4 niveaux | Lip-sync plus fin |
| Émotions : content, concentré, surpris, salut de la main | 10 émotions de plus et leurs mélanges |
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
- Les émotions viennent d'une liste de mots, pas d'une compréhension du texte : l'ironie ou un mot à double sens
  peuvent tromper le robot. Dans ce cas, impose l'expression de la phrase dans Personnages.

## Documentation

- [docs/DECISIONS.md](docs/DECISIONS.md) : choix techniques et écarts par rapport au cahier des charges.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) : organisation du code.
- [docs/ADD_CHARACTER.md](docs/ADD_CHARACTER.md) : ajouter un personnage sans toucher au code.
- [docs/PRO_LICENSE.md](docs/PRO_LICENSE.md) : licences Pro.
- [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) : licences des composants tiers.

## Licence

MIT. Voir `LICENSE`.
