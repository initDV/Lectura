#!/usr/bin/env bash
# Keep the cause of a build/test failure visible in the check, even without its log archive.
set -euo pipefail
log=$(mktemp)
trap 'rm -f "$log"' EXIT
if "$@" 2>&1 | tee "$log"; then exit 0; fi
result=$(tail -45 "$log" | cut -c1-240)
result=${result//'%'/'%25'}
result=${result//$'\r'/'%0D'}
result=${result//$'\n'/'%0A'}
printf '::error title=Échec de la recette Linux::%s\n' "$result"
exit 1
