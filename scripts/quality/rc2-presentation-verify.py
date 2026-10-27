#!/usr/bin/env python3
"""RC5 release presentation checks. Read-only, no credentials or network.

Usage: python3 scripts/quality/rc2-presentation-verify.py --source
       python3 scripts/quality/rc2-presentation-verify.py --deb /path/real.deb
       python3 scripts/quality/rc2-presentation-verify.py --rpm /path/real.rpm
"""
from pathlib import Path
from xml.etree import ElementTree as ET
import argparse
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tarfile
import tempfile

ROOT=Path(__file__).resolve().parents[2]
CONF=ROOT/'src-tauri/tauri.conf.json'
RES=ROOT/'src-tauri/resources'
IDENT='com.thecreativesolver.TCSMail'
TARGETS=[32,128,256,512]

def require(condition,message):
    if not condition:
        raise ValueError(message)

def png_dimensions(raw):
    require(raw[:8]==b'\x89PNG\r\n\x1a\n','PNG signature missing')
    return struct.unpack('>II',raw[16:24])

def metadata_check(xml):
    root=ET.fromstring(xml)
    require(root.tag=='component' and root.get('type')=='desktop-application','AppStream component type invalid')
    require(root.findtext('id')==IDENT,'AppStream identifier mismatch')
    require(root.findtext("launchable[@type='desktop-id']")==IDENT+'.desktop','AppStream launcher mismatch')
    require(root.findtext("icon[@type='stock']")==IDENT,'AppStream icon name mismatch')
    require(root.findtext('metadata_license') is not None,'AppStream metadata license missing')
    require(root.findtext('summary') is not None,'English summary missing')
    require(root.find("summary[@{http://www.w3.org/XML/1998/namespace}lang='pt-BR']") is not None,'PT-BR summary missing')
    require(len(root.findall('./description/p'))>=4,'Localized full descriptions missing')
    require(root.findtext("url[@type='homepage']")=='https://thecreativesolver.com/mail','Homepage mismatch')
    require(root.find("releases/release[@version='0.8.2-rc8']") is not None,'Version metadata mismatch')

def desktop_check(txt,hidden=False):
    require('[Desktop Entry]' in txt,'Desktop entry missing')
    require('Exec=' in txt and 'Icon=' in txt,'Desktop Exec/Icon missing')
    if hidden:
        require('NoDisplay=true' in txt,'Generated desktop entry must be hidden')
    else:
        require(f'Icon={IDENT}' in txt,'Visible desktop icon ID mismatch')
        require('Name=TCS Mail' in txt,'Visible desktop name mismatch')
        require('Exec=tcs-mail' in txt,'Visible launcher executable mismatch')
        require('NoDisplay=true' not in txt,'Visible app launcher is hidden')

def check_source():
    cfg=json.loads(CONF.read_text(encoding="utf-8"))
    require(cfg['version']=='0.8.2-rc8','Wrong version')
    require(cfg['identifier']==IDENT,'Tauri ID changed (risk to existing user data)')
    require('multiplataforma' in cfg['bundle']['shortDescription'].lower(),'Localized tagline missing')
    require('Linux, Windows e macOS' in cfg['bundle']['longDescription'],'Cross-platform description missing')
    require('IA' in cfg['bundle']['longDescription'],'Optional AI missing')
    metadata_check((RES/(IDENT+'.metainfo.xml')).read_bytes())
    desktop_check((RES/(IDENT+'.desktop')).read_text(encoding="utf-8"))
    desktop_check((RES/'tcs-generated-hidden.desktop.hbs').read_text(encoding="utf-8"),hidden=True)
    for kind in ['deb','rpm']:
        node=cfg['bundle']['linux'][kind]
        require(node['desktopTemplate']=='resources/tcs-generated-hidden.desktop.hbs',f'{kind}: hidden generator template missing')
        paths=node['files']
        require(paths['/usr/share/applications/'+IDENT+'.desktop']=='resources/'+IDENT+'.desktop',f'{kind}: desktop map missing')
        require('/usr/share/metainfo/'+IDENT+'.metainfo.xml' in paths,f'{kind}: AppStream map missing')
        for sz in TARGETS:
            key=f'/usr/share/icons/hicolor/{sz}x{sz}/apps/{IDENT}.png'
            require(key in paths,f'{kind}: missing icon {sz}')
            if kind == 'deb':
                require(f'/usr/share/icons/hicolor/{sz}x{sz}/apps/tcs-mail.png' in paths,f'{kind}: missing Tauri icon alias {sz}')
            else:
                require(f'/usr/share/icons/hicolor/{sz}x{sz}/apps/tcs-mail.png' not in paths,f'{kind}: manually mapped icon alias causes duplicate entry {sz}')
            pp=ROOT/'src-tauri'/paths[key]
            require(pp.is_file(),f'{kind}: icon source missing: {pp}')
            require(png_dimensions(pp.read_bytes())==(sz,sz),f'{kind}: wrong icon size {sz}')
    require('write_support_view' not in (ROOT/'src-tauri/src/lib.rs').read_text(encoding="utf-8"),'Previously reported dead-code helper still exists')
    require((ROOT/'frontend/help_center.js').is_file(),'Help Center is missing')
    print('PASS: source AppStream, executable identity, official icons, 0.8.2-rc8 and previous lint fix')
    if shutil.which('appstreamcli'):
        cmd=['appstreamcli','validate','--no-net',str(RES/(IDENT+'.metainfo.xml'))]
        print('Running:',*cmd)
        subprocess.run(cmd,check=True)
    else:
        print('NOT RUN: external AppStream validator unavailable (install appstream).')

