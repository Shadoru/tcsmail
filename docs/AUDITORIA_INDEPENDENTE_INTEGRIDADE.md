# Auditoria independente de integridade — fonte RC8 fix1

Data: 2026-11-02, America/Sao_Paulo. Este documento registra a **fase de auditoria anterior às correções 0.8.3**. As referências abaixo descrevem os bytes examinados nessa fase; alterações posteriores podem deslocar suas linhas.

Fonte: `/home/otavio/.codex/.chatgpt-projects/g-p-6abf33aa6dd081919c3abe5c457f7cf1/TCS-Mail-0.8.2-rc8-fix1`. Base Git: `228ad458e61bf590e5452ed869565a69815b1a45`, com alterações e arquivos não rastreados preexistentes. O commit sozinho não identifica esta árvore de trabalho.

Li integralmente os AGENTS.md do projeto, desta fonte e do baseline. Examinei primeiro os fluxos solicitados e só depois li as **211 linhas** de `/home/otavio/Downloads/TCS Mail 0.8.2-RC8 — Auditoria estática independente.md`, SHA-256 `2fb92199e1e89b12bc6f646ded255111ff4d8ed42fd89228c0b23324fe058800`. Confronto feito por um único auditor, em passadas de investigação e contestação; não representa dois especialistas externos independentes.

Não executei aplicativo, instalação, build, benchmark ou testes nesta fase. Não alterei código. A gravação deste relatório foi autorizada posteriormente. Nenhuma conclusão equivale a homologação funcional ou multiplataforma.

## Resultado prioritário

P0 significa bloqueio de entrega por envio contra a decisão de cancelamento; P1, integridade/privacidade ou função essencial; P2, falha funcional localizada/limitação; P3, manutenção. Efeitos de desempenho permanecem sem medição.

| Claim | Prioridade atual | Veredito sobre a fonte examinada | Evidência atual |
| --- | --- | --- | --- |
| C01 | P0 | Confirmado: cancelamento pode ser sobrescrito | `crates/tcs-core/src/outbound.rs:112–114,169–192,221–222` |
| C02 / A02 | — | Atualmente corrigido: workflows manuais | `.github/workflows/imap-cross-platform.yml:3–4`; `tcsmail-homologacao.yml:3–4`; `rc8fix1-renderer.yml:3–4` |
| C03 / A01 | P1 | Confirmado para exportação da interface; refutada ausência de qualquer restauração no repositório | `src-tauri/src/lib.rs:5537–5561`; `scripts/backup-upgrade-databases.py:68–145` |
| C04 / A03 | P1 | Confirmado: ordem DB/cofre e erros ignorados | `src-tauri/src/lib.rs:2392–2429`; `secrets.rs:40–47` |
| C05 / A13 | P2 | Chave por e-mail confirmada; colisão de e-mail idêntico no mesmo DB refutada por UNIQUE. Mudança só de caixa tem risco concreto de perder lookup | `schema_v9.sql:1–4`; `secrets.rs:28–46`; `lib.rs:2392–2402` |
| C06 | P1 | Confirmado: cache de análise não é isolado por conta/conteúdo/contexto | `src-tauri/src/lib.rs:6453–6488,6491–6510,6570–6572`; `rag.rs:262–275,679` |
| C07 | P1 | Confirmado: leitor separado exclui permanentemente sem confirmação | `frontend/native_window.js:95,127,130`; `lib.rs:1272–1279` |
| C08 | P1 | Confirmado para erros anteriores ao claim; não para todo erro SMTP | `outbound.rs:182–192,218–221,247–252`; `lib.rs:6603–6606` |
| C09 / A10 | — / P2 | Atributos remanescentes confirmados; alegado bypass da CSP do leitor bloqueado refutado. Ver caminho distinto do compositor abaixo | `frontend/lib.js:43`; `main.js:694–699`; `native_window.js:90` |
| C10 | P1 | Confirmado: funções irmãs acessam nomes locais de render | `frontend/native_window.js:87–92,125–132` |
| C11 | P2 | Confirmado: array groups oculta função groups | `frontend/views.js:91` |
| C12 / A09 | P2 | Confirmado como ausência de override/UI ambígua; refutada premissa de que a UI já grava chave por conta para esta opção | `frontend/main.js:27–29`; `frontend/views.js:104` |
| C13 / A11 | P2 | Limitação confirmada; UI Linux já está desabilitada e explica política | `lib.rs:6791–6883,6956–6966`; `main.rs:9–11`; `views.js:100` |
| C14 | P2 | Confirmado: transformação lexical inverte ranking | `crates/tcs-ai-core/src/rag.rs:431,450,522–528` |
| C15 / A19 | P2 | Confirmado: linhas/erro de contagem descartados | `crates/tcs-core/src/store.rs:571,588–591` |

