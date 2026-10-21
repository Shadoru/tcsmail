#!/usr/bin/env python3
"""Consistent pre-upgrade SQLite backup; never changes original databases."""
import hashlib
import json
import os
import sqlite3
import sys
import re
import shutil
import tempfile
from pathlib import Path


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def safe_name(name: object) -> bool:
    return (isinstance(name, str) and bool(re.fullmatch(r"[A-Za-z0-9_.-]+\.db", name))
            and name not in (".", "..") and not name.startswith("."))


def check_directory(path: Path, purpose: str) -> None:
    if path.is_symlink() or not path.is_dir():
        raise ValueError(f"unsafe or missing {purpose} directory: {path}")


def verify(backup_dir: Path) -> list[str]:
    check_directory(backup_dir, "backup")
    manifest_file = backup_dir / "snapshot-manifest.json"
    if manifest_file.is_symlink() or not manifest_file.is_file():
        raise ValueError("missing or unsafe manifest")
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    if type(manifest.get("schema")) is not int or manifest["schema"] != 1 or not isinstance(manifest.get("files"), list):
        raise ValueError("invalid backup manifest")
    checked = []
    seen = set()
    for item in manifest["files"]:
        if not isinstance(item, dict) or set(item) != {"name", "sha256", "bytes"}:
            raise ValueError("invalid backup manifest item")
        name = item["name"]
        if not safe_name(name) or name in seen:
            raise ValueError("unsafe or duplicate backup name")
        seen.add(name)
        path = backup_dir / name
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"missing or unsafe backup: {name}")
        if (type(item["bytes"]) is not int or item["bytes"] < 0 or
            not isinstance(item["sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", item["sha256"])):
            raise ValueError(f"invalid backup metadata: {name}")
        if path.stat().st_size != item["bytes"] or digest(path) != item["sha256"]:
            raise ValueError(f"backup checksum mismatch: {name}")
        with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as db:
            result = db.execute("PRAGMA integrity_check").fetchone()
            if result != ("ok",):
                raise ValueError(f"backup SQLite integrity failure: {name}: {result}")
        checked.append(str(path))
    actual = {p.name for p in backup_dir.glob("*.db")}
    if actual != seen:
        raise ValueError("backup database inventory mismatch")
    return checked


def snapshot(source_dir: Path, backup_dir: Path) -> list[str]:
    check_directory(source_dir, "source")
    check_directory(backup_dir, "backup")
    if source_dir.resolve() == backup_dir.resolve():
        raise ValueError("source and destination must differ")
    manifest_file = backup_dir / "snapshot-manifest.json"
    if manifest_file.exists() or manifest_file.is_symlink():
        raise FileExistsError(manifest_file)
    saved = []
    entries = []
    for original in sorted(source_dir.glob("*.db")):
        if not safe_name(original.name) or not original.is_file() or original.is_symlink():
            raise ValueError(f"refusing unsafe database path: {original}")
        destination = backup_dir / original.name
        if destination.exists() or destination.is_symlink():
            raise FileExistsError(destination)
        try:
            with sqlite3.connect(original.resolve().as_uri() + "?mode=ro", uri=True) as src:
                with sqlite3.connect(destination) as dst:
                    src.backup(dst)
                    result = dst.execute("PRAGMA integrity_check").fetchone()
                    if result != ("ok",):
                        raise RuntimeError(f"backup integrity check failed: {destination}: {result}")
            saved.append(str(destination))
            entries.append({"name": original.name, "sha256": digest(destination), "bytes": destination.stat().st_size})
        except Exception:
            destination.unlink(missing_ok=True)
            raise
    # Never overwrite a pre-existing manifest; consumers verify checksums and SQLite integrity.
    fd = os.open(manifest_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump({"schema": 1, "files": entries}, output, indent=2, sort_keys=True)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
    except BaseException:
        manifest_file.unlink(missing_ok=True)
        raise
    # A completed manifest is the commit marker; verify every copy before reporting success.
    verify(backup_dir)
    return saved


def restore_to_new_directory(backup_dir: Path, target_dir: Path) -> list[str]:
    """Restore *only* SQLite snapshots into a new directory, never into live data.

    The caller must explicitly select a path that does not yet exist.  Staging
    is created next to the destination and renamed only after verification.
    Non-database data is not included in this operation.
    """
    backups = verify(backup_dir)
    if target_dir.exists() or target_dir.is_symlink():
        raise FileExistsError(f"restore target must not exist: {target_dir}")
    parent = target_dir.parent
    check_directory(parent, "restore parent")
    if target_dir.resolve() == backup_dir.resolve():
        raise ValueError("backup and target must differ")
    staging = Path(tempfile.mkdtemp(prefix=".tcs-restore-", dir=parent))
    try:
        for source in backups:
            src = Path(source)
            destination = staging / src.name
            with src.open("rb") as input_file, destination.open("xb") as output_file:
                shutil.copyfileobj(input_file, output_file, 1024 * 1024)
                output_file.flush()
                os.fsync(output_file.fileno())
            if digest(src) != digest(destination):
                raise ValueError(f"restore copy hash mismatch: {src.name}")
            with sqlite3.connect(destination) as db:
                if db.execute("PRAGMA integrity_check").fetchone() != ("ok",):
                    raise ValueError(f"restored database failed integrity check: {src.name}")
        # Ensure the snapshots were not altered while we copied them.
        verify(backup_dir)
        if target_dir.exists() or target_dir.is_symlink():
            raise FileExistsError(target_dir)
        staging.rename(target_dir)
        return [str(target_dir / Path(path).name) for path in backups]
    finally:
        if staging.exists():
            shutil.rmtree(staging)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--verify":
        for path in verify(Path(sys.argv[2])):
            print(f"Verified SQLite backup: {path}")
    elif len(sys.argv) == 4 and sys.argv[1] == "--restore-to":
        for path in restore_to_new_directory(Path(sys.argv[2]), Path(sys.argv[3])):
            print(f"Restored SQLite snapshot to isolated directory: {path}")
    elif len(sys.argv) == 3:
        for path in snapshot(Path(sys.argv[1]), Path(sys.argv[2])):
            print(f"Backup SQLite: {path}")
    else:
        sys.exit("usage: backup-upgrade-databases.py DATA_DIR BACKUP_DIR | --verify BACKUP_DIR | --restore-to BACKUP_DIR NEW_NONEXISTENT_DIR")
