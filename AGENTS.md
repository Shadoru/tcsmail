# AGENTS.md — TCS Mail: critérios de entrega obrigatórios

Aplicável a todas as alterações deste repositório. Este arquivo orienta agentes automatizados, revisões humanas e verificações de CI; por si só **não garante** ausência de defeitos. Não omitir etapas alegando aprovação estática.

## Identidade, segurança e limites

- Fonte canônica: este repositório. Antes de alterar, obter `git status`, commit-base e diffs. Nunca substituir silenciosamente código atualizado por ZIP antigo.
- Versão corrente: `0.8.2-rc7`; somente modificar a versão quando solicitado. Preservar `com.thecreativesolver.TCSMail` e os dados persistidos do usuário.
- Não publicar releases ou registrar dados de mensagens, tokens, credenciais, endereços e conteúdo de e-mail em logs/testes. Use caixas e tokens sintéticos.
- Todo o trabalho do usuário fica em `~/Projetos`; preservar `TCS-Mail-P2`, `TCS-Mail-Validacao`, fontes, credenciais, bancos e anexos. A limpeza exige listagem prévia e confirmação explícita.
- Nenhuma correção específica de Windows pode alterar indevidamente Linux ou macOS. Examinar todos os `cfg` por plataforma e cobrir Windows x64, Linux x64, macOS Intel e ARM64.

## Protocolo obrigatório: dois enfoques, confronto e dupla revalidação

1. Especialista virtual A (implementação): reproduzir o defeito, localizar a causa com caminho/linha e produzir correção mínima orientada a invariantes.
2. Especialista virtual B (adversarial): procurar regressões, concorrência, compatibilidade por SO/provedor, dados persistidos e casos de falha; desafiar explicitamente A.
3. Comparar alternativas e estabelecer consenso escrito; se não houver evidência suficiente, registrar `pendente` e **não declarar resolvido**.
4. Revalidação I: testes estáticos, unitários e contratos direcionados; reprovar quando faltar dependência/artefato/versão.
5. Revalidação II: executar o pipeline de compilação real em todos os destinos; validar pacotes e teste gráfico nativo. Não transformar warnings em sucesso presumido.
6. Registrar provas, limites, commit, versões de ferramentas e erros novos no relatório da entrega.

## Matriz de não regressão obrigatória

- Gmail: caixa de entrada, `\All`/Todos os e-mails, grandes pastas, rótulos, cursor UID, UIDVALIDITY, flags, alternância rápida de pastas, sincronização inicial vs. histórico.
- Microsoft (Outlook/Exchange Online): OAuth2 PKCE e renovação, IMAP/SMTP delegados, reautorização, seleção de pastas especiais, UIDVALIDITY, cancelamentos.
- IMAP genérico: autenticação básica/STARTTLS/TLS, namespaces, separadores, Modified UTF-7/UTF-8, `\NoSelect`, respostas parciais, desconexão, flags, anexos.
- UI: tema escuro/claro/sistema, menus `selectShell` e seletores nativos, foco/contraste, compositor independente/integrado, barra horizontal, posições de popups, rascunhos, atalhos e dados persistidos.
- Windows: executável GUI sem console, subprocessos sem janela, Credential Manager: set/get/delete com dados sintéticos e Unicode; EXE + MSI.
- Linux: DEB e RPM; AppStream, `.desktop`, ícones, versões específicas e recursos sem entradas duplicadas.
- macOS Intel/ARM64: `APP` + `DMG`, `.app.zip` via `ditto`, recursos/symlinks, Keychain.

## RC7 — gates de movimentação e compiladores

- Todo menu de seleção de pastas deve exibir `display_name` decodificado e enviar `name` original, com separador/prefixo correto. Nunca enviar o rótulo traduzido ao servidor.
- Ações drag-and-drop devem exigir seleção homogênea da mesma conta, destino selecionável, token efêmero, confirmação antes de movimentar, tratamento de falhas parciais e alternativas sem mouse.
- Em mensagens, `Excluir` deve ficar entre as primeiras ações do menu de contexto, que precisa caber na viewport, rolar e ser acessível por teclado. Exclusão definitiva exige confirmação.
- Dropdowns devem abrir no espaço disponível acima/abaixo, sem ficarem cortados por modais ou barras; conferir temas e contraste nos três mecanismos nativos.
- Verificadores Python sempre usam UTF-8 explicitamente, com gate; contratos que leem código Rust devem aceitar rustfmt e variações de quebra de linha.
- Executar testes de `folder_move`, contrato de RC7 e UTF-8 em **todos** os jobs; exigir build real dos quatro destinos e os dois formatos Linux locais antes de homologar.

## Gates e anti-recorrência

- Todos os scripts Python de CI devem ler arquivos UTF-8 com `Path.read_text(encoding="utf-8")`; evitar a codificação padrão do Windows. O workflow deve ativar `PYTHONUTF8=1` e executar `test_utf8_ci_sources.py` em todos os runners.

Antes de commit / push (no Ubuntu, com CARGO_HOME/RUSTUP_HOME isolados):

```
cargo fmt --all
cargo fmt --all -- --check
cargo check --locked --workspace --all-targets
cargo test --locked --workspace
cargo clippy --locked --workspace --all-targets -- -D warnings
python3 scripts/quality/tcsmail-package-guard.py --source
python3 scripts/quality/test_utf8_ci_sources.py
python3 scripts/quality/rc7-ui-and-packager.py
node scripts/quality/rc7-folder-move.test.mjs
python3 scripts/quality/rc7-providers-and-release.py
python3 scripts/quality/test_tcsmail_package_guard.py
python3 scripts/quality/rc2-presentation-verify.py --source
node scripts/verify-ms-oauth.mjs
node scripts/quality/rc2-release-contract.mjs
node scripts/quality/rc2-interface-regression.mjs
node scripts/quality/rc2-native-composer-behavior.mjs
node scripts/quality/rc7-composer-routing.mjs
node scripts/quality/rc7-provider-sync-contract.mjs
python3 scripts/quality/rc7_crossplatform_regression.py
git diff --check
```

