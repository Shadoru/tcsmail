# TCS Mail 0.8.3 — compilar e executar

Extraia a fonte em uma pasta nova dentro de `Projetos`. Esta entrega é completa: não é necessário aplicar RCs anteriores. Não copie arquivos por cima de um repositório com alterações próprias. A identidade continua `com.thecreativesolver.TCSMail`; os dados e credenciais da instalação existente continuam nos locais anteriores.

## Escopo da entrega

- IA em três etapas: conectar serviço/chave, escolher modelo e definir acesso aos e-mails. OpenAI, Claude, Gemini, servidor local e serviço compatível ficam visíveis desde o início.
- Chave no cofre do sistema; botão mostrar/ocultar; nenhum segredo em preferências do navegador. A assinatura de um chat não substitui a chave da API.
- Teste real com frase sintética, sem e-mails. O teste pode consumir créditos; não salva modelos nem amplia permissões. A configuração é salva por uma ação separada.
- Pastas exibidas com acentos em navegação, movimentação, autorizações da IA e importação/exportação. O identificador usado no servidor permanece original.
- Configurações agrupadas por tarefa, com pesquisa; controles avançados recolhidos, campos e popups adaptáveis, opções de envio e imagens externas em linguagem simples.
- Verificação de UTF-8 no inventário de fontes próprias e vendorizadas; testes de regressão e pipeline nativo para quatro destinos.

