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
package=io.github.initdv.lectura
instrument() {
    local phase="$1" class="$2" rc=0 check_log="$LECTURA_REPORT/android-$1.txt"
    shift 2
    adb shell am force-stop "$package"
    adb shell input keyevent KEYCODE_WAKEUP
    adb shell wm dismiss-keyguard
    timeout 330 adb shell am instrument -w -r "$@" "$package.tests/$package.$class" | tee "$check_log" || rc=$?
    cat "$check_log" >> "$LECTURA_REPORT/android-checks.txt"
    local result summary=''
    while IFS= read -r result; do
        result=${result%$'\r'};result=${result//%/%25}
        if [[ $result == LECTURA_ERROR* ]]; then
            printf '::error file=docs/ANDROID_PARITE.md,title=API 31 · %s::%s\n' "$phase" "${result:0:1400}"
        else
            summary+="${summary:+%0A}$result"
        fi
    done < <(grep -E '^LECTURA_(OK|ERROR|SKIP)' "$check_log" || true)
    # GitHub caps annotations per step. Keep the final offline test visible as well.
    if [[ -n $summary ]]; then
        printf '::notice file=docs/ANDROID_PARITE.md,title=API 31 · %s::%s\n' "$phase" "$summary"
    fi
    if ((rc)) || grep -q 'LECTURA_ERROR' "$check_log" || ! grep -q '^LECTURA_COMPLETE' "$check_log"; then
        summary=$(tail -c 1100 "$check_log" | tr '\r\n' ' ')
        printf '::error title=Instrumentation Android · %s::Code de retour %s ; %s\n' "$phase" "$rc" "${summary//%/%25}"
        return 1
    fi
}
no_radios() {
    adb shell cmd connectivity airplane-mode enable
    adb shell svc wifi disable
    adb shell svc data disable
}
export PATH="$ANDROID_HOME/platform-tools:$PATH"
export ANDROID_USER_HOME=${RUNNER_TEMP:-${TMPDIR:-/tmp}}/lectura-android
export ANDROID_AVD_HOME=$ANDROID_USER_HOME/avd
mkdir -p "$ANDROID_AVD_HOME"
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
  printf 'no\n' | avdmanager create avd --force --name lectura_ci --package 'system-images;android-31;google_apis;x86_64' --device 'pixel_4' --path "$ANDROID_AVD_HOME/lectura_ci.avd"
  ls -la "$ANDROID_AVD_HOME"
  "$ANDROID_HOME/emulator/emulator" -list-avds
  ls -l /dev/kvm
  "$ANDROID_HOME/emulator/emulator" -accel-check
} >"$log" 2>&1
"$ANDROID_HOME/emulator/emulator" -avd lectura_ci -memory 4096 -partition-size 4096 -no-window -gpu swiftshader_indirect -no-snapshot -noaudio -no-boot-anim -camera-back none >>"$log" 2>&1 &
emu=$!
for ((i=0;i<150;i++)); do
    if [[ $(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r') == 1 ]]; then
        adb shell wm size 390x780
        adb shell wm density 160
        adb shell settings put global window_animation_scale 0
        adb shell settings put global transition_animation_scale 0
        adb shell settings put global animator_duration_scale 0
        # Do not let Android's one-time full-screen hint cover the Lectura controls.
        adb shell settings put secure immersive_mode_confirmations confirmed
        adb shell svc power stayon true
        adb shell input keyevent KEYCODE_WAKEUP
        adb shell wm dismiss-keyguard
        tts=()
        if [[ -n ${LECTURA_TEST_TTS_APK:-} ]]; then
            adb install -r "$LECTURA_TEST_TTS_APK"
            adb shell settings put secure tts_default_synth com.reecedunn.espeak
            adb shell settings put secure tts_default_locale com.reecedunn.espeak:fra-FRA
            adb shell am start -W -n com.reecedunn.espeak/.DownloadVoiceData
            # am start -W waits for launch, not for the voice data extraction. Inspect the
            # activity records rather than assuming a specific spelling of the resumed field.
            for ((attempt=0;attempt<80;attempt++)); do
                activities=$(adb shell dumpsys activity activities)
                if ! grep -Eq 'ActivityRecord\{.*com\.reecedunn\.espeak/[^ ]*DownloadVoiceData' <<< "$activities"; then break; fi
                sleep 0.25
            done
            if ((attempt==80)); then
                echo '::error title=Préparation eSpeak NG::Extraction des données vocales non terminée avant l’instrumentation.'
                exit 1
            fi
            tts=(-e espeak true)
        fi
        adb logcat -c
        no_radios
        : > "$LECTURA_REPORT/android-checks.txt"
        failures=0
        if [[ -n ${LECTURA_PREDECESSOR_APK:-} ]]; then
            adb install "$LECTURA_PREDECESSOR_APK" | tee -a "$log"
            adb install "$2" | tee -a "$log"
            instrument avant-mise-a-jour UpgradeChecks -e mode seed || failures=1
            adb install -r "$1" | tee -a "$log" # No uninstall or clear between these two tests.
            instrument apres-mise-a-jour UpgradeChecks || failures=1
        else
            adb install "$1" | tee -a "$log"
            adb install "$2" | tee -a "$log"
        fi
        adb shell pm clear "$package" | tee -a "$log"
        instrument installation-en-avion DeviceChecks -e mode clean "${tts[@]}" || failures=1
        adb shell cmd connectivity airplane-mode disable
        adb shell svc wifi enable
        adb shell svc data enable
        if instrument telechargement DeviceChecks -e mode download; then
            no_radios
            instrument redemarrage-en-avion DeviceChecks -e mode offline-hd || failures=1
            instrument estelle-en-avion DeviceChecks -e mode offline-estelle || failures=1
            instrument kokoro-en-avion DeviceChecks -e mode offline-kokoro || failures=1
        else
            failures=1
        fi
        adb logcat -d -s AndroidRuntime:E Lectura:E > "$LECTURA_REPORT/android-errors.txt"
        adb pull /sdcard/Android/data/io.github.initdv.lectura/files/verification "$LECTURA_REPORT/device" || true
        mv "$LECTURA_REPORT"/device/android-*.png "$LECTURA_REPORT/" 2>/dev/null || true
        if ((failures)); then
            logline=$(head -c 1700 "$LECTURA_REPORT/android-errors.txt" | tr '\r\n' ' ')
            printf '::error file=docs/ANDROID_PARITE.md,title=Contrôles natifs::%s\n' "${logline//%/%25}"
        fi
        exit "$failures"
    fi
    if ! kill -0 "$emu" 2>/dev/null; then exit 1; fi
    sleep 2
done
exit 1