## Defeitos confirmados, consequência e correção mínima

### Fila: C01 e C08

Interleaving concreto: worker lê o item elegível na linha 182; cancelamento muda para `cancelled` na 113 e retorna sucesso; worker executa UPDATE incondicional na 221 e chama SMTP na 222. SEND_LOCK só serializa processadores no mesmo processo, não cancelamentos nem processos externos.

Correção mínima: claim condicional por estado elegível, exigindo exatamente uma linha alterada antes de SMTP; cancel deve distinguir cancelado, já iniciado e inexistente. Não resolver colocando cancel atrás de um lock mantido durante o envio: isso apenas o atrasaria até ser tarde. Workers em processos distintos precisam disputar o mesmo claim SQLite.

Falhas de JSON, conta, cofre/OAuth ou endereço antes da linha 221 deixam o item elegível e mais antigo para sempre. A fila é global: uma conta bloqueia as seguintes. Persistir erro de preparação como `needs_auth` ou retry com prazo, sem reativar item já cancelado, e continuar atendendo outras contas. Erros SMTP já passam para `failed` na 251; não confundir os dois casos. O `?` de background_tick também interrompe o restante daquele ciclo.

Riscos da correção: reenviar SMTP cujo resultado foi incerto. Preservar quarentena/revisão, inclusive para `sending` abandonado após crash; nunca resetar automaticamente para queued.

Testes necessários: barreiras determinísticas entre SELECT/claim/cancel; dois workers e duas conexões; cancel tardio sem falso sucesso; conta A sem credencial seguida de B válida; JSON inválido; erro SMTP após DATA com apenas uma tentativa.

### Conta e cofre: C04 e ressalva C05

Salvar grava DB antes de store_password, sem rollback. Renomear sem informar senha migra antes de validar/persistir o novo e-mail, ignora erro e apaga a chave antiga dentro de migrate_password. Exemplo concreto: renomear conta A para o e-mail já usado por B pode sobrescrever a senha de B e apagar a de A **antes** de UNIQUE rejeitar o UPDATE. Esse defeito não depende de coexistirem duas contas com o mesmo e-mail.

Excluir limpa/revoga primeiro e ignora falhas; se o DELETE falhar, a conta persiste sem credencial; se a limpeza falhar, o segredo pode permanecer após remoção. Não há limpeza explícita dos arquivos de anexos da conta no comando examinado.

Correção mínima: serializar mutações da identidade, fazer a validação/atualização SQLite em transação antes de qualquer migração destrutiva, manter o segredo antigo até commit, propagar falhas e compensar alterações do cofre em erro de commit. Na exclusão, confirmar remoção local e registrar limpeza pendente do cofre, com possibilidade de retry. DB e cofre não compartilham transação: não anunciar atomicidade perfeita só por inverter duas chamadas.

Chave estável por conta é evolução válida, mas exige migração com fallback e não é justificada pela colisão impossível alegada em C05. Há outro defeito localizado: save_account e migrate_password comparam e-mails ignorando caixa, mas lookup_password usa a string bruta. Alteração apenas de maiúsculas/minúsculas sem nova senha pode deixar a conta apontando para chave inexistente em cofres de chave exata. Tokens OAuth têm namespace e normalização próprios (`oauth.rs:341–356,616–633`); não generalizar comportamento entre os três SOs.

