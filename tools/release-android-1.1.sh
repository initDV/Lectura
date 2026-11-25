#!/usr/bin/env bash
# Publie le candidat approuvé, sans reconstruire ni accéder à la clé de signature.
set -Eeuo pipefail
phase=prévol
trap 'rc=$?; printf "::error title=Distribution Android 1.1.0::%s (ligne %s, code %s)\n" "$phase" "$LINENO" "$rc" >&2; exit "$rc"' ERR
repo=initDV/Lectura
branch=arena/d2229c4f-lectura
run=45513815595
sha=0c24ef502240373cfdbbe49fe7a6124bd60b4485
cert=b6873c0f1a2f447163fb9af7e6f4181280b31fd1f5c45b0535993075b3dc7d8b
tag=v1.1.0
bundle="Lectura-$tag-android.zip"
sources=Lectura-Android-sources.zip
base="https://github.com/$repo/releases/download/$tag/"
[[ ${GITHUB_REPOSITORY:-} == "$repo" && ${GITHUB_REF:-} == "refs/heads/$branch" && ${GITHUB_EVENT_NAME:-} == workflow_dispatch ]]
: "${GH_TOKEN:?Jeton GitHub Actions absent}" "${ANDROID_HOME:?SDK Android absent}"
git merge-base --is-ancestor "$sha" HEAD
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

api() { gh api "repos/$repo/$1" "${@:2}"; }
sha256() { sha256sum "$1" | cut -d' ' -f1; }
phase='provenance du candidat signé'
api "actions/runs/$run" | jq -e --arg sha "$sha" --arg branch "$branch" '
  .head_sha==$sha and .head_branch==$branch and .path==".github/workflows/android.yml"
  and .run_number==38 and .status=="completed" and .conclusion=="success"
' >/dev/null
api "actions/runs/$run/jobs" | jq -e '
  any(.jobs[]; .conclusion=="success" and any(.steps[]; .name=="Test Android 12" and .conclusion=="success"))
