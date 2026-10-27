#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
echo '== TCS Mail 0.8 regression audit =='
./scripts/validate-0.8.sh
python3 scripts/quality/browser-journeys-41-44.py
python3 scripts/quality/browser-native-composer.py
python3 scripts/quality/browser-native-composer-r41.py
python3 scripts/quality/browser-native-reader-r4.py
python3 scripts/verify-system-upgrade.py
python3 -m compileall -q scripts/quality homologation
grep -q 'search_tokens' crates/tcs-core/src/store.rs
grep -q 'waiting_undo' crates/tcs-core/src/outbound.rs
grep -q 'retry_wait' crates/tcs-core/src/outbound.rs
grep -q 'autoconfig.thunderbird.net' src-tauri/src/lib.rs
grep -q 'general.background_enabled' src-tauri/src/lib.rs
grep -q 'rule_query_matches' crates/tcs-core/src/productivity.rs
echo 'REGRESSION AUDIT: PASS'
