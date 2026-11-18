# Lectura Android — clé de signature permanente (phase 0)

L’APK et l’APK d’instrumentation doivent porter le **même certificat permanent**, vérifié par son empreinte SHA-256 avant et après la signature. Aucun script de build ne génère de clé ni ne se rabat sur une clé de débogage. Le paquet reste `io.github.initdv.lectura`. Les builds Actions utilisent le numéro d’exécution comme `versionCode` ; une relance du même run garde ce numéro.

**État : configuration à faire par le propriétaire.** L’intégration du sandbox reçoit `403 Resource not accessible by integration` sur l’API des secrets Actions, y compris sur la clé publique d’envoi des secrets. Aucune nouvelle clé privée ni aucun mot de passe n’a été créé dans le sandbox. Sans configuration, le workflow s’arrête avant de compiler et ne publie pas d’APK.

## 1. Créer la clé une seule fois, hors du dépôt

Si tu possèdes déjà le keystore **permanent** de Lectura, utilise celui-là et saute la génération. Les anciens certificats de débogage CI ne sont pas cette clé. Sur ta machine, avec le JDK installé, depuis un shell Bash :

```bash
umask 077
sign_dir="$HOME/.lectura-signing"
mkdir -p "$sign_dir"
chmod 700 "$sign_dir"
ks="$sign_dir/lectura.p12"
if [[ -e "$ks" || -L "$ks" ]]; then
  printf 'Clé existante : réutilise %s, ne la régénère pas.\n' "$ks"
else
  keytool -genkeypair -storetype PKCS12 -keystore "$ks" -alias lectura \
    -keyalg RSA -keysize 3072 -sigalg SHA256withRSA -validity 36500 \
    -dname 'CN=Lectura Android'
fi
```

`keytool` demande le mot de passe **de façon interactive**. Utilise une valeur longue et aléatoire dans ton gestionnaire de mots de passe. Pour ce format PKCS#12, le mot de passe de la clé et celui du keystore sont le même. Sauvegarde `lectura.p12` sur un support chiffré, et le mot de passe et l’alias `lectura` dans ton gestionnaire. Conserve une copie de secours hors ligne. Ni copie en clair dans le dépôt, le chat, un artefact CI ou un journal, ni mot de passe dans une commande. **Les secrets Actions ne sont pas une sauvegarde récupérable.**

Obtiens l’empreinte du **certificat public** (pas le SHA-256 du fichier `.p12`) :

```bash
set -o pipefail
alias_key=lectura  # alias de ta clé permanente si elle existait déjà
cert=$(keytool -exportcert -keystore "$ks" -alias "$alias_key" \
  | openssl dgst -sha256 -r | awk '{print $1}')
printf '%s\n' "$cert"
```

## 2. Configurer GitHub Actions sans téléverser le fichier dans Git

Dans [Settings → Environments](https://github.com/initDV/Lectura/settings/environments), créer ou ouvrir `android-signing`. Dans **Deployment branches and tags**, choisir **Selected branches and tags** et n’autoriser que la branche `arena/d2229c4f-lectura`. Si possible, exiger une approbation humaine après examen du commit avant que le workflow accède à la clé. Une personne qui peut modifier le workflow d’une exécution autorisée peut autrement accéder aux secrets : ne pas autoriser d’exécution non approuvée. Ne change pas l’environnement `github-pages`.

Avec `gh` connecté sur **ta machine** avec la permission d’administrer cet environnement, dans le même shell (`$ks`, `$cert` et `$alias_key` définis) :

```bash
# Le flux base64 est une représentation du fichier privé, PAS un chiffrement.
openssl base64 -A -in "$ks" | gh secret set LECTURA_KEYSTORE_B64 \
  --repo initDV/Lectura --env android-signing
gh secret set LECTURA_STORE_PASS --repo initDV/Lectura --env android-signing
# La commande précédente demande le mot de passe sans le placer dans l’historique.
gh variable set LECTURA_SIGNING_CERT_SHA256 --body "$cert" \
  --repo initDV/Lectura --env android-signing
# Facultatif, seulement si l’alias n’est pas « lectura » :
# gh variable set LECTURA_KEY_ALIAS --body "$alias_key" --repo initDV/Lectura --env android-signing
```

Ne pas écraser ces valeurs si la clé permanente a déjà été enregistrée ; vérifier d’abord l’empreinte contre la sauvegarde. Les mêmes valeurs peuvent être configurées dans l’interface **Environment secrets** / **Environment variables**. Le workflow n’attend ni mot de passe GitHub, ni jeton, ni secret saisi en conversation. Signaler uniquement que la configuration est terminée.

## 3. Vérifier avant installation

Relancer sur la branche le run de phase 0 après configuration (et l’approuver si l’environnement le demande). Le workflow décode le keystore dans un répertoire temporaire privé du runner, le supprime en fin d’étape, puis publie l’APK seulement si la vérification de signature et les contrôles Android passent. Le rapport `Lectura-comparaison/apk-certificates.txt` ne contient que des empreintes publiques. Vérifier aussi l’artefact reçu avec `apksigner verify --print-certs Lectura.apk`.

Android refuse de remplacer l’ancien APK de test par un APK au certificat différent. Sur le même téléphone, passer à la nouvelle série est donc une installation propre : **attendre l’APK permanent et vérifier son certificat avant de désinstaller quoi que ce soit**. Exporter d’abord les projets et le brouillon à conserver en `.lectura`, vérifier les exports, et copier les fichiers audio d’origine hors du stockage privé de l’app. Les `.lectura` ne contiennent ni les fichiers audio ni les modèles de voix : réimporter les fichiers et retélécharger les voix au besoin. La désinstallation efface les données locales, dont les réglages et l’identifiant d’installation. En cas de doute sur les sauvegardes, tester sur un appareil séparé ou un émulateur sans toucher à l’ancien APK.

La livraison de phase 0 inclura **l’empreinte SHA-256 du certificat** de l’APK publié (pas le hash du fichier ZIP ou APK). Pour les **prochaines** mises à jour, installer l’APK permanent suivant par-dessus le premier sans désinstaller ; vérifier le certificat, le `versionCode` et la conservation des données.

## Compilation locale

`bash android/build.sh --check` vérifie l’application et l’instrumentation dans un dossier temporaire ; ne laisse aucun APK et ne touche pas aux clés. Pour créer un APK local, fournir `LECTURA_KEYSTORE` (chemin absolu hors dépôt), `LECTURA_SIGNING_CERT_SHA256`, `LECTURA_STORE_PASS` (invité confidentiellement dans ton terminal) et, si différents des réglages précédents, `LECTURA_KEY_ALIAS` / `LECTURA_KEY_PASS`. `LECTURA_VERSION_CODE` permet de choisir le numéro de version local, par défaut `1` ; ne pas utiliser les builds locaux numérotés séparément pour mettre à jour une série CI sans contrôler ce numéro et le certificat.
