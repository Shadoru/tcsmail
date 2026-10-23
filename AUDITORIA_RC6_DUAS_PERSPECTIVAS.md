# TCS Mail 0.8.2-rc6 — auditoria A/B, confronto e dupla revalidação

**Base:** fonte integral de TCS Mail 0.8.2-rc5 da conversa, com correção UTF-8 posterior incorporada. Não houve acesso ao commit privado atual do usuário. **Estado:** código preparado, homologação nativa pendente.

## Especialista virtual A — implementação

1. Em `frontend/main.js`, o modal de movimentação usava `list_folders` e apresentava o **nome bruto IMAP**. A árvore já usa `list_folder_tree` (com `name`, `display_name`, `parent`, `selectable`). O novo módulo `frontend/folder_move.js` exibe o nome legível no menu e envia exclusivamente o identificador original.
2. `frontend/ui_controls.js` posicionava o popup sempre abaixo, dentro da rolagem do modal. A RC6 usa portal de popup em `document.body`, posicionamento visível acima/abaixo, limites da janela, rolagem e restauração do elemento ao fechar.
3. `frontend/main.js`: adicionado DnD de mensagens do servidor para pastas da conta ativa, com token efêmero sem dados de e-mail, validação de conta/pasta e confirmação. Usa o comando Rust `message_action` existente.
4. O menu de contexto possuía Excluir apenas na última posição e sem limitar altura. Na RC6, `Mover` e `Excluir` ficam no topo, há rolagem e comandos de teclado; confirmação de exclusão permanente foi mantida/reforçada.
5. Traduções em `frontend/i18n.js` e dois artigos bilingues em `frontend/help_center.js` documentam o fluxo de mover/excluir. Manuais agora incluem compilação local Linux e GitHub.

## Especialista virtual B — auditoria adversarial

1. Nunca substituir raw UID/UIDVALIDITY nem traduzi-los; `moveFolderChoices()` gera pares `{value:name,label:display_name}`. Pastas `\NoSelect` não aceitam drop; Inbox permanece elegível.
2. Nunca arrastar dados da mensagem/credencial; `DataTransfer` contém apenas token transitório. DnD entre contas/rascunhos locais não deve ser permitido. Não permitir executar move para destinos não listados.
3. Proteger operações longas: execução sequencial, `moveInProgress`, feedback parcial, atualização da lista, recuperação da seleção em falhas; **não há rollback transacional global de movimentos já executados**.
4. Dropdown precisa funcionar com scroll, redimensionamento e dark-mode em Chromium/WebView2, WebKitGTK e WKWebView. Implementação CSS não é evidência de teste visual em SO real.
5. Validadores CI não podem depender de caracteres nativos cp1252 no Windows nem de espaçamento Rust fixo. Reforçados `PYTHONUTF8=1`, codificação explícita, contratos com regex tolerante a rustfmt e scripts Node. Empacotadores continuam com MSI versão interna 0.8.206 e RPM 0.8.2-0.rc6.1.
6. Backups e caches só em `~/Projetos`; não remover dados, credenciais, fontes e histórico Git; nenhuma publicação automática.

## Consenso

Implementação localizada e compartilhada entre provedores (Gmail, Microsoft e IMAP genérico) e entre Windows, Linux e macOS, com validação de entrada, nomes somente para exibição e alternativa de menu acessível. Não alterar backend IMAP ou semântica de movimentação sem testes de protocolo.

## Evidências de revalidação 1 — executadas neste ambiente

- Teste Node puro `rc6-folder-move.test.mjs`: Unicode e Modified UTF-7 (`Segurança` e `Jurídico`), hierarquia, nomes brutos, `[Gmail]/All Mail`, exclusão `\NoSelect`, conta mista, rascunho local e pasta de origem.
- Contrato Python `rc6-ui-and-packager.py`: existência de componentes, regras de DnD, menu Excluir, popup, Ajuda PT/EN, versões e matriz CI.
- Contratos RC2 e RC6 de OAuth, compositor, sincronização, interface, metadados e ícones; análise de UTF-8 explícito.
- Sintaxe JavaScript/Node, Python e Bash, integridade de arquivos do ZIP extraído.
- Testes sintéticos macOS de embalagem `.app`/DMG e hashing; não invocam o `ditto` real fora do macOS.

## Evidências de revalidação 2 — pendentes de ambiente nativo

- `cargo fmt --all -- --check`, `cargo check`, `cargo test`, Clippy e `cargo tauri build` nos quatro runners; Rust/Cargo não estão disponíveis neste ambiente.
- Inspeção nativa dos dois instaladores Linux e Windows, APP/DMG Intel/ARM; macOS `ditto`; teste real das novas interações visuais e drag-and-drop.
- Contas Gmail/Microsoft/IMAP reais, mensagens copiadas para pastas com acentos, falhas de rede e milhares de mensagens.

**Não declarar RC6 homologada sem esses resultados.** O arquivo `AGENTS.md` impõe critérios; os scripts de CI testam invariantes, mas não garantem ausência de defeitos futuros.
