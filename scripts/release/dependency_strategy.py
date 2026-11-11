#!/usr/bin/env python3
"""Shared frontend dependency policy for local preflight and GitHub runners.

Never silently invent a package manager, never run an unlocked CI install.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

LOCKS = {
    # npm gives npm-shrinkwrap.json priority if both exist.
    'npm': ('npm-shrinkwrap.json', 'package-lock.json'),
    'pnpm': ('pnpm-lock.yaml',),
    'yarn': ('yarn.lock',),
    'bun': ('bun.lock', 'bun.lockb'),
}


def executable_for_subprocess(name, *, windows=None):
    """Return an executable path; Windows Node commands are .cmd shims.

    shutil.which('npm') may resolve npm.cmd, while CreateProcess('npm', ...)
    still raises WinError 2. Always execute the resolved pathname.
    """
    if windows is None:
        windows = os.name == 'nt'
    if windows and name.lower() in ('npm','pnpm','yarn','corepack','bun'):
        resolved = shutil.which(name + '.cmd') or shutil.which(name + '.exe')
        if resolved:
            return resolved
    return shutil.which(name)


def frontend_root(root):
    candidates = [root] if (root/'package.json').is_file() else []
    excluded = {'node_modules','target','.git','vendor','.venv','dist','build'}
    # A nested frontend is legitimate; exclude generated/vendor trees.
    def visit(folder, depth):
        if depth > 3:
            return
        for child in folder.iterdir():
            if child.is_symlink() or not child.is_dir() or child.name in excluded:
                continue
            if (child/'package.json').is_file():
                candidates.append(child)
            else:
                visit(child, depth+1)
    visit(root, 1)
    if len(candidates) == 1:
        return candidates[0]
    if candidates:
        # Tauri production assets are configured relative to src-tauri, whereas
        # homologation/e2e is an independent test project, not the app frontend.
        config_file=root/'src-tauri/tauri.conf.json'
        cfg=json.loads(config_file.read_text('utf-8')) if config_file.is_file() else {}
        build=cfg.get('build',{})
        dist=build.get('frontendDist')
        if isinstance(dist,str) and dist and not dist.startswith(('http:','https:')):
            target=(root/'src-tauri'/dist).resolve()
            matching=[c for c in candidates if c==target or c in target.parents]
            if len(matching)==1:
                print('Frontend de produção identificado pelo frontendDist do Tauri:', matching[0],file=sys.stderr)
                return matching[0]
        hook=build.get('beforeBuildCommand') or ''
        if isinstance(hook,dict):
            cwd=hook.get('cwd')
            if isinstance(cwd,str) and cwd:
                locations={(root/cwd).resolve(), (root/'src-tauri'/cwd).resolve()}
                matching=[c for c in candidates if c in locations]
                if len(matching)==1:
                    print('Frontend identificado pelo cwd do beforeBuildCommand:',matching[0],file=sys.stderr)
                    return matching[0]
            hook=hook.get('script') or ''
        if isinstance(hook,str):
            matching=[c for c in candidates if c.name!='e2e' and
                      re.search(r'(?<![\w-])'+re.escape(str(c.relative_to(root)))+r'(?=/|\s|["\x27]|$)',hook)]
            if len(matching)==1:
                print('Frontend identificado pelo beforeBuildCommand:',matching[0],file=sys.stderr)
                return matching[0]
        # The canonical TCS Mail project keeps its application in frontend/.
        # Never treat a nested E2E harness as the production dependency root.
        primary=root/'frontend'
        nonprod={'homologation','e2e','tests','test','fixtures'}
        if primary in candidates and all(c==primary or bool(set(c.relative_to(root).parts)&nonprod) for c in candidates):
            print('Frontend de produção identificado: frontend/; ignorado(s) apenas projeto(s) de teste:',
                  ', '.join(str(c.relative_to(root)) for c in candidates if c!=primary),file=sys.stderr)
            return primary
        raise SystemExit('FALHA: vários package.json possíveis; defina uma única raiz do frontend antes da release: '+', '.join(str(x) for x in candidates))
    return None


def resolve(root):
    root = root.resolve()
    folder = frontend_root(root)
    if folder is None:
        config_file = root/'src-tauri/tauri.conf.json'
        if config_file.is_file():
            cfg = json.loads(config_file.read_text('utf-8'))
            cmd = str(cfg.get('build', {}).get('beforeBuildCommand') or '')
            if re.search(r'\b(npm|npx|pnpm|yarn|bun|bunx|node|corepack)\b', cmd):
                raise SystemExit('FALHA: Tauri exige frontend Node no beforeBuildCommand, mas package.json não foi localizado.')
        return {'manager':'none','folder':root,'lock':None,'relative':'.','declared':None}
    manifest = json.loads((folder/'package.json').read_text('utf-8'))
    declared = manifest.get('packageManager')
    manager = None
    if declared is not None:
        if not isinstance(declared, str):
            raise SystemExit('FALHA: packageManager de package.json inválido.')
        manager = declared.split('@',1)[0]
        if manager not in LOCKS:
            raise SystemExit('FALHA: packageManager não suportado neste kit: '+declared)
        if manager in ('pnpm', 'yarn') and not re.fullmatch(r'(?:pnpm|yarn)@\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?',declared):
            raise SystemExit('FALHA: para release reproduzível, fixe packageManager em package.json, ex.: '+manager+'@9.15.3; revise/commite manualmente.')
    present = {name for name, files in LOCKS.items() if any((folder/f).is_file() for f in files)}
    if len(present)>1:
        raise SystemExit('FALHA: lockfiles de gerenciadores diferentes; escolha o canônico: '+str(sorted(present)))
    if manager and present and manager not in present:
        raise SystemExit('FALHA: packageManager='+manager+' não coincide com lockfile encontrado: '+str(sorted(present)))
    if manager is None:
        if present:
            manager = next(iter(present))
        else:
            # This is a candidate, not permission to generate an npm lock.
            before = ''
            config_file = root/'src-tauri/tauri.conf.json'
            if config_file.is_file():
                cfg=json.loads(config_file.read_text('utf-8'))
                before=str(cfg.get('build',{}).get('beforeBuildCommand') or '')
            hits=[name for name in LOCKS if re.search(r'\b'+re.escape(name)+r'\b', before)]
            if len(hits)>1:
                raise SystemExit('FALHA: comando beforeBuildCommand menciona gerenciadores conflitantes.')
            manager=hits[0] if hits else 'npm'
    if manager == 'bun':
        raise SystemExit('FALHA: projeto usa Bun, mas este kit R11 não configura Bun nos runners; release bloqueada de forma segura, sem executar npm incorretamente.')
    if manager in ('pnpm','yarn') and not declared:
        raise SystemExit('FALHA: '+manager+' detectado pelo lockfile, mas packageManager não fixa versão em package.json; acrescente ex.: "packageManager": "'+manager+'@9.15.3" sob revisão.')
    config_file = root/'src-tauri/tauri.conf.json'
    if config_file.is_file():
        cfg=json.loads(config_file.read_text('utf-8'))
        before=str(cfg.get('build',{}).get('beforeBuildCommand') or '')
        # Check explicit package-manager executables; do not infer from ordinary words.
        used=set(re.findall(r'(?<![\w-])(npm|pnpm|yarn|bun)(?=\s|$)',before))
        if used and (len(used)>1 or manager not in used):
            raise SystemExit('FALHA: beforeBuildCommand usa '+str(sorted(used))+' mas lockfile/packageManager seleciona '+manager+'. Corrija a divergência na fonte.')
    lock = next((f for f in LOCKS[manager] if (folder/f).is_file()),None)
    return {'manager':manager,'folder':folder,'lock':lock,
            'relative':str(folder.relative_to(root)) or '.', 'declared':declared}


def ensure(root, info):
    if info['manager']=='none' or info['lock']:
        return info
    manager=info['manager']
    folder=info['folder']
    print('ATENÇÃO: existe package.json, mas não há lockfile versionado do gerenciador detectado:',manager)
    print('Frontend:',folder)
    print('Campo packageManager:',info['declared'] or '(não especificado)')
    if manager not in ('npm','pnpm'):
        raise SystemExit('FALHA: gere e revise manualmente o lockfile de '+manager+'; não usarei npm como substituto.')
    if input('Para criar SOMENTE o lockfile desse gerenciador, digite GERAR_LOCK: ').strip()!='GERAR_LOCK':
        raise SystemExit('Cancelado: release reproduzível exige lockfile. Nenhum clone realizado.')
    before=hashlib.sha256((folder/'package.json').read_bytes()).hexdigest()
    if manager=='npm':
        command=['npm','install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund']
    else:
        command=['corepack','pnpm','install','--lockfile-only','--ignore-scripts']
    executable = executable_for_subprocess(command[0])
    if not executable:
        raise SystemExit('FALHA: '+command[0]+' não está instalado localmente para criar lockfile.')
    command[0] = executable
    subprocess.run(command,cwd=folder,check=True)
    after=hashlib.sha256((folder/'package.json').read_bytes()).hexdigest()
    if after!=before:
        raise SystemExit('FALHA: package.json foi alterado pela geração do lock. Revise o diff antes de prosseguir.')
    updated=resolve(root)
    if not updated['lock']:
        raise SystemExit('FALHA: geração não criou o lockfile esperado.')
    rel=(folder/updated['lock']).relative_to(root)
    ignored=subprocess.run(['git','check-ignore','-q','--',str(rel)],cwd=root,check=False,capture_output=True)
    if ignored.returncode==0:
        raise SystemExit('FALHA: lockfile está ignorado pelo Git; ajuste .gitignore sob revisão antes de assinar release.')
    print('LOCKFILE GERADO, pendente de revisão/commit:',rel)
    return updated


def install(info):
    manager, folder = info['manager'], info['folder']
    if manager=='none':
        print('Sem frontend Node: nenhuma instalação npm/pnpm/yarn/bun necessária.')
        return
    if not info['lock']:
        raise SystemExit('FALHA: CI não pode instalar dependências sem lockfile.')
    commands={
        'npm':['npm','ci','--no-audit','--no-fund'],
        'pnpm':['corepack','pnpm','install','--frozen-lockfile'],
        'yarn':['corepack','yarn','install','--immutable'],
        'bun':['bun','install','--frozen-lockfile'],
    }
    command=commands[manager]
    if manager=='yarn':
        declared=info['declared'] or ''
        if declared.startswith('yarn@1.') or not (folder/'.yarnrc.yml').exists():
            command=['corepack','yarn','install','--frozen-lockfile']
    if manager in ('pnpm','yarn') and not executable_for_subprocess('corepack'):
        npm_executable = executable_for_subprocess('npm')
        if not npm_executable:
            raise SystemExit('FALHA: npm indisponível para preparar Corepack no runner.')
        print('Preparando Corepack fixo 0.36.0 para o gerenciador declarado',manager)
        subprocess.run([npm_executable,'install','--global','corepack@0.36.0'],check=True)
    executable = executable_for_subprocess(command[0])
    if not executable:
        raise SystemExit('FALHA: '+command[0]+' indisponível no runner para '+manager)
    command[0] = executable
    print('Instalação reproduzível:',manager,info['lock'],'em',folder)
    subprocess.run(command,cwd=folder,check=True)


def main():
    p=argparse.ArgumentParser()
    p.add_argument('mode',choices=('report','check','ensure','install'))
    p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2])
    args=p.parse_args()
    info=resolve(args.root)
    if args.mode=='ensure':
        info=ensure(args.root.resolve(),info)
    if args.mode in ('check','install') and info['manager']!='none' and not info['lock']:
        raise SystemExit('FALHA: gerenciador '+info['manager']+' sem lockfile; gere/commite localmente antes de tag assinada.')
    print(json.dumps({k:(str(v) if isinstance(v,Path) else v) for k,v in info.items()},ensure_ascii=False))
    if args.mode=='install':
        install(info)


if __name__=='__main__':
    main()
