#!/usr/bin/env bash
# SDK officiel + JDK, aucun Gradle ni daemon. Le dossier de travail est temporaire, hors dépôt.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
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
OUTPUT=$(realpath -m "${1:-android/build/Lectura.apk}")
WORK=$(mktemp -d "${TMPDIR:-/tmp}/lectura-build.XXXXXXXX")
trap 'rm -rf -- "$WORK"' EXIT
mkdir -p "$WORK"/{classes,dex,res} "$(dirname "$OUTPUT")"
node android/assets.mjs "$WORK/assets" "$WORK/res"
cp -r android/res/. "$WORK/res/"
# Décompresse le même WOFF2 (pas de substitution par une police système).
python3 - "$WORK/assets" <<'PY'
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
font = TTFont('fonts/jetbrains-mono-latin.woff2', recalcTimestamp=False)
font.flavor = None
font.save(Path(sys.argv[1]) / 'jetbrains-mono.ttf')
PY
"$AAPT2" compile --dir "$WORK/res" -o "$WORK/res.zip"
"$AAPT2" link -I "$PLATFORM" --manifest android/AndroidManifest.xml \
  --min-sdk-version 31 --target-sdk-version 37 -A "$WORK/assets" -o "$WORK/resources.apk" "$WORK/res.zip"
find android/src -name '*.java' | sort > "$WORK/sources"
"$JAVAC" -encoding UTF-8 -source 11 -target 11 -classpath "$PLATFORM" -d "$WORK/classes" @"$WORK/sources"
python3 - "$WORK" <<'PY'
import sys, zipfile
from pathlib import Path
w = Path(sys.argv[1]); directory = w/'classes'
with zipfile.ZipFile(w/'classes.jar', 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(directory.rglob('*.class')):
        z.write(f, f.relative_to(directory))
PY
"$D8" --release --min-api 31 --lib "$PLATFORM" --output "$WORK/dex" "$WORK/classes.jar"
python3 - "$WORK" <<'PY'
import sys, zipfile
from pathlib import Path
w = Path(sys.argv[1])
with zipfile.ZipFile(w/'resources.apk', 'a', zipfile.ZIP_DEFLATED) as z:
    for f in sorted((w/'dex').glob('*.dex')):
        z.write(f, f.name)
PY
"$ZIPALIGN" -f 4 "$WORK/resources.apk" "$WORK/aligned.apk"
KEYSTORE=${LECTURA_KEYSTORE:-${HOME}/.android/debug.keystore}
export LECTURA_STORE_PASS=${LECTURA_STORE_PASS:-android}
export LECTURA_KEY_PASS=${LECTURA_KEY_PASS:-$LECTURA_STORE_PASS}
if [[ ! -f "$KEYSTORE" && ! -v LECTURA_KEYSTORE ]]; then
  mkdir -p "$(dirname "$KEYSTORE")"
  "$KEYTOOL" -genkeypair -storetype PKCS12 -keystore "$KEYSTORE" -storepass:env LECTURA_STORE_PASS \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Android Debug,O=Android,C=US'
fi
"$APKSIGNER" sign --ks "$KEYSTORE" --ks-key-alias "${LECTURA_KEY_ALIAS:-androiddebugkey}" \
  --ks-pass env:LECTURA_STORE_PASS --key-pass env:LECTURA_KEY_PASS --v4-signing-enabled false \
  --out "$OUTPUT" "$WORK/aligned.apk"
"$APKSIGNER" verify --verbose "$OUTPUT"
printf '\nAPK : %s\n' "$OUTPUT"
