# Prononciation et phrasé de Lectura

La voix et les modèles sont les mêmes. Ce lot change les phonèmes envoyés à la synthèse, puis, dans certains cas, la petite portion de voyelle qui termine une question. Il ne change ni le texte du projet ni les téléchargements de voix. Il n'ajoute pas de profil, de filtre global ni de moteur.

| Source | Prononciation | Finale de question |
| --- | --- | --- |
| Piper Siwis, PWA et APK | Lexique commun, corrections de diction ciblées et pauses selon la ponctuation | Relèvement local et +70 ms à 1× si la finale est faible et suffisamment périodique |
| Autres voix Piper | Même phonétisation ; repli de `/ɥ/` sur `/y/` si le modèle n'a pas le phonème | Pas de traitement ajouté sur le Web. Sur Android, traitement existant limité aux finales faibles, sans allongement |
| Siwis Kokoro (APK) | Même phonétisation locale, vérification de `/ɥ/` dans les tokens du pack | Finale Android sans allongement |
| Estelle et voix système Android | Heures écrites normalisées avant la lecture ; prononciation du moteur, pas de lexique IPA Piper | Finale Android sans allongement |
| Web Speech, audio importé, aperçu silencieux | Inchangé | Inchangé |

## Cas retenus

- Depuis la 1.1 : `8 h 30`, `8h30` et `08:30` deviennent « huit heures trente » à la synthèse, pas dans le projet. « Est-ce », « qu’est-ce » et « n’est-ce » sont phonétisés comme un groupe.
- Les formes écoutées « notamment », « faisait », « derrière », « compter », « moyen » et « doigt » entrent dans le lexique partagé. Seul **Siwis Piper** utilise la variante du modèle (`y` à la place de `ɥ`) pour « nuit » et le « huit » de « huit heures trente » ; le `/t/` est gardé. Ni « pluie », ni les autres heures, ni les autres modèles n’héritent de ce remplacement.
- Les pauses de Siwis suivent la ponctuation (notamment 300 ms après un point, 360 ms après une question et 320 ms après un point d’exclamation à 1×). Les coupes des fragments et les durées de voix peuvent différer entre le Web et Android. La prise D a servi de référence d’écoute : ce n’est pas un enregistrement incorporé, et une nouvelle synthèse ne reproduit pas son PCM à l’identique.

- `/jø/` reste intact seul ; « les yeux » et « deux yeux » reçoivent la liaison `/z/`. Pas de liaison introduite devant « yaourt », « héros » ou « haricot ».
- « Vraiment ? » inclut bien `/ɑ̃/`, sans élargir aveuglément la règle de `-ent` aux verbes. « Fils », « couvent » et « président » ne changent de lecture qu'en présence d'un indice clair. Les formes isolées ambiguës gardent leur lecture par défaut.
- Le traitement audio est sélectif : une question ouverte, un choix « … ou … ? », un signal non voisé/incertain, ou une montée naturelle ne sont pas remodelés. Il conserve le reste du signal et ne prolonge pas la pause après la question. Les tests `g2p`, `question-pitch` et l'instrumentation Android utilisent les mêmes cas de référence.

## Chargement et caches

Le préchauffage travaille sur une seule file, après une pause de saisie. Il calcule au plus trois phrases Piper sur 320 caractères parlés, sans fabriquer un enregistrement partiel. Sur Android, les packs Kokoro et Estelle gardent une seule phrase en préchauffage lors de l'édition. Changement de voix, arrêt, navigation ou nouvelle saisie invalident le travail périmé. Si une phrase est déjà calculée, la lecture la reprend au lieu d'en synthétiser une autre. Le cache Web de phrases en RAM est limité à 8 Mio ; IndexedDB évince les anciens rendus après 80 Mio, sans lire leur PCM pour calculer le quota.

Le démarrage progressif avec N+1 pendant N n'est pas activé. La lecture, les sauts, les lèvres et l'export utilisent le même WAV et les mêmes durées mesurées. Démarrer avec un WAV incomplet introduirait une nouvelle horloge, des attentes à la frontière des phrases et, sur le Web, une normalisation différente avant de connaître le pic de l'ensemble. Les révisions de cache distinguent les nouveaux rendus des anciens ; les packs et brouillons sont conservés.

## Vérification

- `npm test`, `npm run lint`, `npm run build` ; `bash android/build.sh --check` avec JDK/SDK. La CI Android signe et vérifie l'APK sur émulateur, notamment la mise à jour et la lecture de Siwis Piper hors réseau.
- Dans une PWA de test : installer Siwis, couper le réseau, recharger, lire « Tu viens ce soir ? » puis « Vraiment ? ». Vérifier arrêt pendant la préparation, pause/reprise, sauts, changement de source, lèvres, silence des lignes `$` et vidéo avec piste audio. Rejouer sans vider le cache des modèles.
- Sur les mêmes 1 000 graphies du banc, 833 transcriptions correspondent strictement à une référence, contre 775 avant. Les écarts prioritaires passent de 118 à 59 ; ce ne sont pas des erreurs confirmées à l'écoute. Les fichiers de référence Lexique 3.83 ne font pas partie de la distribution.
- Sur le **même PCM Siwis** de « Tu viens ce soir ? », les fenêtres d'analyse de finale passent de 189 → 145 Hz à 189 → 218 Hz, et la parole dure 865 → 935 ms (hors pause). Sur « Vraiment ? » corrigé, la montée 210 → 264 Hz est laissée telle quelle. Le Java et le JavaScript donnent le même PCM sur ces deux prises, à plage de détection identique. Les contours de nouvelles synthèses peuvent varier.

Ces mesures sont des contrôles hôte et émulateur, pas un benchmark du Redmi.
