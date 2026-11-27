#!/usr/bin/env bash
# Distribution du même APK que celui installé et testé par Android CI, sans accès aux secrets de signature.
set -Eeuo pipefail
repo=initDV/Lectura
branch=arena/d2229c4f-lectura
tag=v1.1.6
previous=v1.1.5
previous_code=63
version=${tag#v}
bundle="Lectura-$tag-android.zip"
sources=Lectura-Android-sources.zip
phase=prévol
trap 'printf "::error title=Publication Lectura::%s (ligne %d)\n" "$phase" "$LINENO" >&2' ERR
[[ ${GITHUB_REPOSITORY:-} == "$repo" && ${GITHUB_REF:-} == "refs/heads/$branch" && ${GITHUB_EVENT_NAME:-} == workflow_dispatch ]]
: "${GH_TOKEN:?Jeton Actions absent}" "${ANDROID_HOME:?SDK absent}"
run=${1:-}
[[ $run =~ ^[1-9][0-9]+$ ]]
sha=$(git rev-parse HEAD)
[[ $sha == "$GITHUB_SHA" ]]
api() { gh api "repos/$repo/$1"; }
release() { gh release "$@" --repo "$repo"; }
sha256() { sha256sum "$1" | cut -d' ' -f1; }
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
cert=$(<android/signing-cert.sha256)
[[ $cert =~ ^[0-9a-f]{64}$ ]]

phase='provenance et résultat de la recette Android'
api "actions/runs/$run" > "$work/run.json"
code=$(jq -er --arg branch "$branch" --arg sha "$sha" '
  select(.head_branch==$branch and .head_sha==$sha and .path==".github/workflows/android.yml"
    and .event=="workflow_dispatch" and .status=="completed" and .conclusion=="success") | .run_number' "$work/run.json")
[[ $code =~ ^[0-9]+$ && $code -gt $previous_code ]]
job=$(api "actions/runs/$run/jobs?filter=latest" | jq -er '
  .jobs[] | select( .name=="android" and .conclusion=="success"
    and any(.steps[]; .name=="Comparer les certificats de signature" and .conclusion=="success")
    and any(.steps[]; .name=="Test Android 12" and .conclusion=="success")) | .id')
api "check-runs/$job/annotations?per_page=100" > "$work/checks.json"
jq -e --arg codes "$previous_code → $code" '
  any(.[]; .title=="Signature de mise à jour" and (.message|contains($codes)))
  and any(.[]; (.title|contains("avant-mise-a-jour")) and (.message|contains("LECTURA_OK mise-a-jour")))
  and any(.[]; (.title|contains("apres-mise-a-jour")) and (.message|contains("LECTURA_OK mise-a-jour")))' "$work/checks.json" >/dev/null

phase='intégrité des artefacts issus de ce commit'
api "actions/runs/$run/artifacts" > "$work/artifacts.json"
artifact() {
  local name=$1 out=$2 id digest
  read -r id digest < <(jq -er --arg name "$name" --arg sha "$sha" --argjson run "$run" '
    [.artifacts[] | select(.name==$name and .expired==false and .workflow_run.id==$run
      and .workflow_run.head_sha==$sha and (.digest|test("^sha256:[0-9a-f]{64}$")))]
    | select(length==1) | .[0] | [.id,.digest]|@tsv' "$work/artifacts.json")
  api "actions/artifacts/$id/zip" > "$out"
  printf '%s  %s\n' "${digest#sha256:}" "$out" | sha256sum -c -
}
artifact 'Lectura-Android-API31+' "$work/original.zip"
artifact 'Lectura-Android-sources' "$work/$sources"
[[ $(unzip -Z1 "$work/original.zip") == Lectura.apk ]]
unzip -tq "$work/$sources"
for notice in lectura.tar.gz lamejs.tar.gz LGPL-2.1.txt; do
  unzip -Z1 "$work/$sources" | grep -Fx "$notice" >/dev/null
done
unzip -p "$work/$sources" lectura.tar.gz > "$work/source.tar.gz"
tar -tzf "$work/source.tar.gz" >/dev/null
[[ $(git get-tar-commit-id < <(gzip -dc "$work/source.tar.gz")) == "$sha" ]]

phase='vérification du paquet, de la version et du certificat permanent'
mkdir "$work/zip"
apk="$work/zip/Lectura.apk"
unzip -p "$work/original.zip" Lectura.apk > "$apk"
bt="$ANDROID_HOME/build-tools/37.0.0"
[[ -x $bt/apksigner && -x $bt/aapt2 ]] || sdkmanager 'build-tools;37.0.0'
[[ $("$bt/apksigner" verify --print-certs "$apk" | awk '/certificate SHA-256 digest:/ {print $NF}') == "$cert" ]]
"$bt/aapt2" dump badging "$apk" > "$work/badging.txt"
grep -F "package: name='io.github.initdv.lectura' versionCode='$code' versionName='$version'" "$work/badging.txt"
grep -E "^(minSdkVersion|sdkVersion):'31'$" "$work/badging.txt"
unzip -p "$apk" assets/version.json | jq -e --arg sha "${sha:0:8}" --arg version "$version" '.native==$sha and .version==$version' >/dev/null
apk_hash=$(sha256 "$apk")
cp LICENSE THIRD_PARTY_LICENSES.md android/licenses/*.md android/licenses/*.txt "$work/$sources" "$work/zip/"
(cd "$work/zip" && printf '%s  Lectura.apk\n' "$apk_hash" > Lectura.apk.sha256)
cat > "$work/zip/LIRE-MOI.txt" <<EOF
Lectura Android $version (code $code), pour Android 12 ou plus.
Installez Lectura.apk par-dessus la version précédente, sans désinstaller.
Sources et licences : $sources et les notices de ce dossier.
SHA-256 de Lectura.apk : $apk_hash
Certificat SHA-256 : $cert
Recette : https://github.com/$repo/actions/runs/$run
EOF
(cd "$work/zip" && zip -q -X "$work/$bundle" -- *)
cat > "$work/notes.md" <<EOF
## Lectura $version · Android 12 ou plus

- Les cinq lectrices expliquent, énumèrent et comparent avec des gestes distincts pendant la parole, en français et en anglais.
- Le visage réagit au moment des mots utiles et selon le contexte : une mention ou un mot nié ne déclenche plus une émotion forte à lui seul. Le réglage manuel et les mouvements réduits restent disponibles.
- Estelle anticipe les textes courts pendant une pause de saisie. Si le calcul a déjà commencé pour le même texte, **Lancer** le réutilise. La voix reste utilisable hors ligne, avec le même rendu.

Installez **Lectura.apk** par-dessus la version précédente, **sans désinstaller**. Le ZIP contient aussi les sources et les licences.

[Recette Android #$code](https://github.com/$repo/actions/runs/$run) · commit \`$sha\` · certificat de mise à jour inchangé.

SHA-256 de l’APK : \`$apk_hash\`.
EOF

phase='envoi au brouillon et vérification avant publication'
api releases/latest | jq -e --arg previous "$previous" '.tag_name==$previous' >/dev/null
[[ -z $(git ls-remote --tags "https://github.com/$repo.git" "refs/tags/$tag") ]]
if ! release view "$tag" > /dev/null 2>&1; then
  release create "$tag" --draft --target "$sha" --title "Lectura $version" --notes-file "$work/notes.md"
fi
release view "$tag" --json isDraft,isPrerelease,targetCommitish,assets | jq -e --arg sha "$sha" --arg zip "$bundle" --arg src "$sources" '
  .isDraft and (.isPrerelease|not) and .targetCommitish==$sha
  and all(.assets[]; .name=="Lectura.apk" or .name==$zip or .name==$src)' >/dev/null
release upload "$tag" "$apk" "$work/$bundle" "$work/$sources" --clobber
mkdir "$work/relu"
release download "$tag" --dir "$work/relu" --pattern Lectura.apk --pattern "$bundle" --pattern "$sources"
for f in "$apk" "$work/$bundle" "$work/$sources"; do cmp "$f" "$work/relu/$(basename "$f")"; done
release edit "$tag" --notes-file "$work/notes.md"

phase='publication et relecture anonyme des fichiers'
release edit "$tag" --draft=false --latest
api "git/ref/tags/$tag" | jq -e --arg sha "$sha" '.object.type=="commit" and .object.sha==$sha' >/dev/null
api releases/latest | jq -e --arg tag "$tag" '.tag_name==$tag and (.draft|not) and (.prerelease|not) and (.assets|length)==3' >/dev/null
base="https://github.com/$repo/releases/download/$tag/"
for f in "$apk" "$work/$bundle" "$work/$sources"; do
  curl -fsSL --retry 3 --retry-all-errors --max-time 120 "$base$(basename "$f")" -o "$work/public"
  cmp "$f" "$work/public"
done
printf -- '- [Lectura.apk](%sLectura.apk) · code %s · SHA-256 `%s`\n- [Recette Android](https://github.com/%s/actions/runs/%s)\n' \
  "$base" "$code" "$apk_hash" "$repo" "$run" >> "$GITHUB_STEP_SUMMARY"
printf '::notice title=Version %s vérifiée::APK public, code %s, SHA-256 %s.\n' "$version" "$code" "$apk_hash"
