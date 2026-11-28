#!/usr/bin/env bash
# Publication de l'artefact de recette, jamais construction ni signature d'un nouvel APK.
set -Eeuo pipefail
phase='prévol'
trap 'rc=$?; printf "::error title=Distribution Android::Échec : %s (ligne %s, statut %s).\n" "$phase" "$LINENO" "$rc" >&2; exit "$rc"' ERR
repo=initDV/Lectura
branch=arena/d2229c4f-lectura
ref=refs/heads/$branch
run=45220486453
sha=3c5ca6d5a02c1475ca121958bde923f44004af97
cert=b6873c0f1a2f447163fb9af7e6f4181280b31fd1f5c45b0535993075b3dc7d8b
tag=v1.0.0
[[ ${GITHUB_REPOSITORY:-} == "$repo" && ${GITHUB_REF:-} == "$ref" && ${GITHUB_EVENT_NAME:-} == workflow_dispatch ]]
: "${GH_TOKEN:?Jeton GitHub Actions absent}" "${ANDROID_HOME:?SDK Android absent}"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

api() {
  local path=$1
  shift
  gh api "repos/$repo/$path" "$@"
}
phase='provenance du run signé et de la recette'
api "actions/runs/$run" | jq -e --arg sha "$sha" --arg branch "$branch" --argjson run "$run" '
  .id==$run and .workflow_id==422483874 and .head_sha==$sha and .head_branch==$branch
  and .run_number==32 and .status=="completed" and .conclusion=="success"
' >/dev/null
api "actions/runs/$run/jobs" | jq -e '
  any(.jobs[]; .conclusion=="success" and any(.steps[]; .name=="Test Android 12" and .conclusion=="success"))
' >/dev/null
phase='branche principale et absence de publication concurrente'
api 'git/ref/heads/main' | jq -e '.object.sha=="39e429522cc715aeda6ce0db9d3eb5690ba1f2fd"' >/dev/null
api 'releases?per_page=100' --paginate | jq -es --arg tag "$tag" 'all(.[][]; .tag_name != $tag)' >/dev/null
tag_ref=$(git ls-remote --tags "https://github.com/$repo.git" "refs/tags/$tag")
[[ -z $tag_ref ]]

fetch_artifact() {
  local id=$1 name=$2 hash=$3 dest=$4
  phase="métadonnées de $name ($id)"
  api "actions/artifacts/$id" | jq -e --arg sha "$sha" --arg name "$name" --arg hash "sha256:$hash" --argjson run "$run" '
    .name==$name and .digest==$hash and .expired==false
    and .workflow_run.id==$run and .workflow_run.head_sha==$sha
  ' >/dev/null
  phase="téléchargement de $name"
  api "actions/artifacts/$id/zip" > "$dest"
  phase="empreinte de l’archive $name"
  printf '%s  %s\n' "$hash" "$dest" | sha256sum -c -
}
fetch_artifact 14839954678 'Lectura-Android-API31+' 07b3bfbf2675094c429716dc4facc24c5867b7140425340826d688bc1e117fda "$work/apk.zip"
fetch_artifact 14840118131 'Lectura-Android-sources' eee1603a55bb40e97888600fc25b27774bf270d9d1a8588f06726c9eab9756c4 "$work/Lectura-Android-sources.zip"
phase='structure de l’archive APK'
[[ $(unzip -Z1 "$work/apk.zip") == Lectura.apk ]]
apk="$work/Lectura.apk"
unzip -p "$work/apk.zip" Lectura.apk > "$apk"

phase='outils officiels de vérification Android'
buildtools="$ANDROID_HOME/build-tools/37.0.0"
if [[ ! -x "$buildtools/apksigner" || ! -x "$buildtools/aapt2" ]]; then
  sdkmanager 'build-tools;37.0.0'
fi
verify_apk() {
  local path=$1
  phase="certificat de $(basename "$path")"
  "$buildtools/apksigner" verify --print-certs "$path" > "$work/cert.txt"
  # Même extraction que la recette signée : le libellé du signataire dépend d'apksigner.
  local fingerprint
  fingerprint=$(awk '/certificate SHA-256 digest:/ {print $NF}' "$work/cert.txt")
  [[ $fingerprint == "$cert" ]]
  phase="nom de paquet et versions de $(basename "$path")"
  "$buildtools/aapt2" dump badging "$path" > "$work/badging.txt"
  grep -Eq "^package: name='io\.github\.initdv\.lectura' versionCode='32' versionName='1\.0\.0'" "$work/badging.txt"
  phase="SHA inscrit dans $(basename "$path")"
  unzip -p "$path" assets/version.json | jq -e --arg short "${sha:0:8}" '.native==$short and .version=="1.0.0"' >/dev/null
}
verify_apk "$apk"
apk_hash=$(sha256sum "$apk" | cut -d' ' -f1)
printf '::notice title=APK original contrôlé::Run %s, SHA APK %s, certificat %s.\n' "$run" "$apk_hash" "$cert"

