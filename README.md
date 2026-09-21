# MeuNotas

Sistema pessoal de anotações, tarefas e prazos. Site estático, sem servidor e sem máquina virtual:
o app roda no GitHub Pages e grava as anotações num arquivo JSON dentro de um repositório **privado** seu.
Abre em qualquer máquina (casa, trabalho, celular) e mostra as mesmas notas.

- **App (público, só código):** https://pedrxnes.github.io/meunotas/
- **Notas (privado, só dados):** `dados/notas.json` no repositório `notas-pessoais`

## Por que resolve o problema das notas autoadesivas

- Cada pedido é **um item separado**, não uma linha perdida dentro de uma nota gigante.
- **Trabalho e vida pessoal separados** por área — um clique (ou as teclas `1`, `2`, `3`) troca de contexto
  e tudo muda com ele: visões, projetos, contadores e o que você anota em seguida.
- Busca instantânea em tudo (título, detalhes, área, projeto, tags) — `Ctrl+K`.
- Projetos na lateral: `#erp`, `#relatorios`, `#carro`, cada um com sua contagem de pendências.
- **Aba de lembretes** só para o que não pode ser esquecido: os soltos, sem tema nenhum, e os que
  nasceram dentro dos projetos, num lugar só.
- Prazos com visões **Hoje**, **Atrasadas**, **7 dias**; contador de atrasadas no título da aba.
- Captura rápida numa linha: escreve e dá `Enter`, sem abrir janela nenhuma.
- **Cole imagens** (`Ctrl+V`) direto na anotação: print de erro, foto do comprovante, recado no papel.
- Funciona offline (é PWA, dá para instalar como aplicativo no Windows); sincroniza quando a rede voltar.

## Áreas e tipos

**Área** = a divisão grande da sua vida. Já vêm `Trabalho` e `Pessoal`; pode criar outras (`Faculdade`,
`Casa`, `Academia`) no `＋` da lateral. Enquanto uma área está selecionada, tudo que você anota cai nela
automaticamente — não precisa digitar nada. Clique duplo numa área que você criou renomeia.
Anotações antigas sem área aparecem em **Tudo** e o ⚙ oferece mandar todas de uma vez para uma área.

**Tipo** = o que aquela linha é: `Tarefa` (padrão), `Nota`, `Ideia`, `Lembrete`. Os chips acima da lista
filtram por tipo e podem ser combinados — dá para ver, por exemplo, só as ideias do pessoal.

## A aba Lembretes

Na lateral, acima das visões, **Lembretes** junta tudo que é do tipo `Lembrete` em três entradas:

| Entrada | O que mostra |
|---|---|
| **Todos** | tudo, separado por origem: primeiro os gerais, depois um bloco por projeto |
| **Gerais** | só os soltos — as coisas que você quer deixar anotadas sem tema nenhum, sem projeto |
| **Dos projetos** | só os que nasceram dentro de `#erp`, `#carro` e companhia |

Com a aba aberta, o que você escrever na barra de captura já nasce lembrete — não precisa digitar
`+lembrete`, nem escolher projeto. O resto da sintaxe continua valendo: `!amanha` dá prazo, `#projeto`
manda o lembrete para um projeto, `@tag` etiqueta. A área selecionada continua mandando: em `Trabalho`
aparecem só os lembretes do trabalho; em `Tudo`, todos. Na faixa de cada bloco, o nome do projeto é
clicável e abre aquele projeto. Atalho: `l`.

## Como escrever na barra de captura

```
* Ajustar retorno da API de saldo %trabalho #erp !amanha @chefe :: pediu no daily, ver /saldo/v2
Levar o carro na revisão %pessoal #carro !sab +lembrete
```

