#!/usr/bin/env python3
"""Check the completed migration passes, while legacy manifest/code fails."""
import pathlib, subprocess, tempfile, sys, shutil
root=pathlib.Path(__file__).resolve().parents[2]
gate=root/'scripts/quality/async-imap-migration-gate.py'
run=lambda target:subprocess.run([sys.executable,str(gate),'--root',str(target)],capture_output=True,text=True)
current=run(root)
assert current.returncode==0,(current.stdout,current.stderr)
with tempfile.TemporaryDirectory() as temp:
 p=pathlib.Path(temp)
 (p/'crates/tcs-core/src').mkdir(parents=True)
 (p/'crates/tcs-core/Cargo.toml').write_text((root/'crates/tcs-core/Cargo.toml').read_text(encoding="utf-8").replace('[dependencies]','[dependencies]\nimap = "2.4.1"\nimap-proto = "0.10.2"',1))
 shutil.copyfile(root/'Cargo.lock',p/'Cargo.lock')
 (p/'crates/tcs-core/src/legacy.rs').write_text('use imap::Client;\n')
 bad=run(p)
 assert bad.returncode==1,(bad.stdout,bad.stderr)
 assert 'Direct legacy dependency: imap' in bad.stdout
 assert 'Direct legacy dependency: imap-proto' in bad.stdout
 assert 'legacy references' in bad.stdout
 print('PASS: finished migration passes; stale crates and legacy Rust usage rejected')
