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
export HOME="$work" XDG_CONFIG_HOME="$work/config" XDG_DATA_HOME="$work/data"
voice='{"source":"voix"}'
if [[ -n ${LECTURA_TEST_SIWIS:-} ]]; then
  mkdir -p "$XDG_DATA_HOME/Lectura/Lectura/voices"
  cp "$LECTURA_TEST_SIWIS" "$XDG_DATA_HOME/Lectura/Lectura/voices/siwis.onnx"
  voice='{"source":"voix","voix":{"moteur":"piper","id":"siwis"}}'
fi
cat > "$work/Test.lectura" <<JSON
{"version":1,"id":"verification-linux","titre":"Candidat Linux","personnageId":"aicha","texte":"Bonjour et bienvenue dans Lectura, un logiciel de bureau. Approche un peu et écoute cette lecture de test. Merci et à bientôt !","audio":$voice}
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

# Export from the packaged desktop app (reuse the paused soundtrack).
find_window() {
  timeout 12s xdotool search --sync --onlyvisible --all --limit 1 --pid "$pid" --name "$1"
}
xdotool windowfocus --sync "$wid" key ctrl+shift+e
if ! format=$(find_window '^Exporter en MP4$'); then
  cat "$work/app.log"; echo 'Dialogue du format vidéo introuvable' >&2; exit 1
fi
xdotool windowfocus --sync "$format" key Return
if ! save=$(find_window '^Enregistrer la vidéo$'); then
  cat "$work/app.log"; echo 'Dialogue d’enregistrement du MP4 introuvable' >&2; exit 1
fi
xdotool windowfocus --sync "$save" key Return
movie="$work/Candidat Linux.mp4"
if ! timeout 45s bash -c 'until [[ -s $1 ]]; do kill -0 "$2" || exit 1; sleep .2; done' _ "$movie" "$pid"; then
  cat "$work/app.log"; echo 'MP4 introuvable après export depuis le paquet' >&2; exit 1
fi
video=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height -of csv=p=0 "$movie")
sound=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$movie")
[[ $video == h264,1280,720 && $sound == aac ]]
profil=eSpeak
if [[ -n ${LECTURA_TEST_SIWIS:-} ]]; then profil='Siwis HD'; fi
printf '::notice title=Lectura installé::Lanceur, projet, lecture %s hors ligne, pause et export H.264/AAC vérifiés avec Xvfb/PulseAudio.\n' "$profil"
