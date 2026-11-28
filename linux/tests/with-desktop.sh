#!/usr/bin/env bash
# Entrypoint for tests under an unprivileged user with virtual X11 and a local audio sink.
set -euo pipefail
export XDG_RUNTIME_DIR=$(mktemp -d)
export QT_QPA_PLATFORM=xcb LC_ALL=C.UTF-8
export PULSE_SERVER="unix:$XDG_RUNTIME_DIR/pulse/native"
cleanup() {
  pulseaudio --kill >/dev/null 2>&1 || true
  rm -rf "$XDG_RUNTIME_DIR"
}
trap cleanup EXIT
pulseaudio -n --daemonize=yes --exit-idle-time=-1 --log-target=stderr \
  --load='module-native-protocol-unix auth-anonymous=1' --load='module-null-sink sink_name=lectura'
pactl set-default-sink lectura
export LECTURA_REQUIRE_AUDIO=1
xvfb-run -a -s '-screen 0 1440x900x24' "$@"
