#!/usr/bin/env python3
"""Native, explicit local release builder. Never cross-compiles or publishes.

Artifacts and reusable Cargo cache remain under ~/Projetos.
The GitHub Actions matrix is the path for architectures not available locally.
"""
import argparse
from datetime import datetime, timezone
import getpass
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import re

FPR = '1674F96ACE21F6A87434398ADD1974F061C5B37E'
SUBFPR = 'EB55887A1A9923E4D2FE4803B03A894B9F604781'
ICON_HASH = 'ae5d9f85330b3c650c87d92d4633dfe2454b4a0f7565783c9a361f895d6e8992'
HERE = Path(__file__).resolve().parent
FORMATS = {'Linux': ('deb','rpm','appimage'),
           'Windows': ('exe','msi'),
           'Darwin': ('app','dmg')}
EXTENSIONS = {'deb':'.deb','rpm':'.rpm','appimage':'.AppImage',
              'exe':'.exe','msi':'.msi','dmg':'.dmg'}


def run(command, *, cwd=None, env=None, input_bytes=None):
    print('EXECUTANDO:', ' '.join(str(item) for item in command), flush=True)
    subprocess.run([str(item) for item in command],cwd=cwd,env=env,
                   input=input_bytes,check=True)


def required(program):
    if not shutil.which(program):
        raise SystemExit('FALHA: ferramenta não instalada: '+program)


def gpg_detached(path, passphrase):
    signature=path.with_name(path.name+'.asc')
    subprocess.run(['gpg','--batch','--yes','--pinentry-mode','loopback',
                    '--passphrase-fd','0','--local-user',SUBFPR+'!',
                    '--armor','--detach-sign','--output',str(signature),str(path)],
                   input=(passphrase+'\n').encode('utf-8'),check=True)
    run(['gpg','--batch','--verify',str(signature),str(path)])
    return signature


def windows_signtool():
    tool=shutil.which('signtool.exe') or shutil.which('signtool')
    if tool: return tool
    base=Path(os.environ.get('ProgramFiles(x86)','C:/Program Files (x86)'))/'Windows Kits/10/bin'
    candidates=sorted(base.glob('*/x64/signtool.exe'),reverse=True) if base.exists() else []
    if not candidates:
        raise SystemExit('FALHA: signtool não encontrado. Instale Windows SDK/Build Tools.')
    return str(candidates[0])


def sign_windows(path, tool, thumbprint):
    run([tool,'sign','/sha1',thumbprint,'/fd','SHA256',
         '/tr','http://timestamp.digicert.com','/td','SHA256',str(path)])
    run([tool,'verify','/pa','/v',str(path)])


def validate_project(root):
    home=(Path.home()/'Projetos').resolve()
    root=root.expanduser().resolve()
    if not home.is_dir() or (root!=home and home not in root.parents):
        raise SystemExit('FALHA: somente projetos em ~/Projetos são permitidos.')
    for name in ('src-tauri/Cargo.toml','src-tauri/tauri.conf.json',
                 'src-tauri/icons/icon.png'):
        if not (root/name).is_file():
            raise SystemExit('FALHA: fonte Tauri incompleta; ausente '+name)
    version = json.loads((root/'src-tauri/tauri.conf.json').read_text(encoding='utf-8')).get('version')
    if version != '0.8.3':
        raise SystemExit(f'FALHA: versão do aplicativo deve ser EXATAMENTE 0.8.3, encontrada: {version!r}')
    if hashlib.sha256((root/'src-tauri/icons/icon.png').read_bytes()).hexdigest()!=ICON_HASH:
        raise SystemExit('FALHA: logotipo da fonte difere da identidade canônica 0.8.3.')
    return root


def selected_formats(raw, system):
    permitted=FORMATS[system]
    if raw is None:
        print('Este computador pode compilar nativamente:', ', '.join(permitted))
        raw=input('Formatos separados por vírgulas [Enter=todos acima]: ').strip() or ','.join(permitted)
    selected=list(dict.fromkeys(x.strip().lower() for x in raw.split(',') if x.strip()))
    if not selected or any(x not in permitted for x in selected):
        raise SystemExit('FALHA: formato incompatível com '+system+
                         '. Escolhas permitidas: '+', '.join(permitted)+
                         '. Use o GitHub Actions para os outros sistemas.')
    return selected


