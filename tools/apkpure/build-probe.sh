#!/usr/bin/env bash
# Build only a sandbox UI probe, not Lectura, with a scratch key never used by the release.
set -euo pipefail
: "${ANDROID_HOME:?}"
: "${RUNNER_TEMP:?}"
work=$(mktemp -d "$RUNNER_TEMP/ui-probe-XXXXXX")
trap 'rm -rf -- "$work"' EXIT
bt="$ANDROID_HOME/build-tools/37.0.0"
platform=$(find "$ANDROID_HOME/platforms" -name android.jar -type f | sort -V | tail -n 1)
[[ -f $platform ]]
mkdir "$work/classes"
cat > "$work/AndroidManifest.xml" <<'XML'
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="io.github.initdv.lectura.capture">
  <uses-sdk android:minSdkVersion="31" android:targetSdkVersion="36"/>
  <application android:label="Lectura screenshot probe"/>
  <instrumentation android:name=".UiSnapshot" android:targetPackage="io.github.initdv.lectura.capture"/>
</manifest>
XML
javac -encoding UTF-8 -source 11 -target 11 -classpath "$platform" -d "$work/classes" tools/apkpure/UiSnapshot.java
jar cf "$work/probe.jar" -C "$work/classes" .
"$bt/d8" --release --min-api 31 --lib "$platform" --output "$work/dex.zip" "$work/probe.jar"
"$bt/aapt2" link -I "$platform" --manifest "$work/AndroidManifest.xml" -o "$work/probe.apk"
unzip -p "$work/dex.zip" classes.dex > "$work/classes.dex"
zip -q -j "$work/probe.apk" "$work/classes.dex"
"$bt/zipalign" -f 4 "$work/probe.apk" "$work/aligned.apk"
# Local, single-use test identity. No secrets are read and there is no release signing step.
keytool -genkeypair -storetype PKCS12 -keystore "$work/scratch.p12" -alias screenshot-probe \
  -storepass unused-test-key -dname 'CN=Lectura disposable screenshot probe' -keyalg RSA -keysize 2048 -validity 1
"$bt/apksigner" sign --ks "$work/scratch.p12" --ks-pass pass:unused-test-key --v4-signing-enabled false \
  --out "$1" "$work/aligned.apk"
