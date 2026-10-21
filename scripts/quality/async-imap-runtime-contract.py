#!/usr/bin/env python3
"""Static guard only; does not claim Rust compilation."""
from pathlib import Path
import sys,tomllib
root=Path(__file__).resolve().parents[2]
manifest=tomllib.loads((root/'crates/tcs-core/Cargo.toml').read_text())
dep=manifest['dependencies']['async-imap']
source=(root/'crates/tcs-core/src/async_mail.rs').read_text()
checks={
 'Pinned async-imap 0.12.0':dep.get('version')=='=0.12.0',
 'Tokio runtime enabled':dep.get('default-features') is False and 'runtime-tokio' in dep.get('features',[]),
 'Tokio IO traits used':'tokio::io::AsyncRead + tokio::io::AsyncWrite' in source,
 'No Tokio-to-Futures Compat':'TokioAsyncReadCompatExt' not in source and 'Compat<' not in source and '.compat()' not in source,
 'STARTTLS valid method arity':'run_command_and_check_ok("STARTTLS", None)' in source,
 'TCP transport native':'Client::new(socket)' in source,
 'TLS transport native':'Client::new(stream)' in source,
 'No TLS downgrade':'Unsupported IMAP security mode; refusing to connect' in source,
}
for key, ok in checks.items(): print(('PASS' if ok else 'FAIL'), key)
sys.exit(0 if all(checks.values()) else 1)