def cargo_cli(env, tools_root):
    required('cargo')
    found=subprocess.run(['cargo','tauri','--version'],capture_output=True,text=True,env=env)
    if found.returncode==0 and re.search(r'\b2\.11\.4\b',found.stdout):
        print('Tauri CLI disponível:',found.stdout.strip())
        return env
    if input('Tauri CLI 2.11.4 ausente ou diferente. Instalar versão isolada em ~/Projetos? Digite INSTALAR_CLI: ').strip()!='INSTALAR_CLI':
        raise SystemExit('Cancelado; instale tauri-cli 2.11.4 e execute novamente.')
    tool_dir=tools_root/'cargo-cli'
    tool_dir.mkdir(parents=True,exist_ok=True)
    run(['cargo','install','tauri-cli','--version','2.11.4','--locked',
         '--root',str(tool_dir)],env=env)
    env['PATH']=str(tool_dir/'bin')+os.pathsep+env.get('PATH','')
    checked=subprocess.run(['cargo','tauri','--version'],env=env,capture_output=True,text=True,check=True)
    if not re.search(r'\b2\.11\.4\b',checked.stdout):
        raise SystemExit('FALHA: versão instalada de Tauri CLI diverge de 2.11.4.')
    return env


def snapshot(bundle_root):
    if not bundle_root.exists(): return {}
    return {str(p):(p.stat().st_size,p.stat().st_mtime_ns)
            for p in bundle_root.rglob('*') if p.is_file()}


def collect_fresh(bundle_root, before, requested, destination):
    files=[p for p in bundle_root.rglob('*') if p.is_file() and
           (str(p) not in before or before[str(p)]!=(p.stat().st_size,p.stat().st_mtime_ns))]
    result=[]
    for fmt in requested:
        if fmt=='app':
            continue
        suffix=EXTENSIONS[fmt].lower()
        matched=[p for p in files if p.suffix.lower()==suffix and
                 (fmt!='exe' or 'nsis' in p.parts)]
        if len(matched)!=1:
            raise SystemExit('FALHA: esperado 1 pacote novo '+fmt+
                             ', encontrados '+str(len(matched))+'. Artefatos antigos não serão reutilizados.')
        target=destination/matched[0].name
        shutil.copy2(matched[0],target)
        result.append(target)
    return result


