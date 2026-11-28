// Partition visuelle locale des planches, dans leurs coordonnées SVG 420 × 248.
// Chaque geste nomme ce qu'on écoute, une zone utile et, si le dessin en montre un, un trajet.
// `suite` autorise les locutions explicites à prolonger une planche déjà active (jamais à la déclencher seule).
const e = (mots, zone, trajet = null, suite = '') => ({ mots, zone, trajet, suite });
export const ID_CONDENSATION = 'meteo-cycle-condensation';

export const SCENARIOS = {
  'code-source': [
    e('instructions|editeur|programme|source code|editor|instructions', [43, 34, 251, 165], null, 'lignes de code|editeur de code|lines of code'),
    e('affiche|afficher|resultat|sortie|output|result', [316, 105, 79, 84], [286, 153, 313, 148], 'resultat s affiche|affiche le resultat|output is displayed'),
  ],
  'web-mobile': [
    e('ordinateur|grand ecran|bureau|desktop|wide screen', [53, 22, 269, 169], null, 'version de bureau|ecran de l ordinateur|desktop layout'),
    e('mobile|telephone|petit ecran|phone|small screen', [273, 83, 112, 143], null, 'mise en page s adapte|petit ecran du telephone|mobile layout'),
  ],
  systeme: [
    e('applications|logiciels|apps|software', [75, 42, 310, 60], null, 'couche des applications|application layer'),
    e('systeme|systeme d exploitation|operating system', [75, 101, 310, 62], null, 'couche du systeme|operating system layer'),
    e('materiel|composants|hardware', [75, 157, 310, 61], null, 'gere le materiel|couche materielle|hardware layer'),
  ],
  cybersecurite: [
    e('protection|bouclier|defense|shield|defence', [124, 28, 180, 195], null, 'bouclier de protection|security shield'),
    e('verrou|protege|controle des acces|verrouille|lock|access control', [178, 79, 66, 85], null, 'controle des acces|protege les donnees|access control'),
  ],
  'analyse-donnees': [
    e('tableau|donnees sources|lignes|table|source data', [47, 48, 138, 154], null, 'tableau source|tableau de donnees|source data table'),
    e('tendance|graphique|visualisation|trend|chart', [216, 24, 167, 174], [178, 138, 211, 138], 'courbe de tendance|tendance du graphique|trend line'),
  ],
  'base-sql': [
    e('stockage|stocke|stockees|serveur|storage|stored', [36, 62, 118, 137], null, 'stocke les enregistrements|stores records'),
    e('table|lignes|colonnes|rows|columns', [205, 43, 196, 150], [149, 123, 185, 123, 205, 103], 'lignes et les colonnes|lignes et colonnes|rows and columns'),
  ],
  'modele-ia': [
    e('exemples|donnees d entrainement|training examples|training data', [22, 65, 94, 129], null, 'donnees d entrainement|exemples d entrainement|training data'),
    e('modele|apprentissage|model|training', [155, 30, 116, 152], [115, 124, 152, 108], 'entraine le modele|apprend des exemples|trains the model'),
    e('sortie|prediction|resultat|output|prediction', [304, 80, 89, 72], [270, 117, 300, 117], 'sortie du modele|fait une prediction|model output'),
  ],
  cloud: [
    e('serveurs|serveur|infrastructure|servers|server', [109, 125, 203, 89], null, 'ressources des serveurs|serveurs distants|remote servers'),
    e('cloud|nuage|distant|distance|remote', [101, 6, 218, 117], [210, 126, 210, 109], 'ressources distantes|hebergees a distance|remote resources'),
  ],
  processeur: [
    e('carte|connexions|pistes|board|connections|traces', [49, 23, 329, 216], [77, 164, 120, 164, 120, 146, 158, 139], 'pistes de la carte|pistes relient|board traces'),
    e('puce|calcul|processeur|chip|processor', [145, 84, 126, 114], null, 'puce de calcul|puce du processeur|processor chip'),
  ],
  interface: [
    e('navigation|menu|navigation menu', [55, 74, 76, 124], null, 'menu de navigation|navigation menu'),
    e('contenu|panneau|content|panel', [132, 66, 184, 123], null, 'panneau de contenu|content panel'),
    e('bouton|ouvrir|controle|button|open', [258, 113, 79, 49], [346, 174, 324, 150, 312, 143], 'clique sur le bouton|clicks the button'),
  ],
  'test-unitaire': [
    e('resultat attendu|valeur attendue|expected result|expected value', [35, 61, 147, 122], null, 'resultat attendu|valeur attendue|expected result'),
    e('resultat obtenu|valeur obtenue|actual result|actual value', [255, 61, 155, 122], null, 'resultat obtenu|valeur obtenue|actual result'),
    e('compare|comparaison|test reussi|compare|passes', [183, 91, 67, 117], null, 'compare les deux valeurs|compares the values'),
  ],
  'algorithme-tri': [
    e('ordre de depart|avant|entree|unsorted|input', [21, 71, 181, 108], null, 'valeurs de depart|valeurs en desordre|unsorted values'),
    e('ordre croissant|apres|resultat|sorted|ascending', [230, 71, 180, 108], [194, 123, 226, 123], 'ordre croissant|valeurs triees|ascending order'),
  ],
  'circuit-imprime': [
    e('pastille|pastilles|contacts|pads|terminals', [62, 56, 67, 122], null, 'pastilles de connexion|contact pads'),
    e('piste|pistes|connexion|trace|traces', [75, 61, 157, 48], [76, 68, 134, 68, 170, 95, 180, 95], 'pistes relient les composants|pistes conductrices|conductive traces'),
    e('composant|puce|component|chip', [178, 72, 77, 89], null, 'composant sur la carte|component on the board'),
  ],
  'circuit-electrique': [
    e('source|pile|batterie|battery|power source', [60, 96, 113, 67], null, 'pile alimente|pile fournit l energie|battery supplies power'),
    e('lampe|allume|lamp|bulb', [274, 86, 102, 85], [84, 97, 84, 55, 318, 55, 318, 88], 'lampe s allume|ampoule s allume|lamp lights up'),
    e('boucle fermee|circuit ferme|retour|closed loop|return path', [62, 47, 292, 156], [318, 144, 318, 184, 84, 184, 84, 129], 'courant revient a la pile|ferme la boucle|boucle est fermee|current returns to the battery|closed loop'),
  ],
  circulation: [
    e('coeur|pompe|heart|pumps', [168, 105, 91, 77], null, 'coeur pompe|heart pumps'),
    e('poumons|pulmonaire|lungs|pulmonary', [111, 14, 220, 105], null, 'sang va aux poumons|sang passe par les poumons|blood flows to the lungs'),
    e('corps|organes|systemique|body|organs|systemic', [111, 143, 220, 95], null, 'sang circule dans le corps|blood flows to the body'),
  ],
  surveillance: [
    e('personne|patient|observe|observation|person|observe', [49, 32, 177, 190], null, 'observe le patient|observer le patient|observe the patient'),
    e('noter|fiche|note|noter les observations|record', [226, 57, 169, 107], null, 'note les observations|fiche d observation|records the observations'),
    e('transmettre|transmission|transmet|report|handover', [233, 139, 154, 48], null, 'transmet les observations|reports the observations'),
  ],
  fraction: [
    e('parts egales|unite|disque|equal parts|whole', [38, 38, 183, 188], null, 'divise en parts egales|decoupe en parts egales|divided into equal parts'),
    e('numerateur|trois parts|numerator|three parts', [259, 49, 126, 77], null, 'trois parts colorees|numerateur indique|three shaded parts'),
    e('denominateur|quatre parts|denominator|four parts', [257, 118, 129, 81], null, 'denominateur indique|denominator shows'),
  ],
  triangle: [
    e('angle droit|90 degres|coin droit|right angle|90 degrees', [87, 146, 96, 49], null, 'angle droit|forme un angle droit|right angle'),
    e('hypotenuse|cote oppose|hypotenuse|opposite side', [96, 46, 239, 142], [98, 61, 326, 180], 'cote oppose a l angle droit|cote oppose est l hypotenuse|opposite the right angle'),
  ],
  frise: [
    e('avant|debut|premier|before|first', [51, 88, 112, 83], null, 'premier evenement|evenement le plus ancien|earliest event'),
    e('evenement|repere|event|milestone', [158, 66, 110, 101], [106, 124, 208, 124], 'repere sur la frise|marque une date|event on the timeline'),
    e('apres|suite|after|later', [255, 88, 109, 83], [208, 124, 307, 124], 'evenement le plus recent|latest event'),
  ],
  vente: [
    e('objet|produit|bien|object|goods', [39, 71, 339, 72], [265, 115, 151, 115], 'vendeur remet l objet|acheteur recoit l objet|buyer receives the item'),
    e('paiement|paye|argent|payment|money', [39, 137, 339, 73], [151, 169, 265, 169], 'acheteur paie|vendeur recoit le paiement|buyer pays'),
  ],
  'informatique-systemes-repertoire-courant': [
    e('atelier|dossier de depart|point de depart|starting folder', [42, 69, 162, 44], null, 'depuis le dossier atelier|starts in the workshop folder'),
    e('notes|dossier courant|repertoire courant|working directory', [98, 120, 272, 57], [73, 109, 73, 148, 96, 148], 'entre dans le dossier notes|opens the notes folder'),
    e('pwd|affiche le chemin|show the path', [30, 198, 360, 32], null, 'affiche le chemin du dossier courant'),
  ],
  'informatique-systemes-permissions-de-fichier': [
    e('lire|lecture|read', [164, 53, 53, 137], null, 'droit de lire|colonne lire|read permission'),
    e('ecrire|ecriture|write', [238, 53, 64, 137], null, 'droit d ecrire|colonne ecrire|write permission'),
    e('executer|execution|execute', [307, 53, 82, 137], null, 'droit d executer|colonne executer|execute permission'),
  ],
  'informatique-reseaux-adresse-ip': [
    e('adresse|ipv4|address', [44, 58, 330, 71], null, 'adresse ipv4|adresse d exemple|ipv4 address'),
    e('interface|appareil|interface reseau|device|network interface', [166, 155, 87, 58], [209, 126, 209, 152], 'interface reseau de l appareil|device network interface'),
  ],
  'informatique-cyber-authentification-a-deux-facteurs': [
    e('mot de passe|connaissance|ce que je sais|password|knowledge factor', [23, 64, 184, 112], null, 'facteur de connaissance|knowledge factor'),
    e('possession|application de verification|ce que j ai|possession factor|authenticator app', [219, 64, 178, 112], null, 'application de verification|possession factor'),
  ],
  'soins-surveillance-tension-arterielle': [
    e('systolique|maximum|systolic|peak', [33, 63, 349, 31], [47, 84, 285, 84], 'valeur systolique|pression maximale|systolic value'),
    e('diastolique|minimum|diastolic|lowest', [33, 149, 349, 28], [47, 162, 285, 162], 'valeur diastolique|pression minimale|diastolic value'),
  ],
  'physique-ondes-longueur-donde': [
    e('sommet|sommets|crete|cretes|crests|peaks', [76, 78, 188, 30], null, 'deux sommets consecutifs|deux cretes consecutives|two adjacent crests'),
    e('longueur d onde|distance|lambda|wavelength', [76, 48, 190, 39], [93, 68, 160, 68, 181, 68, 247, 68], 'distance entre les deux sommets|distance between crests'),
  ],
  'chimie-analyse-echelle-de-ph': [
    e('acide|acidite|acid|acidic', [27, 62, 164, 103], null, 'ph inferieur a sept|ph below seven'),
    e('neutre|neutralite|ph 7|neutral', [182, 62, 56, 104], null, 'ph neutre|ph egal a sept|neutral ph'),
    e('basique|basicite|alkalin|basic|alkaline', [238, 62, 155, 103], null, 'ph superieur a sept|ph above seven'),
  ],
  'histoire-sources-source-primaire': [
    e('lettre|document|source directe|letter|primary document', [27, 65, 153, 122], null, 'lettre datee|document d epoque|dated letter|contemporary document'),
    e('question|autrice|auteur|voyage|question|author|journey', [222, 65, 175, 122], [181, 126, 220, 126], 'question etudiee|historical question'),
  ],
  'temps-heure-fuseau-horaire': [
    e('midi|douze heures|utc 0|noon|twelve', [35, 66, 152, 120], null, 'midi a utc|il est midi ici|noon in utc'),
    e('quatorze heures|utc 2|decalage|offset|fourteen', [229, 66, 153, 120], null, 'quatorze heures la bas|decalage horaire|time offset'),
    e('meme instant|simultane|same instant|same time', [105, 184, 208, 43], [107, 197, 107, 203, 312, 203, 312, 197], 'meme instant dans les deux zones|two clocks show the same instant'),
  ],
  [ID_CONDENSATION]: [
    e('verre froid|paroi froide|surface froide|refroidit|refroidissement|cold glass|cold surface|cools down', [217, 52, 157, 164], null, 'verre froid|paroi froide|surface froide|cold glass|cold surface'),
    e('gouttes se forment|gouttes apparaissent|gouttelettes se forment|gouttelettes apparaissent|de petites gouttes|se condense|droplets form|drops form|drops appear', [252, 74, 139, 134], null, 'gouttes se forment|gouttes apparaissent|gouttelettes se forment|gouttelettes apparaissent|droplets form|drops form|drops appear'),
    e('se rejoignent|se rassemblent|fusionnent|se regroupent|coalescence|merge|join together', [262, 96, 123, 104], null, 'gouttes se rejoignent|gouttes se rassemblent|gouttelettes se rejoignent|gouttes fusionnent|droplets merge|drops merge'),
    e('glissent|glisse|ruissellent|ruisselle|coulent|coule le long|run down|slide down', [284, 110, 89, 112], null, 'glissent sur le verre|glissent vers le bas|glissent le long|coulent le long de la paroi|coulent le long du verre|gouttes glissent|droplets run down|drops slide down'),
  ],
  'astronomie-orbites-periode-orbitale': [
    e('tour|orbite|tour complet|orbit|revolution', [64, 69, 263, 132], [88, 130, 88, 110, 114, 87, 165, 72, 217, 71, 270, 84, 308, 109, 322, 129, 307, 154, 270, 177, 212, 187, 152, 177, 108, 155, 88, 130], 'fait un tour complet|parcourt son orbite|completes one orbit'),
    e('repere|revient|retour|temps ecoule|reference point|returns|elapsed time', [305, 109, 94, 49], null, 'revient au meme point|returns to the starting point'),
  ],
  'litterature-narration-focalisation-externe': [
    e('geste|observable|ouvre la lettre|actions|visible|opens the letter', [24, 68, 177, 123], null, 'elle ouvre la lettre|indices observables|observable details'),
    e('pensees|sentiments|interieur|thoughts|feelings', [218, 68, 177, 123], null, 'pensees du personnage|character s thoughts'),
  ],
  'humour-rythme-chute-dune-blague': [
    e('mise en place|attente|escargot|express|setup|expectation', [24, 59, 370, 69], null, 'mise en place de la blague|setup of the joke'),
    e('chute|annee prochaine|surprise|punchline|next year', [24, 143, 370, 78], null, 'chute de la blague|punchline of the joke'),
  ],
  'sociologie-culture-norme-sociale': [
    e('file|attendent|attente|ordre d arrivee|queue|line up', [78, 84, 153, 112], null, 'forment une file|attendent en file|form a queue'),
    e('tour|premier|guichet|turn|counter', [190, 83, 186, 107], [217, 157, 262, 157], 'attendre son tour|attend son tour|waits their turn'),
  ],
  'mobilite-transports-tranchee-couverte': [
    e('ouvre|ouvrir|creuse|creuser|excavation|excaver|dig|excavate', [22, 62, 118, 131], [81, 116, 81, 150], 'ouvre la chaussee|ouvre la rue|excave depuis la rue|excavate the street'),
    e('batit|batir|construit|construire|pose le tunnel|builds|build the tunnel', [151, 62, 118, 131], [185, 163, 185, 125, 234, 125, 234, 163], 'construit le tunnel|pose le tunnel|construire le tunnel|builds the tunnel'),
    e('recouvre|couvre|couvrir|referme|retablit|retablissement|restores|covers', [280, 62, 118, 131], [291, 111, 387, 111], 'referme la rue|retablit la chaussee|recouvre le tunnel|restores the street'),
  ],
  'informatique-systemes-arborescence-de-fichiers': [
    e('parent|dossier projet|projet|parent folder', [170, 51, 84, 67], null, 'sous le dossier projet|under the project folder'),
    e('textes|enfant|branche|child|branch', [76, 151, 62, 74], [210, 119, 210, 136, 106, 136, 106, 152], 'branche textes|dossier textes|text folder'),
    e('images|autre enfant|meme niveau|images folder|same level', [275, 151, 70, 74], [210, 119, 210, 136, 313, 136, 313, 152], 'branche images|dossier images|image folder'),
  ],
  'informatique-systemes-chemin-absolu': [
    e('racine|barre oblique|depuis la racine|root|slash', [27, 67, 75, 111], null, 'part de la racine|barre initiale|starts at the root'),
    e('dossiers|exemple|atelier|folders|directories', [103, 65, 151, 114], [93, 110, 106, 110], 'traverse les dossiers|passes through the folders'),
    e('fichier|jour txt|destination|file', [268, 65, 129, 114], [250, 110, 269, 110], 'atteint le fichier|reaches the file'),
  ],
  'informatique-systemes-chemin-relatif': [
    e('atelier|dossier courant|point de depart|working directory', [31, 67, 360, 58], null, 'part du dossier courant|starts in the current folder'),
    e('notes|dossier notes|subfolder', [105, 129, 139, 53], [76, 111, 76, 155, 107, 155], 'passe par le sous dossier notes|through the notes subfolder'),
    e('fichier|jour txt|chemin relatif|file|relative path', [281, 124, 98, 75], [241, 154, 276, 154], 'fichier dans notes|file in the notes folder'),
  ],
  'informatique-systemes-dossier-parent': [
    e('atelier|dossier courant|point de depart|current folder', [124, 122, 179, 56], null, 'dossier atelier|workshop folder'),
    e('deux points|point point|remonte d un niveau|remonter d un niveau|double dot|one level up', [119, 187, 186, 39], [312, 149, 329, 149, 343, 142, 347, 130, 347, 107, 340, 94, 329, 88, 312, 88], 'remonte d un niveau|remonter d un niveau|deux points consecutifs|one level up'),
    e('dossier personnel|dossier qui le contient|dossier parent|parent directory|home folder', [59, 59, 247, 57], null, 'dossier qui le contient|its containing folder'),
  ],
  'informatique-systemes-fichier-cache': [
    e('liste ordinaire|masque|invisible|hidden|regular listing', [22, 61, 183, 129], null, 'liste ordinaire masque|fichiers masques par defaut|hidden by default'),
    e('ls a|brouillon|point initial|nom commence par un point|dotfile|show hidden', [216, 61, 181, 129], null, 'liste affiche aussi|affiche les fichiers caches|show hidden files'),
  ],
  'informatique-systemes-variable-denvironnement': [
    e('variable|lang|valeur|langue|value|language', [26, 70, 245, 104], null, 'nom et une valeur|variable lang|name and value'),
    e('programme|application|lit|program|reads', [303, 84, 100, 107], [271, 118, 303, 118], 'programme lit la variable|program reads the variable'),
  ],
  'informatique-systemes-redirection-de-sortie': [
    e('sortie standard|programme|ecran|standard output|screen', [25, 49, 365, 109], [156, 132, 205, 132, 205, 85, 256, 85], 'sortie standard va a l ecran|standard output goes to the screen'),
    e('fichier|redirige|redirection|file|redirects', [257, 135, 144, 63], [207, 132, 254, 174], 'redirige vers un fichier|redirects to a file'),
  ],
  'informatique-systemes-gestionnaire-de-paquets': [
    e('depot|source|repository|source packages', [25, 83, 117, 63], null, 'paquets du depot|packages from the repository'),
    e('gestionnaire|dependances|verifie|manager|dependencies|verifies', [147, 83, 124, 63], [140, 115, 151, 115], 'verifie les dependances|checks the dependencies'),
    e('installe|application|logiciel|installs|application', [281, 83, 117, 63], [268, 115, 284, 115], 'installe le paquet|installs the package'),
  ],
  'informatique-systemes-terminal-sur-android': [
    e('telephone|android|application|phone|app', [34, 52, 124, 158], null, 'application terminal|terminal app'),
    e('saisie|commande|entree|input|command', [191, 69, 195, 40], [152, 108, 188, 108], 'saisit une commande|types a command'),
    e('sortie|affiche|resultat|output|response', [52, 107, 90, 56], null, 'lignes de sortie|output lines'),
  ],
  'informatique-systemes-espace-utilisateur-termux': [
    e('android|limites|systeme|boundaries|system', [25, 56, 371, 151], null, 'systeme android reste separe|android system stays separate'),
    e('termux|outils|travail|espace utilisateur|tools|workspace', [42, 90, 339, 100], null, 'fichiers de travail|outils de termux|termux files'),
  ],
  'informatique-systemes-historique-des-commandes': [
    e('saisies|historique|commandes precedentes|previous commands|history', [30, 61, 359, 130], null, 'liste des commandes precedentes|list of previous commands'),
    e('pwd|premiere saisie|first entry', [34, 92, 350, 31], null, 'premiere commande saisie|first command entered'),
    e('date|derniere saisie|last entry', [34, 149, 350, 33], null, 'derniere commande saisie|last command entered'),
  ],
  'informatique-cyber-moindre-privilege': [
    e('consultation|lire|lecture seule|read only|view only', [27, 72, 135, 127], null, 'role de consultation|autorise la lecture seule|allows read only access'),
    e('modifier|administrer|restreint|edit|administer|restricted', [154, 121, 242, 79], null, 'droit de modification reserve|editing rights restricted'),
  ],
  'informatique-cyber-mise-a-jour-de-securite': [
    e('version a|ancienne version|avant|old version|before', [31, 69, 152, 110], null, 'version vulnerable|ancienne version du logiciel|old version of the software'),
    e('version b|corrigee|correctif|patch|updated version|fixed version', [239, 69, 153, 110], [184, 127, 231, 127], 'installe le correctif|version corrigee|installs the patch'),
  ],
  'informatique-cyber-chiffrement-du-stockage': [
    e('document|donnees|data|document', [28, 68, 136, 115], null, 'donnees avant chiffrement|unencrypted data'),
    e('support chiffre|support protege|verrouille|encrypted storage|locked', [255, 68, 137, 115], [159, 120, 252, 120], 'support chiffre reste verrouille|support chiffre|encrypted drive'),
  ],
  'informatique-cyber-recuperation-de-compte': [
    e('demande|service|request|official service', [26, 71, 113, 115], null, 'demande de recuperation|recovery request'),
    e('verifie|verification d identite|controle|identity check', [152, 71, 111, 115], [139, 129, 151, 129], 'identite verifiee|service verifie l identite|identity is verified'),
    e('acces retabli|retour au compte|restored access|return to account', [281, 71, 110, 115], [264, 129, 280, 129], 'acces au compte retabli|account access restored'),
  ],
  'informatique-cyber-sauvegarde-hors-ligne': [
    e('original|systeme courant|original copy|working system', [49, 89, 100, 97], null, 'exemplaire de travail|working copy'),
    e('copie isolee|hors ligne|deconnectee|offline copy|isolated copy', [274, 87, 95, 100], null, 'copie isolee|copie deconnectee|isolated backup'),
    e('liaison interrompue|separee|connexion interrompue|disconnected', [145, 96, 129, 44], null, 'liaison interrompue|backup drive disconnected'),
  ],
  'informatique-reseaux-nom-de-domaine': [
    e('nom|domaine|nom de domaine|domain name', [23, 81, 135, 98], null, 'nom lisible|human readable name'),
    e('dns|resolution|resolu|resolve|lookup', [181, 85, 52, 54], [157, 109, 178, 109], 'resout le nom|dns cherche|dns lookup'),
    e('adresse|adresse ip|address', [262, 81, 136, 98], [230, 109, 257, 109], 'renvoie l adresse ip|returns the ip address'),
  ],
  'informatique-reseaux-certificat-tls': [
    e('serveur|identite|certificat presente|server|identity', [25, 71, 105, 114], null, 'certificat presente|server presents a certificate'),
    e('nom attendu|nom de domaine|hostname|expected name', [138, 65, 266, 33], [99, 113, 129, 113], 'nom attendu|nom dans le certificat|expected hostname'),
    e('validite|date|validity|valid until', [138, 99, 266, 32], null, 'date de validite|period of validity'),
    e('chaine de confiance|autorite|trust chain|certificate authority', [138, 132, 266, 38], null, 'chaine de confiance|chain of trust'),
  ],
  'informatique-reseaux-point-dacces-wi-fi': [
    e('point d acces|borne|access point', [25, 81, 129, 94], null, 'la borne diffuse|access point broadcasts'),
    e('radio|sans fil|appareils|wireless|devices', [258, 59, 93, 137], [138, 114, 166, 94, 205, 80, 256, 79], 'liaison radio|liaison sans fil|wireless link'),
    e('reseau|liaison filaire|network|wired link', [17, 178, 273, 36], [28, 143, 24, 143, 24, 196, 143, 196], 'liaison filaire|wired uplink'),
  ],
  'informatique-reseaux-latence-reseau': [
    e('requete|aller|request', [111, 61, 187, 38], [109, 92, 299, 92], 'requete est envoyee|request is sent'),
    e('reponse|revient|response|reply', [112, 123, 186, 34], [299, 125, 109, 125], 'reponse revient|reply comes back'),
    e('aller retour|duree totale|millisecondes|round trip|milliseconds', [50, 168, 324, 52], null, 'temps d un aller retour|temps aller retour|round trip time'),
  ],
  'informatique-materiel-cle-usb': [
    e('connecteur|contacts|connector|contacts', [50, 92, 76, 81], null, 'contacts du connecteur|usb connector contacts'),
    e('controleur|transfert|controller', [133, 95, 94, 63], null, 'controleur de la cle|flash drive controller'),
    e('memoire|stockage|memory|storage', [255, 94, 73, 67], [225, 129, 261, 129], 'puce memoire|memory chip'),
  ],
  'informatique-dev-boucle-for': [
    e('deux|premiere iteration|2|first iteration|two', [26, 57, 84, 150], [68, 112, 68, 146], 'premiere iteration|first iteration'),
    e('quatre|deuxieme iteration|4|second iteration|four', [168, 57, 84, 150], [210, 112, 210, 146], 'deuxieme iteration|second iteration'),
    e('six|troisieme iteration|6|third iteration|six', [310, 57, 84, 150], [352, 112, 352, 146], 'troisieme iteration|third iteration'),
  ],
  'vue-optique': [
    e('incident|arrive|incident ray|incoming ray', [42, 26, 160, 110], [75, 49, 195, 121], 'rayon incident|rayon arrive sur l eau|incident ray'),
    e('reflexion|reflechi|rebondit|reflection|reflected', [197, 25, 159, 105], [195, 121, 315, 49], 'rayon reflechi|rayon rebondit|reflected ray'),
    e('refraction|refracte|entre dans l eau|refraction|refracted', [182, 122, 175, 103], [195, 121, 235, 213], 'rayon refracte|rayon entre dans l eau|refracted ray'),
  ],
  'vue-etats-matiere': [
    e('solide|fusion|solidification|solid|melting', [24, 69, 116, 116], null, 'particules du solide|particles in the solid'),
    e('liquide|liquefaction|liquid', [146, 69, 120, 116], [82, 61, 200, 61], 'devient liquide|particules du liquide|becomes liquid'),
    e('gaz|vaporisation|gazeux|gas|vaporisation|vaporization', [272, 69, 128, 116], [211, 61, 333, 61], 'particules du gaz|particles in the gas'),
  ],
  'vue-ecologie': [
    e('vegetaux|vegetal|plantes|plants', [21, 73, 92, 113], null, 'mangent les plantes|eat the plants'),
    e('criquet|chenille|consommateur|grasshopper|caterpillar', [159, 23, 102, 202], [103, 108, 127, 80, 169, 61, 191, 57], 'le criquet|la chenille|the grasshopper'),
    e('oiseau|se nourrit|bird|feeds on', [301, 76, 106, 115], [256, 156, 288, 145, 321, 125], 'oiseau mange|bird eats'),
  ],
  'vue-chronometrage': [
    e('huit heures vingt|8 h 20|depart|start time', [45, 37, 145, 156], null, 'heure de depart|start time'),
    e('huit heures trente cinq|8 h 35|arrivee|end time', [241, 37, 146, 156], null, 'heure d arrivee|finish time'),
    e('duree|quinze minutes|ecart|duration|fifteen minutes', [107, 186, 206, 48], [113, 203, 309, 203], 'quinze minutes se sont ecoulees|fifteen minutes have passed'),
  ],
  'vue-cartographie': [
    e('courbes de niveau|altitude|relief|contours|elevation', [26, 24, 220, 192], null, 'courbes de niveau|contour lines'),
    e('riviere|eau|river|stream', [223, 25, 77, 190], [273, 29, 259, 57, 268, 87, 267, 112, 251, 137, 241, 167, 249, 204], 'riviere traverse le relief|river crosses the terrain'),
    e('nord|echelle|cent metres|100 m|north|scale', [303, 37, 94, 169], null, 'fleche indique le nord|arrow points north'),
  ],
  'vue-cycle-eau': [
    e('evaporation|evapore|evaporation|evaporates', [23, 42, 147, 179], [67, 153, 76, 138, 78, 116, 80, 98, 97, 78, 119, 69, 138, 65], 'eau s evapore|eau de la mer s evapore|water evaporates'),
    e('condensation|condense|nuage|condenses|cloud', [133, 19, 121, 74], null, 'forme un nuage|forme des nuages|forms clouds'),
    e('pluie|precipitations|tombe|rain|precipitation', [246, 62, 142, 72], [255, 85, 265, 112], 'pluie tombe|eau retombe en pluie|rain falls'),
    e('ruissellement|ruisselle|retour a la mer|runoff|flows back', [140, 130, 226, 89], [279, 149, 264, 162, 239, 175, 211, 183, 191, 188], 'retourne a la mer|eau ruisselle|returns to the sea'),
  ],
  'vue-systeme-solaire': [
    e('rocheuses|mercure|venus|terre|mars|rocky planets', [24, 38, 373, 92], [68, 72, 157, 72, 254, 72, 345, 72], 'planetes rocheuses|rocky planets'),
    e('geantes|jupiter|saturne|uranus|neptune|giant planets', [24, 132, 373, 89], [68, 175, 157, 175, 252, 175, 345, 175], 'planetes geantes|anneaux de saturne|giant planets'),
  ],
  'vue-point-de-vue': [
    e('interne|crainte|s inquiete|focalisation interne|internal|worries', [15, 23, 189, 194], null, 'ressent le personnage|personnage ressent|character feels'),
    e('externe|geste|ouvre la lettre|focalisation externe|external|opens the letter', [214, 23, 190, 194], null, 'geste visible|elle ouvre la lettre|she opens the letter'),
  ],
  'vue-grammaire': [
    e('sujet|classe|eleves|subject', [21, 46, 125, 139], null, 'sujet de la phrase|subject of the sentence'),
    e('verbe|observe|observent|verb', [152, 46, 120, 139], null, 'verbe de la phrase|verb of the sentence'),
    e('accord|pluriel|change|agreement|plural', [22, 131, 377, 59], [75, 191, 100, 204, 155, 208, 203, 206, 227, 188], 'verbe s accorde|passage au pluriel|verb agrees'),
  ],
  'vue-jeux-de-mots': [
    e('sens|souris|double sens|meaning|mouse', [84, 31, 257, 94], null, 'deux sens du mot|two meanings of the word'),
    e('sons|homophones|vert|verre|homophones|same sound', [109, 135, 243, 84], [224, 163, 246, 163], 'mots se prononcent pareil|sons identiques|words sound the same'),
  ],
  'vue-groupes-sociaux': [
    e('famille|family', [25, 27, 222, 196], null, 'appartient a la famille|belongs to the family'),
    e('association|groupe|club|community', [176, 27, 219, 196], null, 'fait partie du club|belongs to the club'),
    e('deux groupes|intersection|recoupent|both groups|overlap', [175, 69, 76, 117], null, 'appartient aux deux groupes|belongs to both groups'),
  ],
  'vue-memoire': [
    e('encode|encoder|observe|encodage|encode|observe', [27, 51, 122, 134], null, 'encode l information|encodes the information'),
    e('garde|conserve|conserver|stockage|store|retain', [157, 52, 112, 134], [142, 112, 157, 112], 'trace conservee|retains the information'),
    e('rappelle|rappeler|rappel|souvenir|recall|remember', [279, 52, 117, 134], [265, 112, 278, 112], 'se rappelle l image|recalls the image'),
  ],
  'vue-argument': [
    e('premiere premisse|tous les carres|first premise|all squares', [25, 46, 185, 94], null, 'premiere premisse|first premise'),
    e('seconde premisse|deuxieme premisse|cette figure|second premise', [218, 46, 178, 94], null, 'seconde premisse|deuxieme premisse|second premise'),
    e('conclusion|donc|quatre cotes|conclusion|therefore', [78, 182, 268, 42], [118, 138, 137, 161, 189, 181], 'en tire la conclusion|draws the conclusion'),
  ],
  'vue-contrats': [
    e('accord|contrat|document|agreement|contract', [163, 26, 89, 85], null, 'les deux engagements|both commitments'),
    e('preter|pret|livre|lend|book', [108, 96, 207, 47], [130, 121, 288, 121], 'livre emprunte|prete le livre|lends the book'),
    e('rendre|restitue|retour|return the book|gives back', [106, 141, 208, 42], [288, 162, 131, 162], 'rend le livre|rendre le livre|returns the book'),
  ],
  'vue-budget': [
    e('recettes|entrees|recoit|income|receives', [27, 42, 367, 47], null, 'les dix unites|dix unites de recettes|ten units of income'),
    e('depenses|sorties|depense|expenses|spends', [27, 91, 367, 47], null, 'depense sept unites|spends seven units'),
    e('reste|solde|restantes|balance|remaining', [27, 139, 367, 52], null, 'trois unites restantes|three units remain'),
  ],
  'vue-musique': [
    e('pulsation|temps reguliers|pulse|regular beats', [26, 49, 365, 39], [137, 68, 193, 68, 249, 68, 305, 68], 'temps reguliers|regular beats'),
    e('rythme|deux temps|rythmique|rhythm|two beats', [26, 92, 365, 56], null, 'son dure deux temps|note lasts two beats'),
    e('tempo|rapide|lent|tempo|faster|slower', [44, 164, 330, 62], null, 'tempo plus rapide|tempo plus lent|faster tempo'),
  ],
  'vue-evaluation': [
    e('observer|premier essai|erreur|observe|first try', [16, 68, 119, 128], null, 'premier groupe de points|first group of dots'),
    e('retour|compter|aide|feedback|count', [143, 68, 120, 128], [132, 118, 144, 118], 'retour donne|retour precise|gives feedback'),
    e('reessayer|nouvel essai|resultat|try again|second try', [271, 68, 127, 128], [260, 118, 275, 118], 'sur le nouvel essai|au deuxieme essai|on the second try'),
  ],
  'vue-mecanismes': [
    e('engrenages|roues dentees|sens opposes|gears|opposite directions', [22, 35, 173, 167], [51, 90, 61, 77, 78, 70, 93, 74, 100, 79], 'roues tournent en sens opposes|gears turn in opposite directions'),
    e('levier|bascule|appui|charge|lever|fulcrum|load', [221, 35, 173, 167], [379, 137, 379, 117], 'point d appui|pivot du levier|lever pivots'),
  ],
  'vue-sols': [
    e('vegetation|surface|plantes|vegetation|surface plants', [32, 33, 353, 41], null, 'vegetation en surface|plants on the surface'),
    e('organique|humus|organic layer', [32, 70, 353, 51], null, 'couche organique|organic layer'),
    e('terre minerale|mineraux|mineral soil', [32, 116, 353, 56], null, 'couche minerale|mineral layer'),
    e('roche|sous sol|bedrock|rock layer', [32, 171, 353, 52], null, 'roche sous le sol|bedrock beneath the soil'),
  ],
  'vue-cuisine': [
    e('couper|morceaux|legumes|chop|cut|vegetables', [17, 40, 123, 189], null, 'coupe les legumes|chops the vegetables'),
    e('melanger|melange|bol|mix|stir|bowl', [145, 40, 128, 189], null, 'melange dans le bol|mixes in the bowl'),
    e('cuire|cuisson|casserole|cook|pot', [279, 40, 125, 189], null, 'cuit dans la casserole|cooks in the pot'),
  ],
  'vue-mobilite': [
    e('marche|marcher|depart|walking|walks|departure', [22, 82, 131, 98], [46, 157, 77, 157, 98, 126, 129, 109], 'marche jusqu a l arret|walks to the stop'),
    e('bus|monte dans le bus|trajet en bus|bus ride', [122, 65, 196, 99], [129, 109, 186, 109, 222, 77, 286, 77], 'monte dans le bus|prend le bus|boards the bus'),
    e('arrivee|descend|dernier troncon|arrival|get off', [288, 66, 107, 107], [286, 77, 321, 83, 338, 108, 356, 121], 'descend du bus|marche jusqu a l arrivee|gets off the bus'),
  ],
  // Nouvelles planches : astronomie, sciences, mathématiques, techniques et terminal.
  'astronomie-phases-lune': [
    e('nouvelle lune|new moon', [17, 80, 89, 104], null,
      'nouvelle lune|new moon'),
    e('premier quartier|first quarter', [112, 80, 99, 120], null,
      'premier quartier|first quarter'),
    e('pleine lune|full moon', [218, 80, 82, 104], null,
      'pleine lune|full moon'),
    e('dernier quartier|troisieme quartier|last quarter', [310, 80, 87, 120], null,
      'dernier quartier|troisieme quartier|last quarter'),
  ],
  'astronomie-eclipse-solaire': [
    e('rayons solaires|soleil eclaire|sunlight reaches', [26, 79, 88, 112], [94, 97, 191, 109],
      'rayons du soleil|rayons solaires|sunlight reaches'),
    e('lune s aligne|passe entre|passe devant|moon passes between', [170, 98, 69, 92], null,
      'la lune passe entre|la lune passe devant|the moon passes between'),
    e('ombre de la lune|ombre atteint|moon s shadow', [224, 78, 166, 115], [222, 124, 317, 124],
      'ombre de la lune|ombre atteint la terre|moon s shadow'),
  ],
  'astronomie-saisons': [
    e('ete au nord|hemisphere nord incline vers le soleil|northern summer', [23, 74, 109, 127], [178, 112, 123, 112],
      'ete au nord|hemisphere nord incline vers le soleil|northern summer'),
    e('hiver au nord|hemisphere nord incline a l oppose|northern winter', [289, 74, 109, 127], [242, 112, 297, 112],
      'hiver au nord|vers le soleil dans le sud|northern winter'),
    e('axe incline|inclinaison|tilted axis', [297, 76, 83, 102], [322, 169, 366, 83],
      'axe incline|axe garde sa direction|tilted axis'),
  ],
  'physique-prisme-optique': [
    e('rayon blanc|lumiere blanche|white light', [22, 80, 136, 89], [29, 106, 176, 106],
      'rayon de lumiere blanche|rayon blanc|white beam'),
    e('verre du prisme|dans le prisme|deviation|inside the prism', [134, 64, 139, 136], [176, 106, 238, 119],
      'verre du prisme|a l interieur du prisme|changes direction inside the prism'),
    e('couleurs se separent|couleurs en sortie|spectre visible|rouge et le violet|colours separate|colors separate', [271, 101, 118, 110], [240, 123, 364, 174],
      'couleurs se separent|rouge et le violet|revele les couleurs|colours separate|colors separate'),
  ],
  'physique-propagation-son': [
    e('source sonore|haut parleur|vibration|speaker|source vibrates', [19, 83, 97, 126], null,
      'haut parleur vibre|source sonore vibre|the speaker vibrates'),
    e('se propage|de proche en proche|variation de pression|pressure wave|travels through the air', [108, 61, 213, 137], [107, 188, 306, 188],
      'de proche en proche|variation de pression|travels through the air'),
    e('oreille|tympan|ear', [323, 93, 72, 116], null,
      'atteint l oreille|tympan vibre|reaches the ear'),
  ],
  'physique-conduction-thermique': [
    e('chaud|zone chaude|extremite chaude|hot end', [32, 61, 114, 110], null,
      'extremite chaude|zone la plus chaude|hot end'),
    e('chaleur se propage|transfert de chaleur|du chaud vers le froid|heat flows', [63, 108, 292, 89], [83, 128, 335, 128],
      'chaleur se propage|du chaud vers le froid|heat flows from'),
    e('froid|zone froide|extremite froide|cold end', [274, 61, 113, 110], null,
      'extremite froide|zone la plus froide|cold end'),
  ],
  'vivant-germination': [
    e('graine gonfle|graine absorbe|seed absorbs|seed swells', [19, 66, 123, 137], null,
      'graine absorbe|graine gonfle|seed absorbs water'),
    e('radicule|racine sort|racine apparait|root emerges', [149, 66, 122, 137], [217, 148, 209, 157, 213, 170, 208, 182],
      'racine sort|racine emerge|radicle emerges|root emerges'),
    e('pousse|tige sort|jeune tige|shoot grows', [277, 66, 123, 137], [338, 146, 337, 131, 338, 111],
      'pousse sort|pousse se developpe|tige sort de terre|shoot grows'),
  ],
  'vivant-photosynthese': [
    e('lumiere du soleil|energie lumineuse|sunlight|light energy', [179, 54, 126, 61], [209, 90, 209, 105],
      'lumiere du soleil|capte la lumiere|light energy'),
    e('dioxyde de carbone|co2|carbon dioxide', [27, 78, 114, 53], [48, 112, 139, 112],
      'dioxyde de carbone|absorbe le co2|carbon dioxide'),
    e('eau absorbee|eau remonte|water from the roots', [91, 144, 95, 58], [166, 194, 168, 167, 182, 145],
      'eau remonte|eau des racines|water from the roots'),
    e('sucres|sugars', [203, 166, 171, 38], null,
      'fabrique des sucres|produit des sucres|produces sugars'),
    e('dioxygene|oxygene|oxygen', [267, 74, 117, 55], [267, 109, 365, 109],
      'libere du dioxygene|rejette du dioxygene|releases oxygen'),
  ],
  'vivant-pollinisation': [
    e('pollen preleve|prend du pollen|collects pollen', [40, 99, 103, 127], [91, 124, 119, 108, 161, 100],
      'pollen preleve|prend du pollen|collects pollen'),
    e('abeille|insecte|bee|pollinator', [171, 59, 83, 71], null,
      'abeille transporte|insecte transporte le pollen|the bee carries pollen'),
    e('pollen depose|depose du pollen|stigmate|deposits pollen', [299, 99, 92, 127], [257, 103, 296, 107, 330, 126],
      'pollen depose|depose du pollen|deposits pollen'),
  ],
  'vivant-respiration-pulmonaire': [
    e('inspiration|air entre|diaphragme s abaisse|inhalation|air enters', [20, 63, 181, 142], [110, 105, 110, 135, 85, 156],
      'air entre dans les poumons|diaphragme s abaisse|air enters the lungs'),
    e('expiration|air ressort|diaphragme remonte|exhalation|air leaves', [219, 63, 182, 142], [335, 156, 310, 135, 310, 105],
      'air ressort|diaphragme remonte|air leaves the lungs'),
  ],
  'math-symetrie-axiale': [
    e('axe de symetrie|ligne de pliage|axis of symmetry', [185, 58, 50, 140], [210, 63, 210, 191],
      'ligne de pliage|axe passe au milieu|fold line'),
    e('figure en miroir|point image|reflet|mirror image', [251, 61, 112, 105], null,
      'figure en miroir|de l autre cote de l axe|mirror image'),
    e('meme distance|a egale distance|equidistant|equal distance', [116, 64, 187, 42], [123, 89, 210, 89, 297, 89],
      'meme distance de l axe|egale distance de l axe|equal distance from the axis'),
  ],
  'math-pourcentage': [
    e('cent cases|100 cases|cent au total|hundred squares', [40, 58, 166, 164], null,
      'cent cases|100 cases|hundred squares'),
    e('cases colorees|cases teintees|colored squares|shaded squares', [40, 58, 166, 52], null,
      'cases colorees|colorie des cases|shaded squares'),
    e('sur cent|sur 100|sur une base de cent|out of a hundred', [227, 82, 142, 117], null,
      'sur cent|sur 100|out of a hundred'),
  ],
  'math-moyenne': [
    e('additionne|somme des valeurs|add the values|sum of the values', [30, 67, 146, 143], null,
      'additionne les valeurs|somme des valeurs|sum of the values'),
    e('divise|partage le total|divide the total|divide by three', [245, 93, 136, 117], [176, 139, 241, 139],
      'divise par le nombre|divise par trois|partage le total|divide the total'),
  ],
  'math-aire-perimetre': [
    e('perimetre|longueur du contour|contour du rectangle|perimeter|boundary length', [34, 67, 145, 157], [45, 79, 169, 79, 169, 172, 45, 172, 45, 79],
      'longueur du contour|somme des cotes|contour du rectangle|boundary length'),
    e('aire|surface interieure|unites carrees|area of the rectangle|square units', [239, 67, 146, 157], null,
      'surface interieure|unites carrees|a l interieur du rectangle|square units'),
  ],
  'terre-bassin-versant': [
    e('ligne de partage|limite du bassin|ligne de crete|watershed divide', [29, 59, 363, 138], [36, 104, 73, 77, 119, 68, 151, 78, 193, 60],
      'ligne de crete|limite du bassin|watershed divide'),
    e('affluents|cours d eau se rejoignent|rassemblent|tributaries join', [87, 87, 246, 89], [330, 101, 302, 115, 278, 135, 224, 153, 206, 172],
      'cours d eau se rejoignent|affluents rejoignent|tributaries join'),
    e('vers l aval|exutoire|sortie du bassin|outlet', [187, 167, 186, 55], [206, 172, 219, 184, 209, 205],
      'sortie du bassin|meme point de sortie|the same outlet'),
  ],
  'terre-dorsale-oceanique': [
    e('plaques s ecartent|s eloignent|plates move apart', [52, 69, 307, 57], [262, 116, 344, 116],
      'plaques s ecartent|plaques s eloignent|plates move apart'),
    e('magma remonte|magma monte|magma rises', [85, 128, 168, 89], [210, 195, 210, 133],
      'magma remonte|magma monte|magma rises'),
    e('nouvelle croute|se refroidit|new oceanic crust', [141, 107, 139, 47], [210, 110, 228, 114, 247, 129, 285, 139],
      'nouvelle croute|croute oceanique se forme|new crust forms'),
  ],
  'matiere-filtration': [
    e('verse le melange|melange verse|pour the mixture', [25, 57, 128, 54], [67, 80, 109, 80, 151, 89],
      'verse le melange|melange est verse|pour the mixture'),
    e('filtre retient|particules solides|residu|filter traps', [144, 79, 246, 60], null,
      'filtre retient|solide reste dans le filtre|filter traps the solids'),
    e('filtrat|liquide traverse|liquid passes|filtrate', [149, 164, 218, 56], [210, 120, 210, 183, 210, 201],
      'liquide traverse|recueille le filtrat|liquid passes through'),
  ],
  'energie-panneau-photovoltaique': [
    e('rayons du soleil|soleil eclaire|sunlight hits', [23, 73, 99, 101], [91, 104, 145, 104],
      'rayons du soleil|lumiere atteint le panneau|sunlight hits the panel'),
    e('cellules convertissent|cellules transforment|cellules du panneau|cells convert', [128, 79, 141, 106], null,
      'cellules convertissent|cellules transforment|solar cells convert'),
    e('courant alimente|lampe s allume|circuit electrique|powers the lamp', [274, 88, 119, 124], [268, 145, 304, 145, 304, 123, 324, 123],
      'courant alimente|alimente une lampe|powers the lamp'),
  ],
  'matiere-recyclage-papier': [
    e('papier collecte|vieux papier|collecter le papier|collect waste paper', [20, 67, 122, 138], null,
      'vieux papier est collecte|collecter le papier|collect waste paper'),
    e('pate de fibres|pate a papier|mise en pate|paper pulp', [148, 67, 124, 138], [123, 150, 161, 150],
      'pate de fibres|transforme en pate|turned into pulp'),
    e('sechage|feuilles sechees|nouvelles feuilles|new sheets', [275, 67, 126, 138], [255, 150, 297, 150],
      'forme de nouvelles feuilles|feuilles sechees|new sheets are formed'),
  ],
  'informatique-systemes-copier-deplacer': [
    e('copier|copie|original reste|copy|original stays', [22, 87, 376, 50], [242, 112, 314, 112],
      'original reste|cree une copie|original stays'),
    e('deplacer|deplace|fichier quitte|move|file moves', [22, 147, 376, 50], [242, 172, 314, 172],
      'fichier quitte le dossier|change d emplacement|file moves to the destination'),
  ],
  'informatique-systemes-tube-commandes': [
    e('sortie standard|sortie de la premiere|standard output', [24, 125, 130, 75], null,
      'sortie de la premiere commande|first command s output'),
    e('barre verticale|transmet les donnees|vertical bar|passes the data', [148, 65, 125, 111], [151, 165, 270, 165],
      'barre verticale|donnees passent dans le tube|passes along the pipe'),
    e('entree standard|entree de la seconde|standard input', [267, 125, 130, 75], null,
      'entree de la seconde commande|second command s input'),
  ],
};
