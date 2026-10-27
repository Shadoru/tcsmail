#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)";cd "$ROOT"
echo '== TCS Mail 0.8.2-r14-fix3 validation =='
python3 scripts/quality/cross-platform-contract.py
node --check frontend/main.js
node --check frontend/views.js
node --check frontend/composer.js
node --check frontend/native_window.js
python3 scripts/quality/frontend-import-contract.py
python3 scripts/quality/ai-contextual-r2-contract.py
python3 scripts/quality/ai-content-timeout-r3-contract.py
python3 scripts/quality/ai-operation-memory-r4-contract.py
python3 scripts/quality/settings-navigation-guard.py
node scripts/quality/consolidation-phase2.mjs
node scripts/quality/navigation-modes.mjs
node scripts/quality/settings-functional-contract.mjs
python3 scripts/quality/theme-contrast-audit.py
node scripts/quality/recipient-thread-reader-contract.mjs
node scripts/quality/folder-expansion-contract.mjs
node scripts/quality/editor-calendar-io-contract.mjs
python3 scripts/quality/draft-data-contract.py
node scripts/quality/multiwindow-reader-draft-contract.mjs
python3 scripts/quality/r39-ux-contract.py
python3 scripts/quality/r40-ux-contract.py
python3 scripts/quality/r41-ux-contract.py
python3 scripts/quality/rust-source-clippy-guard.py
python3 scripts/quality/ai-rust-0.8-contract.py
python3 scripts/quality/r2-rust199-regression.py
python3 scripts/quality/r3-rust199-regression.py
python3 scripts/quality/r4-ux-contract.py
python3 scripts/quality/r5-ux-contract.py
python3 scripts/quality/r6-columns-contract.py
python3 scripts/quality/r7-stability-contract.py
python3 scripts/quality/r8-reading-settings-contract.py
python3 scripts/quality/ai-migration-0.8-contract.py
python3 scripts/quality/preservation-0.8-contract.py
python3 scripts/quality/purge-agent-0.8-test.py
python3 scripts/quality/ipc-parity-0.8.py
python3 scripts/quality/oauth-google-0.8.1-contract.py
python3 scripts/quality/oauth-token-secret-debug-guard.py
python3 scripts/quality/oauth-mock-server-regression.py
python3 scripts/quality/r7-autoaccount-composer-feedback-contract.py
python3 scripts/quality/release-consistency-0.8.1.py
python3 scripts/quality/i18n-mpl-0.8.1-contract.py
python3 scripts/quality/r8-maturity-contract.py
python3 scripts/quality/r9-maturity-contract.py
python3 scripts/quality/r10-integrated-composition-contract.py
bash -n scripts/install.sh
bash -n scripts/purge-tcs-agent.sh
bash -n scripts/rust-gates.sh
bash -n scripts/build-macos.sh
! grep -RqiE 'AF-12|AcertoFumo|ReceitaGuard' frontend src-tauri crates config data || { echo 'PRIVATE CUSTOMIZATION GUARD: FAIL';exit 1; }
! grep -RqiE 'TCS_MAIL_AGENT_PORT|X-TCS-Agent-Token|agent_ensure_running|http://127\.0\.0\.1:8765' frontend src-tauri crates || { echo 'SEPARATE AGENT GUARD: FAIL';exit 1; }
# OAuth scope guard: this release intentionally permits Google only.
! grep -RqiE 'login\.microsoftonline\.com|graph\.microsoft\.com|api\.login\.yahoo\.com|oauth\.yahoo\.com' frontend src-tauri crates || { echo 'OAUTH PROVIDER SCOPE GUARD: FAIL';exit 1; }
echo 'GOOGLE OAUTH SCOPE GUARD: PASS'
echo 'SEPARATE AGENT GUARD: PASS'
echo 'PRIVATE CUSTOMIZATION GUARD: PASS'
python3 scripts/quality/ai-reader-source-r5-contract.py
python3 scripts/quality/ai-reader-r6-contract.py
python3 scripts/quality/r7-provider-cancellation-contract.py
python3 scripts/quality/r8-clippy-ipc-regression.py
node --experimental-default-type=module scripts/quality/r7-ai-workspace-behavior.mjs
python3 scripts/quality/r9-inline-transfer-contract.py
python3 scripts/quality/r10-response-surface-contract.py
node scripts/quality/r11-composer-regression.mjs
node scripts/quality/r11-fix1-dom-regression.mjs
node scripts/quality/r11-fix2-transfer-contract.mjs
node scripts/quality/r12-composer-contract.mjs
python3 scripts/quality/r13-draft-import-contract.py
node --experimental-default-type=module scripts/quality/r14-safety-contract.mjs
python3 scripts/quality/r14-contract.py
node scripts/quality/r14-fix-settings-regression.mjs
python3 scripts/quality/r14-fix2-find-contract.py
python3 scripts/quality/r14-fix3-search-regression.py
python3 scripts/quality/audit4-rag-read-errors.py
echo 'TCS MAIL 0.8.2-r14-fix3 VALIDATION: PASS'
