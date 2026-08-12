/* ===== MeuNotas — sincronia via GitHub Contents API =====
   Sem servidor: o navegador fala direto com api.github.com.
   O arquivo JSON num repositório privado é a fonte compartilhada entre máquinas.
*/
var G = (function () {
  'use strict';

  var CHAVE_CFG = 'meunotas.cfg';
  var CHAVE_SHA = 'meunotas.sha';
  var CHAVE_MD = 'meunotas.md';
  var API = 'https://api.github.com';

  var cfg = { owner: '', repo: '', branch: 'main', caminho: 'dados/notas.json', token: '', espelho: true };
  var shas = {};
  var ouvinteEstado = function () {};
  var rodando = null;
  var pedidoPendente = false;
  var ultimaSincronia = '';

  function carregar() {
    try {
      var c = localStorage.getItem(CHAVE_CFG);
      if (c) cfg = Object.assign(cfg, JSON.parse(c));
    } catch (e) { /* ignora */ }
    try {
      var s = localStorage.getItem(CHAVE_SHA);
      if (s) shas = JSON.parse(s) || {};
    } catch (e) { shas = {}; }
    return cfg;
  }

  function salvarCfg(novo) {
    cfg = Object.assign(cfg, novo);
    localStorage.setItem(CHAVE_CFG, JSON.stringify(cfg));
  }

  function guardarSha(caminho, sha) {
    shas[caminho] = sha;
    try { localStorage.setItem(CHAVE_SHA, JSON.stringify(shas)); } catch (e) { /* ignora */ }
  }

  function configurado() {
    return !!(cfg.owner && cfg.repo && cfg.caminho && cfg.token);
  }

  function estado(nome, msg) {
    ouvinteEstado(nome, msg || '');
  }

  function aoEstado(fn) { ouvinteEstado = fn; }

  /* ---------- chamadas cruas ---------- */

  async function api(rota, opcoes) {
    opcoes = opcoes || {};
    var r = await fetch(API + rota, {
      method: opcoes.method || 'GET',
      headers: {
        'Authorization': 'Bearer ' + cfg.token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
      cache: 'no-store'
    });
    var texto = await r.text();
    var corpo = null;
    try { corpo = texto ? JSON.parse(texto) : null; } catch (e) { corpo = { message: texto }; }
    if (!r.ok) {
      var err = new Error(mensagemDeErro(r.status, corpo));
      err.status = r.status;
      err.corpo = corpo;
      throw err;
    }
    return corpo;
  }

  function mensagemDeErro(status, corpo) {
    var m = (corpo && corpo.message) || ('HTTP ' + status);
    if (status === 401) return 'Token inválido ou expirado (401).';
    if (status === 403) return 'Sem permissão ou limite da API (403). Confira se o token tem "Contents: Read and write" neste repositório.';
    if (status === 404) return 'Não encontrado (404): confira dono, repositório e branch — e se o token cobre este repositório.';
    if (status === 409 || status === 422) return 'Conflito de versão: ' + m;
    return m + ' (' + status + ')';
  }

  /** devolve {texto, sha} ou null quando o arquivo ainda não existe */
  async function lerArquivo(caminho) {
    var rota = '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) +
      '/contents/' + caminho.split('/').map(encodeURIComponent).join('/') +
      '?ref=' + encodeURIComponent(cfg.branch) + '&t=' + Date.now();
    try {
      var r = await api(rota);
      if (Array.isArray(r)) throw new Error('O caminho aponta para uma pasta, não um arquivo.');
      guardarSha(caminho, r.sha);
      return { texto: r.encoding === 'base64' ? U.deBase64(r.content) : (r.content || ''), sha: r.sha };
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async function gravarArquivo(caminho, texto, sha, mensagem) {
    var rota = '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) +
      '/contents/' + caminho.split('/').map(encodeURIComponent).join('/');
    var corpo = {
      message: mensagem || 'MeuNotas: atualiza anotações',
      content: U.paraBase64(texto),
      branch: cfg.branch
    };
    if (sha) corpo.sha = sha;
    var r = await api(rota, { method: 'PUT', body: corpo });
    var novo = r && r.content && r.content.sha;
    if (novo) guardarSha(caminho, novo);
    return novo;
  }

  async function testar() {
    var r = await api('/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo));
    var b = await api('/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) +
      '/branches/' + encodeURIComponent(cfg.branch));
    return {
      repo: r.full_name,
      privado: r.private,
      branch: b.name,
      permissao: r.permissions && r.permissions.push ? 'leitura e escrita' : 'somente leitura'
    };
  }

  /* ---------- ciclo de sincronia ---------- */

  async function passo() {
    var remoto = await lerArquivo(cfg.caminho);
    var pacoteRemoto = null;
    if (remoto) {
      try {
        pacoteRemoto = JSON.parse(remoto.texto);
      } catch (e) {
        throw new Error('O arquivo remoto não é um JSON válido. Renomeie/arrume ' + cfg.caminho + ' no GitHub.');
      }
    } else {
      // arquivo ainda não existe: confirma repo e branch para não dizer "sincronizado" com config errada
      await api('/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) +
        '/branches/' + encodeURIComponent(cfg.branch));
    }

    var mesclado = S.mesclar(S.dados, pacoteRemoto);
    var assinaturaLocal = S.assinatura(S.dados);
    var assinaturaMesclada = S.assinatura(mesclado);
    var assinaturaRemota = S.assinatura(pacoteRemoto);

    if (assinaturaMesclada !== assinaturaLocal) S.substituir(mesclado);

    if (assinaturaMesclada !== assinaturaRemota) {
      var texto = JSON.stringify(mesclado, null, 1);
      try {
        await gravarArquivo(cfg.caminho, texto, remoto ? remoto.sha : shas[cfg.caminho], mensagemCommit(mesclado));
      } catch (e) {
        if (e.status === 409 || e.status === 422) {
          // alguém gravou no meio do caminho: relê, mescla de novo e tenta uma última vez
          var denovo = await lerArquivo(cfg.caminho);
          var pacote2 = denovo ? JSON.parse(denovo.texto) : null;
          var mesclado2 = S.mesclar(S.dados, pacote2);
          S.substituir(mesclado2);
          await gravarArquivo(cfg.caminho, JSON.stringify(mesclado2, null, 1), denovo ? denovo.sha : null, mensagemCommit(mesclado2));
          mesclado = mesclado2;
        } else {
          throw e;
        }
      }
    }

    if (cfg.espelho) {
      try { await espelharMarkdown(); } catch (e) { console.warn('espelho NOTAS.md falhou', e); }
    }

    ultimaSincronia = U.agora();
    try { localStorage.setItem('meunotas.ultimaSincronia', ultimaSincronia); } catch (e) { /* ignora */ }
  }

  function mensagemCommit(pacote) {
    var abertas = pacote.itens.filter(function (i) { return !i.apagado && !i.feito; }).length;
    return 'MeuNotas: ' + abertas + ' em aberto — ' + new Date().toLocaleString('pt-BR');
  }

  async function espelharMarkdown() {
    var md = S.paraMarkdown();
    var caminho = (cfg.caminho.indexOf('/') >= 0 ? cfg.caminho.replace(/\/[^\/]+$/, '/') : '') + 'NOTAS.md';
    // o cabeçalho tem data/hora, então compara só o corpo
    var corpo = md.split('\n').filter(function (l) { return l.indexOf('_Gerado pelo MeuNotas') !== 0; }).join('\n');
    var anterior = null;
    try { anterior = localStorage.getItem(CHAVE_MD); } catch (e) { /* ignora */ }
    if (anterior === corpo && shas[caminho]) return;

    var sha = shas[caminho];
    if (!sha) {
      var atual = await lerArquivo(caminho);
      sha = atual ? atual.sha : null;
    }
    try {
      await gravarArquivo(caminho, md, sha, 'MeuNotas: atualiza NOTAS.md');
    } catch (e) {
      if (e.status === 409 || e.status === 422) {
        var novo = await lerArquivo(caminho);
        await gravarArquivo(caminho, md, novo ? novo.sha : null, 'MeuNotas: atualiza NOTAS.md');
      } else { throw e; }
    }
    try { localStorage.setItem(CHAVE_MD, corpo); } catch (e) { /* ignora */ }
  }

  /** uma sincronia por vez; pedidos durante a corrida viram uma nova rodada ao final */
  function sincronizar() {
    if (!configurado()) { estado('local', 'sincronia desligada'); return Promise.resolve(false); }
    if (rodando) { pedidoPendente = true; return rodando; }

    estado('sincronizando');
    rodando = passo().then(function () {
      estado('ok', ultimaSincronia);
      return true;
    }).catch(function (e) {
      estado('erro', e.message || String(e));
      console.warn('sincronia falhou', e);
      return false;
    }).then(function (ok) {
      rodando = null;
      if (pedidoPendente) { pedidoPendente = false; return sincronizar(); }
      return ok;
    });
    return rodando;
  }

  function zerarShas() {
    shas = {};
    try {
      localStorage.removeItem(CHAVE_SHA);
      localStorage.removeItem(CHAVE_MD);
    } catch (e) { /* ignora */ }
  }

  return {
    carregar: carregar, salvarCfg: salvarCfg, configurado: configurado,
    get cfg() { return cfg; },
    get ultimaSincronia() { return ultimaSincronia || localStorage.getItem('meunotas.ultimaSincronia') || ''; },
    aoEstado: aoEstado, estado: estado, testar: testar, sincronizar: sincronizar,
    lerArquivo: lerArquivo, gravarArquivo: gravarArquivo, zerarShas: zerarShas
  };
})();
