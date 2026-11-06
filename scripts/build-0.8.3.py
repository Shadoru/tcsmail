#!/usr/bin/env python3
"""Native 0.8.3 verification + bundles. Never installs, pushes or publishes.

Default: every source gate, Rust fmt/check/test/Clippy, native bundles, payload
guard. --gates-only is explicitly source-only evidence. Failed runs retain logs.
Use a fresh --target-dir for each build; existing bundle outputs are rejected.
"""
from pathlib import Path
import argparse
from datetime import datetime, timezone
import json
import os
import platform
import shutil
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts/quality"))
from v083_release import RPM_RELEASE, RPM_VERSION, TAURI_CLI_VERSION, VERSION

HOSTS = {
    ("Linux", "x86_64"): ("linux", "linux-x64", "x86_64-unknown-linux-gnu"),
    ("Windows", "amd64"): ("windows", "windows-x64", "x86_64-pc-windows-msvc"),
    ("Windows", "x86_64"): ("windows", "windows-x64", "x86_64-pc-windows-msvc"),
    ("Darwin", "x86_64"): ("mac_intel", "macos-intel", "x86_64-apple-darwin"),
    ("Darwin", "arm64"): ("mac_arm", "macos-arm64", "aarch64-apple-darwin"),
}
PYTHON_GATES = (
    ("rc7-branding-gate.py",), ("rc8-linux-rpm-regression.py",),
    ("test_rc7_microsoft_connect_and_branding.py",),
    ("tcsmail-package-guard.py", "--source"), ("test_utf8_ci_sources.py",),
    ("v083-utf8.py",), ("v083-regression.py",),
    ("rc7-ui-and-packager.py",), ("rc7-clean-release-contract.py",),
    ("test_frontend_module_syntax.py",), ("rc7-providers-and-release.py",),
    ("test_tcsmail_package_guard.py",), ("rc7_crossplatform_regression.py",),
    ("rc2-presentation-verify.py", "--source"),
)
NODE_GATES = (
    "scripts/quality/rc7-folder-move.test.mjs", "scripts/quality/rc8-folder-labels.test.mjs", "scripts/quality/rc7-first-run-regression.mjs",
    "scripts/quality/rc8-bulk-delete-regression.mjs", "scripts/quality/rc8fix1-bulk-behavior.mjs",
    "scripts/quality/v083-reported-ui-regression.mjs",
    "scripts/quality/rc8fix1-ai-behavior.mjs", "scripts/quality/rc8fix1-translations.mjs",
    "scripts/verify-ms-oauth.mjs", "scripts/quality/rc2-release-contract.mjs",
    "scripts/quality/rc2-interface-regression.mjs", "scripts/quality/rc2-native-composer-behavior.mjs",
    "scripts/quality/rc7-composer-routing.mjs", "scripts/quality/rc7-provider-sync-contract.mjs",
    "scripts/quality/reader-config-083.test.mjs",
    "scripts/quality/rc083-responsiveness.test.mjs",
)


def native_host(target=None):
    host = HOSTS.get((platform.system(), platform.machine().lower()))
    if host is None or (target and target != host[2]):
        raise ValueError("Use the native x64 Linux/Windows, Intel macOS or ARM64 macOS runner for this target")
    return host


def source_commands():
    commands = [[sys.executable, "scripts/quality/" + gate[0], *gate[1:]] for gate in PYTHON_GATES] + [
        ["node", gate] for gate in NODE_GATES]
    if (ROOT / ".git").exists() and shutil.which("git"):
        commands.append(["git", "diff", "--check"])
    return commands


def rust_commands(target):
    return [
        ["cargo", "fmt", "--all", "--", "--check"],
        ["cargo", "check", "--locked", "--workspace", "--all-targets", "--target", target],
        ["cargo", "test", "--locked", "--workspace", "--target", target],
        ["cargo", "clippy", "--locked", "--workspace", "--all-targets", "--target", target, "--", "-D", "warnings"],
    ]


def native_prerequisite_commands(kind):
    if kind == "linux":
        return [[sys.executable, "scripts/quality/v083-linux-runtime.py", "--check-prerequisites"]]
    return []


