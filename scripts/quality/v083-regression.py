#!/usr/bin/env python3
"""Adversarial behavioral fixtures for encoding, release gates and packaging.

All files, subprocess failures and package headers below are synthetic. Native
MSI/DMG execution is intentionally not simulated as proof of OS compatibility.
"""
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import importlib.util
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/quality'))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


scan = load('v083_scan', Path(__file__).with_name('v083-utf8.py'))
build = load('v083_build', ROOT / 'scripts/build-0.8.3.py')
runtime = load('v083_linux_runtime', Path(__file__).with_name('v083-linux-runtime.py'))
guard = load('v083_guard', Path(__file__).with_name('tcsmail-package-guard.py'))
from v083_release import check_versions, VERSION
from v083_packages import check_pe, app_signature


class EncodingTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("git"), "Git-specific inventory fixture; ZIP fixture always runs")
    def test_real_git_inventory_includes_new_code_and_tracked_ignored_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            (root / 'nested').mkdir()
            (root / 'nested/new.rs').write_text('// Olá, 日本語, 😀\n', encoding='utf-8')
            (root / 'tracked.js').write_text('// original\n', encoding='utf-8')
            subprocess.run(['git', 'add', 'tracked.js'], cwd=root, check=True)
            (root / '.gitignore').write_text('tracked.js\nignored/\n', encoding='utf-8')
            (root / 'ignored').mkdir()
            (root / 'ignored/not-code').write_bytes(b'\xff')
            (root / 'vendor').mkdir()
            (root / 'vendor/third.rs').write_text('// third party\n', encoding='utf-8')
            self.assertEqual(scan.inspect(root), (4, []))
            # Valid UTF-8 mojibake, then invalid UTF-8. Both must fail.
            (root / 'nested/new.rs').write_text('// configura\u00c3\u00a7\u00c3\u00a3o\n', encoding='utf-8')
            self.assertTrue(any('nested/new.rs:1' in e for e in scan.inspect(root)[1]))
            (root / 'nested/new.rs').write_bytes(b'// invalid \xe7\xe3\n')
            self.assertTrue(any('nested/new.rs: unreadable UTF-8' in e for e in scan.inspect(root)[1]))
            (root / 'nested/new.rs').write_text('// valid\n', encoding='utf-8')
            (root / 'tracked.js').write_text('// \ufffd\n', encoding='utf-8')
            self.assertTrue(any('tracked.js:1' in e for e in scan.inspect(root)[1]))

    def test_plain_source_zip_inventory_without_git_includes_vendor(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'vendor').mkdir()
            (root / 'vendor/third.rs').write_text('// third party Unicode \u65e5\u672c\u8a9e\n', encoding='utf-8')
            (root / 'new.py').write_text('# configura\u00e7\u00e3o\n', encoding='utf-8')
            (root / 'target').mkdir()
            (root / 'target/generated').write_bytes(b'\xff')
            counts = {}
            with patch.object(scan.shutil, 'which', return_value=None):
                self.assertEqual(scan.inspect(root, counts), (2, []))
                self.assertEqual(counts, {'first_party': 1, 'third_party': 1})
                (root / 'vendor/third.rs').write_bytes(b'\xff')
                self.assertTrue(any('vendor/third.rs' in error for error in scan.inspect(root)[1]))

    def test_plain_zip_orchestrator_does_not_require_git(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(build, 'ROOT', Path(tmp)), patch.object(build.shutil, 'which', return_value=None):
            self.assertFalse(any(command[0] == 'git' for command in build.source_commands()))


class ReleaseTests(unittest.TestCase):
    def test_exact_version_and_identity_not_substring_presence(self):
        files = ['src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'crates/tcs-core/Cargo.toml',
                 'crates/tcs-ai-core/Cargo.toml', 'Cargo.lock']
        for relative, before, after in [
            ('src-tauri/tauri.conf.json', VERSION, '0.8.2-rc8'),
            ('src-tauri/tauri.conf.json', '0.8.300', '0.8.209'),
            ('src-tauri/tauri.conf.json', 'com.thecreativesolver.TCSMail', 'com.example.other'),
            ('src-tauri/tauri.conf.json', 'https://thecreativesolver.com/tcsmail/', 'https://thecreativesolver.com/mail'),
            ('src-tauri/tauri.conf.json', '"release": "1"', '"release": "0.rc8.2"'),
            ('Cargo.lock', 'name = "tcs-core"\nversion = "' + VERSION + '"', 'name = "tcs-core"\nversion = "0.8.2-rc8"'),
            ('crates/tcs-ai-core/Cargo.toml', VERSION, '0.8.2-rc8'),
        ]:
            with self.subTest(relative=relative, after=after), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                for name in files:
                    path = root / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(ROOT / name, path)
                check_versions(root)
                path = root / relative
                path.write_text(path.read_text(encoding='utf-8').replace(before, after, 1), encoding='utf-8')
                with self.assertRaises(ValueError):
                    check_versions(root)

    def test_all_previous_active_gates_are_still_executed(self):
        required = {
            'rc7-branding-gate.py', 'rc8-linux-rpm-regression.py', 'test_rc7_microsoft_connect_and_branding.py',
            'tcsmail-package-guard.py', 'test_utf8_ci_sources.py', 'rc7-ui-and-packager.py',
            'rc7-clean-release-contract.py', 'test_frontend_module_syntax.py', 'rc7-folder-move.test.mjs',
            'rc7-first-run-regression.mjs', 'rc7-providers-and-release.py', 'test_tcsmail_package_guard.py',
            'verify-ms-oauth.mjs', 'rc2-release-contract.mjs', 'rc2-interface-regression.mjs',
            'rc2-native-composer-behavior.mjs', 'rc7-composer-routing.mjs', 'rc7-provider-sync-contract.mjs',
            'rc7_crossplatform_regression.py', 'rc2-presentation-verify.py',
            'rc8-bulk-delete-regression.mjs', 'rc8fix1-bulk-behavior.mjs', 'v083-utf8.py',
            'rc8-folder-labels.test.mjs', 'rc8fix1-ai-behavior.mjs', 'rc8fix1-translations.mjs',
            'reader-config-083.test.mjs', 'rc083-responsiveness.test.mjs',
        }
        actual = {Path(command[1]).name for command in build.source_commands() if len(command) > 1}
        self.assertFalse(required - actual, required - actual)

    def test_rust_commands_are_locked_and_lints_block(self):
        commands = build.rust_commands('native-target')
        self.assertEqual(commands[0], ['cargo', 'fmt', '--all', '--', '--check'])
        for command in commands[1:]:
            self.assertIn('--locked', command)
            self.assertIn('--workspace', command)
            self.assertEqual(command[command.index('--target') + 1], 'native-target')
        self.assertEqual(commands[-1][-3:], ['--', '-D', 'warnings'])

    def test_host_mismatch_is_rejected(self):
        with patch.object(build.platform, 'system', return_value='Linux'), patch.object(build.platform, 'machine', return_value='x86_64'):
            self.assertEqual(build.native_host()[2], 'x86_64-unknown-linux-gnu')
            with self.assertRaises(ValueError):
                build.native_host('x86_64-pc-windows-msvc')

    def test_failure_prevents_subsequent_steps(self):
        calls = []
        def fail(command, **kwargs):
            calls.append(command)
            return SimpleNamespace(returncode=7)
        with tempfile.TemporaryDirectory() as tmp:
            records = []
            with self.assertRaisesRegex(RuntimeError, 'failed'):
                build.execute([['first-gate'], ['must-not-build-or-package']], {}, Path(tmp), records, runner=fail)
            self.assertEqual(calls, [['first-gate']])
            self.assertEqual(records[0]['status'], 'failed')
            self.assertEqual(records[0]['returncode'], 7)

    def test_per_host_bundle_plan_preserves_global_version(self):
        before = (ROOT / 'src-tauri/tauri.conf.json').read_bytes()
        linux = build.bundle_commands('linux', 'native')
        self.assertEqual([c[c.index('--bundles') + 1] for c in linux], ['deb', 'rpm'])
        override = json.loads(linux[1][linux[1].index('--config') + 1])
        self.assertEqual(override['version'], '0.8.3')
        self.assertEqual(override['bundle']['linux']['rpm']['release'], '1')
        for kind, bundles in [('windows', 'nsis,msi'), ('mac_intel', 'app,dmg'), ('mac_arm', 'app,dmg')]:
            command, = build.bundle_commands(kind, 'native')
            self.assertEqual(command[command.index('--bundles') + 1], bundles)
            self.assertEqual(command[-2:], ['--', '--locked'])
        self.assertEqual((ROOT / 'src-tauri/tauri.conf.json').read_bytes(), before)


class LinuxRuntimeTests(unittest.TestCase):
    def test_synthetic_roundtrip_uses_unique_attributes_stdin_and_removes_secret(self):
        calls = []
        state = {}
        def fake(command, **kwargs):
            calls.append((command, kwargs))
            if command[1] == 'store':
                state['value'] = kwargs['input']
                return SimpleNamespace(returncode=0, stdout='')
            if command[1] == 'clear':
                state.clear()
                return SimpleNamespace(returncode=0, stdout='')
            return SimpleNamespace(returncode=0 if state else 1, stdout=state.get('value', ''))
        with patch.object(runtime.platform, 'system', return_value='Linux'), patch.object(runtime.shutil, 'which', return_value='/usr/bin/secret-tool'):
            runtime.verify_secret_store(runner=fake)
        self.assertEqual([cmd[1] for cmd, _ in calls], ['store', 'lookup', 'clear', 'lookup'])
        attrs = [cmd[-4:] for cmd, _ in calls]
        self.assertTrue(all(value == attrs[0] for value in attrs))
        self.assertEqual(attrs[0][:3], ['application', 'com.thecreativesolver.TCSMail', 'qa-run'])
        self.assertEqual(len(attrs[0][3]), 32)
        secret = calls[0][1]['input']
        self.assertTrue(all(secret not in str(cmd) for cmd, _ in calls))
        self.assertFalse(state)

    def test_store_failure_still_attempts_synthetic_cleanup(self):
        calls = []
        def fake(command, **kwargs):
            calls.append(command[1])
            return SimpleNamespace(returncode=1 if command[1] == 'store' else 0, stdout='')
        with patch.object(runtime.platform, 'system', return_value='Linux'), patch.object(runtime.shutil, 'which', return_value='/usr/bin/secret-tool'):
            with self.assertRaisesRegex(RuntimeError, 'store failed'):
                runtime.verify_secret_store(runner=fake)
        self.assertEqual(calls, ['store', 'clear'])


class PackageTests(unittest.TestCase):
    def make_linux(self, tmp):
        root = Path(tmp) / 'bundle'
        root.mkdir()
        for suffix in ['deb', 'rpm']:
            (root / ('synthetic.' + suffix)).write_bytes(b'synthetic package, never install')
        return SimpleNamespace(bundles=str(root), kind='linux', label='linux-x64', sha='synthetic')

    def test_stale_embedded_linux_versions_and_duplicates_are_rejected(self):
        for deb, rpm in [('0.8.2-rc8-fix1', '0.8.3-1'), (VERSION, '0.8.2-0.rc8.2'), (VERSION, '0.8.3-0.rc8.2')]:
            with self.subTest(deb=deb, rpm=rpm), tempfile.TemporaryDirectory() as tmp:
                args = self.make_linux(tmp)
                def query(command, **kwargs):
                    return deb if command[0] == 'dpkg-deb' else rpm
                with patch.object(guard.subprocess, 'check_output', side_effect=query), patch.object(guard.subprocess, 'run') as payload:
                    with self.assertRaisesRegex(RuntimeError, 'version mismatch'):
                        guard.bundle(args)
                    payload.assert_not_called()
                (Path(args.bundles) / 'stale.deb').write_bytes(b'old')
                with self.assertRaisesRegex(RuntimeError, 'exactly 1'):
                    guard.bundle(args)

    def test_unsafe_label_rejected_before_creating_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = self.make_linux(tmp)
            args.label = '../../elsewhere'
            with self.assertRaises(ValueError):
                guard.bundle(args)

    def test_windows_application_architecture_and_gui_subsystem(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'synthetic.exe'
            blob = bytearray(256)
            blob[:2] = b'MZ'
            struct.pack_into('<I', blob, 0x3c, 64)
            blob[64:68] = b'PE\0\0'
            struct.pack_into('<H', blob, 68, 0x8664)
            struct.pack_into('<H', blob, 64 + 24 + 68, 2)
            path.write_bytes(blob)
            check_pe(path, app=True)
            struct.pack_into('<H', blob, 64 + 24 + 68, 3)
            path.write_bytes(blob)
            with self.assertRaisesRegex(ValueError, 'GUI'):
                check_pe(path, app=True)
            struct.pack_into('<H', blob, 64 + 24 + 68, 2)
            struct.pack_into('<H', blob, 68, 0x14c)
            path.write_bytes(blob)
            with self.assertRaisesRegex(ValueError, 'x64'):
                check_pe(path, app=True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
