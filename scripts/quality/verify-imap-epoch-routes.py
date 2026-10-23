#!/usr/bin/env python3
"""Fail-closed regression gate for cached UID/UIDVALIDITY (source-level).
This supplements, never replaces, the Rust TCP fixtures and live server tests.
"""
import pathlib, re, tomllib
root = pathlib.Path(__file__).resolve().parents[2]
core = (root/'crates/tcs-core/src/async_mail.rs').read_text(encoding="utf-8")
frontend = (root/'src-tauri/src/lib.rs').read_text(encoding="utf-8")
lock = tomllib.loads((root/'Cargo.lock').read_text(encoding="utf-8"))['package']
assert [p['version'] for p in lock if p['name']=='async-imap']==['0.12.0']
assert [p['version'] for p in lock if p['name']=='imap-proto']==['0.17.0']
assert not [p for p in lock if p['name']=='imap']
assert 'pub async fn read_raw_by_uid(' not in core
assert 'pub async fn fetch_reply_to(' not in core
assert 'read_raw_by_uid(' not in frontend
assert 'fetch_reply_to(' not in frontend
functions={}
for f in ('read_raw_by_uid_if_epoch','fetch_reply_to_if_epoch'):
 match=re.search(r'pub async fn '+f+r'<T>\(',core)
 assert match, f
 start=match.start(); end=core.find('\n/// ',match.end());
 if end<0:raise AssertionError('cannot bound source '+f)
 impl=core[start:end]
 functions[f]=impl
 assert 'expected_validity == 0' in impl,f
 assert '.examine(folder)' in impl,f
 assert 'mailbox.uid_validity != Some(expected_validity)' in impl,f
 assert impl.index('mailbox.uid_validity != Some(expected_validity)')<impl.index('.uid_fetch('),f
 assert 'response.uid != Some(uid)' in impl if f=='fetch_reply_to_if_epoch' else 'item.uid != Some(uid)' in impl,f
 assert 'Duplicate' in impl or 'matching_responses > 1' in impl,f
assert frontend.count('read_raw_by_uid_if_epoch(')==4
assert frontend.count('fetch_reply_to_if_epoch(')==1
assert frontend.count('confirm_cached_message_identity(')>=4
assert 'confirm_cached_folder_epoch(' in frontend
for action in ('get_raw_source','attach_message_as_eml','export_message_eml','export_folder_mbox'):
 match=re.search(r'async fn '+action+r'\(',frontend)
 assert match
 fn=frontend[match.start():frontend.index('\n#[tauri::command]',match.end())]
 assert 'UIDVALIDITY' in fn and 'validity' in fn and 'read_raw_by_uid_if_epoch(' in fn,action
 assert 'confirm_cached_message_identity(' in fn or 'confirm_cached_folder_epoch(' in fn,action
 assert fn.index('confirm_cached_')<fn.index('login_secure('),action
# Regression mutation: removing epoch check must be detected by criterion.
for f,source in functions.items():
 mutated=source.replace('mailbox.uid_validity != Some(expected_validity)','false',1)
 assert mutated!=source and 'mailbox.uid_validity != Some(expected_validity)' not in mutated,f
print('PASS: pinned async-imap/proto and all 5 UID+epoch routes guarded; negative checks passed')