def checks_payload(files, *, rpm=False):
    name='.//usr/share/'
    def find(path):
        for key,val in files.items():
            if key.lstrip('./')==path.lstrip('/'):
                return val
        raise ValueError('Missing inside package: '+path)
    metadata_check(find('/usr/share/metainfo/'+IDENT+'.metainfo.xml'))
    desktop_check(find('/usr/share/applications/'+IDENT+'.desktop').decode('utf-8'))
    # Tauri default package also creates tcs-mail.desktop; must be hidden to avoid duplicate app menu entries.
    generated=next((v for k,v in files.items() if k.lstrip('./')=='usr/share/applications/tcs-mail.desktop'),None)
    if generated is not None: desktop_check(generated.decode('utf-8'),hidden=True)
    for sz in TARGETS:
        blob=find(f'/usr/share/icons/hicolor/{sz}x{sz}/apps/{IDENT}.png')
        require(png_dimensions(blob)==(sz,sz),f'Invalid icon in package: {sz}')
        alias_key=f'usr/share/icons/hicolor/{sz}x{sz}/apps/tcs-mail.png'
        alias=next((v for k,v in files.items() if k.lstrip('./')==alias_key),None)
        if not rpm:
            require(alias is not None,f'DEB missing launcher icon alias: {sz}')
        if alias is not None:
            require(png_dimensions(alias)==(sz,sz),f'Invalid generated launcher icon alias: {sz}')
    print('PASS: package contains visible TCS Mail desktop entry, 4 official icon resolutions and valid AppStream metadata.')

def verify_deb(path):
    require(shutil.which('dpkg-deb') is not None,'Install dpkg-deb for DEB inspection.')
    pr=subprocess.Popen(['dpkg-deb','--fsys-tarfile',str(path)],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    found={}
    with tarfile.open(fileobj=pr.stdout,mode='r|') as tar:
        for member in tar:
            name=member.name.lstrip('./')
            if name.startswith(('usr/share/applications/','usr/share/icons/hicolor/','usr/share/metainfo/')) and member.isfile():
                fp=tar.extractfile(member)
                found[name]=fp.read() if fp else b''
    err=pr.stderr.read().decode(errors='replace')
    require(pr.wait()==0,'DEB extraction error: '+err)
    checks_payload(found)

def verify_rpm(path):
    require(shutil.which('rpm2cpio') and shutil.which('cpio'),'Install rpm2cpio and cpio to validate RPM payload.')
    # Extract only in a new temporary directory, not in the user's source or home.
    with tempfile.TemporaryDirectory(prefix='tcs-rc6-rpm-qa-') as tmp:
        # Keep the integrity inspection: allow RPM payloads to contain repeated
        # directory entries / timestamps without causing false extraction errors.
        a=subprocess.Popen(['rpm2cpio',str(path)],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        b=subprocess.run(['cpio','-idmu','--quiet','--no-absolute-filenames'],stdin=a.stdout,cwd=tmp,capture_output=True,text=True)
        if a.stdout:a.stdout.close()
        rpm_stderr=a.stderr.read().decode('utf-8',errors='replace') if a.stderr else ''
        rpm_status=a.wait()
        if rpm_status or b.returncode:
            details=f'rpm2cpio={rpm_status}, cpio={b.returncode}; cpio stderr={b.stderr.strip()}; rpm stderr={rpm_stderr.strip()}'
            # Some runner cpio builds reject payload metadata handled by libarchive.
            # Fallback still extracts the full RPM and performs all checks_payload assertions.
            bsdtar=shutil.which('bsdtar')
            if not bsdtar:
                raise ValueError('RPM extraction failed: '+details)
            fallback=subprocess.run([bsdtar,'-xf',str(path),'-C',tmp],capture_output=True,text=True)
            require(fallback.returncode==0,'RPM extraction failed: '+details+'; bsdtar: '+fallback.stderr.strip())
        files={}
        prefix=Path(tmp)/'usr/share'
        for subdir in ['applications','icons/hicolor','metainfo']:
            folder=prefix/subdir
            if folder.exists():
                for file in folder.rglob('*'):
                    if file.is_file():files[str(file.relative_to(tmp))]=file.read_bytes()
        checks_payload(files, rpm=True)

def main():
    ap=argparse.ArgumentParser()
    g=ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--source',action='store_true')
    g.add_argument('--deb',type=Path)
    g.add_argument('--rpm',type=Path)
    a=ap.parse_args()
    try:
        if a.source:check_source()
        else:
            path=a.deb or a.rpm
            require(path.is_file(),f'Package missing: {path}')
            verify_deb(path) if a.deb else verify_rpm(path)
    except (ValueError,OSError,subprocess.CalledProcessError) as exc:
        sys.exit('FAIL: '+str(exc))

if __name__=='__main__':main()
