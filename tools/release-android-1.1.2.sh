#!/usr/bin/env bash
# Publie le candidat 1.1.2 approuvé, sans reconstruire ni accéder à la clé de signature.
set -Eeuo pipefail
phase=prévol
trap 'rc=$?; printf "::error title=Distribution Android 1.1.2::%s (ligne %s, code %s)\n" "$phase" "$LINENO" "$rc" >&2; exit "$rc"' ERR
repo=initDV/Lectura
branch=arena/d2229c4f-lectura
run=45869559426
sha=a5a7d2a31e8bc45d3bf637a8d6b48b6c0beeb018
code=42
cert=b6873c0f1a2f447163fb9af7e6f4181280b31fd1f5c45b0535993075b3dc7d8b
version=1.1.2
tag=v$version
draft_id=459746927
bundle="Lectura-$tag-android.zip"
sources=Lectura-Android-sources.zip
base="https://github.com/$repo/releases/download/$tag/"
[[ ${GITHUB_REPOSITORY:-} == "$repo" && ${GITHUB_REF:-} == "refs/heads/$branch" && ${GITHUB_EVENT_NAME:-} == workflow_dispatch ]]
: "${GH_TOKEN:?Jeton GitHub Actions absent}" "${ANDROID_HOME:?SDK Android absent}"
git merge-base --is-ancestor "$sha" HEAD
# La page de téléchargement peut évoluer ; l’application et les sources du run restent celles du candidat.
git diff --exit-code "$sha" HEAD -- . ':!app' ':!tools/build.mjs' ':!tools/release-android-1.1.2.sh' \
  ':!.github/workflows/deploy.yml' ':!.github/workflows/publish-lectura-1.1.2.yml'
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

api() { gh api "repos/$repo/$1" "${@:2}"; }
sha256() { sha256sum "$1" | cut -d' ' -f1; }
phase='provenance du candidat signé'
api "actions/runs/$run" | jq -e --arg sha "$sha" --arg branch "$branch" --argjson code "$code" '
  .head_sha==$sha and .head_branch==$branch and .path==".github/workflows/android.yml"
  and .run_number==$code and .status=="completed" and .conclusion=="success"
' >/dev/null
api "actions/runs/$run/jobs" | jq -e '
  any(.jobs[]; .conclusion=="success" and any(.steps[]; .name=="Test Android 12" and .conclusion=="success"))
' >/dev/null
phase='identité du brouillon réservé à ce candidat'
api "releases/$draft_id" | jq -e --arg tag "$tag" --arg sha "$sha" '
  .tag_name==$tag and .target_commitish==$sha and .draft and (.prerelease|not) and (.assets|length)==0
' >/dev/null
tag_ref=$(git ls-remote --tags "https://github.com/$repo.git" "refs/tags/$tag")
[[ -z $tag_ref ]]