No Ubuntu, o gerenciador local deve comprovar DEB e RPM usando o mesmo pacote de testes do CI.

No GitHub, executar todos os quatro jobs de `.github/workflows/tcsmail-homologacao.yml` em **novo commit**. `cargo fmt --check` e Clippy são bloqueantes. Cada job deve empacotar **todos** os formatos solicitados e inspecionar os arquivos gerados antes do upload. `Actions verde` não significa aplicativo homologado.

Falha recorrente deve gerar: (a) teste de regressão que falha antes da correção, (b) correção mínima, (c) execução pós-correção, (d) instrução de recuperação sem apagar dados, (e) nota no changelog/auditoria.

### Empacotamento e versões

- SemVer público `0.8.2-rc7`; MSI/WiX `0.8.207`; RPM `Version=0.8.2, Release=0.rc7.1` via override de **empacotamento**, não mudança global de identidade.
- Não declarar manualmente no RPM os aliases `tcs-mail.png` que o Tauri já escreve. Não exigir aliases removidos como entradas **configuradas**; inspecionar os recursos **reais**.
- No macOS, evitar shadowing de import Python (`subprocess`) e preservar o `.app` com `ditto`.
- O `AGENTS.md` orienta, mas o controle efetivo depende dos gates de CI, dos testes e da revisão do diff.

## Template obrigatório para novos prompts de entrega

> TCS Mail — use a fonte canônica da última entrega/commit. Siga integralmente o `AGENTS.md`: dois enfoques independentes (implementação e auditoria adversarial), confronto até consenso, dupla revalidação; examine impacto em Gmail, Microsoft, IMAP genérico e quatro destinos Windows/Linux/macOS; reproduza erros, adicione testes de regressão e não declare homologação não executada. Preserve dados e identidades; produza a fonte completa, workflow e guia com comandos Ubuntu/GitHub e limpeza segura, indicando explicitamente o que ficou pendente.

## RC7 — Primeira execução, integridade e contrato de fontes externas

- Primeiro uso em duas etapas quando não há conta: adicionar contas (Gmail/Microsoft OAuth ou IMAP TLS/STARTTLS) e selecionar as mesmas opções de tema oferecidas por Aparência, notificações ligadas e compositor integrado. Nunca registrar senhas/tokens em localStorage.
- Reuso obrigatório de constantes para temas; revisão de ajuda em PT-BR e EN-US; edição de múltiplas contas sem substituir perfil anterior.
- Agendamento não pode enfileirar imediatamente quando a data está ausente ou é passada; follow-up não pode aceitar data anterior.
- Após cadastro de conta, a navegação deve recarregar o snapshot atual, sem exigir reinício manual. Não iniciar backfill histórico completo durante conexão OAuth.
- Controles enriquecidos não podem multiplicar eventos globais conforme novas janelas abrem; identificadores de mensagens IMAP devem ser inteiros positivos.
- Não declarar conformidade integral de material de outra conversa sem acesso aos bytes originais e hash. Registrar falta do anexo como bloqueio, não inventar funcionalidades.
- Exigir o contrato `rc7-first-run-regression.mjs` no GitHub em todos os sistemas. Contratos anteriores permanecerão disponíveis somente como histórico, nunca como bloqueios RC7.

## Limpeza e rastreabilidade do pacote Git

- Não incluir relatórios de h2/h3/h4/h5, READMEs desatualizados, hashes
  de releases antigas, imagens de mockups temporários ou documentação histórica
  que não seja necessária à execução/compilação/testes atuais.
- Não apagar scripts, schemas, vendoring, ícones, workflows ativos, licenças
  ou dados do usuário apenas por parecerem antigos. Limpeza em clone existente
  deve ser reversível, com allowlist, conferência de hash e backup em ~/Projetos.
- README e Ajuda não podem conter links locais inexistentes. Mudança em
  onboarding requer testes de retomada sem conta, preferências ao voltar,
  erro de cofre de credenciais e conclusão apenas com conta persistida.
- Artefatos de outra conversa inacessíveis em bytes são bloqueios para alegar
  conformidade integral. Registrar pendências e nunca fabricar origem/prova.

## Contrato First Run e recursos de apresentação

- O First Run apresenta dois passos, três benefícios explicados (Contas em um só lugar, Dados armazenados localmente, IA somente se você quiser), e os seis temas reais (Sistema, Claro, Escuro, Focus, Ocean, Graphite), com foco e seleção por teclado.
- Toda mudança nos tokens de cor deve atualizar as prévias dos seis temas e seus testes; não anunciar paletas ilustrativas como cores do aplicativo.
- Não alegar que PNG/ICO/ICNS foram atualizados sem comparar os hashes da release anterior com a arte oficial aprovada.
- Nenhum assistente pode indicar restauração completa se faltar transação/rollback; não criar importação improvisada de bancos ou credenciais.


## RC7: controles de dependências e rede
- Verificadores executados no CI devem usar a biblioteca padrão Python, ou instalar dependências de modo explícito antes de executá-los em todos os runners.
- Timeout TCP não é recusa de credenciais; não criar conta antes de autenticar IMAP com êxito. Não contornar firewall, certificado ou política de segurança.
- Fluxo OAuth deve exibir indicação de espera e erros acionáveis de rede. Testar Linux, Windows, macOS Intel e ARM64.
