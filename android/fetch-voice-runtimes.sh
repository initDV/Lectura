#!/usr/bin/env bash
# Only build dependencies, never the downloadable voice models.
set -euo pipefail
: "${1:?Dossier temporaire des dépendances vocales requis}"
mkdir -p "$1"
cd "$1"
maven=https://repo.maven.apache.org/maven2
curl -fsSL --retry 2 'https://github.com/k2-fsa/sherpa-onnx/releases/download/v2.0.1/sherpa-onnx-static-link-onnxruntime-2.0.1.aar' -o sherpa.aar
echo '07e042d97f3a6bd5b7fe74d4eef0513dc01a714b16c15a903250095aba43a575  sherpa.aar' | sha256sum -c
curl -fsSL --retry 2 "$maven/org/jetbrains/kotlin/kotlin-stdlib/2.2.21/kotlin-stdlib-2.2.21.jar" -o kotlin.jar
curl -fsSL --retry 2 "$maven/org/apache/commons/commons-compress/1.27.1/commons-compress-1.27.1.jar" -o compress.jar
curl -fsSL --retry 2 "$maven/commons-io/commons-io/2.16.1/commons-io-2.16.1.jar" -o io.jar
