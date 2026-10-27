#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
echo '== TCS Mail 0.8 foundational guard =='
python3 scripts/quality/ai-rust-0.8-contract.py
python3 scripts/quality/preservation-0.8-contract.py
! grep -RqiE 'oauth2?::|authorization[_ -]?code|\bpkce\b|/oauth2?/' frontend src-tauri crates || { echo 'OAUTH GUARD: FAIL'; exit 1; }
! grep -RqiE 'TCS_MAIL_AGENT_PORT|X-TCS-Agent-Token|agent_ensure_running|http://127\.0\.0\.1:8765' frontend src-tauri crates || { echo 'SEPARATE AGENT GUARD: FAIL'; exit 1; }
echo 'FOUNDATIONAL GUARD: PASS'
