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
export PATH="$ANDROID_HOME/platform-tools:$PATH"
cli_dir=$(find "$ANDROID_HOME/cmdline-tools" -maxdepth 4 -name sdkmanager -print -quit 2>/dev/null || true)
if [[ -z "$cli_dir" ]]; then
  temp=$(mktemp -d)
  curl -fsSL --retry 2 'https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip' -o "$temp/tools.zip" >"$log" 2>&1
  unzip -qo "$temp/tools.zip" -d "$temp"
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  mv "$temp/cmdline-tools" "$ANDROID_HOME/cmdline-tools/lectura"
  cli_dir="$ANDROID_HOME/cmdline-tools/lectura/bin/sdkmanager"
  rm -rf "$temp"
fi
export PATH="$(dirname "$cli_dir"):$PATH"
echo "::notice file=docs/ANDROID_PARITE.md,title=Outils Android::SDK=${ANDROID_HOME}; sdkmanager=${cli_dir}; KVM=$(test -c /dev/kvm && echo oui || echo non)"
{
  set +o pipefail
  yes | sdkmanager --licenses
  set -o pipefail
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
