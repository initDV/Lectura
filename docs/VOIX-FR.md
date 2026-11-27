# Prononciation et phrasé de Lectura

Les correctifs de diction ne changent ni le texte du projet ni les modèles déjà téléchargés. Les traitements sont propres à chaque moteur ; la voix choisie et la priorité du mode Automatique ne changent pas.

| Source | Prononciation | Finale de question |
| --- | --- | --- |
| Piper Siwis, PWA et APK | Lexique commun, corrections de diction ciblées et pauses selon la ponctuation | Relèvement local et +70 ms à 1× si la finale est faible et suffisamment périodique |
| Autres voix Piper | Même phonétisation ; repli de `/ɥ/` sur `/y/` si le modèle n'a pas le phonème | Pas de traitement ajouté sur le Web. Sur Android, traitement existant limité aux finales faibles, sans allongement |
| Siwis Kokoro (APK) | Phonétisation locale adaptée au vocabulaire du modèle (`/ɲ/`, `/ɥ/`, voyelles nasales), clauses gardées ensemble | Finale Android sans allongement |
| Estelle (APK) | Heures normalisées, clauses gardées ensemble, vraies fins de phrase pour le modèle Pocket TTS | Finale Android sans allongement |
| Voix système Android | Heures normalisées ; prononciation du moteur, pas de lexique IPA Piper | Finale Android sans allongement |
| Web Speech, audio importé, aperçu silencieux | Inchangé | Inchangé |

## Cas retenus

- Depuis la 1.1 : `8 h 30`, `8h30` et `08:30` deviennent « huit heures trente » à la synthèse, pas dans le projet. « Est-ce », « qu’est-ce » et « n’est-ce » sont phonétisés comme un groupe.
- Les formes écoutées « notamment », « faisait », « derrière », « compter », « moyen » et « doigt » entrent dans le lexique partagé. Seul **Siwis Piper** utilise la variante du modèle (`y` à la place de `ɥ`) pour « nuit » et le « huit » de « huit heures trente » ; le `/t/` est gardé. Ni « pluie », ni les autres heures, ni les autres modèles n’héritent de ce remplacement.
- Les pauses de Siwis suivent la ponctuation (notamment 300 ms après un point, 360 ms après une question et 320 ms après un point d’exclamation à 1×). Les marges silencieuses du modèle sont rognées aux bords des phrases avant d’insérer les pauses, sans modifier les silences à l’intérieur d’une phrase. Les coupes et les durées de voix peuvent différer entre le Web et Android. La prise D a servi de référence d’écoute : ce n’est pas un enregistrement incorporé, et une nouvelle synthèse ne reproduit pas son PCM à l’identique.

- `/jø/` reste intact seul ; « les yeux » et « deux yeux » reçoivent la liaison `/z/`. Pas de liaison introduite devant « yaourt », « héros » ou « haricot ».
- « Vraiment ? » inclut bien `/ɑ̃/`, sans élargir aveuglément la règle de `-ent` aux verbes. « Fils », « couvent » et « président » ne changent de lecture qu'en présence d'un indice clair. Les formes isolées ambiguës gardent leur lecture par défaut.
- Le traitement audio est sélectif : une question ouverte, un choix « … ou … ? », un signal non voisé/incertain, ou une montée naturelle ne sont pas remodelés. Il conserve le reste du signal et ne prolonge pas la pause après la question. Les tests `g2p`, `question-pitch` et l'instrumentation Android utilisent les mêmes cas de référence.

## Estelle et Kokoro sur Android