| Símbolo | O que faz |
|---|---|
| `%area` | manda para a área (`%trabalho`, `%pessoal`, ou uma sua; cria se não existir) |
| `#projeto` | joga no projeto (cria se não existir; `_` vira espaço) |
| `+tipo` | `+nota`, `+ideia`, `+lembrete` (sem isso é tarefa; aceita apelidos como `+lembrar`, `+anotacao`) |
| `@tag` | etiqueta |
| `!hoje` `!amanha` `!depois` | prazo hoje / amanhã / depois de amanhã |
| `!seg` … `!dom` | próxima segunda … domingo |
| `!12/03` `!12/03/2026` `!15` | data exata / dia do mês |
| `!3d` `!2s` `!1m` | em 3 dias / 2 semanas / 1 mês |
| `*` | fixa no topo |
| `::` | tudo depois vai para os detalhes |

Nos detalhes, linhas em `- [ ] passo` viram subtarefas clicáveis.

## Imagens

Cole com `Ctrl+V` a qualquer momento:

- com uma anotação **selecionada** na lista, a imagem entra naquela anotação;
- sem nenhuma selecionada, ela vira uma **anotação nova** já na área/projeto abertos;
- dentro do formulário (`＋ Nova` ou `e`), dá para colar, **arrastar o arquivo** para o campo Detalhes
  ou usar o botão **＋ Imagem**.

Clique na miniatura para ver em tela cheia (`←` `→` passam entre as imagens da anotação, `Esc` fecha,
**Baixar** salva o arquivo). O `×` no canto da miniatura, dentro do formulário, tira a imagem da anotação.

**Onde a imagem fica.** Antes de guardar, a imagem é reduzida (maior lado em 1800 px) e recomprimida em
WebP até caber em 900 KB — um print de tela costuma ficar com algumas dezenas de KB. GIF e SVG pequenos
passam intactos, para não perder animação nem o vetor. Os bytes ficam em dois lugares:

- no **IndexedDB** desta máquina, que é o que faz a imagem aparecer offline;
- num **arquivo por imagem** no repositório privado, em `dados/imagens/`, ao lado do `notas.json`.

No `notas.json` fica só a ficha (`id`, tipo, tamanho, dimensões) — o arquivo de notas continua leve, e a
sincronia não quebra por excesso de tamanho. Ao abrir noutra máquina, a imagem é baixada na hora de
mostrar; enquanto não chega (sem rede, por exemplo), a miniatura aparece com um `⤓` no lugar.

## Atalhos

`n` capturar · `Ctrl+K` ou `/` buscar · `1` `2` `3`… trocar de área · `l` lembretes · `j`/`k` navegar ·
`x` concluir · `f` fixar · `e` editar · `Ctrl+V` colar imagem · `Del` apagar · `Ctrl+Z` desfazer ·
`s` sincronizar · `?` ajuda · `Esc` fechar

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
- As imagens sobem **antes** do JSON, cada uma no seu arquivo em `dados/imagens/`, para nenhuma máquina
  ver uma anotação apontando para imagem que ainda não existe no repositório.
- Se `NOTAS.md` estiver ligado, o app também grava um resumo legível no repositório privado, separado
  por área e projeto — serve para ler as pendências pelo site do GitHub, no celular, sem token.
- O JSON está na versão 2 (com `area`, `tipo` e a lista `imagens` de cada anotação). Arquivo antigo (v1) é lido sem quebrar: os itens
  entram como “sem área” e tipo `Tarefa`, e o arquivo é regravado em v2 na primeira mudança.

## Visual

A interface segue o padrão do macOS: barra e lateral translúcidas, fio de cabelo no lugar de moldura,
cantos macios, azul do sistema como único destaque forte e a fonte do próprio sistema. O tema acompanha
o do computador na primeira vez que você abre; o ◐ no topo troca quando quiser.

A cor do projeto entra **em doses pequenas** — um traço fino na lateral esquerda do cartão e a etiqueta
do projeto com o fundo lavado. Nada de faixa colorida atravessando a anotação. Para escolher a cor:
a **bolinha** do projeto na lateral, o botão **Cor** ao abrir um projeto, ou o **Cor** ao lado do campo
Projeto no formulário (aí a cor vale só para aquela anotação). Sem escolher nada, a cor sai automática
a partir do nome.

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
