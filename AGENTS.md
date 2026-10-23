# AGENTS.md — TCS Mail: critérios de entrega obrigatórios

Aplicável a todas as alterações deste repositório. Este arquivo orienta agentes automatizados, revisões humanas e verificações de CI; por si só **não garante** ausência de defeitos. Não omitir etapas alegando aprovação estática.

## Identidade, segurança e limites

- Fonte canônica: este repositório. Antes de alterar, obter `git status`, commit-base e diffs. Nunca substituir silenciosamente código atualizado por ZIP antigo.
- Versão corrente: `0.8.2-rc5`; somente modificar a versão quando solicitado. Preservar `com.thecreativesolver.TCSMail` e os dados persistidos do usuário.
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

## Gates e anti-recorrência

Antes de commit / push (no Ubuntu, com CARGO_HOME/RUSTUP_HOME isolados):

```
cargo fmt --all
cargo fmt --all -- --check
cargo check --locked --workspace --all-targets
cargo test --locked --workspace
cargo clippy --locked --workspace --all-targets -- -D warnings
python3 scripts/quality/tcsmail-package-guard.py --source
python3 scripts/quality/rc5-providers-and-release.py
python3 scripts/quality/test_tcsmail_package_guard.py
python3 scripts/quality/rc2-presentation-verify.py --source
node scripts/verify-ms-oauth.mjs
node scripts/quality/rc2-release-contract.mjs
node scripts/quality/rc2-interface-regression.mjs
node scripts/quality/rc2-native-composer-behavior.mjs
node scripts/quality/rc5-composer-routing.mjs
git diff --check
```

No GitHub, executar todos os quatro jobs de `.github/workflows/tcsmail-homologacao.yml` em **novo commit**. `cargo fmt --check` e Clippy são bloqueantes. Cada job deve empacotar **todos** os formatos solicitados e inspecionar os arquivos gerados antes do upload. `Actions verde` não significa aplicativo homologado.

Falha recorrente deve gerar: (a) teste de regressão que falha antes da correção, (b) correção mínima, (c) execução pós-correção, (d) instrução de recuperação sem apagar dados, (e) nota no changelog/auditoria.

### Empacotamento e versões

- SemVer público `0.8.2-rc5`; MSI/WiX `0.8.205`; RPM `Version=0.8.2, Release=0.rc5.1` via override de **empacotamento**, não mudança global de identidade.
- Não declarar manualmente no RPM os aliases `tcs-mail.png` que o Tauri já escreve. Não exigir aliases removidos como entradas **configuradas**; inspecionar os recursos **reais**.
- No macOS, evitar shadowing de import Python (`subprocess`) e preservar o `.app` com `ditto`.
- O `AGENTS.md` orienta, mas o controle efetivo depende dos gates de CI, dos testes e da revisão do diff.

## Template obrigatório para novos prompts de entrega

> TCS Mail — use a fonte canônica da última entrega/commit. Siga integralmente o `AGENTS.md`: dois enfoques independentes (implementação e auditoria adversarial), confronto até consenso, dupla revalidação; examine impacto em Gmail, Microsoft, IMAP genérico e quatro destinos Windows/Linux/macOS; reproduza erros, adicione testes de regressão e não declare homologação não executada. Preserve dados e identidades; produza a fonte completa, workflow e guia com comandos Ubuntu/GitHub e limpeza segura, indicando explicitamente o que ficou pendente.