Testes: falha cofre/DB/commit; renomear A para B deve preservar ambos os segredos; mudança só de caixa; excluir com DB bloqueado ou cofre indisponível. Usar credenciais sintéticas em Windows, Linux e ambos os macOS. Risco de implementação: médio, pela compensação e compatibilidade dos dados persistidos.

### Backup, restauração e WAL: C03, A01 e A24

A interface exporta apenas `mail.db` via API SQLite Backup. Essa API inclui o estado SQLite do WAL; **não** há base para dizer que esta exportação perde o WAL por copiar só um arquivo. Omite `ai.db`, arquivos em cache/attachments e draft-attachments; handles e caminhos persistidos não tornam o pacote autocontido. Configuração/histórico/RAG em ai.db também ficam fora; algumas configurações de IA espelhadas no mail.db podem permanecer.

O script separado usa `src.backup(dst)` para todos os `*.db` (linhas 78–88), verifica hashes/integridade e restaura para diretório novo por staging/rename (112–145). Isso já existe tanto no baseline quanto no fix1. Os testes phase2 importam esse script: a afirmação de que testariam um comando Tauri inexistente é incorreta. Entretanto o script declara que exclui dados fora dos bancos e não integra recuperação completa à interface, nem garante snapshot atômico entre dois bancos em atividade.

Correção imediata de UX: rotular como exportação do banco local de e-mails, sem prometer recuperação completa ou automática. Uma recuperação integral posterior precisa inventário/manifesto, anexos com caminhos relativos, validação de schema, staging, quiescência e rollback; reautenticação continua necessária.

A24: há `fs::copy` pré-migração em `db.rs:61–65,166–169`. Não se confere a tupla busy/log/checkpointed e não se impede escrita entre checkpoint e cópia. Corrupção/perda efetiva permanece hipótese, a validar com escritor/leitor WAL concorrentes. A referência anterior a `store.rs:253–259` é insuficiente: no fluxo normal, Database::open primeiro eleva user_version a 11 (`db.rs:149–150`), e o ramo old<10 de migrate_v10 não é normalmente alcançado. Usar API Backup no caminho efetivamente alcançável.

### Cache IA: C06

Consentimento e cfg.enabled são conferidos **antes** do cache (`lib.rs:6455–6460`): não há prova de bypass dessa autorização. O defeito é outra fronteira: a chave contém Message-ID, idioma e duas preferências; lookup não filtra account_scope. Duas mensagens autorizadas de contas diferentes com mesmo Message-ID podem receber resposta/fontes calculadas no contexto da outra conta, inclusive trechos e caminhos RAG. Alteração do corpo/modelo/prompt/índice também não invalida a chave. Não foi demonstrada exfiltração automática para um provedor remoto.

Correção mínima: namespace por conta e identidade/conteúdo da mensagem, conferir scope no SELECT e invalidar cache legado. Incluir hash do conteúdo preparado, binding provider/model, versão de prompt e revisão/escopo RAG. Não usar Message-ID fornecido pelo remetente como identidade exclusiva.

Teste: duas contas, mesmo Message-ID, corpos/fontes diferentes; conta sem consentimento deve falhar mesmo com cache; alterar corpo/modelo/índice deve invalidar. Risco: baixo/médio, principalmente crescimento do cache e invalidação.

### HTML/CSP: contestação A10/C09

O sanitizador **já prefixa** o documento com meta CSP. Com allowRemote=false, `default-src 'none'; img-src data: cid:` restringe os recursos de imagem. As políticas efetivas se intersectam; a política externa permitir HTTP/HTTPS não afrouxa a interna. Atributos `background` e CSS `image-set()` remanescentes não demonstram bypass dessa política. Não classificar como P1 de vazamento no leitor só por faltar whitelist.