' >/dev/null
phase='vérification que cette version n’existe pas déjà'
api 'releases?per_page=100' --paginate | jq -es --arg tag "$tag" 'all(.[][]; .tag_name != $tag)' >/dev/null
[[ -z $(git ls-remote --tags "https://github.com/$repo.git" "refs/tags/$tag") ]]

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
fetch_artifact 14976423951 'Lectura-Android-API31+' a51846c0af2c47de3e75c82bfc2418c2e0671a58c284527b055fcf8fc9a4eb9a "$work/apk.zip"
fetch_artifact 14976398529 'Lectura-Android-sources' 684686a2522d3a34d885d516358150efbea6241b23497811129155e5af103c0e "$work/$sources"
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
  grep -Eq "^package: name='io\.github\.initdv\.lectura' versionCode='38' versionName='1\.1\.0'" "$work/badging.txt"
  grep -Fx "sdkVersion:'31'" "$work/badging.txt"
  unzip -p "$file" assets/version.json | jq -e --arg native "${sha:0:8}" '.native==$native and .version=="1.1.0"' >/dev/null
}
verify_apk "$apk"
apk_hash=$(sha256 "$apk")
phase='dossier de téléchargement avec notices et sources correspondantes'
cp LICENSE THIRD_PARTY_LICENSES.md android/licenses/*.md android/licenses/*.txt "$work/$sources" "$work/zip/"
cat > "$work/zip/LIRE-MOI.txt" <<EOF
Lectura Android 1.1.0 (versionCode 38) — Android 12 et versions ultérieures

Extrayez ce dossier puis ouvrez Lectura.apk. Si Lectura 1.0.0 est déjà
installé avec le même certificat, installez la mise à jour sans désinstaller.

SHA-256 du fichier Lectura.apk : $apk_hash
SHA-256 du certificat : $cert
APK original de https://github.com/$repo/actions/runs/$run
Sources et notices : $sources et fichiers de ce dossier.
EOF
(cd "$work/zip" && zip -q -X "$work/$bundle" -- *)
cat > "$work/notes.md" <<EOF
## Lectura 1.1.0 pour Android 12 et versions ultérieures

Téléchargez **Lectura.apk**, ou le ZIP si vous souhaitez aussi les sources et notices dans le même téléchargement. Pour mettre à jour Lectura 1.0.0 portant le même certificat, installez l’APK sans désinstaller la version précédente.

- Le Robot Lectura fait un pas de côté, indique l’heure, s’incline à la première question et salue à la fin. Les gestes suivent la lecture jusque dans la vidéo exportée.
- Siwis Piper : corrections de diction, notamment « huit heures trente », phrasé des questions et pauses. La synthèse fonctionne hors ligne une fois le pack téléchargé.
- Toujours gratuit, sans clé ni compte Lectura.

APK d’origine du [run Android #38](https://github.com/$repo/actions/runs/$run), commit \`$sha\`, versionCode 38. Mise à jour depuis la 1.0.0 (code 32), lecture Siwis en mode avion et export MP4 vérifiés sur émulateur Android 12.

- Fichier \`Lectura.apk\`, SHA-256 : \`$apk_hash\`
- Certificat de signature, SHA-256 : \`$cert\`
- Sources et notices : \`$sources\`.

Cette publication GitHub ne modifie pas la version 1.0.0 ni sa soumission APKPure.
EOF

phase='création d’un brouillon et envoi des trois fichiers'
gh release create "$tag" "$apk" "$work/$bundle" "$work/$sources" --repo "$repo" --target "$sha" \
  --draft --title 'Lectura Android v1.1.0' --notes-file "$work/notes.md"
phase='relecture des trois fichiers depuis le brouillon'
mkdir "$work/relu"
gh release download "$tag" --repo "$repo" --dir "$work/relu" \
  --pattern Lectura.apk --pattern "$bundle" --pattern "$sources"
cmp "$apk" "$work/relu/Lectura.apk"
cmp "$work/$bundle" "$work/relu/$bundle"
cmp "$work/$sources" "$work/relu/$sources"
verify_apk "$work/relu/Lectura.apk"
gh release view "$tag" --repo "$repo" --json isDraft,targetCommitish --jq . | jq -e --arg sha "$sha" '.isDraft and .targetCommitish==$sha' >/dev/null

phase='publication de la Release relue'
gh release edit "$tag" --repo "$repo" --draft=false --latest
phase='vérification du tag public et des empreintes des trois fichiers'
api "git/ref/tags/$tag" | jq -e --arg sha "$sha" '.object.type=="commit" and .object.sha==$sha' >/dev/null
api "releases/tags/$tag" > "$work/release.json"
jq -e --arg tag "$tag" --arg sha "$sha" '.tag_name==$tag and .target_commitish==$sha and .draft==false and .prerelease==false' "$work/release.json" >/dev/null
for file in "$apk" "$work/$bundle" "$work/$sources"; do
  name=$(basename "$file")
  jq -e --arg name "$name" --arg url "$base$name" --arg digest "sha256:$(sha256 "$file")" '
    any(.assets[]; .name==$name and .state=="uploaded" and .browser_download_url==$url and .digest==$digest)
  ' "$work/release.json" >/dev/null
done
phase='téléchargement public sans authentification'
curl -fsSL --retry 4 --retry-all-errors --max-time 120 "${base}Lectura.apk" -o "$work/public.apk"
cmp "$apk" "$work/public.apk"
printf '::notice title=APK Android 1.1.0 publié::Code 38 ; APK SHA-256 %s ; certificat %s.\n' "$apk_hash" "$cert"
{
  printf '## Publication Android 1.1.0\n\n'
  printf -- '- [Release](%s)\n- [APK public](%sLectura.apk)\n' "$(jq -er .html_url "$work/release.json")" "$base"
  printf -- '- SHA-256 de l’APK : `%s`\n- SHA-256 du certificat : `%s`\n' "$apk_hash" "$cert"
} >> "$GITHUB_STEP_SUMMARY"