release_cmd() {
  local result
  if ! result=$(gh release "$@" --repo "$repo" 2>&1); then
    result=${result//%/%25}; result=${result//$'\r'/%0D}; result=${result//$'\n'/%0A}
    printf '::error title=Commande Release::%s\n' "${result:0:1200}" >&2
    return 1
  fi
  printf '%s\n' "$result"
}

fetch_artifact() {
  local id=$1 name=$2 digest=$3 out=$4
  phase="provenance et empreinte de $name ($id)"
  api "actions/artifacts/$id" | jq -e --arg sha "$sha" --arg name "$name" --arg digest "sha256:$digest" --argjson run "$run" '
    .name==$name and .digest==$digest and .expired==false
    and .workflow_run.id==$run and .workflow_run.head_sha==$sha
  ' >/dev/null
  api "actions/artifacts/$id/zip" > "$out"
  printf '%s  %s\n' "$digest" "$out" | sha256sum -c -
}
fetch_artifact 15143081565 'Lectura-Android-API31+' 784e9d9b9ee0955577c0ea262f519be486210e6f825be1711be28e52c1911638 "$work/apk.zip"
fetch_artifact 15142815581 'Lectura-Android-sources' 0c1a8a039cb622dbd9f9f8e19670d2df04c3b11578289db45847a8940980e969 "$work/$sources"
phase='extraction du seul APK attendu'
[[ $(unzip -Z1 "$work/apk.zip") == Lectura.apk ]]
mkdir "$work/zip"
apk="$work/zip/Lectura.apk"
unzip -p "$work/apk.zip" Lectura.apk > "$apk"
unzip -tq "$work/$sources"

phase='outils de vérification Android'
bt="$ANDROID_HOME/build-tools/37.0.0"
if [[ ! -x "$bt/apksigner" || ! -x "$bt/aapt2" ]]; then
  sdkmanager 'build-tools;37.0.0'
fi
verify_apk() {
  local file=$1 fingerprint
  phase="signature, paquet et version de $(basename "$file")"
  fingerprint=$("$bt/apksigner" verify --print-certs "$file" | awk '/certificate SHA-256 digest:/ {print $NF}')
  [[ $fingerprint == "$cert" ]]
  "$bt/aapt2" dump badging "$file" > "$work/badging.txt"
  grep -F "package: name='io.github.initdv.lectura' versionCode='$code' versionName='$version'" "$work/badging.txt"
  grep -E "^(minSdkVersion|sdkVersion):'31'$" "$work/badging.txt"
  unzip -p "$file" assets/version.json | jq -e --arg native "${sha:0:8}" --arg version "$version" '.native==$native and .version==$version' >/dev/null
}
verify_apk "$apk"
apk_hash=$(sha256 "$apk")
phase='dossier de téléchargement avec notices et sources correspondantes'
cp LICENSE THIRD_PARTY_LICENSES.md android/licenses/*.md android/licenses/*.txt "$work/$sources" "$work/zip/"
cat > "$work/zip/LIRE-MOI.txt" <<EOF
Lectura Android $version (versionCode $code) — Android 12 et versions ultérieures

Extrayez ce dossier puis ouvrez Lectura.apk. Si Lectura est déjà installé avec
le même certificat, installez la mise à jour sans désinstaller.

SHA-256 du fichier Lectura.apk : $apk_hash
SHA-256 du certificat : $cert
APK original de https://github.com/$repo/actions/runs/$run
Sources et notices : $sources et fichiers de ce dossier.
EOF
(cd "$work/zip" && zip -q -X "$work/$bundle" -- *)
cat > "$work/notes.md" <<EOF
## Lectura $version pour Android 12 et versions ultérieures

- Sept personnages, comme dans la PWA 1.1.2 : Aïcha, Charlotte, Doriane, Monique, Prisca, Robot Lectura et Robot rouge.
- Les cinq lectrices reprennent les dessins validés, dont Prisca dans sa version originale. Leurs gestes, les lèvres et le décor sont animés en natif, sans WebView. Les deux robots gardent leurs dessins et animations.
- Si un projet utilise un personnage retiré, Robot Lectura s’affiche à sa place sans modifier l’identifiant enregistré, le texte ou les médias.

Téléchargez **Lectura.apk**, ou le ZIP si vous souhaitez aussi les sources et notices. Installez l’APK par-dessus la version précédente signée avec le même certificat, **sans désinstaller**.

APK d’origine du [run Android #$code](https://github.com/$repo/actions/runs/$run), commit \`$sha\`, versionCode $code. Mise à jour en place de la 1.1.1 (code 40), WAV conservé à l’octet, sept vignettes, cinq lectrices en mode avion, pause/recherche, voix Siwis hors ligne, capture PNG de Prisca et MP4 de Monique vérifiés sur émulateur Android 12.

- Fichier \`Lectura.apk\`, SHA-256 : \`$apk_hash\`
- Certificat de signature, SHA-256 : \`$cert\`
- Sources et notices : \`$sources\`.

Les versions précédentes restent disponibles. Cette publication GitHub ne change rien sur APKPure.
EOF

phase='envoi des trois fichiers au brouillon réservé'
release_cmd upload "$tag" "$apk" "$work/$bundle" "$work/$sources"
phase='relecture des trois fichiers depuis le brouillon'
mkdir "$work/relu"
release_cmd download "$tag" --dir "$work/relu" --pattern Lectura.apk --pattern "$bundle" --pattern "$sources"
cmp "$apk" "$work/relu/Lectura.apk"
cmp "$work/$bundle" "$work/relu/$bundle"
cmp "$work/$sources" "$work/relu/$sources"
verify_apk "$work/relu/Lectura.apk"
api "releases/$draft_id" | jq -e --arg sha "$sha" --arg tag "$tag" '
  .draft and .target_commitish==$sha and .tag_name==$tag and (.assets|length)==3
' >/dev/null
release_cmd edit "$tag" --notes-file "$work/notes.md"
printf '::notice title=Brouillon Android %s vérifié::ID %s ; trois fichiers relus ; APK SHA-256 %s.\n' "$version" "$draft_id" "$apk_hash"

phase='publication de la Release relue'
api 'releases/latest' | jq -e '.tag_name=="v1.1.1"' >/dev/null
release_cmd edit "$tag" --draft=false --latest
phase='vérification du tag public et des empreintes des trois fichiers'
api "git/ref/tags/$tag" | jq -e --arg sha "$sha" '.object.type=="commit" and .object.sha==$sha' >/dev/null
api "releases/tags/$tag" > "$work/release.json"
jq -e --arg tag "$tag" --arg sha "$sha" --argjson id "$draft_id" '.id==$id and .tag_name==$tag and .target_commitish==$sha and .draft==false and .prerelease==false' "$work/release.json" >/dev/null
for file in "$apk" "$work/$bundle" "$work/$sources"; do
  name=$(basename "$file")
  jq -e --arg name "$name" --arg url "$base$name" --arg digest "sha256:$(sha256 "$file")" '
    any(.assets[]; .name==$name and .state=="uploaded" and .browser_download_url==$url and .digest==$digest)
  ' "$work/release.json" >/dev/null
  phase="téléchargement public sans authentification : $name"
  curl -fsSL --retry 4 --retry-all-errors --max-time 120 "$base$name" -o "$work/public"
  cmp "$file" "$work/public"
done
printf '::notice title=APK Android %s publié::Code %s ; APK SHA-256 %s ; certificat %s.\n' "$version" "$code" "$apk_hash" "$cert"
{
  printf '## Publication Android %s\n\n' "$version"
  printf -- '- [Release](%s)\n- [APK public](%sLectura.apk)\n' "$(jq -er .html_url "$work/release.json")" "$base"
  printf -- '- SHA-256 de l’APK : `%s`\n- SHA-256 du certificat : `%s`\n' "$apk_hash" "$cert"
} >> "$GITHUB_STEP_SUMMARY"
