#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
echo '== Verification 1/3: TCS Mail 0.8 static architecture =='
./scripts/validate-0.8.sh
for f in frontend/*.js; do node --check "$f"; done
python3 -m compileall -q scripts/quality
echo 'SYSTEM STATIC VERIFICATION: PASS'
