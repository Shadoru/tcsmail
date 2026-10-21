# TCS Mail — Microsoft OAuth (h6-ms-oauth-rc1)

**Status: CANDIDATA DE CÓDIGO, NÃO VERSÃO HOMOLOGADA.** Fonte base preservada: `0.8.2-h5-imapfix2`. Esta entrega implementa integração Microsoft OAuth para **IMAP/SMTP do Exchange Online e Outlook.com**, e **não** implementa Microsoft Graph como transporte principal. É um avanço concreto e isolado, mas não cumpre ainda o plano Graph-first dos anexos.

## Proveniência e limitações

- Configuração: `oauth-microsoft-tcs.zip` fornecido pelo usuário; tipo de aplicação pública, client ID, `/common`, `http://localhost`, permissões **Graph** já configuradas.
- Código avaliado: árvore completa `0.8.2-h5-imapfix2`. `AGENTS.md` instrui preservar referências sincronizadas; nenhum arquivo externo foi sobrescrito.
- Fontes oficiais: Microsoft desktop app (https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-configuration), authorization code PKCE (https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), Exchange OAuth IMAP/SMTP (https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth), Graph delta (https://learn.microsoft.com/en-us/graph/delta-query-messages), immutable IDs (https://learn.microsoft.com/en-us/graph/outlook-immutable-id), throttling (https://learn.microsoft.com/en-us/graph/throttling), sendMail (https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0).
- Perspectiva prática: relatos de administradores em https://www.reddit.com/r/sysadmin/comments/1akns5l/ e https://www.reddit.com/r/sysadmin/comments/157biqw/ sobre consentimento corporativo e permissões excessivas. Relatos não são evidência de defeitos específicos no TCS.
- Não houve revisão por dois especialistas humanos externos. As duas perspectivas são revisão documental e revisão adversarial do código, com duas passagens de contratos locais. Compilação Rust, login real, servidor Microsoft e plataformas Windows/macOS não foram executados neste ambiente.

## Decisão de arquitetura e divergência explícita com o material

O plano anexado pede **Graph como principal** e IMAP/SMTP como alternativa. O código TCS atual é IMAP-first com armazenamento local baseado em UID/UIDVALIDITY e fila SMTP. Foi possível integrar OAuth para IMAP/SMTP sem reescrever nem arriscar as operações existentes. A presente revisão **não converte Graph em IMAP**, não solicita token Graph, não mistura os recursos e não declara o plano Graph principal concluído.

**O Entra do projeto possui somente permissões Graph Mail.ReadWrite e Mail.Send configuradas.** Para que o novo conector de compatibilidade IMAP/SMTP funcione, também é preciso conceder **as permissões delegadas do recurso Exchange Online**, `IMAP.AccessAsUser.All` e `SMTP.Send`; organizações podem bloquear esse consentimento mesmo após login. Se o Entra não permitir concedê-las, o fluxo não deverá fazer login por senha básica. Para uso sem IMAP/SMTP habilitados, falta implementar Graph.

## O que foi alterado

1. `crates/tcs-core/src/oauth.rs`: fluxo Microsoft public client Authorization Code + PKCE S256 sem segredo; scopes Outlook exclusivos; renovação de token sob trava própria; cliente de troca de tokens com redirecionamentos HTTP desativados; persistência no SecretStore com prefixo isolado de Google; rejeição de token Graph; três testes Rust sem rede.
2. `src-tauri/src/lib.rs`: comandos Tauri Microsoft connect, cancel, status; reutilização do listener localhost em porta efêmera; verificação de autorização **IMAP real** antes de persistir conta/token; proteção de reconexão contra substituir conta OAuth Google; remoção local do token Microsoft; bloqueio de alteração direta do endereço de conta OAuth (Google e Microsoft) preservando a edição de nomes locais; detecção de Microsoft incluindo domínios corporativos via descoberta/MX. Nunca cria serviços de inicialização automática.
3. `frontend/views.js`: conexão Microsoft pelo mesmo fluxo “Adicionar conta” e botão Reconectar/Editar, com os nomes locais preservados; status separado do Google.
4. `frontend/styles.css`: componentes Microsoft harmonizados com as variáveis de cada tema.
5. `scripts/verify-ms-oauth.mjs`: contratos estáticos de segurança/integração, ligados ao instalador e à matriz multiplataforma.
6. `scripts/install.sh`: verificação de manifesto novo e regressões antes de `cargo test --workspace --lib` e `cargo check --workspace --all-targets`; somente após build release troca executável, preservando credenciais, SQLite e fonte anterior.

## Passos no Microsoft Entra — necessários para este modo

1. No registro do aplicativo existente **TCS Mail**, mantenha Mobile/Desktop, `http://localhost`, clientes pessoais e organizacionais, sem client secret.
2. Adicione ao conjunto de permissões delegadas **Office 365 Exchange Online**: `IMAP.AccessAsUser.All` e `SMTP.Send` (além das permissões Graph existentes; não conceda permissões *application* de toda a organização).
3. Caso a organização bloqueie consentimento do usuário, um administrador deverá autorizar conforme sua política. Não contorne o bloqueio com senha básica, ROPC ou permissões de aplicação.
4. Confirme que **IMAP** e, para envio, **Authenticated SMTP** estão habilitados para a caixa. A conclusão do OAuth não comprova que esses serviços estejam ativos.
5. No TCS Mail: Configurações → Contas → Adicionar conta → informe apenas o e-mail. Microsoft é detectada e o navegador padrão é aberto. Antes de salvar a conta, o TCS testa autenticação IMAP com o token recebido. O nome local da caixa continua independente do remetente.

## Dupla contraposição e revalidação

**Oficial, 1ª revisão:** não confundir escopos de Graph e Exchange. Validar `state`, PKCE, client public, redirect localhost. **Adversarial, 1ª revisão:** evitar associar token Microsoft a conta Google, preservar nome local, não gravar conta antes da prova da caixa IMAP, não logar tokens.

**Oficial, 2ª revisão:** confirmar `offline_access`, escopos Outlook delegados, TLS/STARTTLS com SASL XOAUTH2 e diferenciação dos servidores pessoal/corporativo. **Adversarial, 2ª revisão:** contratos de IPC, status, cancelamento, reconexão, token store, preservação Google e testes negativos de token Graph. Limites adicionais abaixo permanecem abertos.

## Gates / cenários para homologação

- `node scripts/verify-ms-oauth.mjs` e os gates legados JS + IMAP.
- `cargo test --locked --workspace --lib` e `cargo check --locked --workspace --all-targets` em cada sistema operacional.
- No Ubuntu, `./scripts/install.sh` preserva o executável anterior se qualquer gate falhar; reutiliza cache Cargo compartilhado.
- Conta Outlook.com pessoal: login, IMAP, mensagens antigas, Enviados, novas respostas e envio real SMTP, renovação, reconexão.
- Conta Microsoft 365 corporativa: login com MFA e sem consentimento; bloqueio pelo administrador; caixa sem licença Exchange; IMAP disabled; SMTP AUTH disabled; servidores/perm diferentes.
- Duas contas Google/Microsoft simultâneas: isolamento do token, nome personalizado da caixa, renovação concorrente, remoção seletiva e sincronização separada.
- Testes adversariais: callback caminho errado; `state` errado/duplicado; cancelamento; token só Graph; erro do cofre; timeout; reconexão para outro provedor; atualização de tela após troca rápida de conta.
- Windows (Credential Manager/loopback), macOS (Keychain/loopback), Ubuntu (Secret Service/loopback), verificar que nenhum serviço inicia sozinho e nada fica em execução após sair via tray.
- Nem a matriz CI nem contrato estático equivale a homologação real com a Microsoft. Não enviar e-mails de produção nos primeiros ensaios.

## Pendências P0 para o objetivo Graph-first do projeto

1. Provider Microsoft Graph separado de `async_mail`, com autenticação do recurso Graph e identidade estável do Entra (`oid`/`tid` ou `sub`) devidamente **validada**, armazenamento de token com chaves tenant/recurso/usuário.
2. Persistência aditiva de Graph IDs textuais (`Prefer: IdType="ImmutableId"`), IDs de pastas e delta links por pasta, sem reinterpretá-los como IMAP UID/UIDVALIDITY.
3. Sincronização paginada Graph por pasta: `@odata.nextLink`, `@odata.deltaLink`, resets/erros, regras 429/Retry-After, anexos e cópia MIME segura.
4. Mutações Graph: marcações, mover, excluir, rascunhos remotos, anexos pequenos e upload sessions, fila `sendMail` com estado **202 aceito != entregue**, prevenção de reenvio duplicado.
5. Abstração de transporte comum preservando backup, busca, visualizador, agrupamento, anexos, Rascunhos, Enviados, identidades, respostas e envio existente Google/IMAP.
6. Testes reais e nativos nos três SO, incl. contas pessoais e corporativas. **Sem cumprir os itens 1–6, não declarar a integração Graph completa.**

## Riscos remanescentes no conector de compatibilidade

- Endereço de caixa é prova de autenticação IMAP mas **não** equivale à identidade imutável `oid`/`tid` validada. O esquema atual impõe um registro por e-mail, limitando cenários multi-tenant e caixas compartilhadas.
- Um usuário corporativo pode autenticar na Microsoft e ter o acesso IMAP bloqueado pela política do Exchange; para ele o aplicativo não conseguirá criar a conta por este modo.
- SMTP AUTH pode estar desativado apesar de IMAP funcionar. O TCS deve informar o erro no diagnóstico, e o usuário não deve presumir que o envio está homologado após apenas leitura.
- A revogação nesta revisão remove tokens locais. Para retirar consentimento já concedido na conta Microsoft, utilize as configurações do Microsoft Entra/Microsoft Account; isso não é uma revogação remota feita pelo TCS.
- A matriz original possui Tauri 2.12.4 no Cargo.lock (verificação do aviso GHSA-7gmj-67g7-phm9 para versões <=2.11.0). Nenhuma compilação Rust foi feita aqui; gates Rust e execução real permanecerão pendentes até a estação do usuário e CI.