Os leitores integrado (`main.js:694–699`) e separado (`native_window.js:90`) usam o documento completo em srcdoc. A prévia do rascunho também usa `sanitizeEmailHtml(...allowRemote:false)` (`main.js:1179–1180`). Nenhum destes trechos prova o vazamento alegado.

**Caminho diferente confirmado por fluxo estático:** `main.js:787–789` e `native_window.js:122–124` fazem sanitização com allowRemote=true, extraem doc.body.innerHTML e passam a citação para o compositor. `composer.js:242` insere seed.htmlBody no DOM principal. A meta CSP ficou no head descartado; a CSP externa (`tauri.conf.json:12`) permite img-src HTTP/HTTPS. Portanto uma imagem remota comum na citação pode ser carregada ao responder/encaminhar sem o consentimento de imagens do leitor. Isto é uma rota concreta, não inferência baseada apenas em atributo ausente. Tráfego real não foi capturado nesta auditoria. Prioridade proposta: P1 para eliminar esse caminho antes da entrega, condicionando comprovação de rede a teste posterior.

A prévia de envio (`composer.js:344`) remove src/href HTTP explícitos, mas não isola o documento em iframe nem cobre background/CSS/protocol-relative de forma completa. O carregamento por esses vetores é hipótese de engine; testar, sem confundir com srcdoc protegido. `stripUnsafePaste` é outro filtro (`rich_editor.js:79–102`) e não é chamado na atribuição inicial seed.htmlBody.

Correção mínima posterior: preservar o bloqueio na transformação citação→editor e na prévia; não descartar a proteção ao extrair body. Não reescrever lib.js como pré-condição de todas as outras correções. Testar pixel sintético em servidor local, com interceptação de rede, para leitor bloqueado, rascunho, resposta, encaminhamento, compositor independente e prévia nos três engines. Aceite: zero requests sem opt-in. Nunca declarar execução desses testes nesta fase.

### Leitor separado e configurações: C07, C10, C11, C12 e P03

- C07: dois botões nativos usam delete_permanent diretamente em Trash. Compartilhar um helper com confirmação e texto explícito; cancelar deve produzir zero chamadas. O backend já verifica UID/UIDVALIDITY e exige UIDPLUS; isso não substitui consentimento do usuário.
- C10: elevar setMode/showHtml ao escopo de initReader, com guarda de identidade do host e sequência de requisição para descartar respostas obsoletas. Testar os três botões depois de rerender.
- P03: initReader aguarda get_message, set_flags e folder_roles antes de renderizar (`native_window.js:79–85`). get_message pode hidratar via rede (`lib.rs:1170–1179`). Pintar primeiro get_message_cached, obter conteúdo/permissões/roles depois, sem permitir ação destrutiva com contexto incompleto e sem marcar novamente como lida após ação do usuário.
- C11: renomear o array local groups; após salvar/excluir, chamar a função que recarrega. A persistência acontece antes do TypeError; não dizer que a alteração foi perdida.
- C12: tanto leitura quanto escrita de reply_surface são globais hoje. As demais preferências do formulário já têm override. Implementar leitura/escrita `account.<id>.composition.reply_surface` com fallback global, ou deixar visualmente explícito que esta opção é global. Não há prova de envio pela conta errada: seed.accountId é respeitado (`composer.js:107`; `native_windows.js:22`).

Risco: baixo/médio; testar cliques repetidos, fechar/rerender durante hidratação, erro/offline e contas A/B com configurações diferentes.

## Demais claims A: confronto com o código atual

