from pathlib import Path
import re
p=Path(__file__).resolve().parents[2] / 'crates/tcs-core/src/async_mail.rs'
s=p.read_text()
def body(start, end):
    return s.split(start,1)[1].split(end,1)[0]
flags=body('pub async fn set_message_flags_uid(', '/// Append complete RFC822 bytes')
star=body('pub async fn set_starred_uid(', '/// Apply both remotely stored')
checks={
'UID check before select': flags.index('checked_uid(uid)?') < re.search(r'session\s*\.\s*select\s*\(\s*folder\s*\)', flags).start(),
'folder validated': 'checked_folder(folder)?' in flags,
'no-op needs no network': flags.index('seen.is_none() && starred.is_none()') < re.search(r'session\s*\.\s*select\s*\(\s*folder\s*\)', flags).start(),
'correct Seen flag': r'\\Seen' in flags,
'correct Flagged flag': r'\\Flagged' in flags,
'no sequence STORE': bool(re.search(r'uid_store\s*\(\s*&uid\s*,\s*&command\s*\)', flags)),
'flag responses fully consumed': bool(re.search(r'try_collect\s*\(\s*\)\s*\.\s*await', flags)),
'STORE errors propagated': bool(re.search(r'map_err\s*\(\s*\|e\|\s*MailError::Protocol\s*\(\s*e\.to_string\(\)\s*\)\s*\)\s*\?', flags)),
'star validates UID': 'checked_uid(uid)?' in star,
'star uses UID STORE': bool(re.search(r'uid_store\s*\(\s*&uid\s*,\s*command\s*\)', star)),
'star consumes response': bool(re.search(r'try_collect\s*\(\s*\)\s*\.\s*await', star)),
'no silent retry': 'retry' not in flags.lower(),
}
for name,ok in checks.items():
    print(f"{'PASS' if ok else 'FAIL'}: {name}")
assert all(checks.values())
for name, next_name in [('copy_uid','move_uid'), ('move_uid','set_seen_uid'), ('set_seen_uid','set_starred_uid')]:
    b=body('pub async fn '+name+'(', 'pub async fn '+next_name+'(')
    assert 'checked_folder(' in b, name+' missing folder validation'
    assert b.index('checked_folder(') < re.search(r'session\s*\.\s*select\s*\(', b).start(), name+' validation too late'
    print('PASS:', name, 'folder guarded before select')
print('PASS: 15 async mutation guards')