- Une phrase courte comme « À 8 h 30, les enfants longent la montagne sous la pluie. » n’est plus synthétisée en deux morceaux autour de la virgule. Les virgules, deux-points et points-virgules restent dans le texte donné au moteur. Pour une phrase longue, la coupure cherche d’abord une ponctuation, sinon un espace. Les fins de phrase, les retours à la ligne et les lignes de commande gardent leurs pauses ; le terminal garde le texte exact.
- Estelle reçoit un point à la fin d’un fragment sans ponctuation forte. Comme dans [Pocket TTS](https://github.com/kyutai-labs/pocket-tts/blob/bc4d640c925a3782092a841e9bc7ba442a65a838/pocket_tts/models/tts_model.py), le premier signal de fin n’est pris en compte qu’après six trames pour éviter d’arrêter avant le premier mot.
- Kokoro reçoit `/ɲ/` dans « montagne » et « oignon », sans remplacer le vrai `/nj/` de « panier ». Les tirets propres à Piper ne sont pas envoyés. `/ɥ/` (« pluie ») et les voyelles nasales sont gardés quand le pack peut les représenter. Ce profil ne reprend pas les exceptions propres à Siwis Piper. [La fiche de Kokoro](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md#french) ne propose qu’un locuteur français pour ce modèle : `ff_siwis`, le même corpus que le Piper doux, pas une nouvelle personne.
- Aux bords des phrases Estelle et Kokoro, jusqu’à 40 ms de signal faible sont préservées pour ne pas rogner une consonne. Après traitement, la marge de pic reste à −3 dBFS. Siwis Piper et les fichiers importés ne sont pas retouchés.
- Estelle seule conserve le renfort de présence autour de 3 kHz (+5 % d’amplitude à cette fréquence). Un gain lissé sur 40 ms lui donne plus d’appui : environ +1,4 dB sur les syllabes déjà fortes et jusqu’à +2,3 dB sur les syllabes audibles mais plus faibles, avant le plafond de pic. Le niveau de fond très faible n’est pas relevé. Le WAV utilisé pour la lecture et les exports garde le débit, la hauteur et les pauses ; ni le modèle ni le cache des phrases brutes ne changent. Seul le cache WAV complet d’Estelle est renouvelé.

**Comparer à l’oreille.** L’artefact **Lectura-estelle-avant-apres** contient deux rendus de la même prise Estelle à 1× : le réglage du #58 et la version avec plus d’appui. Siwis douce lit le même texte à titre de référence. Les deux Estelle ont exactement les mêmes durées et repères ; la différence de niveau mesurée n’est pas une mesure de l’expressivité.

## Chargement et caches

Le préchauffage travaille sur une seule file. Pour Estelle, il commence après 800 ms de saisie stable ou d’ouverture d’un texte, avec un pack installé. Jusqu’à deux fragments sont anticipés (320 caractères prononcés au total). Un texte court de deux fragments au plus (240 caractères source) peut avoir son WAV complet et ses repères prêts avant **Lancer**. Un clic pendant le calcul du même texte et de la même voix ne jette pas le travail en cours : la lecture prend le relais, sans redémarrer le modèle ni la phrase. Un changement de texte/de voix, l’arrêt, la navigation et l’arrière-plan annulent toujours le travail devenu inutile. La lecture en avion ne change pas ; le pack, la qualité sonore et les clés de cache restent identiques.

Piper anticipe jusqu’à trois phrases sur 320 caractères parlés, Kokoro au plus une. Le cache Web de phrases en RAM est limité à 8 Mio ; IndexedDB évince les anciens rendus après 80 Mio sans relire leur PCM. Sur Android, l’enveloppe des lèvres est calculée par blocs de 32 fenêtres PCM : les mêmes mesures, mais moins de lectures de fichier.

Le démarrage progressif avec N+1 pendant N n'est pas activé. La lecture, les sauts, les lèvres et l'export utilisent le même WAV et les mêmes durées mesurées. Démarrer avec un WAV incomplet introduirait une nouvelle horloge, des attentes à la frontière des phrases et, sur le Web, une normalisation différente avant de connaître le pic de l'ensemble. Les révisions de cache distinguent les nouveaux rendus des anciens ; les packs et brouillons sont conservés.

## Vérification

- `npm test`, `npm run lint`, `npm run build` ; `bash android/build.sh --check` avec JDK/SDK. La CI Android signe et vérifie l'APK sur émulateur, notamment la mise à jour et la lecture de Siwis Piper hors réseau.
- Dans une PWA de test : installer Siwis, couper le réseau, recharger, lire « Tu viens ce soir ? » puis « Vraiment ? ». Vérifier arrêt pendant la préparation, pause/reprise, sauts, changement de source, lèvres, silence des lignes `$` et vidéo avec piste audio. Rejouer sans vider le cache des modèles.
- Sur les mêmes 1 000 graphies du banc, 833 transcriptions correspondent strictement à une référence, contre 775 avant. Les écarts prioritaires passent de 118 à 59 ; ce ne sont pas des erreurs confirmées à l'écoute. Les fichiers de référence Lexique 3.83 ne font pas partie de la distribution.
- Sur le **même PCM Siwis** de « Tu viens ce soir ? », les fenêtres d'analyse de finale passent de 189 → 145 Hz à 189 → 218 Hz, et la parole dure 865 → 935 ms (hors pause). Sur « Vraiment ? » corrigé, la montée 210 → 264 Hz est laissée telle quelle. Le Java et le JavaScript donnent le même PCM sur ces deux prises, à plage de détection identique. Les contours de nouvelles synthèses peuvent varier.

Ces mesures sont des contrôles hôte et émulateur, pas un benchmark du Redmi.
