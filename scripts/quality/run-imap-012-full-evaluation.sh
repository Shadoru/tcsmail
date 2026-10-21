#!/usr/bin/env bash
# Isolated, non-destructive migration audit. Never formats or updates source.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$ROOT"
echo '=== IMAP 0.12/0.17: verificação não destrutiva ==='
python3 scripts/quality/verify-imap-epoch-routes.py
python3 scripts/h4-source-audit.py
for test in \
  scripts/quality/test-target-imap-policy.py \
  scripts/quality/test-imap-proto-single-version-gate.py \
  scripts/quality/test-phase2-folder-tree-migration.py \
  scripts/quality/test-phase2-eml-async-route.py \
  scripts/quality/test-phase2-export-maildir-async.py \
  scripts/quality/test-phase2-reply-context-async.py \
  scripts/quality/test-phase2-mbox-export-async.py \
  scripts/quality/async-imap-migration-gate-test.py \
  scripts/quality/async-imap-evidence-guard-test.py \
  scripts/quality/phase2-backup-adversarial-test.py \
  scripts/quality/phase2-restore-isolation-test.py \
  scripts/quality/async-imap-runtime-contract.py \
  scripts/quality/test-async-imap-transport-bridge.py \
  scripts/quality/test-imap-phase2-contract-gates.py \
  scripts/quality/test-phase2-async-mutations.py \
  scripts/quality/test-phase2-operation-queue-safety.py \
  scripts/quality/test-phase2-queue-matrix-expanded.py \
  scripts/quality/test-phase2-stale-recovery-and-account-isolation.py \
  scripts/quality/test-phase2-targeted-queue.py \
  scripts/quality/test-phase2-late-worker-finalization.py \
  scripts/quality/test-phase2-queue-async-production.py \
  scripts/quality/test-phase2-uidplus-permanent-delete.py \
  scripts/quality/test-phase2-production-recent-sync.py \
  scripts/quality/test-phase2-async-backfill.py \
  scripts/quality/test-phase2-background-async-routes.py \
  scripts/quality/test-phase2-async-reconcile-safety.py \
  scripts/quality/test-phase2-transactional-sync.py \
  scripts/quality/imap-proto-single-version-gate.py \
  scripts/quality/async-imap-migration-gate.py
do
  echo "TEST: $test"
  python3 "$test"
done
if ! command -v cargo >/dev/null 2>&1; then
  echo 'BLOQUEADO: Cargo ausente; Rust/Tauri e integração ainda não homologados'
  exit 2
fi
cargo test --locked --workspace --lib -j 2
cargo check --locked --workspace --all-targets -j 2
printf '\nPASS: verificadores locais e Rust; testes IMAP reais e compilação de plataforma ainda necessários\n'
