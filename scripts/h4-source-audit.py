#!/usr/bin/env python3
"""Full archive non-mutating inventory/syntax/dependency checks; Rust correctness via cargo."""
import json,os,re,subprocess,tomllib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
ignore={'.git','target','node_modules','dist','.venv','__pycache__'}
files=[]
for base,dirs,names in os.walk(root,followlinks=False):
 dirs[:]=[x for x in dirs if x not in ignore]
 for name in names:
  path=Path(base)/name
  if path.is_symlink() or not path.is_file():raise SystemExit('BLOQUEADO: link/arquivo inesperado '+str(path))
  files.append(path)
assert len(files)>140, 'Pacote de origem incompleto'
counts={x:0 for x in ['javascript','rust','shell','json','toml','other']}
for path in files:
 suffix=path.suffix
 if suffix in ('.js','.mjs'):
  counts['javascript']+=1
  completed=subprocess.run(['node','--check',str(path)],capture_output=True,text=True)
  if completed.returncode:raise SystemExit('BLOQUEADO: JavaScript inválido '+str(path)+'\n'+completed.stderr[:400])
 elif suffix=='.sh':
  counts['shell']+=1
  completed=subprocess.run(['bash','-n',str(path)],capture_output=True,text=True)
  if completed.returncode:raise SystemExit('BLOQUEADO: Bash inválido '+str(path)+'\n'+completed.stderr[:400])
 elif suffix=='.json':
  counts['json']+=1;json.loads(path.read_text())
 elif suffix=='.toml':
  counts['toml']+=1;tomllib.loads(path.read_text())
 elif suffix=='.rs':
  counts['rust']+=1
  for target in re.findall(r'include_(?:str|bytes)!\(\s*"([^"\n]+)"',path.read_text(errors='replace')):
   if not (path.parent/target).is_file():raise SystemExit('BLOQUEADO: include ausente '+str(path)+' -> '+target)
 else:counts['other']+=1
for schema in ('crates/tcs-core/data/schema_v9.sql','crates/tcs-core/data/schema_v10.sql'):
 if not (root/schema).is_file():raise SystemExit('BLOQUEADO: schema ausente '+schema)
packages=tomllib.loads((root/'Cargo.lock').read_text())['package']
for name,expected in [('async-imap',['0.12.0']),('imap-proto',['0.17.0']),('imap',[])]:
 actual=[p['version'] for p in packages if p['name']==name]
 if actual!=expected:raise SystemExit(f'BLOQUEADO: {name}: {actual} deveria ser {expected}')
print('PASS auditoria de fonte: arquivos=',len(files),' classes=',counts)
print('PASS sintaxe JS/Bash/JSON/TOML, includes Rust, schemas SQL e IMAP 0.12.0/0.17.0')
print('AVISO: compilação e testes Rust são executados exclusivamente pelos gates cargo do instalador')
