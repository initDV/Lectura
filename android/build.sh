#!/usr/bin/env bash
# SDK officiel + JDK, aucun Gradle ni daemon. Le dossier de travail est temporaire, hors dépôt.
set -euo pipefail
cd "$(dirname "$0")/.."
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
  --min-sdk-version 31 --target-sdk-version 37 -A "$WORK/assets" -o "$WORK/resources.apk" "$WORK/res.zip"
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
if [[ -v LECTURA_TEST_APK ]]; then
  mkdir -p "$WORK"/{tests,assets-test,dex-test}
  node android/tests/fixtures.mjs "$WORK/assets-test/fixtures.json"
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
  "$APKSIGNER" sign --ks "$KEYSTORE" --ks-key-alias "${LECTURA_KEY_ALIAS:-androiddebugkey}" \
    --ks-pass env:LECTURA_STORE_PASS --key-pass env:LECTURA_KEY_PASS --v4-signing-enabled false \
    --out "$LECTURA_TEST_APK" "$WORK/tests-aligned.apk"
  "$APKSIGNER" verify "$LECTURA_TEST_APK"
fi