cat > "$work/notes.md" <<EOF
## Lectura pour Android 12 et versions ultérieures

Téléchargez **Lectura.apk**. Pour mettre à jour une installation portant le même certificat, installez sans désinstaller la version précédente.

- Bibliothèque : recherche sans accents, tri et duplication des projets avec leur WAV et leurs repères.
- Voix HD : taille des modèles partagés, reprise confirmée ou nettoyage du seul téléchargement partiel.
- Exports : médiathèque audio et vidéo, renommage, lecture, copie et partage sans réencodage.

APK original du [run Android ${run}](https://github.com/${repo}/actions/runs/${run}), commit \`${sha}\`, versionCode 32. Validé sur émulateur Android 12 : mode avion effectif, 43 personnages, aucun Pro visible dans les écrans contrôlés, lecture complète et exports.

- Certificat de signature SHA-256 : \`${cert}\`
- Fichier Lectura.apk SHA-256 : \`${apk_hash}\`
- Sources correspondantes et notices : \`Lectura-Android-sources.zip\`.

Cette publication ne déploie pas la version Web candidate.
EOF

# La Release reste privée tant que le fichier envoyé n'a pas été relu et revérifié.
phase='création du brouillon puis envoi de l’APK et des sources'
gh release create "$tag" "$apk" "$work/Lectura-Android-sources.zip" \
  --repo "$repo" --target "$sha" --draft --title 'Lectura Android v1.0.0' --notes-file "$work/notes.md"
phase='relecture et comparaison de l’APK depuis la Release privée'
mkdir "$work/roundtrip"
gh release download "$tag" --repo "$repo" --dir "$work/roundtrip" \
  --pattern Lectura.apk --pattern Lectura-Android-sources.zip
cmp "$apk" "$work/roundtrip/Lectura.apk"
cmp "$work/Lectura-Android-sources.zip" "$work/roundtrip/Lectura-Android-sources.zip"
verify_apk "$work/roundtrip/Lectura.apk"
gh release view "$tag" --repo "$repo" --json isDraft,targetCommitish | jq -e --arg sha "$sha" '.isDraft and .targetCommitish==$sha' >/dev/null
tag_ref=$(git ls-remote --tags "https://github.com/$repo.git" "refs/tags/$tag")
[[ -z $tag_ref ]]

phase='publication de la Release relue'
gh release edit "$tag" --repo "$repo" --draft=false --latest
phase='vérification du tag et de l’APK public'
api "git/ref/tags/$tag" | jq -e --arg sha "$sha" '.object.type=="commit" and .object.sha==$sha' >/dev/null
published=$(api "releases/tags/$tag")
jq -e --arg sha "$sha" --arg hash "sha256:$apk_hash" '
  .tag_name=="v1.0.0" and .target_commitish==$sha and .draft==false and .prerelease==false
  and any(.assets[]; .name=="Lectura.apk" and .state=="uploaded" and .digest==$hash
          and .browser_download_url=="https://github.com/initDV/Lectura/releases/download/v1.0.0/Lectura.apk")
  and .html_url=="https://github.com/initDV/Lectura/releases/tag/v1.0.0"
' <<< "$published" >/dev/null
phase='comparaison du téléchargement public sans authentification'
curl --fail --silent --show-error --location --retry 4 --retry-all-errors --max-time 120 \
  "https://github.com/$repo/releases/download/$tag/Lectura.apk" --output "$work/public.apk"
cmp "$apk" "$work/public.apk"
release_url=$(jq -er .html_url <<< "$published")
printf '::notice title=APK de distribution::Run %s, commit %s, SHA-256 APK %s, certificat %s\n' "$run" "$sha" "$apk_hash" "$cert"
printf '## Publication Android\n\n- [Release %s](%s)\n- SHA-256 de Lectura.apk : `%s`\n- Certificat : `%s`\n' "$tag" "$release_url" "$apk_hash" "$cert" >> "$GITHUB_STEP_SUMMARY"
