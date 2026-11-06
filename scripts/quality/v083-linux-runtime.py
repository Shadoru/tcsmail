#!/usr/bin/env python3
"""Linux package prerequisites and optional synthetic Secret Service roundtrip.

The native builder only checks prerequisite commands. Run --verify-secret-store
inside the logged-in desktop session to test store/lookup/delete. No existing
credential is read; a unique QA attribute scopes all three operations.
"""
import argparse
import platform
import secrets
import shutil
import subprocess
import sys
import uuid

from v083_release import IDENTIFIER, VERSION

TOOLS = ("dpkg-deb", "rpm", "rpm2cpio", "cpio", "bsdtar", "appstreamcli", "secret-tool")


def prerequisites():
    if platform.system() != "Linux":
        raise RuntimeError("Run the Linux prerequisite check on Linux")
    missing = [name for name in TOOLS if shutil.which(name) is None]
    if missing:
        raise RuntimeError("Missing Linux commands: " + ", ".join(missing))


def verify_secret_store(runner=subprocess.run):
    if platform.system() != "Linux" or shutil.which("secret-tool") is None:
        raise RuntimeError("Linux libsecret-tools is required for this runtime test")
    attrs = ["application", IDENTIFIER, "qa-run", uuid.uuid4().hex]
    value = "synthetic-Unicode-\u00e7-\u0394-" + secrets.token_hex(16)

    def run(arguments, **kwargs):
        return runner(["secret-tool", *arguments, *attrs], capture_output=True,
                      encoding="utf-8", timeout=20, **kwargs)

    try:
        stored = run(["store", "--label", f"TCS Mail {VERSION} synthetic verification"], input=value)
        if stored.returncode:
            raise RuntimeError("Secret Service store failed; run in an unlocked desktop session")
        fetched = run(["lookup"])
        if fetched.returncode or fetched.stdout.rstrip("\r\n") != value:
            raise RuntimeError("Synthetic Secret Service lookup did not match")
    finally:
        # Attempt removal even after a store timeout: no existing attributes match.
        cleared = run(["clear"])
        if cleared.returncode:
            raise RuntimeError("Could not clear the uniquely scoped synthetic QA credential")
    absent = run(["lookup"])
    if absent.returncode != 1 or absent.stdout:
        raise RuntimeError("Synthetic QA credential still exists after clear")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check-prerequisites", action="store_true")
    mode.add_argument("--verify-secret-store", action="store_true")
    args = parser.parse_args()
    try:
        if args.check_prerequisites:
            prerequisites()
            print("PASS: Linux package inspection tools, bsdtar and secret-tool are installed; desktop runtime not tested")
        else:
            verify_secret_store()
            print("PASS: synthetic Unicode Secret Service store/lookup/clear; no credential value logged")
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as exc:
        # Exception text from a subprocess may contain its stdin; never print it.
        detail = str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__
        sys.exit("FAIL: " + detail)
