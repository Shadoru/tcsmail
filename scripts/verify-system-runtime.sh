#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
echo '== Verification 3/3: integrated Rust AI contracts + browser journeys =='
python3 scripts/quality/ai-rust-0.8-contract.py
python3 scripts/quality/ai-migration-0.8-contract.py
python3 scripts/quality/browser-journeys-41-44.py
python3 scripts/quality/browser-native-composer.py
python3 scripts/quality/browser-native-composer-r41.py
echo 'SYSTEM RUNTIME-AVAILABLE VERIFICATION: PASS'
