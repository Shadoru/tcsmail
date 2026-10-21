#!/usr/bin/env python3
"""Regression tests of the lockfile acceptance gate with synthetic isolated lockfiles."""
import importlib.util
import pathlib
import tempfile

source = pathlib.Path(__file__).with_name("imap-proto-single-version-gate.py")
spec = importlib.util.spec_from_file_location("proto_gate", source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def lock(*versions):
    with tempfile.TemporaryDirectory() as temp:
        path = pathlib.Path(temp) / "Cargo.lock"
        path.write_text('version = 4\n' + ''.join(
            f'[[package]]\nname = "imap-proto"\nversion = "{version}"\n' for version in versions))
        return module.check_lock(path)

assert lock("0.16.7") == []
assert lock("0.17.0") == []
assert lock("1.0.0") == []
assert lock("0.16.6")
assert lock("0.10.2")
assert lock("0.16.7", "0.17.0")
assert lock("0.10.2", "0.16.7")
assert lock()
assert lock("0.17.0-alpha.1")
print("PASS: 9 single-proto regression scenarios")
