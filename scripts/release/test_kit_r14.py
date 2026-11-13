#!/usr/bin/env python3
"""Independent tests of tracked release code. Works from an Actions checkout.

No dependency on the local-only INSTALAR_CONFIGURAR_TCS_RELEASE.py or ZIP.
No production build, secrets, repository mutations or network calls.
"""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / '.github/workflows/tcs-mail-release-manual.yml'
W = WORKFLOW.read_text(encoding='utf-8')
CHECK = (ROOT / 'scripts/release/check_release_source.py').read_text(encoding='utf-8')


def load(name):
    path = ROOT / f'scripts/release/{name}.py'
    spec = importlib.util.spec_from_file_location('tcs_r14_' + name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TrackedReleaseTests(unittest.TestCase):
    def test_ci_independent_of_distribution_installer(self):
        # The Actions checkout deliberately contains only files in git.
        self.assertTrue(WORKFLOW.is_file())
        self.assertTrue((ROOT / 'scripts/release/dependency_strategy.py').is_file())
        self.assertTrue((ROOT / 'scripts/release/check_release_source.py').is_file())

    def test_application_version_unchanged(self):
        self.assertIn("base = '0.8.3'", CHECK)
        self.assertIn('if version != base:', CHECK)
        self.assertIn('installers-0\\.8\\.3-r', CHECK)
        config=ROOT/'src-tauri/tauri.conf.json'
        if config.is_file():
            self.assertEqual(str(json.loads(config.read_text('utf-8')).get('version')), '0.8.3')
        self.assertIn("version != '0.8.3'", (ROOT/'scripts/release/build_local.py').read_text('utf-8'))

    def test_tag_naming_is_installer_only(self):
        self.assertIn('installers-0.8.3-r14', W)
        self.assertNotIn('v0.8.3-rc10', W)
        self.assertIn('TCS Mail 0.8.3 | Instaladores R14', W)
        self.assertIn('TCS Mail 0.8.3 - Instaladores', W)

    def test_only_explicit_manual_dispatch(self):
        header=W.split('permissions:',1)[0]
        self.assertIn('workflow_dispatch:', header)
        for trigger in ('push:', 'pull_request:', 'release:', 'schedule:', 'workflow_run:'):
            self.assertNotIn('\n  '+trigger, header)

    def test_five_build_choices_independently_visible(self):
        for option in ('linux', 'appimage', 'windows', 'mac_intel', 'mac_arm'):
            self.assertIn('      '+option+':',W)
            self.assertIn('inputs.'+option,W)
        self.assertIn('if: ${{ inputs.linux || inputs.appimage }}',W)
        self.assertIn('if: ${{ inputs.windows }}',W)
        self.assertIn('if: ${{ inputs.mac_intel || inputs.mac_arm }}',W)

    def test_preflight_checks_tag_before_checkout_of_tag(self):
        self.assertLess(W.index('Validar tag com codigo confiavel da main'), W.index('Verificar fonte, logo e lockfiles da tag'))
        self.assertLess(W.index('Validar tag com codigo confiavel da main'), W.index('ref: ${{ steps.source.outputs.sha }}'))
        self.assertIn('git\',\'verify-tag\',\'--raw\'',W)
        self.assertIn('test_kit_r14.py',W)

    def test_signature_is_specific_subkey(self):
        self.assertIn('EB55887A1A9923E4D2FE4803B03A894B9F604781',W)
        self.assertIn('1674F96ACE21F6A87434398ADD1974F061C5B37E',W)
        self.assertIn("fields[0].upper(),fields[9].upper()",W)
        self.assertIn('EB55887A1A9923E4D2FE4803B03A894B9F604781',CHECK)

    def test_no_secrets_or_untrusted_trigger_in_source(self):
        self.assertNotIn('BEGIN PGP PRIVATE KEY BLOCK',W)
        self.assertNotIn('pull_request_target',W)
        self.assertIn('GITHUB_OUTPUT',W)
        self.assertIn('environment: tcsmail-signing',W)

    def test_deb_rpm_appimage_gating(self):
        self.assertIn('if [ "$BUILD_LINUX" = true ]; then selected+=(deb rpm); fi',W)
        self.assertIn('selected+=(appimage)',W)
        self.assertIn('cargo tauri bundle --bundles "$targets"',W)
        self.assertIn('--appimage-signature',W)

    def test_windows_uses_npm_cmd(self):
        helper=load('dependency_strategy')
        with patch.object(helper.shutil,'which',side_effect=lambda x: 'C:/node/npm.cmd' if x=='npm.cmd' else None):
            self.assertEqual(helper.executable_for_subprocess('npm',windows=True),'C:/node/npm.cmd')

    def test_frontend_not_confused_with_e2e(self):
        helper=load('dependency_strategy')
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); (root/'frontend').mkdir();(root/'homologation/e2e').mkdir(parents=True);(root/'src-tauri').mkdir()
            (root/'src-tauri/tauri.conf.json').write_text(json.dumps({'version':'0.8.3','build':{'frontendDist':'../frontend/dist'}}),'utf-8')
            for name in ('frontend','homologation/e2e'):
                (root/name/'package.json').write_text('{"name":"test","version":"0.8.3"}','utf-8')
            (root/'frontend/package-lock.json').write_text('{}','utf-8')
            info=helper.resolve(root)
            self.assertEqual(info['relative'],'frontend')
            self.assertEqual(info['manager'],'npm')

    def test_branding_manifest_runs_before_and_after_asset_preparation(self):
        # GitHub jobs must never regenerate approved src-tauri/icons/ images.
        self.assertNotIn('cargo tauri icon',W)
        self.assertNotIn('tcs-mail-icon-original.png',W)
        self.assertEqual(W.count('python scripts/release/prepare_branding.py'),3)
        self.assertEqual(W.count('python scripts/quality/rc7-branding-gate.py'),6)
        self.assertEqual(W.count('git diff --exit-code -- src-tauri/icons'),3)
        self.assertIn('QUALITY RUN:',(ROOT/'scripts/release/run_quality_only.py').read_text('utf-8'))
        local=(ROOT/'scripts/release/build_local.py').read_text('utf-8')
        self.assertNotIn("run(['cargo','tauri','icon'",local)
        self.assertIn("gate=root/'scripts/quality/rc7-branding-gate.py'",local)

    def test_node24_runtime_actions(self):
        # Instalador transforma tags em SHAs imutáveis com comentário # vN.
        import re
        for name,major in (('checkout',5),('setup-node',5),('setup-python',6),
                           ('upload-artifact',6),('download-artifact',7)):
            pat=r'actions/'+re.escape(name)+r'@(?:v'+str(major)+r'|[a-f0-9]{40} # v'+str(major)+r' confirmado via GitHub API)'
            self.assertRegex(W,pat)
        for old in ('actions/checkout@v4','actions/setup-node@v4',
                    'actions/setup-python@v5','actions/upload-artifact@v4',
                    'actions/download-artifact@v4'):
            self.assertNotIn(old,W)
        self.assertIn("node-version: '22'",W)  # frontend Node is independent

    def test_source_gate_fail_closed_on_icon_divergence(self):
        local_installer=(ROOT/'scripts/release/check_release_source.py').read_text('utf-8')
        self.assertIn('logo_hash',local_installer)
        self.assertIn('TCS_TRUSTED_SOURCE_SHA',local_installer)
        self.assertNotIn('cargo tauri icon',W)

    def test_native_signatures_not_claimed_without_certificates(self):
        self.assertIn('strict_native_signing:',W)
        self.assertIn('SEM Authenticode:',W)
        self.assertIn('NATIVE_SIGNED:',W)
        self.assertIn('codesign --verify',W)

    def test_release_is_only_draft_after_nine_artifacts(self):
        self.assertIn('--verify-tag --draft --latest=false',W)
        self.assertIn('scripts/release/finalize_release.py',W)
        self.assertIn('needs: [preflight, linux, windows, macos]',W)

    def test_notes_accept_installer_tag_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);folder=root/'scripts/release';folder.mkdir(parents=True)
            (folder/'prepare_release_notes.py').write_bytes((ROOT/'scripts/release/prepare_release_notes.py').read_bytes())
            (root/'_release_ready').mkdir()
            (root/'_release_ready/SIGNING-REPORT.json').write_text('[{"platform":"linux","native_signed":false}]','utf-8')
            for tag,passes in [('installers-0.8.3-r14',True),('v0.8.3-rc12',False)]:
                run=subprocess.run([sys.executable,str(folder/'prepare_release_notes.py')],env={**os.environ,'RELEASE_TAG':tag},capture_output=True,text=True)
                self.assertEqual(run.returncode==0,passes,(tag,run.stderr))
                if passes:
                    self.assertIn('Versão do aplicativo: 0.8.3',(root/'_release_ready/LEIA_ANTES.txt').read_text('utf-8'))

    def test_missing_artifacts_stop_draft(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);folder=root/'scripts/release';folder.mkdir(parents=True)
            (folder/'finalize_release.py').write_bytes((ROOT/'scripts/release/finalize_release.py').read_bytes())
            out=subprocess.run([sys.executable,str(folder/'finalize_release.py')],capture_output=True,text=True)
            self.assertNotEqual(out.returncode,0)
            self.assertIn('status do build ausente',out.stderr)

    def test_utf8_inventory_ignores_generated_binary_branding_in_git(self):
        # Reproduce four-runner incident: untracked BMPs created before the
        # quality gate by prepare_branding.py. Include a tracked BMP as well.
        if not __import__('shutil').which('git'):
            self.skipTest('git indisponível')
        helper_path = ROOT / 'scripts/quality/v083-utf8.py'
        spec=importlib.util.spec_from_file_location('tcs_utf8_inventory_r14',helper_path)
        helper=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(helper)
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            subprocess.run(['git','init','-q'],cwd=root,check=True,capture_output=True)
            generated=root/'src-tauri/branding-tcs-release'
            generated.mkdir(parents=True)
            for image in ('nsis-header.bmp','nsis-sidebar.bmp','wix-banner.bmp','wix-dialog.bmp'):
                (generated/image).write_bytes(b'\x00\xff\xfe\x00')
            (generated/'generated-not-source.txt').write_text('generated',encoding='utf-8')
            (root/'src-tauri/icons').mkdir()
            (root/'src-tauri/icons/icon.bmp').write_bytes(b'\x00\xfe\xff')
            (root/'frontend').mkdir()
            (root/'frontend/main.js').write_text('const title = "TCS Mail";\n',encoding='utf-8')
            subprocess.run(['git','add','frontend/main.js'],cwd=root,check=True,capture_output=True)
            subprocess.run(['git','add','-f','src-tauri/branding-tcs-release/wix-banner.bmp'],cwd=root,check=True,capture_output=True)
            inspected=list(helper.source_paths(root))
            self.assertEqual({x.relative_to(root).as_posix() for x in inspected},{'frontend/main.js'})
            count,errors=helper.inspect(root)
            self.assertEqual((count,errors),(1,[]))
            # A corrupted *real source* must still be rejected, even when it
            # is tracked and gitignored -- no weakened UTF-8/security gate.
            (root/'vendor').mkdir()
            (root/'vendor/third.rs').write_bytes(b'\xff\xfe')
            (root/'.gitignore').write_text('vendor/*.rs\n',encoding='utf-8')
            subprocess.run(['git','add','-f','vendor/third.rs'],cwd=root,check=True,capture_output=True)
            count,errors=helper.inspect(root)
            self.assertEqual(count,3) # frontend/main.js, .gitignore and vendor/third.rs
            self.assertTrue(any('vendor/third.rs: unreadable UTF-8' in err for err in errors),errors)

    def test_utf8_inventory_ignores_generated_branding_without_git(self):
        spec=importlib.util.spec_from_file_location('tcs_utf8_no_git_r14',ROOT/'scripts/quality/v083-utf8.py')
        helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            generated=root/'src-tauri/branding-tcs-release'
            generated.mkdir(parents=True)
            (generated/'wix-dialog.bmp').write_bytes(b'\xff\x00\xfe')
            (generated/'asset-not-source.txt').write_text('generated',encoding='utf-8')
            (root/'frontend').mkdir()
            (root/'frontend/main.js').write_text('export const a = 1;',encoding='utf-8')
            count,errors=helper.inspect(root)
            self.assertEqual((count,errors),(1,[]))

    def test_quality_precedes_generated_artwork_on_all_ci_platforms(self):
        blocks={
            'linux': W.split('\n  linux:\n    name:',1)[1].split('\n  windows:\n    name:',1)[0],
            'windows': W.split('\n  windows:\n    name:',1)[1].split('\n  macos:\n    name:',1)[0],
            'macos': W.split('  macos:',1)[1].split('  ',1)[0] if False else W.split('  macos:',1)[1].split('  partial:',1)[0]
        }
        for os_name,block in blocks.items():
            with self.subTest(platform=os_name):
                self.assertIn('run: python scripts/release/run_quality_only.py',block)
                self.assertIn('python scripts/release/prepare_branding.py',block)
                self.assertLess(block.index('run: python scripts/release/run_quality_only.py'),
                                block.index('python scripts/release/prepare_branding.py'))
        local=(ROOT/'scripts/release/build_local.py').read_text('utf-8')
        self.assertLess(local.index("'run_quality_only.py'"),local.index("'prepare_branding.py'"))
        self.assertIn('"branding-tcs-release"', (ROOT/'scripts/quality/v083-utf8.py').read_text('utf-8'))
        self.assertIn('".bmp"', (ROOT/'scripts/quality/v083-utf8.py').read_text('utf-8'))


if __name__=='__main__':
    unittest.main(verbosity=2)
