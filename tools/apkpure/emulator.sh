#!/usr/bin/env bash
# Run only on a disposable CI runner; no keystore, no rebuild, no release edits.
set -Eeuo pipefail
: "${ANDROID_HOME:?}" "${RUNNER_TEMP:?}" "${AVD_IMAGE:=system-images;android-36;google_apis;x86_64}"
export ANDROID_SERIAL=emulator-5554
export ANDROID_USER_HOME="$RUNNER_TEMP/lectura-capture-home"
export ANDROID_AVD_HOME="$ANDROID_USER_HOME/avd"
mkdir -p "$ANDROID_AVD_HOME"
out=$1
apk=$2
pkg=io.github.initdv.lectura
mkdir -p "$out"
emulator="$ANDROID_HOME/emulator/emulator"
phase='inspection de l’APK'
finish() {
  local rc=$?
  if ((rc)); then
    printf '::error title=Captures natives Lectura::Échec : %s (statut %s).\n' "$phase" "$rc"
    if [[ $phase == 'démarrage de l’émulateur' ]]; then tail -n 45 "$RUNNER_TEMP/emulator-capture.txt" || true; fi
    if [[ -f $RUNNER_TEMP/capture-fixtures/interface-echec.txt ]]; then
      cat "$RUNNER_TEMP/capture-fixtures/interface-echec.txt"
    fi
  fi
  timeout 10s adb emu kill >/dev/null 2>&1 || true
  exit "$rc"
}
trap finish EXIT
build_tools="$ANDROID_HOME/build-tools/37.0.0"
expected_cert=$(git show 3c5ca6d5a02c1475ca121958bde923f44004af97:android/signing-cert.sha256)
[[ $expected_cert == b6873c0f1a2f447163fb9af7e6f4181280b31fd1f5c45b0535993075b3dc7d8b ]]
expected_apk=d2121f08964d98d6d3f5b1cc784daf18e41caaf34f5b5553a34356ec808f55c0
{
  printf 'Lectura.apk : https://github.com/initDV/Lectura/releases/download/v1.0.0/Lectura.apk\n'
  printf 'Octets : %s\nSHA-256 attendu : %s\n\n' "$(wc -c < "$apk")" "$expected_apk"
  [[ $(wc -c < "$apk") == 71681981 ]]
  printf '%s  %s\n' "$expected_apk" "$apk" | sha256sum -c
  printf '\nAndroid SDK apksigner verify --verbose --print-certs:\n'
  "$build_tools/apksigner" verify --verbose --print-certs "$apk" > "$RUNNER_TEMP/lectura-capture-cert.txt"
  cat "$RUNNER_TEMP/lectura-capture-cert.txt"
  [[ $(awk '/certificate SHA-256 digest:/ {print $NF}' "$RUNNER_TEMP/lectura-capture-cert.txt") == "$expected_cert" ]]
  printf '\nAndroid SDK aapt2 dump badging :\n'
  "$build_tools/aapt2" dump badging "$apk" > "$RUNNER_TEMP/lectura-capture-badging.txt"
  grep -E '^(package:|[[:alpha:]]*[sS]dkVersion:|native-code:|uses-permission:)' "$RUNNER_TEMP/lectura-capture-badging.txt"
  grep -q "^package: name='$pkg' versionCode='32' versionName='1.0.0'" "$RUNNER_TEMP/lectura-capture-badging.txt"
  printf '\nAndroid SDK aapt2 dump xmltree — uses-sdk du manifeste compilé :\n'
  "$build_tools/aapt2" dump xmltree --file AndroidManifest.xml "$apk" > "$RUNNER_TEMP/lectura-capture-manifest.txt"
  grep -A3 'E: uses-sdk' "$RUNNER_TEMP/lectura-capture-manifest.txt"
  grep -Eq 'minSdkVersion[^=]*= *(\(type 0x10\) *)?(31|0x0*1[fF])([[:space:]]|$)' "$RUNNER_TEMP/lectura-capture-manifest.txt"
  grep -Fxq "targetSdkVersion:'37'" "$RUNNER_TEMP/lectura-capture-badging.txt"
} | tee "$out/Verification-APK.txt"
printf '::notice title=APK public vérifié::Lectura.apk · %s · 1.0.0 · versionCode 32 · minSdk 31 · targetSdk 37 · APK SHA-256 %s · certificat permanent SHA-256 %s\n' "$pkg" "$expected_apk" "$expected_cert"

