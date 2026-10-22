# TCS Mail 0.8.2-rc4 — confronto adversarial e dupla revalidação

Data da preparação: 21/10/2026 (BR). **Não é uma homologação de binários.**

## Fontes de verdade utilizadas

- ZIP RC3 revalidado presente na conversa: `TCS_Mail_0.8.2_RC3_FONTE_E_COMPILADORES_REVALIDADO.zip`.
- Seis corretores posteriores compartilhados na conversa: `TCS_RC3_CORRIGIR_CI.py`, `...EMPACOTAMENTO.py`, `...VERIFICADOR_RPM.py`, `...VERSAO_RPM.py`, `...CONSOLE_WINDOWS.py`, `...CREDENCIAIS_WINDOWS.py`.
- Logs relatados pelo usuário sobre Rustfmt, testes de rede OAuth/IMAP, versão MSI, ícones RPM, versão RPM e falha `-Op` em senhas/tokens no Windows.
- Documentação pública do Tauri v2 (configuração, RPM e Windows installer) e GitHub Actions (actions/setup-python, setup-node, upload-artifact).
- **Limite:** não houve leitura autenticada do código atual no repositório privado `tcsmail`; alterações que existam somente naquele repositório não estão necessariamente incluídas neste ZIP. A atualização exige comparação de diferenças.

## Primeira perspectiva virtual — engenharia de distribuição e implementação

1. A versão `0.8.2-rc4` foi propagada a `Cargo.toml` de todos os crates próprios, `Cargo.lock`, `tauri.conf.json`, AppStream, Ajuda, contrato release, guard e workflow. Mantido o identificador estável `com.thecreativesolver.TCSMail`.
2. MSI exige uma versão interna numérica: `bundle.windows.wix.version = 0.8.204`; o aplicativo continua com SemVer RC4.
3. RPM exige `Version` sem hífen: build próprio com `Version=0.8.2`, `Release=0.rc4.1`; DEB mantém SemVer da RC4; ícones manuais redundantes no RPM removidos, oficiais preservados.
4. O verificador RPM requer ícones oficiais e proíbe aliases duplicados no mapeamento; no pacote verifica alias Tauri caso exista. O DEB conserva exigências anteriores.
5. No Windows Release, atributo `windows_subsystem` desativa a criação do console principal. A rotina `SecretStore` transmite `-EncodedCommand` em UTF-16LE e usa `stdin` para a senha/token, com comando auxiliar `CREATE_NO_WINDOW`.
6. OAuth loopback passa a ler os cabeçalhos HTTP completos com timeout; a fixture IMAP de respostas negativas aceita desligamento antecipado pelo cliente sem deixar de rejeitar resposta inválida.
7. macOS: empacotar `.app` com `ditto` preserva links e metadados que não seriam preservados por ZIP comum de arquivos recursivos.
8. Workflow mantém quatro destinos independentes, artefatos com SHA-256, `actions/setup-python@v7`, `setup-node@v7`, `upload-artifact@v7`, sem publicar Releases.

## Segunda perspectiva virtual — auditoria adversarial e de não regressão

- **Dados e identidade:** o ID da aplicação permanece inalterado; não alterar contas/índices/arquivos de usuário. Atualizador recusa clone com mudanças não commitadas, cria branch local de backup, não usa `--delete`, não faz push sozinho.
- **Credenciais:** impedir que valor secreto seja colocado na linha de comando; o nome da conta aparece somente codificado no comando auxiliar. Teste Windows sintético de `store`, `lookup` e `clear` foi acrescentado à suíte Rust, sem dados reais.
- **Interfaces:** preservar contratos de janelas independentes, compositor inline e persistência da preferência RC3. Contratos Node foram executados.
- **Empacotadores:** verificação adicional do `Version/Release` real de DEB/RPM. Alterar apenas o empacotamento, sem reduzir exigências de qualidade anteriores.
- **Histórico:** workflow RC2 antigo arquivado fora de `.github/workflows`, não apagado do histórico; `IMAP 0.12/0.17 cross-platform validation` foi mantido.
- **Limites de cofre:** Windows Credential Manager tem limite de blob; tokens excepcionalmente grandes continuam risco residual. Não redesenhar o armazenamento neste ciclo sem testes completos de migração e rollback.

## Confronto e consenso

- Diferenciar versões internas dos pacotes de versão visível é indispensável; não alterar o identificador, os perfis, as bibliotecas IMAP e a lógica de negócios para contornar erros de empacotamento.
- Fazer testes sintéticos de credenciais no Windows runner, além de contratos estáticos; as implementações Linux (`secret-tool`) e macOS (`Security.framework`) foram mantidas sem alterações.
- Não suprimir falhas no CI; resolver cause-raiz observada e manter gates exigentes.
- Nenhuma compilação a partir do Ubuntu deve apagar o `target` enquanto for útil à recompilação; limpeza apenas após homologação.

## Primeira revalidação — evidências executadas

- `bash -n` da Central Linux e do atualizador Ubuntu: PASS.
- `python3 -m py_compile` dos verificadores: PASS.
- `tcsmail-package-guard.py --source`: PASS.
- `rc2-presentation-verify.py --source`: PASS; `appstreamcli` externo não disponível nesta infraestrutura.
- `verify-ms-oauth.mjs`: PASS.
- `rc2-release-contract.mjs`: PASS.
- `rc2-interface-regression.mjs`: PASS.
- `rc2-native-composer-behavior.mjs`: PASS.
- `rc4-composer-routing.mjs`: PASS.
- `node --check` em 23 arquivos JavaScript do frontend: PASS.
- YAML analisado; workflow RC4, quatro runners, RPM override, ações Node24 e versão MSI conferidos.
- `Cargo.lock`: 3 crates internos com versão `0.8.2-rc4`.

## Segunda revalidação — cenários adversariais

- Injeção sintética de alias manual RPM duplicado: o verificador abortou, como deveria.
- Atualizador executado em repositório Git sintético com branch main e origem fictícia `tcsmail`: branch de backup criada, código RC4 copiado, workflow obsoleto desativado e contratos de fonte executados. **Esse ensaio utilizou um `cargo fmt` simulado, e não testa o Rustfmt real.**
- Preservação de `.git`, histórico, dados fora do clone, compiladores e ausência de `git push` automático confirmadas pelo desenho e ensaio.
- Fonte RC4 completa empacotada com guia e central de compilação, não apenas patches.

## Testes ainda NÃO executados — não declarar homologação

1. **`cargo fmt --all -- --check`, `cargo check`, `cargo test`, Clippy e Rust Release** reais: a infraestrutura de construção deste pacote não possui Rust/Cargo. O atualizador no Ubuntu obrigatoriamente formata o Rust com a toolchain instalada antes do primeiro push.
2. **Windows MSVC real:** rodada CI e operação gráfica sem console, cofre com caracteres especiais, Google OAuth e IMAP.
3. **macOS Intel e ARM64 reais:** criação/abertura da aplicação e DMG, Keychain, OAuth e testes de rede.
4. **Linux real:** DEB e RPM com versionamentos distintos, metadados AppStream, ícone no GNOME Software e instalação funcional.
5. Versão visível do executável que foi empacotado como RPM deve ser comprovada na estação destino, pois a sobreposição de configuração Tauri altera o metadado de bundle; a fonte/Cargo continuam RC4.
6. Limite do Credential Manager para tokens grandes, atualizações futuras do MSI e assinatura/notarização dos instaladores requerem homologação específica.

**Decisão:** RC4 é um pacote de fonte e compilação atualizado e com verificações estáticas concluídas, apto à rodada nativa CI, mas ainda não uma Release homologada.
