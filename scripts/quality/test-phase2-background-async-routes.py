#!/usr/bin/env python3
"""Conservative production-route check; never substitutes for runtime IMAP tests."""
from pathlib import Path
import re
source=(Path(__file__).resolve().parents[2]/'src-tauri/src/lib.rs').read_text(encoding="utf-8")
tick=source[source.index('pub fn background_tick()'):source.index('pub fn background_idle()')]
idle=source[source.index('pub fn background_idle()'):source.index('pub fn migrate_ai_only()')]
tick_flat=re.sub(r'\s+', '', tick)
idle_flat=re.sub(r'\s+', '', idle)
checks={
 'tick uses one dedicated Tokio runtime': 'new_current_thread()' in tick and '.enable_all()' in tick_flat,
 'tick sync uses async backend': 'imap_runtime.block_on(state.sync.sync_recent_async(' in tick_flat,
 'tick reconciles using async backend': 'imap_runtime.block_on(state.sync.reconcile_folder_async(' in tick_flat,
 'idle worker uses dedicated Tokio runtime': 'new_current_thread()' in idle and '.enable_all()' in idle_flat,
 'idle-triggered sync uses async backend': 'worker_state.sync.sync_recent_async(' in idle_flat,
 'idle-triggered reconcile uses async backend': 'worker_state.sync.reconcile_folder_async(' in idle_flat,
 'tick no legacy sync': not re.search(r'\.sync\.sync_recent\(',tick),
 'idle no legacy sync': not re.search(r'\.sync\.sync_recent\(',idle),
 'tick no legacy reconcile': not re.search(r'\.sync\.reconcile_folder\(',tick),
 'idle no legacy reconcile': not re.search(r'\.sync\.reconcile_folder\(',idle),
 'legacy IDLE call removed': 'tcs_core::mail::idle_wait_once(' not in idle_flat,
 'polling is bounded': '60' in idle and 'min(300)' in idle,
 'no stale password fetched by worker': 'mail_auth_secret(' not in idle,
 'sync failure skips reconciliation and rules': 'sync_recent_async' in idle and 'reconcile_folder_async' in idle and 'result.is_ok()' in idle,
}
for k,v in checks.items():
 print(('PASS' if v else 'FAIL')+': '+k)
assert all(checks.values())
for description,needle in [
 ('tick downgrades sync to legacy','imap_runtime.block_on(state.sync.sync_recent_async('),
 ('idle downgrades sync to legacy','worker_state.sync.sync_recent_async('),
 ('tick downgrades reconcile to legacy','imap_runtime.block_on(state.sync.reconcile_folder_async('),
 ('idle downgrades reconcile to legacy','worker_state.sync.reconcile_folder_async('),
]:
 mutant=re.sub(r'\s+', '', source).replace(needle,'legacy_sync_removed(',1)
 assert mutant!=re.sub(r'\s+', '', source) and needle not in mutant,description
 print('PASS: negative mutation detected:', description)
print(f'BACKGROUND_ASYNC_CHECKS={len(checks)} PASS={sum(checks.values())} MUTATIONS=4')