phase='compilation de la sonde d’interface indépendante'
bash tools/apkpure/build-probe.sh "$RUNNER_TEMP/UiSnapshot.apk"
phase='démarrage de l’émulateur'
printf 'no\n' | avdmanager create avd -f -n captura_lectura -k "$AVD_IMAGE" -d pixel_4
python3 - "$ANDROID_AVD_HOME/captura_lectura.avd/config.ini" <<'PYAVD'
from pathlib import Path
import sys
p = Path(sys.argv[1])
settings = {'hw.lcd.width': '1080', 'hw.lcd.height': '1920', 'hw.lcd.density': '420',
            'skin.name': '1080x1920', 'skin.path': '_no_skin', 'showDeviceFrame': 'no'}
lines = [line for line in p.read_text().splitlines() if line.split('=', 1)[0] not in settings]
p.write_text('\n'.join(lines + [f'{k}={v}' for k, v in settings.items()]) + '\n')
PYAVD
"$emulator" -accel-check
"$emulator" -avd captura_lectura -port 5554 -memory 4096 -no-window -gpu swiftshader_indirect \
  -no-snapshot -wipe-data -noaudio -no-boot-anim -camera-back none > "$RUNNER_TEMP/emulator-capture.txt" 2>&1 &
emu=$!
for ((i=0; i<145; i++)); do
  if [[ $(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true) == 1 ]]; then break; fi
  kill -0 "$emu"
  sleep 2
done
[[ $(adb shell getprop sys.boot_completed | tr -d '\r') == 1 ]]
[[ $(adb shell getprop ro.build.version.sdk | tr -d '\r') == 36 ]]
adb root
adb wait-for-device
test "$(adb shell id -u | tr -d '\r')" = 0
adb shell wm size 1080x1920
adb shell wm density 420
adb shell svc power stayon true
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell settings put secure immersive_mode_confirmations confirmed
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command enter
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941
adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false
adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard

phase='installation et captures Android'
adb install "$RUNNER_TEMP/UiSnapshot.apk" | tee "$RUNNER_TEMP/probe-install.txt"
grep -Fxq Success "$RUNNER_TEMP/probe-install.txt"
adb install "$apk" | tee "$RUNNER_TEMP/capture-install.txt"
grep -Fxq Success "$RUNNER_TEMP/capture-install.txt"
adb shell dumpsys package "$pkg" > "$RUNNER_TEMP/capture-package.txt"
grep -E '^[[:space:]]*versionCode=32([[:space:]]|$).*minSdk=31([[:space:]]|$).*targetSdk=37([[:space:]]|$)' \
  "$RUNNER_TEMP/capture-package.txt" | tee -a "$out/Verification-APK.txt"
if ! python3 tools/apkpure/capture.py "$out" "$RUNNER_TEMP/capture-fixtures"; then
  adb logcat -d -s AndroidRuntime:E Lectura:E > "$RUNNER_TEMP/capture-errors.txt" || true
  sed -n '1,100p' "$RUNNER_TEMP/capture-errors.txt" || true
  exit 1
fi
find "$out/captures" -name '*.png' -type f | sort | tee "$RUNNER_TEMP/capture-files.txt"
[[ $(wc -l < "$RUNNER_TEMP/capture-files.txt") == 10 ]]
printf '\nÉmulateur Android 16, API 36, x86_64, 1080 × 1920 px, 420 dpi. Captures ADB natives non retouchées.\n' >> "$out/Verification-APK.txt"
printf '::notice title=10 captures Android contrôlées::5 écrans en français + 5 en anglais, 1080×1920 px ; export MP4 720×1280 avec AAC vérifié pour les deux langues.\n'
