#!/usr/bin/env python3
"""Offline regression tests for installer revision R11; no build, GPG secret or push."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
W = (ROOT / '.github/workflows/tcs-mail-release-manual.yml').read_text('utf-8')
I = (ROOT / 'INSTALAR_CONFIGURAR_TCS_RELEASE.py').read_text('utf-8')
C = (ROOT / 'scripts/release/check_release_source.py').read_text('utf-8')


def load(name):
    file=ROOT / f'scripts/release/{name}.py'
    spec=importlib.util.spec_from_file_location(name, file)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class InstallerVersionTests(unittest.TestCase):
    def test_version_separation(self):
        self.assertIn("APP_VERSION = '0.8.3'",I)
        self.assertIn("KIT_REVISION = 'R11'",I)
        self.assertIn("version != APP_VERSION",I)
        self.assertIn("version != base",C)
        self.assertIn("base = '0.8.3'",C)
    def test_no_rc_application_tags(self):
        for text in (W,I,C):
            self.assertNotIn('v0.8.3-rc10',text)
            self.assertNotIn('v0.8.3-rc9',text)
        self.assertIn('installers-0.8.3-r11',W)
        self.assertIn('installers-0.8.3-r11',I)
        self.assertIn('installers-0\\.8\\.3-r',C)
    def test_app_version_guard_does_not_write_sources(self):
        self.assertNotIn("'src-tauri/tauri.conf.json',", I.split('COPY = (',1)[1].split(')',1)[0])
        self.assertNotIn("'src-tauri/Cargo.toml',", I.split('COPY = (',1)[1].split(')',1)[0])
        self.assertIn("version != '0.8.3'",(ROOT/'scripts/release/build_local.py').read_text('utf-8'))
    def test_installer_tag_vs_app_version(self):
        self.assertIn('TCS Mail 0.8.3 | Instaladores R11',W)
        self.assertIn('TCS Mail 0.8.3 - Instaladores',W)
        self.assertNotIn('--prerelease',W)
    def test_no_automated_events(self):
        self.assertIn('workflow_dispatch:', W)
        for forbidden in ('\n  push:', '\n  pull_request:', '\n  release:', '\n  schedule:', '\n  workflow_run:'):
            self.assertNotIn(forbidden, W.split('permissions:',1)[0])
    def test_input_independence(self):
        for choice in ('linux','appimage','windows','mac_intel','mac_arm'):
            self.assertIn('      '+choice+':',W)
            self.assertIn('inputs.'+choice,W)
        self.assertIn('if: ${{ inputs.linux || inputs.appimage }}',W)
    def test_tag_verified_before_code_from_tag(self):
        self.assertLess(W.index('Validar tag com codigo confiavel da main'), W.index('Verificar fonte, logo e lockfiles da tag'))
    def test_tag_signed_with_new_signing_subkey(self):
        self.assertIn("'tag','-s','-u',CI_SUBFPR+'!'",I)
        self.assertIn("'EB55887A1A9923E4D2FE4803B03A894B9F604781'",W)
        self.assertIn("fields[0].upper(),fields[9].upper()",W)
        self.assertIn("fields[0].upper(),fields[9].upper()",C)
    def test_public_only_no_secret_material(self):
        self.assertNotIn('BEGIN PGP PRIVATE KEY BLOCK',W)
        self.assertIn('GITHUB_OUTPUT',W)
    def test_only_selected_formats(self):
        self.assertIn('if [ "$BUILD_LINUX" = true ]; then selected+=(deb rpm); fi',W)
        self.assertIn('selected+=(appimage)',W)
        self.assertIn('cargo tauri bundle --bundles "$targets"',W)
    def test_native_signature_not_misreported(self):
        self.assertIn("strict_native_signing:",W)
        self.assertIn("default: false",W)
        self.assertIn('NATIVE_SIGNED:',W)
        self.assertIn('SEM Authenticode:',W)
    def test_explicit_draft(self):
        self.assertIn('--verify-tag --draft --latest=false',W)
        self.assertIn('--notes-file _release_ready/LEIA_ANTES.txt',W)
    def test_brands_preserved(self):
        self.assertIn('cp "$RUNNER_TEMP/tcs-mail-icon-original.png" src-tauri/icons/icon.png',W)
        self.assertLess(W.index('cp "$RUNNER_TEMP/tcs-mail-icon-original.png" src-tauri/icons/icon.png'),W.index('run: python scripts/release/run_quality_only.py'))
    def test_windows_npm_cmd_resolution(self):
        helper=load('dependency_strategy')
        self.assertEqual(helper.resolve.__name__,'resolve')
        self.assertIn("name + '.cmd'",(ROOT/'scripts/release/dependency_strategy.py').read_text('utf-8'))
    def test_frontend_separate_from_e2e(self):
        helper=load('dependency_strategy')
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/'frontend').mkdir();(root/'homologation/e2e').mkdir(parents=True)
            (root/'src-tauri').mkdir()
            (root/'src-tauri/tauri.conf.json').write_text(json.dumps({'build':{'frontendDist':'../frontend/dist'},'version':'0.8.3'}),'utf-8')
            for sub in ('frontend','homologation/e2e'):
                (root/sub/'package.json').write_text('{"name":"test","version":"0.8.3"}','utf-8')
            (root/'frontend/package-lock.json').write_text('{}','utf-8')
            resolution=helper.resolve(root)
            self.assertEqual(resolution['relative'],'frontend')
            self.assertEqual(resolution['manager'],'npm')
    def test_release_notes_reject_wrong_tag(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            sub=root/'scripts/release';sub.mkdir(parents=True)
            (sub/'prepare_release_notes.py').write_bytes((ROOT/'scripts/release/prepare_release_notes.py').read_bytes())
            (root/'_release_ready').mkdir()
            (root/'_release_ready/SIGNING-REPORT.json').write_text(json.dumps([{'platform': 'linux', 'native_signed': False}]),'utf-8')
            for tag,good in [('installers-0.8.3-r11',True),('v0.8.3-rc10',False)]:
                env=dict(os.environ,RELEASE_TAG=tag)
                result=subprocess.run([sys.executable,str(sub/'prepare_release_notes.py')],env=env,capture_output=True,text=True)
                self.assertEqual(result.returncode==0,good, (tag,result.stderr))
                if good:
                    notes=(root/'_release_ready/LEIA_ANTES.txt').read_text('utf-8')
                    self.assertIn('Versão do aplicativo: 0.8.3',notes)
                    self.assertIn(tag,notes)
    def test_missing_installer_blocks_draft(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);sub=root/'scripts/release';sub.mkdir(parents=True)
            (sub/'finalize_release.py').write_bytes((ROOT/'scripts/release/finalize_release.py').read_bytes())
            result=subprocess.run([sys.executable,str(sub/'finalize_release.py')],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('status do build ausente',result.stderr)

if __name__=='__main__': unittest.main(verbosity=2)
