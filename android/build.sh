#!/usr/bin/env bash
# SDK officiel + JDK, aucun Gradle ni daemon. Le dossier de travail est temporaire, hors dépôt.
set -euo pipefail
cd "$(dirname "$0")/.."
check=0
if [[ ${1:-} == --check ]]; then check=1; shift; fi
if (( $# > 1 || (check && $#) )); then
  echo 'Usage : android/build.sh [chemin.apk] ou android/build.sh --check' >&2
  exit 2
fi
SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
BT=${ANDROID_BUILD_TOOLS:-${SDK:+$SDK/build-tools/37.0.0}}
PLATFORM=${ANDROID_JAR:-${SDK:+$SDK/platforms/android-37.0/android.jar}}
if [[ ! -f ${PLATFORM:-} && ! -v ANDROID_JAR ]]; then PLATFORM=${SDK:+$SDK/platforms/android-37/android.jar}; fi
: "${BT:?Installe Android SDK Build Tools 37.0.0 et configure ANDROID_HOME.}"
: "${PLATFORM:?Installe Android SDK Platform 37.}"
JAVA=${JAVA:-java}
JAVAC=${JAVAC:-javac}
KEYTOOL=${KEYTOOL:-keytool}
D8=${D8:-$BT/d8}
AAPT2=${AAPT2:-$BT/aapt2}
ZIPALIGN=${ZIPALIGN:-$BT/zipalign}
APKSIGNER=${APKSIGNER:-$BT/apksigner}
version=${LECTURA_VERSION_CODE:-1}
if [[ ! $version =~ ^[1-9][0-9]{0,9}$ ]] || ((version > 2100000000)); then
  echo 'LECTURA_VERSION_CODE invalide (entier de 1 à 2100000000).' >&2
  exit 2
fi
if ((!check)); then
  : "${LECTURA_KEYSTORE:?Keystore permanent requis ; voir android/README.md.}"
  : "${LECTURA_STORE_PASS:?Mot de passe du keystore permanent requis.}"
  : "${LECTURA_SIGNING_CERT_SHA256:?Empreinte publique du certificat permanent requise.}"
  KEYSTORE=$(realpath -e -- "$LECTURA_KEYSTORE")
  [[ -f $KEYSTORE && -r $KEYSTORE ]] || { echo 'Keystore illisible.' >&2; exit 2; }
  case "$KEYSTORE" in "$PWD"/*) echo 'Garder le keystore hors du dépôt.' >&2; exit 2;; esac
  expected=${LECTURA_SIGNING_CERT_SHA256,,}
  [[ $expected =~ ^[a-f0-9]{64}$ ]] || { echo 'Empreinte SHA-256 de certificat invalide.' >&2; exit 2; }
  alias=${LECTURA_KEY_ALIAS:-lectura}
  store_pass=$LECTURA_STORE_PASS
  key_pass=${LECTURA_KEY_PASS:-$store_pass}
  # Ne transmettre les mots de passe qu’aux outils qui ouvrent le keystore.
  unset LECTURA_STORE_PASS LECTURA_KEY_PASS
  actual=$(LECTURA_STORE_PASS="$store_pass" "$KEYTOOL" -exportcert -keystore "$KEYSTORE" \
    -storepass:env LECTURA_STORE_PASS -alias "$alias" | sha256sum)
  [[ ${actual%% *} == "$expected" ]] || { echo 'Certificat du keystore différent du certificat permanent attendu.' >&2; exit 1; }
  OUTPUT=$(realpath -m "${1:-android/build/Lectura.apk}")
  if [[ -n ${LECTURA_TEST_APK:-} ]]; then
    TEST_OUTPUT=$(realpath -m "$LECTURA_TEST_APK")
    [[ $TEST_OUTPUT != "$OUTPUT" ]] || { echo 'Sorties application et instrumentation identiques.' >&2; exit 2; }
  fi
else
  unset LECTURA_STORE_PASS LECTURA_KEY_PASS
fi
WORK=$(mktemp -d "${TMPDIR:-/tmp}/lectura-build.XXXXXXXX")
trap 'rm -rf -- "$WORK"' EXIT
mkdir -p "$WORK"/{classes,dex,res}
node android/assets.mjs "$WORK/assets" "$WORK/res"
cp -r android/res/. "$WORK/res/"
if [[ -v LECTURA_HD_INDEX ]]; then cp "$LECTURA_HD_INDEX" "$WORK/assets/hd-index.json"; fi
if [[ -v LECTURA_ORT_AAR ]]; then
  unzip -p "$LECTURA_ORT_AAR" classes.jar > "$WORK/ort.jar"
  unzip -qo "$LECTURA_ORT_AAR" 'jni/*/*.so' -d "$WORK/ort"
  # AARs may carry notices at their root or under META-INF. Preserve what the publisher ships.
  python3 - "$LECTURA_ORT_AAR" "$WORK/assets" <<'PYNOTICE'
import sys, zipfile
from pathlib import Path
with zipfile.ZipFile(sys.argv[1]) as aar:
    for name in aar.namelist():
        base = Path(name).name
        if base and base.lower().startswith(('license', 'notice', 'thirdpartynotice', 'third-party-notice')):
            (Path(sys.argv[2]) / ('ONNX-' + base)).write_bytes(aar.read(name))
PYNOTICE
fi
# Décompresse le même WOFF2 (pas de substitution par une police système).
python3 - "$WORK/assets" <<'PY'
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
font = TTFont('fonts/jetbrains-mono-latin.woff2', recalcTimestamp=False)
font.flavor = None
font.save(Path(sys.argv[1]) / 'jetbrains-mono.ttf')
PY
cp android/licenses/LGPL-2.1.txt "$WORK/assets/LAME-LGPL-2.1.txt"
cp src/vendor/lamejs/LICENSE "$WORK/assets/LAME-notice.txt"
cp android/licenses/COMPOSANTS.md "$WORK/assets/COMPOSANTS-ANDROID.md"
"$AAPT2" compile --dir "$WORK/res" -o "$WORK/res.zip"
"$AAPT2" link -I "$PLATFORM" --manifest android/AndroidManifest.xml \
  --min-sdk-version 31 --target-sdk-version 37 --version-code "$version" --replace-version \
  -A "$WORK/assets" -o "$WORK/resources.apk" "$WORK/res.zip"
find android/src -name '*.java' | sort > "$WORK/sources"
LAME_REV=582bbba6a12f981b984d8fb9e1874499fed85675
if [[ -v LECTURA_LAME_SRC ]]; then
  LAME_SRC=$LECTURA_LAME_SRC
else
  curl -fsSL --retry 2 "https://codeload.github.com/zhuker/lamejs/tar.gz/$LAME_REV" -o "$WORK/lame.tar.gz"
  tar -xzf "$WORK/lame.tar.gz" -C "$WORK" --wildcards '*/src/main/java/mp3/*' '*/src/main/java/mpg/*'
  LAME_SRC="$WORK/lamejs-$LAME_REV/src/main/java"
fi
find "$LAME_SRC/mp3" "$LAME_SRC/mpg" -name '*.java' ! -name 'Main.java' ! -name 'LameTest.java' ! -name 'GetAudio.java' ! -name 'Parse.java' ! -name 'BRHist.java' | sort >> "$WORK/sources"
"$JAVAC" -encoding UTF-8 -source 11 -target 11 -classpath "$PLATFORM" -d "$WORK/classes" @"$WORK/sources"
python3 - "$WORK" <<'PY'
import sys, zipfile
from pathlib import Path
w = Path(sys.argv[1]); directory = w/'classes'
with zipfile.ZipFile(w/'classes.jar', 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(directory.rglob('*.class')):
        z.write(f, f.relative_to(directory))
PY
inputs=("$WORK/classes.jar")
if [[ -f "$WORK/ort.jar" ]]; then inputs+=("$WORK/ort.jar"); fi
"$D8" --release --min-api 31 --lib "$PLATFORM" --output "$WORK/dex" "${inputs[@]}"
python3 - "$WORK" <<'PY'
import sys, zipfile
from pathlib import Path
w = Path(sys.argv[1])
with zipfile.ZipFile(w/'resources.apk', 'a', zipfile.ZIP_DEFLATED) as z:
    for f in sorted((w/'dex').glob('*.dex')):
        z.write(f, f.name)
    for f in sorted((w/'ort/jni').glob('*/*.so')):
        z.write(f, 'lib/' + str(f.relative_to(w/'ort/jni')))
PY
"$ZIPALIGN" -f 4 "$WORK/resources.apk" "$WORK/aligned.apk"
if ((check)) || [[ -n ${TEST_OUTPUT:-} ]]; then
  mkdir -p "$WORK"/{tests,assets-test,dex-test}
  node android/tests/fixtures.mjs "$WORK/assets-test/fixtures.json"
  if [[ -n ${LECTURA_TEST_SPEECH_WAV:-} ]]; then cp "$LECTURA_TEST_SPEECH_WAV" "$WORK/assets-test/lips-spoken.wav"; fi
  "$AAPT2" link -I "$PLATFORM" --manifest android/tests/AndroidManifest.xml \
    --min-sdk-version 31 --target-sdk-version 37 -A "$WORK/assets-test" -o "$WORK/tests.apk"
  find android/tests/java -name '*.java' | sort > "$WORK/test-list"
  "$JAVAC" -encoding UTF-8 -source 11 -target 11 -classpath "$PLATFORM:$WORK/classes.jar" -d "$WORK/tests" @"$WORK/test-list"
  python3 - "$WORK" <<'PY'
import sys, zipfile
from pathlib import Path
w = Path(sys.argv[1]); d = w/'tests'
with zipfile.ZipFile(w/'tests.jar', 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(d.rglob('*.class')):
        z.write(f, f.relative_to(d))
PY
  "$D8" --release --min-api 31 --lib "$PLATFORM" --classpath "$WORK/classes.jar" --output "$WORK/dex-test" "$WORK/tests.jar"
  python3 - "$WORK" <<'PY'
import sys, zipfile
from pathlib import Path
w = Path(sys.argv[1]); d = w/'dex-test'
with zipfile.ZipFile(w/'tests.apk', 'a', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(d.glob('*.dex')):
        z.write(f, f.name)
PY
  "$ZIPALIGN" -f 4 "$WORK/tests.apk" "$WORK/tests-aligned.apk"
fi
if ((check)); then
  echo 'Application et instrumentation compilées ; aucun APK produit (--check).'
  exit 0
fi

sign_apk() {
  local report digest
  LECTURA_STORE_PASS="$store_pass" LECTURA_KEY_PASS="$key_pass" "$APKSIGNER" sign \
    --ks "$KEYSTORE" --ks-key-alias "$alias" --ks-pass env:LECTURA_STORE_PASS \
    --key-pass env:LECTURA_KEY_PASS --v4-signing-enabled false --out "$2" "$1"
  report=$("$APKSIGNER" verify --verbose --print-certs "$2")
  digest=$(awk '/certificate SHA-256 digest:/ {print $NF}' <<< "$report")
  [[ $digest == "$expected" ]] || { echo 'Certificat de l’APK différent du certificat permanent attendu.' >&2; exit 1; }
  printf '%s\n' "$report"
}
# Ne sortir aucun APK tant que toutes les signatures demandées ne sont pas vérifiées.
sign_apk "$WORK/aligned.apk" "$WORK/app-signed.apk"
if [[ -n ${TEST_OUTPUT:-} ]]; then
  sign_apk "$WORK/tests-aligned.apk" "$WORK/tests-signed.apk"
  mkdir -p -- "$(dirname "$TEST_OUTPUT")"
  mv -fT -- "$WORK/tests-signed.apk" "$TEST_OUTPUT"
fi
mkdir -p -- "$(dirname "$OUTPUT")"
mv -fT -- "$WORK/app-signed.apk" "$OUTPUT"
printf '\nAPK : %s\n' "$OUTPUT"
