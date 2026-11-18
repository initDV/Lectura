#!/usr/bin/env bash
set -euo pipefail
: "${ANDROID_HOME:?SDK absent}" "${LECTURA_REPORT:?Dossier de rapport absent}"
mkdir -p "$LECTURA_REPORT"
log="$LECTURA_REPORT/emulator.txt"
report_failure() {
    code=$?
    if ((code)); then
        message=$(tail -c 1800 "$log" 2>/dev/null | tr '\r\n' ' ' | sed 's/%/%25/g')
        printf '::error file=docs/ANDROID_PARITE.md,title=Émulateur API 31::%s\n' "$message"
    fi
    adb emu kill >/dev/null 2>&1 || true
    exit "$code"
}
trap report_failure EXIT
{
  sdkmanager 'platform-tools' 'emulator' 'system-images;android-31;google_apis;x86_64'
  printf 'no\n' | avdmanager create avd --force --name lectura_ci --package 'system-images;android-31;google_apis;x86_64' --device 'pixel_4'
  ls -l /dev/kvm
  "$ANDROID_HOME/emulator/emulator" -accel-check
} >"$log" 2>&1
"$ANDROID_HOME/emulator/emulator" -avd lectura_ci -no-window -gpu swiftshader_indirect -no-snapshot -noaudio -no-boot-anim -camera-back none >>"$log" 2>&1 &
emu=$!
for ((i=0;i<150;i++)); do
    if [[ $(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r') == 1 ]]; then
        python3 android/tests/device.py "$1"
        exit 0
    fi
    if ! kill -0 "$emu" 2>/dev/null; then exit 1; fi
    sleep 2
done
exit 1