Homepage oficial: [TCS Mail](https://thecreativesolver.com/tcsmail/).

## Pré-requisitos

Em todos os sistemas: Rustup, Node.js 22 ou 24, Python 3.12+, ferramentas nativas do sistema e acesso à internet para baixar dependências na primeira compilação. Python e Node executam verificadores; não são necessários para usar o aplicativo instalado. O código utiliza Rust 1.99.0 e Tauri CLI 2.12.4; `Cargo.lock` é obrigatório.

No Ubuntu 24.04, instale:

```bash
sudo apt-get update
sudo apt-get install -y build-essential curl wget file libwebkit2gtk-4.1-dev libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev patchelf appstream rpm rpm2cpio cpio libarchive-tools libsecret-tools
```

No Windows x64: Visual Studio Build Tools com **Desenvolvimento para desktop com C++**, MSVC e Windows SDK; WebView2; Rustup para MSVC. Para MSI, a ferramenta WiX pode requerer VBScript nos Recursos opcionais do Windows. Use PowerShell em uma estação x64.

No macOS: ferramentas de linha de comando do Xcode (`xcode-select --install`), Rustup e Python 3.12. Compile nativamente em Intel para Intel ou em Apple Silicon para ARM64. O empacotamento DMG exige uma sessão macOS. Os pacotes não são assinados/notarizados por esta entrega.

## Ubuntu e macOS: preparar ferramentas isoladas

Abra um terminal **dentro da pasta da fonte extraída**, que contém `Cargo.toml` e este guia. Rustup precisa estar instalado e acessível. Os comandos abaixo não alteram os dados do TCS Mail.

```bash
(
set -eu
export TCS_BUILD_ROOT="$HOME/Projetos/TCS-Mail-build-0.8.3"
export CARGO_HOME="$TCS_BUILD_ROOT/cargo"
export RUSTUP_HOME="$TCS_BUILD_ROOT/rustup"
export PATH="$CARGO_HOME/bin:$PATH"
export PYTHONUTF8=1
rustup toolchain install 1.99.0 --profile minimal --component rustfmt --component clippy
cargo install tauri-cli --version '=2.12.4' --locked
python3 scripts/build-0.8.3.py
)
```

Pare se algum comando falhar. O compilador executa verificadores, Rustfmt, check, testes, Clippy, geração dos instaladores e inspeção dos arquivos. O diretório de compilação é novo por execução, para impedir que um instalador antigo seja aceito como resultado novo.

## Windows: preparar e compilar

No PowerShell, entre na pasta da fonte extraída. Execute:

```powershell
$ErrorActionPreference = 'Stop'
$TcsBuildRoot = Join-Path $env:USERPROFILE 'Projetos\TCS-Mail-build-0.8.3'
$env:CARGO_HOME = Join-Path $TcsBuildRoot 'cargo'
$env:RUSTUP_HOME = Join-Path $TcsBuildRoot 'rustup'
$env:PATH = "$env:CARGO_HOME\bin;$env:PATH"
$env:PYTHONUTF8 = '1'
rustup toolchain install 1.99.0 --profile minimal --component rustfmt --component clippy
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar Rust.' }
cargo install tauri-cli --version '=2.12.4' --locked
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar Tauri.' }
py -3.12 scripts/build-0.8.3.py
if ($LASTEXITCODE -ne 0) { throw 'A compilação ou uma verificação falhou. Consulte a pasta de evidências indicada.' }
```

Não é necessário Ubuntu ou GitHub para compilar no Windows. O orquestrador exige NSIS EXE e MSI e inspeciona ambos; a configuração do pipeline não comprova que já foram compilados nesta entrega. O MSI usa versão numérica `0.8.300`, maior que `0.8.209` da entrega anterior; a versão pública é `0.8.3`.

## Onde estão os resultados

Os instaladores aprovados pelas verificações automáticas são copiados para `delivery/<sistema>/`, junto de hashes e relatório. Cada execução mantém os comandos, códigos de saída e escopo em `.build-v083/<execução>/result.json`, com um log numerado por comando, inclusive nas falhas. `--gates-only` registra somente validação de fonte, sem declarar compilação ou teste gráfico.

| Estação | Saídas exigidas |
|---|---|
| Linux x64 | DEB e RPM |
| Windows x64 | EXE NSIS e MSI |
| macOS Intel | APP, DMG e APP ZIP preservado por `ditto` |
| macOS ARM64 | APP, DMG e APP ZIP preservado por `ditto` |

RPM usa `Version=0.8.3` e `Release=1`; ambos são inspecionados no cabeçalho real. A release RPM é explícita no Tauri e na invocação de empacotamento. O DEB usa a versão pública estável `0.8.3`. Falta de ferramenta de inspeção ou de qualquer pacote exigido reprova a execução.

No Ubuntu, instale o DEB apontando para o arquivo exato produzido em `delivery/linux-x64/`, pelo gerenciador de programas ou `sudo apt install ./caminho/do/arquivo.deb`. No Windows, execute um dos instaladores. No macOS, abra o DMG e copie o APP para Aplicativos.

## Ubuntu: extração RPM e cofre de credenciais

`libarchive-tools` fornece `bsdtar`, necessário ao fallback de extração RPM.
Na revisão anterior, `rpm2cpio` produziu stdout válido mas retornou 1; isso
aciona o fallback, mantendo a inspeção de AppStream, desktop e ícones. A execução
real do fallback sobre os pacotes 0.8.3 ainda precisa ser registrada. Instalar
a ferramenta não constitui prova de payload aprovado.

`libsecret-tools` fornece `secret-tool`, usado pelo aplicativo no Linux. A
checagem automática de build comprova a presença das ferramentas:

```bash
python3 scripts/quality/v083-linux-runtime.py --check-prerequisites
```

Em uma sessão gráfica desbloqueada com Secret Service disponível, execute:

```bash
python3 scripts/quality/v083-linux-runtime.py --verify-secret-store
```

Esse teste cria uma credencial sintética Unicode com identificador aleatório,
confere leitura e remoção e não imprime o valor. Ele não consulta credenciais
existentes. Ausência de D-Bus ou de cofre desbloqueado reprova o teste; não
execute em sessão headless para alegar sucesso de runtime. O CI verifica
pré-requisitos; o teste real do cofre deve ser registrado separadamente em cada ambiente. A execução sintética desta sessão Linux está registrada em `docs/VERSAO_083.md`.

Não remova `delivery/` ou evidências anteriores para reutilizar uma pasta de
build. Escolha uma nova pasta de fonte ou preserve os resultados e use caminhos
novos. A compilação recusa bundles preexistentes e a preparação recusa saída
ocupada, para não misturar instaladores da RC anterior com 0.8.3.

## GitHub Actions

A entrega contém `.github/workflows/tcsmail-homologacao.yml`. Depois de revisar e incorporar esta fonte ao seu repositório, abra **Actions → TCS Mail 0.8.3 - native builds and installers → Run workflow**. São quatro jobs nativos, com os mesmos verificadores e compiladores do comando local.

O workflow é manual, não faz push nem publica uma Release. Os instaladores ficam em **Artifacts** apenas quando aprovados; evidências de erro também são preservadas. Outra execução, `v083-renderer.yml`, verifica a interface renderizada. Execução real dos quatro jobs continua necessária para comprovar Windows e os dois macOS nesta revisão.

## Matriz de evidências da entrega

| Destino/prova | O que está configurado | Limite desta evidência |
|---|---|---|
| Linux x64 local | Gates, fmt/check/test/Clippy, DEB + RPM, inspeção de metadados/payload | Aprovação depende dos resultados dos pacotes finais congelados; não comprova GUI ou provedores reais |
| Windows x64 | Job nativo exige EXE + MSI e inspeção PE/MSI | Execução nativa e GUI pendentes até evidência específica |
| macOS Intel | Job nativo exige APP + DMG, inspeção e arquivo por `ditto` | Execução nativa e GUI pendentes até evidência específica |
| macOS ARM64 | Job nativo exige APP + DMG, inspeção e arquivo por `ditto` | Execução nativa e GUI pendentes até evidência específica |
| GitHub Actions | Três workflows manuais, com quatro runners em cada matriz | Workflow configurado ou execução verde não constitui homologação funcional |
| Renderer Chromium | Temas/tamanhos/idiomas e controles com dados sintéticos | Não certifica WebView2, WKWebView ou WebKitGTK nativos |
| Cofre Linux | Roundtrip sintético Unicode store/lookup/clear aprovado nesta sessão | Não comprova dependências do instalador, outros desktops, Keychain ou Credential Manager |

O estado final e os caminhos/hashes dos artefatos pertencem a
`VALIDACAO_0.8.3.md`; a análise A–I pertence a `AUDITORIA_0.8.3.md`. Este guia
não declara GitHub, Windows ou macOS homologados. Instalação/atualização, GUI e
provedores reais exigem seus próprios resultados.

## ZIP público de fontes e evidências separadas

O ZIP de fontes deve conter apenas a fonte completa necessária à compilação,
com uma pasta principal nomeada para 0.8.3. Não reutilize a pasta-raiz de trabalho
enquanto os agentes estiverem ativos; a cópia final ocorre após o congelamento.

Excluir do ZIP, inclusive quando existirem em subpastas:

- `.build-v083/` e `.build-rc8fix1/`: logs, relatórios intermediários, cache
  de ferramentas e Playwright; `.build-v083/` **não integra a fonte pública**.
- `target/`, `tauri-cli-target/`, `.cargo/`, `.rustup/`, `node_modules/`,
  `__pycache__/` e arquivos `.pyc`: saídas ou dependências instaladas.
- `.git/`, `delivery/` e instaladores/arquivos de distribuição gerados:
  histórico local e artefatos são entregas separadas, não fonte para recompilar.
- Perfis, bancos, credenciais, anexos, arquivos `.env` e caches de usuário.

Preservar `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, os três pacotes,
`vendor/`, `frontend/`, `src-tauri/` com ícones/recursos, `scripts/`, `tests/`,
`.github/workflows/`, licenças e documentação atual. O `.gitignore` não é garantia
de exclusão por um empacotador de ZIP: conferir o inventário do arquivo final.

Os logs/evidências podem acompanhar a entrega em arquivo separado e revisado.
A fonte extraída deve executar `python3 scripts/build-0.8.3.py --gates-only`
sem `.git` e gerar uma **nova** `.build-v083/` local; essa nova saída também
fica fora de qualquer reempacotamento da fonte. O marcador `source-zip` no
relatório indica origem sem commit, não um hash Git inventado.

## Recuperação e limpeza

A mudança de rótulos de pastas não renomeia pastas do servidor e não exige recriar conta ou banco. Se um nome antigo aparecer, atualize a lista/reabra a configuração para buscar o rótulo atual. Não apague bancos, tokens, anexos ou o perfil para aplicar esta correção.

Não há limpeza automática. Para liberar espaço, preserve primeiro `delivery/` e as evidências e identifique o diretório de intermediários **da execução indicada no log**. Remova somente esse diretório depois de conferir o caminho. A compilação seguinte precisará reconstruí-lo. Não remova o diretório de dados do aplicativo.

## O que a validação comprova

Consulte [docs/VERSAO_083.md](docs/VERSAO_083.md) para a migração de versão e suas pendências. A auditoria anterior em `AUDITORIA_RC8_FIX1.md` comprova somente a fonte anterior; a análise atual está em `AUDITORIA_0.8.3.md` e os resultados finais serão registrados em `VALIDACAO_0.8.3.md` pelo implementador principal. Verificação estática, renderização em navegador, compilação nativa e teste com servidor real são provas diferentes. Esta entrega não trata o sucesso de uma delas como prova das demais. Windows x64, macOS Intel e macOS ARM64 nativos permanecem pendentes até execução real dos respectivos jobs e instalação/teste gráfico. A versão estável não substitui essas provas.

Referências utilizadas: [pré-requisitos Tauri](https://v2.tauri.app/start/prerequisites/), [testes Tauri](https://v2.tauri.app/develop/tests/), [Clippy em CI](https://doc.rust-lang.org/clippy/continuous_integration/index.html), [resolução e lockfile Cargo](https://doc.rust-lang.org/stable/cargo/reference/resolver.html).
