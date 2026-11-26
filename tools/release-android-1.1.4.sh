#!/usr/bin/env bash
# Publier uniquement l’APK validé par la recette Android, sans accéder à la clé de signature.
set -Eeuo pipefail
repo=initDV/Lectura
branch=arena/d2229c4f-lectura
expected_sha=dcc8a8034211f3e506ff40b5b359866315b28eac
tag=v1.1.4
version=${tag#v}
bundle="Lectura-$tag-android.zip"
sources=Lectura-Android-sources.zip
base="https://github.com/$repo/releases/download/$tag/"
phase=prévol
trap 'rc=$?; printf "::error title=Distribution Android 1.1.4::%s (ligne %s, code %s)\n" "$phase" "$LINENO" "$rc" >&2; exit "$rc"' ERR
[[ ${GITHUB_REPOSITORY:-} == "$repo" && ${GITHUB_REF:-} == "refs/heads/$branch" && ${GITHUB_EVENT_NAME:-} == workflow_dispatch ]]
: "${GH_TOKEN:?Jeton Actions absent}" "${ANDROID_HOME:?SDK absent}"
run=${1:-}; draft=${2:-}
[[ $run == 45901739826 && $draft =~ ^[1-9][0-9]+$ ]]
api() { gh api "repos/$repo/$1" "${@:2}"; }
release() { gh release "$@" --repo "$repo"; }
sha256() { sha256sum "$1" | cut -d' ' -f1; }
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
cert=$(<android/signing-cert.sha256)
[[ $cert == b6873c0f1a2f447163fb9af7e6f4181280b31fd1f5c45b0535993075b3dc7d8b ]]

phase='provenance de la recette signée et du brouillon réservé'
api "actions/runs/$run" > "$work/run.json"
sha=$(jq -er --arg branch "$branch" '
  select(.head_branch==$branch and .path==".github/workflows/android.yml" and .event=="push"
    and .status=="completed" and .conclusion=="success") | .head_sha' "$work/run.json")
[[ $sha == "$expected_sha" ]]
code=$(jq -er '.run_number' "$work/run.json")
[[ $code == 47 ]] # Le prédécesseur public 1.1.3 porte le code 46.
git merge-base --is-ancestor "$sha" HEAD
# Les sources du produit publié doivent être celles validées ; seul le circuit de publication peut être ajouté ensuite.
git diff --exit-code "$sha" HEAD -- . \
  ':!.github/workflows/publish-lectura-1.1.3.yml' ':!.github/workflows/publish-lectura-1.1.4.yml' \
  ':!tools/release-android-1.1.3.sh' ':!tools/release-android-1.1.4.sh' \
  ':!tools/distribution/landing-update-1.1.3.py' ':!tools/distribution/landing-update-1.1.4.py'
api "actions/runs/$run/jobs" | jq -e '
  any(.jobs[]; .name=="android" and .conclusion=="success"
    and any(.steps[]; .name=="Test Android 12" and .conclusion=="success"))' >/dev/null
api "releases/$draft" | jq -e --arg tag "$tag" --arg sha "$sha" --arg zip "$bundle" --arg src "$sources" '
  .draft and (.prerelease|not) and .tag_name==$tag and .target_commitish==$sha
  and all(.assets[]; .name=="Lectura.apk" or .name==$zip or .name==$src)' >/dev/null
[[ -z $(git ls-remote --tags "https://github.com/$repo.git" "refs/tags/$tag") ]]
api 'releases/latest' | jq -e '.tag_name=="v1.1.3"' >/dev/null

phase='récupération et vérification des artefacts originaux'
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
mkdir "$work/zip"
apk="$work/zip/Lectura.apk"
unzip -p "$work/original.zip" Lectura.apk > "$apk"
bt="$ANDROID_HOME/build-tools/37.0.0"
[[ -x $bt/apksigner && -x $bt/aapt2 ]] || sdkmanager 'build-tools;37.0.0'
verify_apk() {
  [[ $("$bt/apksigner" verify --print-certs "$1" | awk '/certificate SHA-256 digest:/ {print $NF}') == "$cert" ]]
  "$bt/aapt2" dump badging "$1" > "$work/badging.txt"
  grep -F "package: name='io.github.initdv.lectura' versionCode='$code' versionName='$version'" "$work/badging.txt"
  grep -E "^(minSdkVersion|sdkVersion):'31'$" "$work/badging.txt"
  unzip -p "$1" assets/version.json | jq -e --arg sha "${sha:0:8}" --arg version "$version" \
    '.native==$sha and .version==$version' >/dev/null
}
phase='vérification du paquet, de la version et du certificat permanent'
verify_apk "$apk"
apk_hash=$(sha256 "$apk")
cp LICENSE THIRD_PARTY_LICENSES.md android/licenses/*.md android/licenses/*.txt "$work/$sources" "$work/zip/"
(cd "$work/zip" && printf '%s  Lectura.apk\n' "$apk_hash" > Lectura.apk.sha256)
cat > "$work/zip/LIRE-MOI.txt" <<EOF
Lectura Android $version (code $code), pour Android 12 ou plus.
Ouvrez Lectura.apk sur le téléphone et installez par-dessus l’ancienne version, sans désinstaller.
Sources et licences : $sources et les notices de ce dossier.
SHA-256 de Lectura.apk : $apk_hash
Certificat SHA-256 : $cert
Recette : https://github.com/$repo/actions/runs/$run
EOF
(cd "$work/zip" && zip -q -X "$work/$bundle" -- *)
cat > "$work/notes.md" <<EOF
## Lectura $version pour Android 12 ou plus

- Corrige le cadrage sur les téléphones en portrait allongé : la scène donne toute la largeur aux sept personnages et le terminal passe dessous. Le cas 1080 × 2400 à 600 dp de large a été testé sur émulateur.
- **À propos** indique désormais **Lectura Android** pour le distinguer de Lectura Web.
- Le paysage et le cadrage des exports PNG et vidéo ne changent pas.
- Téléchargez **Lectura.apk** et installez-le par-dessus la version précédente, **sans désinstaller**. Le ZIP est facultatif et contient aussi les sources et les notices.

[APK de la recette signée Android #$code](https://github.com/$repo/actions/runs/$run), commit \`$sha\`. La mise à jour depuis la 1.1.3 publique, la conservation des projets et les exports ont été vérifiés sur émulateur Android 12.

- SHA-256 de l’APK : \`$apk_hash\`
- Certificat de signature inchangé : \`$cert\`
- Sources et licences : \`$sources\`.
EOF

phase='envoi au brouillon et relecture des trois fichiers'
api "releases/$draft" | jq -e --arg tag "$tag" --arg sha "$sha" '.draft and .tag_name==$tag and .target_commitish==$sha' >/dev/null
release upload "$tag" "$apk" "$work/$bundle" "$work/$sources" --clobber
mkdir "$work/relu"
release download "$tag" --dir "$work/relu" --pattern Lectura.apk --pattern "$bundle" --pattern "$sources"
for file in "$apk" "$work/$bundle" "$work/$sources"; do cmp "$file" "$work/relu/$(basename "$file")"; done
verify_apk "$work/relu/Lectura.apk"
release edit "$tag" --notes-file "$work/notes.md"

phase='publication et téléchargement public sans authentification'
api 'releases/latest' | jq -e '.tag_name=="v1.1.3"' >/dev/null
release edit "$tag" --draft=false --latest
api "git/ref/tags/$tag" | jq -e --arg sha "$sha" '.object.type=="commit" and .object.sha==$sha' >/dev/null
api "releases/tags/$tag" > "$work/release.json"
jq -e --arg tag "$tag" --arg sha "$sha" --argjson id "$draft" '
  .id==$id and .tag_name==$tag and .target_commitish==$sha and .draft==false and .prerelease==false
  and (.assets|length)==3' "$work/release.json" >/dev/null
for file in "$apk" "$work/$bundle" "$work/$sources"; do
  name=$(basename "$file")
  jq -e --arg name "$name" --arg url "$base$name" --arg digest "sha256:$(sha256 "$file")" '
    any(.assets[]; .name==$name and .state=="uploaded" and .browser_download_url==$url and .digest==$digest)
  ' "$work/release.json" >/dev/null
  curl -fsSL --retry 3 --retry-all-errors --max-time 120 "$base$name" -o "$work/public"
  cmp "$file" "$work/public"
done
printf '::notice title=APK Android 1.1.4 publié::Code %s ; téléchargement anonyme identique ; SHA-256 %s.\n' "$code" "$apk_hash"
printf -- '- [Télécharger Lectura.apk](%sLectura.apk)\n- Recette Android #%s, SHA-256 : `%s`\n' "$base" "$code" "$apk_hash" >> "$GITHUB_STEP_SUMMARY"