def bundle_commands(kind, target):
    config = "src-tauri/tauri." + {"linux": "linux", "windows": "windows", "mac_intel": "macos", "mac_arm": "macos"}[kind] + ".conf.json"
    base = ["cargo", "tauri", "build", "--ci", "--target", target]
    if kind == "linux":
        override = json.loads((ROOT / config).read_text(encoding="utf-8"))
        override["version"] = RPM_VERSION
        override["bundle"]["linux"] = {"rpm": {"release": RPM_RELEASE}}
        return [base + ["--bundles", "deb", "--config", config, "--", "--locked"],
                base + ["--bundles", "rpm", "--config", json.dumps(override), "--", "--locked"]]
    return [base + ["--bundles", "nsis,msi" if kind == "windows" else "app,dmg", "--config", config, "--", "--locked"]]


def execute(commands, env, evidence, records, runner=subprocess.run):
    for command in commands:
        record = {"command": command, "status": "running"}
        records.append(record)
        log = evidence / f"{len(records):02d}.log"
        record["log"] = log.name
        print("RUN:", *command, flush=True)
        try:
            with log.open("w", encoding="utf-8") as stream:
                result = runner(command, cwd=ROOT, env=env, stdout=stream, stderr=subprocess.STDOUT)
            record["returncode"] = result.returncode
            record["status"] = "passed" if result.returncode == 0 else "failed"
            if result.returncode:
                print(log.read_text(encoding="utf-8", errors="replace")[-16000:], flush=True)
                raise RuntimeError(f"Command failed ({result.returncode}); evidence: {log}")
        except OSError as exc:
            record["status"] = "failed"
            raise RuntimeError(f"Missing prerequisite or execution failed: {command[0]}") from exc


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", help="Must match the current native host")
    parser.add_argument("--gates-only", action="store_true", help="Run source checks only; no build claim")
    parser.add_argument("--target-dir", type=Path, help="Fresh Cargo output directory (never cleaned automatically)")
    parser.add_argument("--evidence-dir", type=Path)
    args = parser.parse_args()
    kind, label, target = native_host(args.target)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ-") + uuid.uuid4().hex[:8]
    evidence = (args.evidence_dir or ROOT / ".build-v083" / run_id).resolve()
    evidence.mkdir(parents=True, exist_ok=False)
    target_dir = (args.target_dir or ROOT / "target" / "v083" / run_id).resolve()
    bundles = target_dir / target / "release/bundle"
    env = os.environ.copy()
    env.update(PYTHONUTF8="1", CARGO_TARGET_DIR=str(target_dir))
    records = []
    report = {"version": VERSION, "platform": label, "native_target": target,
              "scope": "source-only" if args.gates_only else "native-build-and-packages",
              "status": "failed", "commands": records, "gui_tests": "not-run"}
    try:
        if bundles.exists() and any(bundles.iterdir()):
            raise ValueError(f"Existing bundle outputs rejected; choose a fresh --target-dir: {bundles}")
        report["git_sha"] = os.environ.get("GITHUB_SHA") or "source-zip"
        report["git_status"] = None
        if (ROOT / ".git").exists() and shutil.which("git"):
            report["git_sha"] = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, encoding="utf-8").strip()
            report["git_status"] = subprocess.check_output(["git", "status", "--porcelain=v1"], cwd=ROOT, encoding="utf-8").splitlines()
        execute([[sys.executable, "--version"], ["node", "--version"]], env, evidence, records)
        execute(source_commands(), env, evidence, records)
        if not args.gates_only:
            execute(native_prerequisite_commands(kind), env, evidence, records)
            execute([["rustc", "--version", "--verbose"], ["cargo", "--version"], ["cargo", "tauri", "--version"]], env, evidence, records)
            cli = (evidence / records[-1]["log"]).read_text(encoding="utf-8").strip()
            if cli != f"tauri-cli {TAURI_CLI_VERSION}":
                raise ValueError(f"Install tauri-cli {TAURI_CLI_VERSION} with cargo install --locked before building")
            execute(rust_commands(target), env, evidence, records)
            execute(bundle_commands(kind, target), env, evidence, records)
            execute([[sys.executable, "scripts/quality/tcsmail-package-guard.py", "--bundles", str(bundles),
                      "--kind", kind, "--label", label, "--sha", report["git_sha"]]], env, evidence, records)
        report["status"] = "passed"
    except (RuntimeError, ValueError, subprocess.CalledProcessError) as exc:
        report["error"] = str(exc)
        print("FAIL:", exc, file=sys.stderr)
    finally:
        (evidence / "result.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Evidence:", evidence, flush=True)
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, FileExistsError) as exc:
        sys.exit("FAIL: " + str(exc))
