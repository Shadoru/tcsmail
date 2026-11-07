#!/usr/bin/env python3
"""Portable regression for package-guard artifact preparation.

Synthetic test: verifies Python import scoping, macOS bundle packaging/metadata,
negative cases. Does NOT replace real macOS ditto/code signing verification.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch
import zipfile

GUARD_PATH = Path(__file__).with_name('tcsmail-package-guard.py')
spec = importlib.util.spec_from_file_location('tcsmail_package_guard_under_test', GUARD_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError('Cannot load packaging guard')
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

@contextmanager
def cwd(folder: Path):
    original = Path.cwd()
    os.chdir(folder)
    try:
        yield
    finally:
        os.chdir(original)

class MacBundlePreparationTests(unittest.TestCase):
    def test_both_macos_architectures_generate_complete_artifacts(self):
        for kind, label in [('mac_intel', 'macos-intel'), ('mac_arm', 'macos-arm64')]:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                bundles = root / 'bundles'
                app = bundles / 'macos' / 'TCS Mail.app'
                (app / 'Contents' / 'MacOS').mkdir(parents=True)
                (app / 'Contents' / 'MacOS' / 'tcs-mail').write_bytes(b'synthetic executable')
                dmg = bundles / 'dmg' / 'TCS Mail_0.8.3.dmg'
                dmg.parent.mkdir(parents=True)
                dmg.write_bytes(b'synthetic dmg')
                invocations = []

                def fake_ditto(cmd, check):
                    self.assertTrue(check)
                    self.assertEqual(cmd[:5], ['ditto', '-c', '-k', '--sequesterRsrc', '--keepParent'])
                    self.assertEqual(Path(cmd[5]).resolve(), app.resolve())
                    appzip = Path(cmd[6])
                    with zipfile.ZipFile(appzip, 'w') as z:
                        z.write(app / 'Contents' / 'MacOS' / 'tcs-mail',
                                'TCS Mail.app/Contents/MacOS/tcs-mail')
                    invocations.append(appzip)

                args = SimpleNamespace(bundles=str(bundles), kind=kind, label=label, sha='0123456789abcdef')
                with cwd(root), patch.object(guard.sys, 'platform', 'darwin'), \
                     patch.object(guard.shutil, 'which', return_value='/usr/bin/ditto'), \
                     patch.object(guard.subprocess, 'run', side_effect=fake_ditto), \
                     patch.object(guard, 'inspect_native'):
                    guard.bundle(args)

                self.assertEqual(len(invocations), 1)
                result = root / 'delivery' / label
                package = result / f'tcsmail-0.8.3-{label}.zip'
                self.assertTrue(package.is_file())
                with zipfile.ZipFile(package) as z:
                    self.assertEqual(set(z.namelist()), {'TCS Mail.app.zip', dmg.name})
                    with zipfile.ZipFile(z.open('TCS Mail.app.zip')) as app_archive:
                        self.assertIn('TCS Mail.app/Contents/MacOS/tcs-mail', app_archive.namelist())
                info = json.loads((result / 'build-info.json').read_text(encoding="utf-8"))
                self.assertEqual(info['github_sha'], args.sha)
                self.assertEqual(info['version'], '0.8.3')
                self.assertEqual({f['kind'] for f in info['files']}, {'app', 'dmg'})
                digest = hashlib.sha256(package.read_bytes()).hexdigest()
                self.assertEqual(info['zip_sha256'], digest)
                self.assertEqual((result / (package.name + '.sha256')).read_text(encoding="utf-8").split()[0], digest)
                self.assertFalse((result / 'TCS Mail.app.zip').exists(), 'Intermediate .app ZIP must be removed')

    def test_missing_dmg_is_rejected_not_uploaded(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            app = root / 'bundles' / 'macos' / 'TCS Mail.app'
            app.mkdir(parents=True)
            args = SimpleNamespace(bundles=str(root/'bundles'), kind='mac_arm', label='macos-arm64', sha='test')
            with self.assertRaisesRegex(RuntimeError, r'Expected exactly 1 \.dmg'):
                guard.bundle(args)
            self.assertFalse((root / 'delivery').exists())

    def test_non_macos_host_rejects_app_archiving(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            app = root / 'bundles' / 'macos' / 'TCS Mail.app'
            app.mkdir(parents=True)
            dmg = root / 'bundles' / 'dmg' / 'TCS Mail.dmg'
            dmg.parent.mkdir(parents=True)
            dmg.write_bytes(b'synthetic dmg')
            args = SimpleNamespace(bundles=str(root/'bundles'), kind='mac_intel', label='macos-intel', sha='test')
            with cwd(root), patch.object(guard.sys, 'platform', 'linux'):
                with self.assertRaisesRegex(ValueError, r'native macOS runner'):
                    guard.bundle(args)

if __name__ == '__main__':
    unittest.main(verbosity=2)
