# TCS Mail 0.8.3

Cliente de e-mail desktop para Linux, Windows e macOS, em Rust/Tauri 2. IA opcional com autorização explícita; credenciais mantidas no cofre do sistema.

Homepage: [TCS Mail](https://thecreativesolver.com/tcsmail/).

## Compilar

Leia [GUIA_0.8.3.md](GUIA_0.8.3.md) para pré-requisitos, ferramentas isoladas, compilação Ubuntu/Windows/macOS e GitHub Actions. A fonte é completa e pode ser compilada diretamente de um ZIP, sem depender de uma RC anterior.

Com Rust 1.99.0, Tauri CLI 2.12.4, Python 3.12+, Node 22/24 e bibliotecas nativas preparados:

```bash
python3 scripts/build-0.8.3.py
```

No Windows: `py -3.12 scripts/build-0.8.3.py`.

O comando reprova se um gate, teste Rust, Clippy, compilação ou inspeção de pacote falhar. Pacotes aprovados vão para `delivery/`; logs para `.build-v083/`. O comando nunca instala, faz push, publica ou limpa seus arquivos.

## Revisão

- [Migração 0.8.3, verificações e pendências](docs/VERSAO_083.md).
- [Auditoria consolidada da entrega](AUDITORIA_0.8.3.md).
- [Critérios do projeto](AGENTS.md).
- [Licença MPL 2.0](LICENSE).

A interface de IA agora apresenta serviço, chave, modelo e autorização nessa ordem. A correção de nomes de pastas altera a apresentação, preservando o identificador original no servidor.

Os workflows são manuais. A inspeção de instaladores não substitui teste gráfico nativo e teste com os provedores. Consulte a matriz de evidências antes de considerar uma plataforma homologada.

A auditoria 0.8.3 está em `AUDITORIA_0.8.3.md`; os resultados finais ficam em `VALIDACAO_0.8.3.md`, sob responsabilidade do implementador principal. Os resultados antigos não homologam os novos binários.

O ZIP público de fontes exclui `.build-v083/`, caches, `target/`, `.git/` e `delivery/`; logs e instaladores são entregas separadas. Consulte o guia para o inventário e os limites da matriz de validação.
