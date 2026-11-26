#!/usr/bin/env bash
set -euo pipefail
work=$(mktemp -d)
pid=''
cleanup() {
  if [[ -n $pid ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  rm -rf "$work"
}
trap cleanup EXIT
[[ $(command -v lectura) == /usr/bin/lectura ]]
lectura --version
app=io.github.initdv.Lectura
[[ -s /usr/share/icons/hicolor/192x192/apps/$app.png && -s /usr/share/mime/packages/$app.xml ]]
desktop-file-validate "/usr/share/applications/$app.desktop"
cat > "$work/Test.lectura" <<'JSON'
{"version":1,"id":"verification-linux","titre":"Candidat Linux","personnageId":"aicha","texte":"Bonjour et bienvenue dans Lectura, un logiciel de bureau. Approche un peu et écoute cette lecture de test. Merci et à bientôt !","audio":{"source":"voix"}}
JSON
lectura "$work/Test.lectura" >"$work/app.log" 2>&1 & pid=$!
if ! wid=$(timeout 12s xdotool search --sync --onlyvisible --all --limit 1 --pid "$pid" --name 'Lectura .* Candidat Linux'); then
  cat "$work/app.log"; echo 'Fenêtre Lectura introuvable' >&2; exit 1
fi
xdotool windowfocus --sync "$wid"
xdotool key ctrl+Return
# Verify that the installed app opens a real output stream for locally synthesized speech.
heard=false
for _ in {1..100}; do
  streams=$(pactl list sink-inputs short)
  if [[ -n $streams ]]; then heard=true; break; fi
  if ! kill -0 "$pid" 2>/dev/null; then break; fi
  sleep .1
done
if [[ $heard != true ]]; then
  cat "$work/app.log"; echo 'Le paquet n’a pas ouvert de sortie audio.' >&2; exit 1
fi
if [[ -n ${LECTURA_SCREENSHOT:-} ]]; then
  sleep .8
  import -window "$wid" "$LECTURA_SCREENSHOT"
fi
xdotool key ctrl+Return
for _ in {1..40}; do
  streams=$(pactl list sink-inputs short)
  if [[ -z $streams ]]; then break; fi
  sleep .1
done
[[ -z $streams ]]
kill -0 "$pid"
echo '::notice title=Lectura installé::Lanceur, ouverture .lectura, lecture audio locale et pause vérifiés avec Xvfb/PulseAudio.'
