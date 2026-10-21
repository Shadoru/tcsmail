#!/usr/bin/env python3
"""Require one supported imap-proto package in Cargo.lock; --audit reports without blocking.

The invariant applies to the whole Cargo.lock graph, not just a direct dependency.
"""
import argparse
import pathlib
import sys
import tomllib

MINIMUM = (0, 16, 7)
ROOT = pathlib.Path(__file__).resolve().parents[2]


def check_lock(path: pathlib.Path) -> list[str]:
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, UnicodeError) as exc:
        return [f"Cargo.lock unavailable or invalid: {exc}"]
    packages = [p for p in data.get("package", []) if p.get("name") == "imap-proto"]
    if len(packages) != 1:
        return [f"Expected exactly one imap-proto version; found {len(packages)}: "
                + ", ".join(p.get("version", "unknown") for p in packages)]
    version = packages[0].get("version", "")
    parts = version.split(".")
    if len(parts) != 3 or any(not x.isdigit() for x in parts):
        return [f"Unsupported or non-stable imap-proto version: {version}"]
    if tuple(map(int, parts)) < MINIMUM:
        return [f"imap-proto {version} below minimum 0.16.7"]
    print(f"PASS: single imap-proto version {version} (>=0.16.7) in Cargo.lock")
    return []


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit", action="store_true", help="report violations without changing diagnostic exit code")
    parser.add_argument("--lockfile", type=pathlib.Path, default=ROOT / "Cargo.lock")
    args = parser.parse_args()
    violations = check_lock(args.lockfile)
    if violations:
        for violation in violations:
            print("BLOCKED: " + violation)
        if args.audit:
            print("AUDIT ONLY: phase-2 acceptance remains blocked")
            return 0
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