| ID | Status e prioridade | Referência atual e correção/limite |
| --- | --- | --- |
| A04 | Confirmado estrutural, P2; latência hipótese | `operations.rs:62–89`, `coordination.rs:38`, `main.js:585–591`: lote sequencial, runtime/login por mutação. Lote UID por conta/pasta/época; custo e benefício a medir. |
| A05 | Confirmado estrutural, P2 | `schema_v9.sql:26–49`, `store.rs:537–540,588–591`, `lib.rs:1727`: sem índice de ordenação dedicado, COUNT e contadores. Índices conforme plano real; não garantir ganho sem EXPLAIN/medição. |
| A06 | Confirmado no caminho ativo, P2 | `store.rs:526–529`: LIKE concatenado com corpo. FTS existe em db.rs:548; trocar exige preservar semântica de busca. |
| A07 | Confirmado, P1 para falha de abertura/P2 custo | `lib.rs:528–557,6913–6924`: estado/AI antes da janela e single-instance. Importação legada já tem marcador (`migration.rs:31–40`); não afirmar que reimporta tudo sempre. |
| A08 | Confirmada chamada sem cache, P2 | `composer.js:122–124`; `lib.rs:1044–1104`: subprocessos de fontes. Cache/lazy load; custo sem medição. |
| A11 | Parcial, P2 | Ver C13: Linux força off, mas controle já desabilitado em views.js:100; IDLE existe no processo externo, não no principal. Preservar política até decisão explícita. |
| A12 | Confirmado Linux/Windows, P2 | `secrets.rs:91–95,188–221,245–248`; macOS usa Security.framework. Cache curto com invalidação exige cuidado com vida do segredo. |
| A14 | Confirmado, P3 | `lib.rs:6973–6979`: polling SMTP a cada 5 s. Notify/deadline só após correções de integridade. |
| A15 | Confirmado, P3 | `db.rs:43–49`; `store.rs:240–246`: nova conexão por consulta. Pool/reuso apenas com evidência de custo. |
| A16 | Confirmado no worker externo, P3 | `lib.rs:6805–6814,6865–6872`: thread/runtime por conta e consulta periódica. Não atribuir esse IDLE ao processo principal. |
| A17 | Parcial; custo de legado hipótese, P3 | `store.rs:599,626–681`; parser mail.rs:647 produz hex, mas sync atual chama com cabeçalhos e limpa anexos (`async_mail.rs:1780–1790,1890–1900`). Dados antigos podem usar externalização; não remover o parser como suposto código morto. |
| A18 | Confirmado, P3 | `main.js:227–229`: IPC de contagem por conta. Consolidar se medição justificar. |
| A20 | Confirmado, P2 | `lib.rs:3359–3387`; `main.rs:9–11,20–29`: tarefas externas Windows/macOS versus Linux. Considerar também claim SQLite interprocesso de C01. |
| A21 | Parcial/hipótese de requisito, P3 | `tauri.conf.json:42,49`: URL /mail permanece; destino correto depende do requisito do site. MSI já é 0.8.209, coerente com fix1; não repetir 0.8.208 como valor atual. |
| A22 | Divergência principal refutada | Os dois workflows Rust têm with.toolchain=1.99.0 (`imap-cross-platform.yml:37–40`; `tcsmail-homologacao.yml:48–52`). @stable identifica o instalador. rust-version diferentes são mínimos, não prova de toolchains duplicadas. |
| A23 | Hipótese externa, P3 | Tags de actions não foram verificadas remotamente. Tauri CLI já tem versão exata (`tcsmail-homologacao.yml:58`); existência/eficácia de cache não pode ser inferida como medição. |
| A24 | Hipótese de consequência com padrão inseguro confirmado, P2 | Ver seção WAL: corrigir db.rs alcançável; o ramo store.rs apontado não descreve sozinho a partida normal. |

A01/A02/A03/A09/A10/A13/A19 estão confrontados na tabela principal. Não há claim A omitido desta comparação.

## Claims P adicionais

