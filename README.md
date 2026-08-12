# MeuNotas

Sistema pessoal de anotações, tarefas e prazos. Site estático, sem servidor e sem máquina virtual:
o app roda no GitHub Pages e grava as anotações num arquivo JSON dentro de um repositório **privado** seu.
Abre em qualquer máquina (casa, trabalho, celular) e mostra as mesmas notas.

- **App (público, só código):** https://pedrxnes.github.io/meunotas/
- **Notas (privado, só dados):** `dados/notas.json` no repositório `notas-pessoais`

## Por que resolve o problema das notas autoadesivas

- Cada pedido do chefe é **um item separado**, não uma linha perdida dentro de uma nota gigante.
- Busca instantânea em tudo (título, detalhes, projeto, tags) — `Ctrl+K`.
- Projetos na lateral: `#erp`, `#relatorios`, cada um com sua contagem de pendências.
- Prazos com visões **Hoje**, **Atrasadas**, **7 dias**; contador de atrasadas no título da aba.
- Captura rápida numa linha: escreve e dá `Enter`, sem abrir janela nenhuma.
- Funciona offline (é PWA, dá para instalar como aplicativo no Windows); sincroniza quando a rede voltar.

## Como escrever na barra de captura

```
* Ajustar retorno da API de saldo #erp !amanha @chefe :: pediu no daily, ver endpoint /saldo/v2
```

| Símbolo | O que faz |
|---|---|
| `#projeto` | joga no projeto (cria se não existir; `_` vira espaço) |
| `@tag` | etiqueta |
| `!hoje` `!amanha` `!depois` | prazo hoje / amanhã / depois de amanhã |
| `!seg` … `!dom` | próxima segunda … domingo |
| `!12/03` `!12/03/2026` `!15` | data exata / dia do mês |
| `!3d` `!2s` `!1m` | em 3 dias / 2 semanas / 1 mês |
| `*` | fixa no topo |
| `::` | tudo depois vai para os detalhes |

Nos detalhes, linhas em `- [ ] passo` viram subtarefas clicáveis.

## Atalhos

`n` capturar · `Ctrl+K` ou `/` buscar · `j`/`k` navegar · `x` concluir · `f` fixar · `e` editar ·
`Del` apagar · `Ctrl+Z` desfazer · `s` sincronizar · `?` ajuda · `Esc` fechar

## Configurar a sincronia (uma vez por máquina)

1. Crie um **fine-grained token**: GitHub → Settings → Developer settings →
   Personal access tokens → Fine-grained tokens → *Generate new token*.
   - **Repository access:** apenas `notas-pessoais`
   - **Permissions → Repository permissions → Contents:** `Read and write`
   - Defina uma expiração (90 dias, por exemplo).
2. Abra o app, clique em ⚙ e preencha:
   - Dono: `Pedrxnes` · Repositório: `notas-pessoais` · Branch: `main` · Caminho: `dados/notas.json`
   - Cole o token e clique em **Testar conexão**, depois **Salvar e sincronizar**.
3. Repita no notebook do trabalho (pode ser outro token). As duas máquinas passam a ver as mesmas notas.

### Segurança do token

O token fica no armazenamento local do navegador, naquela máquina. Quem tiver acesso ao seu usuário do
Windows — ou uma extensão de navegador maliciosa — consegue lê-lo. Por isso: token *fine-grained*,
limitado a **um** repositório, apenas `Contents: Read and write`, com data de expiração.
No notebook do trabalho use um token separado e revogue quando não precisar mais.
Se algum token vazar, revogue em Settings → Developer settings; as notas continuam intactas no repositório.

## Como a sincronia funciona

- O navegador é a fonte imediata (`localStorage`), então nada trava esperando rede.
- A cada mudança (2,5 s depois), ao abrir, ao voltar para a aba e a cada 2 min: baixa o JSON remoto,
  **mescla item por item** pelo campo `atualizadoEm` (vence a alteração mais nova) e grava de volta.
- Exclusões viajam como marcação `apagado` (some de vez após 45 dias), então apagar em casa apaga no trabalho.
- Conflito de `sha` (duas máquinas gravando junto) é relido e remesclado automaticamente.
- Se `NOTAS.md` estiver ligado, o app também grava um resumo legível no repositório privado —
  serve para ler as pendências pelo site do GitHub, no celular, sem token.

## Rodando local

Qualquer servidor estático serve:

```powershell
python -m http.server 8080
# abre http://localhost:8080
```

Abrir o `index.html` direto pelo Explorer também funciona, mas sem PWA/offline.

## Publicando (GitHub Pages)

```powershell
gh repo create meunotas --public --source . --remote origin --push
gh api -X POST repos/:owner/meunotas/pages -f "source[branch]=main" -f "source[path]=/"
```

O repositório do app é público, mas **não contém anotação nenhuma** — só código.
As notas ficam no repositório privado configurado no ⚙.
