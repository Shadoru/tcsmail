# TCS Mail RC5 — auditoria por dois enfoques e duas revalidações

**Base:** RC4 macOS corrigida, com correções anteriores de RC3 consolidadas. **Versão candidata:** 0.8.2-rc5. **Estado:** código-fonte completo entregue para homologação, não publicado.

## Verificação independente A — implementação/protocolo

- Gmail, Microsoft IMAP e IMAP genérico compartilham `sync_recent`, `SyncEngine`, UID/UIDVALIDITY e checkpoint guarded; o ganho de latência da RC5 foi aplicado no caminho comum.
- Entrada na pasta pede lote recente de 100 cabeçalhos e não inicia backfill histórico automático. O botão Atualizar ainda permite continuar em páginas com checkpoints. A reconciliação completa passou para trabalho de manutenção separado, deduplicado por conta/pasta, para não bloquear a primeira apresentação.
- `list_folder_tree` conserva `FolderInfo.name` bruto para operações IMAP e oferece `display_name` com decodificação Modified UTF-7 (RFC 3501); não reescreve identificadores ou mensagens armazenadas.
- A pasta especial `\All` do Gmail permanece baseada em SPECIAL-USE/atributos; aliases visuais são ocultados da árvore quando já existem atalhos especiais, preservando nomes originais.
- Windows: ocultação de subprocessos PowerShell/schtasks/cmd e janela GUI para Release; credenciais continuam no cofre do Windows, com teste sintético disponível no código.

## Verificação independente B — auditoria adversarial / riscos

- `cargo fmt --check`, Clippy, testes Rust e contratos são obrigatórios no CI. Sem alterar `AGENTS.md`/gates e sem aceitar relatórios estáticos como confirmação de binário instalado.
- DEB com SemVer RC5, RPM com `Version 0.8.2 / Release 0.rc5.1`, MSI interno `0.8.205` e APP/DMG por arquitetura; não recolocar aliases de ícone duplicados, não misturar instaladores antigos.
- `tcsmail-package-guard.py` exige cada formato e arquivos reais, gera manifesto e SHA-256. O `.app` deve ser compactado por `ditto` no macOS; caso contrário o verificador reprova.
- UI: regras de cor para seletores customizados/nativos e tema escuro/sistema, rótulos de pastas e redução de rolagem horizontal. Verificação visual ainda é indispensável.
- A alteração assíncrona de manutenção preserva a trava da conta e os guards de UIDVALIDITY. A presença de trava longa mesmo após mudar de pasta é **um risco remanescente**, não corrigido completamente.

## Confronto / consenso

Consenso após revisão: avançar incrementalmente apenas com otimizações que não alterem identidade de mensagens, cursor, nome da pasta ou credenciais; só alterar apresentação ou agendamento, e bloquear releases antes dos testes nativos. A análise adversarial rejeitou a alegação de que a sincronização é sempre rápida: no primeiro acesso sem checkpoint ainda existe `UID SEARCH ALL` e um servidor grande pode ser lento.

## Revalidação I (efetivamente executada neste ambiente)

- `python3 scripts/quality/tcsmail-package-guard.py --source`: aprovado.
- `python3 scripts/quality/rc5-providers-and-release.py`: aprovado.
- `python3 scripts/quality/rc2-presentation-verify.py --source`: aprovado para dados da fonte; validador AppStream externo indisponível.
- `python3 scripts/quality/test_tcsmail_package_guard.py`: 3 testes Python de bundle e cenários negativos aprovados com fixtures sintéticas; isso não equivale a `ditto` real.
- Contratos Node `verify-ms-oauth`, `rc2-release-contract`, `rc2-interface-regression`, `rc2-native-composer-behavior`, `rc5-composer-routing`: aprovados.
- `node --check` para todos os arquivos JS em `frontend`: aprovado.
- `python3 -m compileall scripts/quality`, `bash -n` dos scripts Linux e atualizador: aprovados.

## Revalidação II (adversarial, estática)

- Metadados e versões fonte comparados com workflow e Cargo.lock; aliases duplicados RPM bloqueados; manifestos e integridade do ZIP calculados.
- Script de atualização preserva `.git`, configurações/contas do usuário, prepara backup Git e exige árvore limpa; sem publicação nem push automático.
- As correções de Windows, macOS e Linux não são substitutos de teste real em cada OS.

## Não executado / bloqueios de homologação

- Ferramentas `cargo`, `rustc`, `rustfmt`, compilação Tauri e executáveis nativos indisponíveis neste ambiente. **Nenhum dos 4 builds do GitHub foi executado nesta revisão.**
- Não foi executado teste real de Gmail Todos os e-mails, Microsoft Exchange Online nem IMAP genérico com servidor de teste; tampouco registro de latência por fase, segurança de sincronização em servidor sob falha ou ensaios de carga de 50.000 mensagens.
- Não há garantia de corrigir cancelamento em operações Rust já iniciadas, eliminação total de busca `UID SEARCH ALL` nem tempo máximo de resposta remoto.
- Menus/datas/rolagem precisam de inspeção WebView2 (Windows), WebKitGTK (Linux) e WKWebView (Mac Intel/ARM64); console Windows e CredMan requerem instalação/testes.
- Assinatura Windows e notarização Apple fora de escopo. Ícones do GNOME Software exigem abrir pacote real.

**Status final:** código RC5 preparado e estaticamente verificado; aprovação de compilação e funcionamento depende de GitHub Actions e homologação humana. Não declarar garantia universal de ausência de defeitos.
