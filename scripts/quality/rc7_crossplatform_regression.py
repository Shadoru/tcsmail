#!/usr/bin/env python3
"""Source gates for past packaging failures; intentionally not a substitute for native tests."""
from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[2]
conf=json.loads((root/'src-tauri/tauri.conf.json').read_text(encoding="utf-8"))
assert conf['version']=='0.8.2-rc8'
assert conf['identifier']=='com.thecreativesolver.TCSMail'
assert conf['bundle']['windows']['wix']['version']=='0.8.208'
rpm=conf['bundle']['linux']['rpm']
assert not any(Path(x).name=='tcs-mail.png' for x in rpm['files'])
flow=(root/'.github/workflows/tcsmail-homologacao.yml').read_text(encoding="utf-8")
for v in ('linux-x64','windows-x64','macos-intel','macos-arm64','0.rc8.1','rc7-provider-sync-contract.mjs','rc7_crossplatform_regression.py'):
 assert v in flow,f'missing CI gate {v}'
assert 'actions/upload-artifact@' in flow and 'contents: read' in flow
assert (root/'AGENTS.md').is_file()
main=(root/'src-tauri/src/main.rs').read_text(encoding="utf-8")
assert 'windows_subsystem' in main
rust=(root/'src-tauri/src/lib.rs').read_text(encoding="utf-8")
assert 'CREATE_NO_WINDOW' in rust and 'creation_flags(0x0800_0000)' in rust
secret=(root/'crates/tcs-core/src/secrets.rs').read_text(encoding="utf-8")
assert '"-EncodedCommand"' in secret and 'mod windows_credential_tests' in secret
package=(root/'scripts/quality/tcsmail-package-guard.py').read_text(encoding="utf-8")
assert 'import subprocess' in package and 'ditto' in package
assert not re.search(r'^\s+import subprocess$',package,re.M),'local import subprocess shadows global'
for f in ('src-tauri/tauri.conf.json','src-tauri/Cargo.toml','crates/tcs-core/Cargo.toml','Cargo.lock','src-tauri/resources/com.thecreativesolver.TCSMail.metainfo.xml'):
 assert '0.8.2-rc8' in (root/f).read_text(encoding="utf-8"),f
print('PASS: RC7 gates on windows subprocess, credential backend, versions, RPM/DEB, mac and CI')
