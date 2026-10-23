#!/usr/bin/env python3
"""Post-migration Reply-To routing: fail closed on stale cached UID."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[2]
t=(root/'src-tauri/src/lib.rs').read_text(encoding="utf-8")
a=(root/'crates/tcs-core/src/async_mail.rs').read_text(encoding="utf-8")
route=t.split('async fn reply_context(',1)[1].split('\n#[tauri::command]',1)[0]
impl=a.split('pub async fn fetch_reply_to_if_epoch',1)[1].split('/// Retrieve message RFC822 bytes',1)[0]
def checks(s):
 return {
  'epoch in route': 'confirm_cached_message_identity(' in s and 'expected_validity' in s,
  'secure async reply-to': 'async_mail::fetch_reply_to_if_epoch(&mut session, &message.folder, message.uid, validity)' in s,
  'account lock': 'acquire_account_operation(account.id)' in s,
  'best effort logout': 'session.logout().await' in s,
  'offline sender fallback': 'remote_reply.unwrap_or_else(|| message.from_email.clone())' in s,
  'reply all recipients': 'message.to_text.as_str(), message.cc_text.as_str()' in s,
  'references preserved': 'message.references_text' in s,
 }
def impl_checks(s):
 return {
  'epoch 0 rejected': 'expected_validity == 0' in s,
  'read-only mailbox': '.examine(folder)' in s,
  'remote epoch checked': 'mailbox.uid_validity != Some(expected_validity)' in s,
  'reject before UID FETCH': 'mailbox.uid_validity != Some(expected_validity)' in s and s.index('mailbox.uid_validity != Some(expected_validity)') < s.index('.uid_fetch('),
  'BODY.PEEK': 'BODY.PEEK[HEADER.FIELDS (REPLY-TO)]' in s,
  'UID matches': 'response.uid != Some(uid)' in s,
  'duplicates rejected': 'if seen' in s,
  'parse failures propagated': 'mailparse::parse_headers(header)' in s,
 }
assert all(checks(route).values()), checks(route)
assert all(impl_checks(impl).values()), impl_checks(impl)
for field,mutation in [
 ('epoch in route',route.replace('confirm_cached_message_identity(', 'bypass_identity(',1)),
 ('secure async reply-to',route.replace('fetch_reply_to_if_epoch(', 'fetch_reply_to(',1)),
 ('account lock',route.replace('acquire_account_operation(', 'uncoordinated(',1)),
]:
 assert mutation!=route and not checks(mutation)[field],field
for field,mutation in [
 ('remote epoch checked',impl.replace('mailbox.uid_validity != Some(expected_validity)', 'false',1)),
 ('read-only mailbox',impl.replace('.examine(folder)', '.select(folder)',1)),
 ('UID matches',impl.replace('response.uid != Some(uid)','false',1)),
]:
 assert mutation!=impl and not impl_checks(mutation)[field],field
print('PASS: Reply-To UIDVALIDITY read-only and adversarial guards')
