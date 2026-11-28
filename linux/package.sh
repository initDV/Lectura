#!/usr/bin/env bash
# À exécuter sur la distribution de compilation (Debian 12 pour un paquet portable).
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
build=$(realpath "${1:-$root/build}")
out=$(realpath -m "${2:-$root/out}")
if [[ ! -x $build/lectura ]]; then
  echo "Compile d’abord Lectura : cmake --build '$build'" >&2
  exit 1
fi
version=$("$build/lectura" --version | awk 'NR == 1 { print $2 }')
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
version="$version-1"
arch=$(dpkg --print-architecture)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
stage="$tmp/debian/lectura"
DESTDIR="$stage" cmake --install "$build" --prefix /usr --strip
cat > "$tmp/debian/control" <<'CONTROL'
Source: lectura
Section: sound
Priority: optional
Maintainer: initDV <349978440+initDV@users.noreply.github.com>

Package: lectura
Architecture: any
Description: Native animated reading studio
CONTROL
shlibs=$(cd "$tmp"; dpkg-shlibdeps -O -e"$stage/usr/bin/lectura")
shlibs=${shlibs#shlibs:Depends=}
[[ -n $shlibs && $shlibs != *$'\n'* ]]
mkdir -p "$stage/DEBIAN" "$out"
installed=$(du -sk "$stage" | cut -f1)
cat > "$stage/DEBIAN/control" <<CONTROL
Package: lectura
Version: $version
Section: sound
Priority: optional
Architecture: $arch
Maintainer: initDV <349978440+initDV@users.noreply.github.com>
Installed-Size: $installed
Depends: $shlibs, qt6-qpa-plugins, ffmpeg, espeak-ng
Recommends: qt6-wayland, shared-mime-info
Homepage: https://github.com/initDV/Lectura
Description: Native animated reading studio for Linux
 Lectura reads local text with animated characters and a synchronized terminal.
 It can synthesize French speech or play an imported soundtrack, entirely offline.
CONTROL
name="lectura_${version}_${arch}.deb"
dpkg-deb --root-owner-group --build "$stage" "$out/$name"
(cd "$out"; sha256sum "$name" > "$name.sha256")