P01 confirmado (`lib.rs:6914,6924`); P02 confirmado inclusive espera de rede em conta selecionada (`main.js:205,274–281`; `lib.rs:1696–1699`), sem essa espera quando não há conta selecionada; P03 confirmado como acima. P04/P05 correspondem A05/A06: o token tcs-sort de `main.js:485` ativa OFFSET em `store.rs:538`, não keyset na listagem normal. P06 confirmado (`async_mail.rs:1829–1840`): SEARCH histórico amplo antes de limitar. P07/P08/P09 correspondem A04/A08/A12. P10 confirmado (`composer.js:251–252`): serialização/Blob por input. P11/P12 correspondem A14–A16/A15. P13 agora confirmado estruturalmente (`main.js:516,532`): filter de todos os itens para cada linha; sem números. P14 confirmado estruturalmente (`rag.rs:365–380,478–499`): embeddings antes de comparar hash e busca vetorial por varredura. P15 confirmado (`rag.rs:595–612`): pdftotext sem timeout/limite de saída pré-alocação; XML DOCX descompactado integralmente antes de limitar caracteres. Prioridade P1 para limites de ingestão de arquivos não confiáveis; nenhuma exploração de memória foi executada.

## Correções propostas pela auditoria anterior que não devem ser aplicadas literalmente

1. Não retirar a conclusão da CSP interna olhando só a CSP externa.
2. Não justificar chave por UUID com duas linhas de e-mail idêntico que o schema impede.
3. Não implementar fallback de exclusão permanente para EXPUNGE amplo sem UIDPLUS. A recomendação de lote em A04 cita esse fallback, mas o código atual recusa corretamente tal operação (`async_mail.rs:1326–1327,1367–1370,1403`). Preservar a recusa: EXPUNGE amplo pode apagar mensagens de outros clientes.
4. Não chamar inversão DB/cofre de transação atômica entre sistemas distintos.
5. Não chamar exportação do mail.db de backup completo nem negar o restore isolado já existente no script.
6. Não anunciar desempenho, pacote funcional, assinatura/notarização ou conformidade integral de OAuth/provedores a partir desta inspeção.

## Baseline e rastreabilidade

Baseline lido: `/home/otavio/Projetos/TCS-Mail/repo`, mesmo HEAD Git; possuía modificação preexistente em src-tauri/Cargo.toml e script não rastreado. Comparação de bytes: outbound.rs, secrets.rs, store.rs, db.rs, rag.rs, backup-upgrade-databases.py, frontend/lib.js e composer.js são idênticos entre baseline e fix1. Portanto fila, cache, cofre e caminhos HTML correspondentes não são regressões introduzidas pelo fix1. main.js, views.js, native_window.js, lib.rs e workflows diferem; suas referências aqui foram obtidas da fonte fix1 atual, não transpostas do relatório antigo.

SHA-256 da fonte examinada, antes de correções posteriores:

```
30007517b6b62212842f7d652ee0940af82279e124f997632fb2e8be6a743e38  crates/tcs-core/src/outbound.rs
d90faafd4017249781dafc9ebaa43d2b6069b42310b9c386f851870d8a25b71b  frontend/lib.js
38625f7df378bef0b1084fdb7433486034837e76e48a3d5aff80f0acd3f04311  frontend/composer.js
3131a364f95db364429fc25c7fdf810d4a377227035bef96323fb19ed30bfd8d  frontend/native_window.js
90b9d42ac9c69199745c1ce0991664c55caa3e16077e2a92cdf211b037e3907f  src-tauri/src/lib.rs
```

## Critérios para a implementação 0.8.3 posterior

Começar por C01/C04/C06/C07/C08; corrigir C10/C11 e leitor local-first; tornar C12 e rótulo da exportação consistentes. Separar mudanças mínimas confirmadas de otimizações e hipóteses. Cada proprietário deve registrar seus testes sintéticos e limites, sem sobrescrever trabalho concorrente. Testes de regressão devem verificar efeitos observáveis (chamadas, persistência, ordem e isolamento), não apenas procurar texto no código.

Homologação posterior exige testes nativos Windows/Linux/macOS Intel/ARM, Gmail/Microsoft/IMAP genérico, falhas parciais/UIDVALIDITY e pacotes conforme AGENTS.md. Nesta fase todas essas execuções ficaram deliberadamente pendentes por instrução expressa de somente leitura.
