#!/usr/bin/env bash
# Test input only: the published model, unmodified, is not part of the .deb.
set -euo pipefail
: "${1:?chemin de destination requis}"
sha=b1d946fd68d0347155fa59bce0a018924abbef3c1561181db45ca463d83963ef
mkdir -p "$(dirname "$1")"
curl --fail --silent --show-error --location --retry 2 --max-time 120 \
  https://initdv.github.io/Lectura/models/siwis.onnx -o "$1.part"
printf '%s  %s\n' "$sha" "$1.part" | sha256sum -c -
mv "$1.part" "$1"
