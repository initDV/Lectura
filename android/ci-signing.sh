#!/usr/bin/env bash
# CI only. Keep the keystore outside Git and never upload it or expose its passwords.
set -euo pipefail
cd "$(dirname "$0")/.."
mode=${1:-}
case "$mode" in
  enroll|build) shift ;;
  *) echo 'Usage : android/ci-signing.sh enroll | build [chemin.apk]' >&2; exit 2 ;;
esac

: "${RUNNER_TEMP:?RUNNER_TEMP requis en CI.}"
: "${LECTURA_KEYSTORE_B64:?KEYSTORE_BASE64 requis dans android-signing.}"
: "${LECTURA_STORE_PASS:?KEYSTORE_PASSWORD requis dans android-signing.}"

# An optional preconfigured public fingerprint can independently confirm the initial enrollment.
configured=$(printf '%s' "${LECTURA_SIGNING_CERT_SHA256:-}" | tr -d '[:space:]:' | tr 'A-F' 'a-f')
if [[ -n $configured && ! $configured =~ ^[a-f0-9]{64}$ ]]; then
  echo '::error title=Empreinte du certificat invalide::LECTURA_SIGNING_CERT_SHA256 doit contenir les 64 chiffres hexadécimaux du certificat, sans préfixe.'
  exit 1
fi
pin=android/signing-cert.sha256
if [[ $mode == build ]]; then
  if [[ ! -f $pin ]]; then
    echo '::error title=Certificat permanent non inscrit::Aucun APK signé avant inscription de l’empreinte publique.'
    exit 1
  fi
  expected=$(<"$pin")
  if [[ ! $expected =~ ^[a-f0-9]{64}$ || ( -n $configured && $configured != "$expected" ) ]]; then
    echo '::error title=Empreintes de certificat incohérentes::Vérifier android/signing-cert.sha256 et, si elle est configurée, la variable LECTURA_SIGNING_CERT_SHA256.'
    exit 1
  fi
fi

umask 077
signing=$(mktemp -d "$RUNNER_TEMP/lectura-signing.XXXXXXXX")
trap 'rm -rf -- "$signing"' EXIT
export LECTURA_KEYSTORE="$signing/lectura.p12"
printf '%s' "$LECTURA_KEYSTORE_B64" | tr -d '[:space:]' | base64 --decode > "$LECTURA_KEYSTORE"
unset LECTURA_KEYSTORE_B64

if [[ $mode == enroll ]]; then
  # Only the SHA-256 of the public certificate leaves this step, never the DER or the keystore.
  cert=$("${KEYTOOL:-keytool}" -exportcert -keystore "$LECTURA_KEYSTORE" \
    -storepass:env LECTURA_STORE_PASS -alias "${LECTURA_KEY_ALIAS:-lectura}" | sha256sum)
  cert=${cert%% *}
  if [[ ! $cert =~ ^[a-f0-9]{64}$ || ( -n $configured && $cert != "$configured" ) ]]; then
    echo '::error title=Certificat du keystore inattendu::L’empreinte ne correspond pas à celle configurée.'
    exit 1
  fi
  printf '::notice title=Empreinte publique à inscrire::SHA-256 %s\n' "$cert"
  echo '::error title=Inscription avant signature::Consigner cette empreinte publique dans android/signing-cert.sha256, puis relancer. Aucun APK produit.'
  exit 1
fi

LECTURA_SIGNING_CERT_SHA256="$expected" bash android/build.sh "$@"
