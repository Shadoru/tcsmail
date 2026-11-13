#!/usr/bin/env python3
"""Strict UTF-8 and mojibake check of all own and vendored text code.

Git inventories tracked AND untracked, nonignored sources when available.
Plain ZIP directories use a filesystem inventory with explicit output excludes.
Binary assets are excluded; an unknown text extension is still inspected.
Diagnostics contain paths/line numbers, never source text or email contents.
"""
from pathlib import Path
import argparse
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
BINARY_SUFFIXES = {".png", ".ico", ".icns", ".jpg", ".jpeg", ".gif", ".webp", ".woff", ".woff2", ".ttf", ".bmp"}
OUTPUT_DIRS = {".git", "target", "node_modules", "dist", "delivery", ".build-v083", ".build-rc8fix1", ".cargo", ".rustup", "__pycache__", "tauri-cli-target", "branding-tcs-release"}
MOJIBAKE = re.compile(
    r"\ufffd|\u00c3[\u0080-\u00bf\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2010-\u203a\u20ac\u2122]"
    r"|\u00c2[\u0080-\u00bf]|\u00e2[\u0080\u20ac]|\u00f0[\u009f\u0178]"
)


def source_paths(root):
    if (root / ".git").exists() and shutil.which("git"):
        result = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
                                cwd=root, check=True, capture_output=True)
        names = set(result.stdout.decode("utf-8").split("\0")) - {""}
    else:
        # os.walk prunes generated trees rather than visiting a multi-GB target.
        import os
        names = set()
        for directory, dirs, files in os.walk(root, followlinks=False):
            dirs[:] = sorted(d for d in dirs if d not in OUTPUT_DIRS)
            names.update(str((Path(directory) / name).relative_to(root)) for name in files)
    for name in sorted(names):
        path = Path(name)
        # Generated installer artwork is NOT source code. Git inventory includes
        # nonignored untracked outputs, while os.walk also sees local builds.
        # Excluding only this known output tree keeps all real code in scope.
        if path.parts[:2] == ("src-tauri", "branding-tcs-release"):
            continue
        if path.suffix.lower() in BINARY_SUFFIXES or path.suffix.lower() in {".pyc", ".pyo"}:
            continue
        yield root / path


def inspect(root, counts=None):
    errors = []
    count = 0
    if counts is not None:
        counts.update(first_party=0, third_party=0)
    for path in source_paths(root):
        relative = path.relative_to(root)
        relative_text = relative.as_posix()
        if path.is_symlink():
            errors.append(f"{relative_text}: source symlink requires explicit review")
            continue
        count += 1
        if counts is not None:
            counts["third_party" if relative.parts[0] == "vendor" else "first_party"] += 1
        try:
            code = path.read_text(encoding="utf-8", errors="strict")
        except (UnicodeError, OSError) as exc:
            errors.append(f"{relative_text}: unreadable UTF-8 ({type(exc).__name__})")
            continue
        if "\x00" in code or code.startswith("\ufeff"):
            errors.append(f"{relative_text}: NUL or UTF-8 BOM in text source")
        for line, text in enumerate(code.splitlines(), 1):
            if MOJIBAKE.search(text):
                errors.append(f"{relative_text}:{line}: probable mojibake or replacement character")
    if not count:
        errors.append("No text sources inspected")
    return count, errors


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    counts = {}
    count, errors = inspect(args.root.resolve(), counts)
    print(f"UTF-8 inventory: total={count}, first-party={counts['first_party']}, third-party={counts['third_party']}")
    if errors:
        sys.exit("FAIL: UTF-8/mojibake\n" + "\n".join(errors))
    print(f"PASS: {count} text sources decoded explicitly as UTF-8; no detected mojibake")
