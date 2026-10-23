#!/usr/bin/env python3
"""Static Tokio contract guard; does not prove Rust compilation or IMAP interoperability."""
from pathlib import Path
import tomllib
root=Path(__file__).resolve().parents[2]
source=(root/'crates/tcs-core/src/async_mail.rs').read_text(encoding="utf-8")
core=tomllib.loads((root/'crates/tcs-core/Cargo.toml').read_text(encoding="utf-8"))
deps=core['dependencies']
ai=deps['async-imap']
assert ai['version']=='=0.12.0'
assert ai['default-features'] is False
assert ai['features']==['runtime-tokio']
assert 'type SecureTransport = TlsStream<TcpStream>;' in source
assert 'Client::new(socket)' in source
assert 'Client::new(stream)' in source
assert 'plaintext_client.run_command_and_check_ok("STARTTLS", None)' in source
assert 'plaintext_client.run_command_and_check_ok("STARTTLS")' not in source
assert 'plaintext_client.into_inner()' in source
assert 'tokio::io::AsyncRead' in source
assert 'tokio::io::AsyncWrite' in source
assert 'tokio-util' not in deps
assert '.compat()' not in source
print('PASS: Tokio transport static contract only (Rust compilation not verified)')