def build(args):
    system=platform.system()
    if system not in FORMATS:
        raise SystemExit('FALHA: sistema não suportado para builds nativos: '+system)
    arch=platform.machine().lower()
    accepted={'Linux': {'x86_64','amd64'}, 'Windows': {'amd64','x86_64'},
              'Darwin': {'x86_64','arm64','aarch64'}}
    if arch not in accepted[system]:
        raise SystemExit('FALHA: arquitetura '+arch+' não coberta pelos instaladores nativos solicitados.')
    root=validate_project(Path(args.project))
    formats=selected_formats(args.formats,system)
    print('Plataforma real:',system,platform.machine(),'| pacotes:',', '.join(formats))
    tools_root=Path.home()/'Projetos/TCS-Mail-Compiladores-R12/local-tools'
    results_base=Path.home()/'Projetos/TCS-Mail-Compiladores-R12/resultados'
    session=results_base/(datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+
                          '-'+system.lower()+'-'+platform.machine().lower())
    if session.exists():
        raise SystemExit('FALHA: sessão já existe, não sobrescrevi: '+str(session))
    print('Fonte:',root)
    print('Resultados:',session)
    if input('Confirma a COMPILAÇÃO LOCAL com esses formatos? Digite COMPILAR: ').strip()!='COMPILAR':
        raise SystemExit('Cancelado; nenhuma compilação iniciada.')
    session.mkdir(parents=True)
    original_root=root
    staged=session/'fonte-de-trabalho'
    # Never rewrite the canonical source, icons or lockfiles. Each run has an isolated source tree.
    ignored=shutil.ignore_patterns('target','node_modules','dist','build','.build-v083',
                                    '__pycache__','.venv','delivery')
    shutil.copytree(root,staged,symlinks=True,ignore=ignored)
    root=staged
    env=os.environ.copy()
    env['TCS_RELEASE_PROJECT_ROOT']=str(root)
    env['CARGO_TARGET_DIR']=str(tools_root/'target')
    if system=='Linux':
        programs=['pkg-config']
        if 'deb' in formats: programs.append('fakeroot')
        if 'rpm' in formats: programs.append('rpmbuild')
        for program in programs:
            required(program)
        for lib in ('webkit2gtk-4.1','ayatana-appindicator3-0.1','librsvg-2.0'):
            found=subprocess.run(['pkg-config','--exists',lib])
            if found.returncode:
                raise SystemExit('FALHA: biblioteca de desenvolvimento ausente: '+lib)
    elif system=='Windows':
        required('powershell.exe' if shutil.which('powershell.exe') else 'pwsh')
    else:
        required('xcodebuild')
        required('ditto')
        run(['xcodebuild','-version'])
    required('gpg')
    env=cargo_cli(env,tools_root)
    run([sys.executable,str(HERE/'dependency_strategy.py'),'ensure','--root',str(root)],cwd=root,env=env)
    run([sys.executable,str(HERE/'dependency_strategy.py'),'install','--root',str(root)],cwd=root,env=env)
    try:
        import PIL
        print('Pillow:',PIL.__version__)
    except ImportError:
        raise SystemExit('FALHA: Pillow não instalado neste Python (python -m pip install Pillow==11.3.0).')
    icon_original=session/'tcs-mail-icon-original.png'
    shutil.copy2(root/'src-tauri/icons/icon.png',icon_original)
    run(['cargo','tauri','icon',str(icon_original)],cwd=root,env=env)
    shutil.copy2(icon_original,root/'src-tauri/icons/icon.png')
    version = json.loads((root/'src-tauri/tauri.conf.json').read_text(encoding='utf-8')).get('version')
    if version != '0.8.3':
        raise SystemExit(f'FALHA: versão do aplicativo deve ser EXATAMENTE 0.8.3, encontrada: {version!r}')
    if hashlib.sha256((root/'src-tauri/icons/icon.png').read_bytes()).hexdigest()!=ICON_HASH:
        raise SystemExit('FALHA: logo canônica não foi restaurada após gerar ícones.')
    run([sys.executable,str(HERE/'prepare_branding.py')],cwd=root,env=env)
    if not args.sem_qualidade:
        run([sys.executable,str(HERE/'run_quality_only.py'),'--root',str(root)],cwd=root,env=env)
    cfg=root/'src-tauri/tauri.tcs-release-branding.conf.json'
    cargo_lock=[p for p in (root/'Cargo.lock',root/'src-tauri/Cargo.lock') if p.is_file()]
    if not cargo_lock:
        if input('Cargo.lock ausente NA CÓPIA. Gerar com cargo generate-lockfile? Digite GERAR_CARGO_LOCK: ').strip()!='GERAR_CARGO_LOCK':
            raise SystemExit('Cancelado: Cargo.lock obrigatório para release reproduzível.')
        run(['cargo','generate-lockfile'],cwd=root/'src-tauri',env=env)
        cargo_lock=[p for p in (root/'Cargo.lock',root/'src-tauri/Cargo.lock') if p.is_file()]
    if len(cargo_lock)!=1:
        raise SystemExit('FALHA: release local requer exatamente um Cargo.lock na fonte.')
    target=Path(env['CARGO_TARGET_DIR'])/'release'
    bundles=target/'bundle'
    before=snapshot(bundles)
    native_signed=False
    if system=='Windows':
        native_thumb=os.getenv('TCS_WINDOWS_CERT_THUMBPRINT','').strip()
        if not native_thumb and not args.permitir_sem_assinatura_nativa:
            raise SystemExit('FALHA: instale certificado válido no Windows Cert Store e informe TCS_WINDOWS_CERT_THUMBPRINT; ou use --permitir-sem-assinatura-nativa.')
        run(['cargo','tauri','build','--no-bundle','--config',str(cfg)],cwd=root,env=env)
        if native_thumb:
            tool=windows_signtool()
            executables=[p for p in target.glob('*.exe') if p.is_file()]
            if len(executables)!=1:
                raise SystemExit('FALHA: não consegui identificar um único executável interno Windows.')
            sign_windows(executables[0],tool,native_thumb)
            native_signed=True
        bundles_arg=','.join('nsis' if x=='exe' else x for x in formats)
        run(['cargo','tauri','bundle','--bundles',bundles_arg,'--config',str(cfg)],cwd=root,env=env)
    elif system=='Linux':
        run(['cargo','tauri','build','--no-bundle','--config',str(cfg)],cwd=root,env=env)
        bundles_arg=','.join(formats)
        if 'appimage' in formats:
            passphrase=getpass.getpass('Senha da subchave GPG para AppImage (oculta): ')
            env.update({'SIGN':'1','SIGN_KEY':SUBFPR,'APPIMAGETOOL_FORCE_SIGN':'1',
                        'APPIMAGETOOL_SIGN_PASSPHRASE':passphrase})
        run(['cargo','tauri','bundle','--bundles',bundles_arg,'--config',str(cfg)],cwd=root,env=env)
        env.pop('APPIMAGETOOL_SIGN_PASSPHRASE',None)
    else:
        identity=os.getenv('APPLE_SIGNING_IDENTITY','').strip()
        profile=os.getenv('TCS_APPLE_NOTARY_PROFILE','').strip()
        if bool(identity)!=bool(profile):
            raise SystemExit('FALHA: configuração Apple incompleta; configure AMBOS identity e notary profile.')
        if (not identity or not profile) and not args.permitir_sem_assinatura_nativa:
            raise SystemExit('FALHA: APPLE_SIGNING_IDENTITY e TCS_APPLE_NOTARY_PROFILE são obrigatórios para assinatura/notarização nativa.')
        if identity:
            env['APPLE_SIGNING_IDENTITY']=identity
            native_signed=True
        run(['cargo','tauri','build','--bundles',','.join(formats),
             '--config',str(cfg)],cwd=root,env=env)
    # At this stage all requested native build commands have completed.
    files=collect_fresh(bundles,before,formats,session)
    if system=='Windows' and native_signed:
        for path in files: sign_windows(path,tool,native_thumb)
    if system=='Darwin':
        apps=[p for p in (bundles/'macos').glob('*.app') if p.is_dir() and
              any(str(child) not in before or before[str(child)]!=(child.stat().st_size,child.stat().st_mtime_ns)
                  for child in p.rglob('*') if child.is_file())]
        if 'app' in formats:
            if len(apps)!=1:
                raise SystemExit('FALHA: APP não identificada unicamente no bundle local.')
            app=apps[0]
            if native_signed:
                run(['codesign','--verify','--deep','--strict','--verbose=2',str(app)])
            zip_path=session/(app.name+'.zip')
            run(['ditto','-c','-k','--sequesterRsrc','--keepParent',str(app),str(zip_path)])
            if native_signed:
                run(['xcrun','notarytool','submit',str(zip_path),'--keychain-profile',profile,'--wait'])
                run(['xcrun','stapler','staple',str(app)])
                run(['xcrun','stapler','validate',str(app)])
                zip_path.unlink()  # only the new temporary zip in this run; recreate after stapling
                run(['ditto','-c','-k','--sequesterRsrc','--keepParent',str(app),str(zip_path)])
            files.append(zip_path)
        if native_signed:
            for dmg in (p for p in files if p.suffix.lower()=='.dmg'):
                run(['xcrun','notarytool','submit',str(dmg),'--keychain-profile',profile,'--wait'])
                run(['xcrun','stapler','staple',str(dmg)])
                run(['xcrun','stapler','validate',str(dmg)])
    if 'appimage' in formats:
        appimage=next(p for p in files if p.suffix.lower()=='.appimage')
        appimage.chmod(appimage.stat().st_mode|0o111)
        result=subprocess.run([str(appimage),'--appimage-signature'],capture_output=True,text=True)
        if result.returncode or 'BEGIN PGP SIGNATURE' not in result.stdout:
            raise SystemExit('FALHA: assinatura incorporada ao AppImage ausente.')
        print('AppImage: presença de assinatura incorporada confirmada; validação criptográfica específica requer appimagevalidate.')
        validator=shutil.which('appimagevalidate')
        if validator:
            run([validator,str(appimage)])
    if not files:
        raise SystemExit('FALHA: nenhum pacote novo produzido.')
    secret=getpass.getpass('Senha da subchave GPG para assinar TODOS os pacotes (oculta): ')
    signed=[]
    for item in files:
        signed.append(gpg_detached(item,secret))
    sums=session/'SHA256SUMS'
    sums.write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n'
                            for p in files),encoding='utf-8')
    gpg_detached(sums,secret)
    result={'system':system,'machine':platform.machine(),
            'formats':formats,'source_original':str(original_root),'source_staged':str(root),
            'quality_checked':not args.sem_qualidade,'native_signed':native_signed,
            'gpg_signer':SUBFPR,'files':[p.name for p in files],
            'caution':'AppImage embedded signature not independently verified' if 'appimage' in formats and not shutil.which('appimagevalidate') else None}
    (session/'RELATORIO.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print('CONCLUIDO: pacotes novos e assinaturas .asc verificadas:',session)
    return session


def main():
    parser=argparse.ArgumentParser(description='Compilar somente pacotes nativos no computador atual')
    parser.add_argument('--project',required=True)
    parser.add_argument('--formats',help='CSV: Linux deb,rpm,appimage; Windows exe,msi; Mac app,dmg')
    parser.add_argument('--sem-qualidade',action='store_true',help='Somente para diagnostico, não homologação')
    parser.add_argument('--permitir-sem-assinatura-nativa',action='store_true',
                        help='Windows/mac: permite pacote sem Authenticode/Developer ID, mas ainda exige GPG')
    args=parser.parse_args()
    build(args)


if __name__=='__main__':
    main()
