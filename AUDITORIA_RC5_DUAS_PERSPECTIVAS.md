# TCS Mail 0.8.2-rc5 — Confronto adversarial e dupla revalidação

**Estado:** candidata de homologação, sem garantia de ausência de regressões. A análise usou dois enfoques virtuais, não revisores humanos separados.

## Especialista virtual A — engenharia de integração e desempenho
- Seguiu o fluxo da UI (`enterFolder`→`syncFolderHistory`→`sync_recent`/`sync_backfill`) ao SQLite, protocolo IMAP e reconciliação.
- A fonte RC4 solicitava centenas de mensagens por chamada e iniciava histórico automático e reconciliação no caminho crítico. A RC5 limita as chamadas de primeiro plano a 100 por solicitação, não inicia `backfill` automático na primeira entrada e retorna a primeira página antes da manutenção de sinalizadores/regras.
- O histórico permanece manualmente retomável pela ação de sincronização. **Não substitui paginação por rolagem com desempenho medido**, que segue como melhoria futura.
- Os nomes de exibição passam por decodificação Modified UTF-7, preservando o nome IMAP original para SELECT, UID e checkpoints (válido para Gmail, Microsoft e IMAP genérico).
- No Windows, subprocessos auxiliares que listam fontes, manipulam arquivos e tarefas são criados sem console visível. O executável principal preserva a configuração `windows_subsystem` Release.
- CSS melhora contraste de menus e controles na variante escura, inclusive modo System quando SO escuro.

## Especialista virtual B — segurança e regressões multiplataforma
- Verificou caminho separado para UIDVALIDITY, cursores e checkpoint: essas rotas não foram substituídas nem contornadas pela mudança de latência.
- Identificou o risco de agendar manutenção a cada página: inserido controle `MAINTENANCE` por conta/pasta para impedir acúmulo ilimitado de reconciliações paralelas.
- Verificou que a versão pública é `0.8.2-rc5`, enquanto MSI é `0.8.205` e RPM `0.8.2-0.rc5.1`; ícones RPM redundantes continuam proibidos.
- Confirmou checagem de sintaxe Python do pacote macOS, compactação `ditto` e arquivo `.app.zip`; a correção da importação `subprocess` segue incorporada.
- Adicionou `AGENTS.md` mais gates executáveis em CI para bloquear recorrência das regressões conhecidas.

## Consenso entre as perspectivas
**Correções com menor superfície de alteração**, sem alterar formato de dados pessoais, licença, identificador do aplicativo, callbacks OAuth, mensagens ou chaves. Priorizar primeira tela responsiva sem violar integridade. Não declarar homologação completa apenas por contratos estáticos.

## Primeira validação (código)
- Gate `rc5-provider-sync-contract.mjs`: valida limites da primeira rodada e nomes de protocolo inalterados.
- Gate `rc5_crossplatform_regression.py`: valida versões, workflow, console, cofre, RPM e artefatos macOS.
- Contratos legados da RC2/RC4 de OAuth, compositor, interface e apresentação; sintaxe JS/Python/Bash.
- Testes adversariais do empacotador: macOS Intel/ARM64 sintéticos, ausência de DMG e execução não macOS.

## Segunda validação (artefato)
- O ZIP é reextraído e sua integridade por SHA-256 será conferida arquivo a arquivo.
- Gates JS, Python e Bash repetidos na fonte extraída.
- O fluxo GitHub aplica Cargo fmt/check/test/clippy na máquina nativa **antes** de empacotar. Testes negativos não são desligados para produzir instaladores.

## Matriz de problemas e pendências
| Problema/risco | Alteração | Evidência necessária de homologação |
|---|---|---|
| Gmail All Mail com 0 inicial e lentidão | UI mostra estado inicial e limita primeira rodada, desacopla reconciliação | Gmail real grande: tempos SELECT/SEARCH/FETCH, primeira página, troca de pasta |
| Microsoft Exchange Online / Outlook | Mesma otimização shared IMAP sem mudar OAuth | Conta Microsoft OAuth real, IMAP/SMTP e mensagens grandes |
| IMAP genérico heterogêneo | Mesmo caminho neutro; Modified UTF-7 apenas em display | Servidores com e sem SPECIAL-USE/UTF8, UIDVALIDITY e rollback |
| Mudança rápida de pasta | UI ignora respostas antigas, manutenção deduplicada | Confirmar prioridade e eventual timeout em operação já iniciada |
| Pastas Gmail traduzidas | Decodificador Modified UTF-7 e teste Rust | Pastas reais localizadas; operação remota usando nome original |
| Menus no escuro/alto contraste | CSS dark, System-dark, controles | Screenshots Windows/Linux/macOS, acessibilidade e menús nativos |
| Console preto ao abrir compositor | `CREATE_NO_WINDOW` para subprocessos conhecidos | Abrir/fechar compositor e anexos no Windows |
| Credenciais Windows | Correção PowerShell EncodedCommand RC4 preservada | IMAP password e tokens Google/MS, reinício e exclusão; limite de token |
| Janela independente e rascunhos | Contratos anteriores preservados | Homologação GUI nativa e operações múltiplas |
| `.deb` e `.rpm` | Versões distintas, ícones, AppStream, guard | Abrir DEB no GNOME Software e instalar RPM |
| `.exe/.msi` | GUI Win + versão numérica MSI | Instalar ambos e checar atualização |
| macOS Intel/ARM64 | `ditto`, `.dmg`/`.app.zip`, teste contra erro Python | Assinatura/notarização, instalação em Macs reais |

## Limites honestos da verificação
- **NÃO EXECUTADO:** cargo fmt/check/test/clippy e empacotamento nativo Windows/Linux/macOS neste ambiente (Cargo/Rust não disponível).
- **NÃO EXECUTADO:** conexão a Gmail, Microsoft, servidores IMAP reais, testes de benchmark e inspeção visual automática da GUI nos sistemas.
- **NÃO COMPROVADO:** ausência total de erros, cancelamento efetivo de uma requisição IMAP já em andamento, latência alvo de poucos segundos e correção completa de todos os controles de UI.
- **DESCONHECIDO:** alterações adicionais presentes na sua branch privada desde a última fonte compartilhada. Confronte `git diff` antes do commit.
