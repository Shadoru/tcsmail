#!/usr/bin/env python3
"""RC7 source regression gate for inbox move, context menu, popup, help and packagers.
Not a substitute for OS-native builds or live IMAP tests.
"""
import json
import re
from pathlib import Path
r=Path(__file__).resolve().parents[2]
read=lambda p:(r/p).read_text(encoding='utf-8')
a=json.loads(read('src-tauri/tauri.conf.json'))
assert a['version']=='0.8.2-rc8'
assert a['identifier']=='com.thecreativesolver.TCSMail'
assert a['bundle']['windows']['wix']['version']=='0.8.208'
main=read('frontend/main.js')
controls=read('frontend/ui_controls.js')
css=read('frontend/styles.css')
folders=read('frontend/folder_move.js')
helptext=read('frontend/help_center.js')
i18n=read('frontend/i18n.js')
workflow=read('.github/workflows/tcsmail-homologacao.yml')
assert "import {moveFolderChoices,validateMoveSelection}" in main
assert "invoke('list_folder_tree',{accountId})" in main
assert 'value="${esc(f.value)}"' in main and '${esc(f.label)}' in main
assert "activeMailDrag={token,ids:selected.map(Number),accountId:item.account_id}" in main
assert "event.dataTransfer.getData('text/plain')" in main
assert 'moveMessagesToFolder(drag.ids,target,choices,{ask:true})' in main
assert 'moveInProgress=true' in main and 'moveInProgress=false' in main
assert "[state.folder===folderName('trash')?'Excluir definitivamente':'Excluir'" in main
assert "menu.style.maxHeight='min(70vh, 560px)'" in main
assert "button.addEventListener('drop',async event=>" in main
assert "confirmDialog(action==='delete_permanent'" in main
assert 'tcsFloatingPopup' in controls and 'document.body.append(popup)' in controls
assert 'openSelectShells' in controls
assert '.selectPopup.tcsFloatingPopup' in css and '.contextMenu{max-height:' in css
assert 'decodeMailboxLabel' in folders and 'selectable!==false' in folders
for lang in ('pt-BR','en-US'):
 assert lang in helptext
for needle in ('Mover mensagens entre pastas','Move messages between folders','Localizar Excluir','Find Delete'):
 assert needle in helptext,needle
assert "'Destino':'Destination'" in i18n
for variant in ('linux-x64','windows-x64','macos-intel','macos-arm64'):
 assert variant in workflow
assert '0.rc8.1' in workflow
for test in ('rc7-folder-move.test.mjs','rc7-ui-and-packager.py','test_utf8_ci_sources.py'):
 assert test in workflow,test
print('PASS: RC7 UI/move/help/translation, version/packagers, all-OS release gates')
