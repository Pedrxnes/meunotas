/* ===== MeuNotas — imagens coladas nas anotações =====
   O arquivo de notas continua pequeno: no JSON fica só a ficha da imagem
   ({id, tipo, tamanho...}), e os bytes vivem em dois lugares:
     • IndexedDB, aqui na máquina (é o que faz funcionar offline);
     • um arquivo por imagem no repositório privado, ao lado do notas.json.
   Quem abre em outra máquina baixa a imagem sob demanda, na hora de mostrar.
*/
var IM = (function () {
  'use strict';

  var BANCO = 'meunotas', LOJA = 'imagens', VERSAO = 1;
  var LADO_MAXIMO = 1800;           // px do maior lado depois de reduzir
  var LIMITE = 900 * 1024;          // a API de conteúdo do GitHub só devolve arquivos até 1 MB
  var ORIGINAL_ATE = 140 * 1024;    // imagem pequena sobe como veio, sem recomprimir

  var promessaBanco = null;
  var urls = {};                    // id -> objectURL já criado nesta sessão
  var pendurados = {};              // id -> promessa de busca em andamento
  var faltando = {};                // id -> true quando já sabemos que não dá para achar

  /* ---------- guarda local (IndexedDB) ---------- */

  function abrir() {
    if (promessaBanco) return promessaBanco;
    promessaBanco = new Promise(function (ok, falha) {
      if (!self.indexedDB) { falha(new Error('este navegador não guarda imagens')); return; }
      var p = indexedDB.open(BANCO, VERSAO);
      p.onupgradeneeded = function () {
        var db = p.result;
        if (!db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA, { keyPath: 'id' });
      };
      p.onsuccess = function () { ok(p.result); };
      p.onerror = function () { falha(p.error || new Error('IndexedDB indisponível')); };
    });
    return promessaBanco;
  }

  function transacao(modo, fn) {
    return abrir().then(function (db) {
      return new Promise(function (ok, falha) {
        var t = db.transaction(LOJA, modo);
        var pedido = fn(t.objectStore(LOJA));
        t.oncomplete = function () { ok(pedido ? pedido.result : undefined); };
        t.onerror = function () { falha(t.error); };
        t.onabort = function () { falha(t.error); };
      });
    });
  }

  function guardar(reg) {
    return transacao('readwrite', function (loja) { return loja.put(reg); });
  }
  function obter(id) {
    return transacao('readonly', function (loja) { return loja.get(id); });
  }
  function apagarLocal(id) {
    if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; }
    delete faltando[id];
    return transacao('readwrite', function (loja) { return loja.delete(id); });
  }
  function listar() {
    return transacao('readonly', function (loja) { return loja.getAll(); }).then(function (r) { return r || []; });
  }

  /* ---------- conversões ---------- */

  function blobParaBase64(blob) {
    return new Promise(function (ok, falha) {
      var leitor = new FileReader();
      leitor.onload = function () {
        var s = String(leitor.result);
        ok(s.slice(s.indexOf(',') + 1));
      };
      leitor.onerror = function () { falha(leitor.error || new Error('não deu para ler a imagem')); };
      leitor.readAsDataURL(blob);
    });
  }

  function base64ParaBlob(b64, tipo) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: tipo || 'application/octet-stream' });
  }

  var EXTENSOES = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
    'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif', 'image/bmp': 'bmp'
  };
  function extensaoDe(tipo) { return EXTENSOES[tipo] || 'bin'; }

  /* ---------- redução e recompressão ---------- */

  var webp = null;
  function suportaWebp() {
    if (webp === null) {
      var c = document.createElement('canvas');
      c.width = c.height = 1;
      webp = c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    }
    return webp;
  }

  function carregarImagem(blob) {
    return new Promise(function (ok, falha) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { ok({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); falha(new Error('não consegui abrir essa imagem')); };
      img.src = url;
    });
  }

  function codificar(canvas, tipo, qualidade) {
    return new Promise(function (ok) {
      canvas.toBlob(function (b) { ok(b); }, tipo, qualidade);
    });
  }

  function desenhar(img, largura, altura, tipo) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(largura));
    c.height = Math.max(1, Math.round(altura));
    var ctx = c.getContext('2d');
    if (tipo === 'image/jpeg') {          // JPEG não tem transparência: fundo branco em vez de preto
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  /**
   * Devolve {blob, tipo, largura, altura}: a imagem já no tamanho e peso que
   * cabem no repositório. GIF e SVG pequenos passam intactos (animação/vetor).
   */
  async function preparar(arquivo) {
    if (!arquivo || !/^image\//.test(arquivo.type || '')) throw new Error('isso não é uma imagem');

    var intacta = function (w, h) {
      return { blob: arquivo, tipo: arquivo.type, largura: w || 0, altura: h || 0 };
    };
    if ((arquivo.type === 'image/gif' || arquivo.type === 'image/svg+xml') && arquivo.size <= LIMITE) {
      try {
        var v = await carregarImagem(arquivo);
        var r = intacta(v.img.naturalWidth, v.img.naturalHeight);
        URL.revokeObjectURL(v.url);
        return r;
      } catch (e) { return intacta(0, 0); }
    }

    var alvo = await carregarImagem(arquivo);
    try {
      var w = alvo.img.naturalWidth, h = alvo.img.naturalHeight;
      if (!w || !h) {
        if (arquivo.size > LIMITE) throw new Error('imagem grande demais (' + U.tamanhoLegivel(arquivo.size) + ')');
        return intacta(w, h);
      }
      var escala = Math.min(1, LADO_MAXIMO / Math.max(w, h));
      if (escala === 1 && arquivo.size <= ORIGINAL_ATE) return intacta(w, h);

      var tipo = suportaWebp() ? 'image/webp' : 'image/jpeg';
      var tentativas = [[escala, 0.86], [escala, 0.72], [escala * 0.75, 0.7], [escala * 0.55, 0.62]];
      var melhor = null;
      for (var i = 0; i < tentativas.length; i++) {
        var e = tentativas[i][0];
        var lg = w * e, at = h * e;
        var blob = await codificar(desenhar(alvo.img, lg, at, tipo), tipo, tentativas[i][1]);
        if (!blob) break;
        melhor = { blob: blob, tipo: tipo, largura: Math.round(lg), altura: Math.round(at) };
        if (blob.size <= LIMITE) break;
      }
      if (!melhor) {                       // navegador sem toBlob para esse tipo
        if (arquivo.size > LIMITE) throw new Error('imagem grande demais (' + U.tamanhoLegivel(arquivo.size) + ')');
        return intacta(w, h);
      }
      // recomprimir piorou (acontece com PNG de poucas cores) e o original já cabia
      if (escala === 1 && arquivo.size <= LIMITE && arquivo.size < melhor.blob.size) return intacta(w, h);
      if (melhor.blob.size > LIMITE) throw new Error('não consegui deixar essa imagem abaixo de 900 KB');
      return melhor;
    } finally {
      URL.revokeObjectURL(alvo.url);
    }
  }

  /** processa e guarda; devolve a ficha que vai para dentro da anotação */
  async function adicionar(arquivo) {
    var pronta = await preparar(arquivo);
    var ficha = {
      id: U.id(),
      tipo: pronta.tipo || 'image/png',
      nome: String((arquivo && arquivo.name) || '').slice(0, 80),
      bytes: pronta.blob.size,
      largura: pronta.largura,
      altura: pronta.altura,
      criadoEm: U.agora()
    };
    await guardar({
      id: ficha.id, blob: pronta.blob, tipo: ficha.tipo, bytes: ficha.bytes,
      largura: ficha.largura, altura: ficha.altura, nome: ficha.nome,
      criadoEm: ficha.criadoEm, enviadoEm: ''
    });
    return ficha;
  }

  /* ---------- endereços e cache de exibição ---------- */

  function urlDe(id, blob) {
    if (!urls[id]) urls[id] = URL.createObjectURL(blob);
    return urls[id];
  }

  /** já disponível sem esperar? (evita piscar a imagem a cada redesenho) */
  function urlEmCache(id) { return urls[id] || ''; }

  function pastaRemota() {
    var c = String((G.cfg && G.cfg.caminho) || 'dados/notas.json');
    var dir = c.indexOf('/') >= 0 ? c.replace(/\/[^\/]+$/, '/') : '';
    return dir + 'imagens/';
  }
  function caminhoRemoto(ficha) {
    return pastaRemota() + ficha.id + '.' + extensaoDe(ficha.tipo);
  }

  /** baixa do repositório a imagem que esta máquina ainda não tem */
  async function buscarRemota(ficha) {
    if (!G.configurado()) return '';
    var r = await G.lerBinario(caminhoRemoto(ficha));
    if (!r) return '';
    var blob = base64ParaBlob(r.base64, ficha.tipo);
    await guardar({
      id: ficha.id, blob: blob, tipo: ficha.tipo, bytes: blob.size,
      largura: ficha.largura || 0, altura: ficha.altura || 0, nome: ficha.nome || '',
      criadoEm: ficha.criadoEm || U.agora(), enviadoEm: U.agora()
    });
    return urlDe(ficha.id, blob);
  }

  /**
   * Endereço para mostrar a imagem: memória → IndexedDB → repositório.
   * Devolve '' quando não existe em lugar nenhum (imagem de outra máquina, ainda sem rede).
   */
  function garantir(ficha) {
    var id = ficha && ficha.id;
    if (!id) return Promise.resolve('');
    if (urls[id]) return Promise.resolve(urls[id]);
    if (faltando[id]) return Promise.resolve('');
    if (pendurados[id]) return pendurados[id];

    pendurados[id] = obter(id).then(function (reg) {
      if (reg && reg.blob) return urlDe(id, reg.blob);
      return buscarRemota(ficha);
    }).catch(function (e) {
      console.warn('imagem indisponível', id, e);
      return '';
    }).then(function (url) {
      delete pendurados[id];
      if (!url) faltando[id] = true;
      return url;
    });
    return pendurados[id];
  }

  /** esquece o "não achei" para tentar de novo depois de sincronizar */
  function tentarDeNovo() { faltando = {}; }

  /* ---------- sincronia ---------- */

  /**
   * Sobe para o repositório o que só existe aqui. Roda antes de gravar o JSON,
   * para a outra máquina nunca ver uma anotação apontando para imagem que não subiu.
   */
  async function enviarPendentes(idsUsados) {
    if (!G.configurado()) return 0;
    var usados = {};
    (idsUsados || []).forEach(function (id) { usados[id] = true; });

    var regs = await listar();
    var fila = regs.filter(function (r) { return !r.enviadoEm && usados[r.id]; });
    var n = 0;
    for (var i = 0; i < fila.length; i++) {
      var r = fila[i];
      var b64 = await blobParaBase64(r.blob);
      await G.gravarBinario(caminhoRemoto(r), b64, null, 'MeuNotas: imagem ' + (r.nome || r.id));
      r.enviadoEm = U.agora();
      await guardar(r);
      n++;
    }
    return n;
  }

  /** tira do banco local o que nenhuma anotação usa mais (já subiu, dá para rebaixar) */
  async function limparOrfas(idsUsados) {
    var usados = {};
    (idsUsados || []).forEach(function (id) { usados[id] = true; });
    var regs = await listar();
    var n = 0;
    for (var i = 0; i < regs.length; i++) {
      if (!usados[regs[i].id] && regs[i].enviadoEm) { await apagarLocal(regs[i].id); n++; }
    }
    return n;
  }

  async function sincronizar(idsUsados) {
    var n = await enviarPendentes(idsUsados);
    if (n) tentarDeNovo();
    try { await limparOrfas(idsUsados); } catch (e) { /* cache: falhar aqui não é problema */ }
    return n;
  }

  /** quanto as imagens ocupam nesta máquina */
  function espacoUsado() {
    return listar().then(function (regs) {
      return regs.reduce(function (t, r) { return t + (r.bytes || 0); }, 0);
    }).catch(function () { return 0; });
  }

  /** pega as imagens de um evento de colar / arrastar */
  function arquivosDe(dados) {
    if (!dados) return [];
    var achados = [];
    var itens = dados.items ? Array.prototype.slice.call(dados.items) : [];
    itens.forEach(function (it) {
      if (it.kind === 'file' && /^image\//.test(it.type)) {
        var f = it.getAsFile();
        if (f) achados.push(f);
      }
    });
    if (!achados.length && dados.files) {
      Array.prototype.slice.call(dados.files).forEach(function (f) {
        if (/^image\//.test(f.type)) achados.push(f);
      });
    }
    return achados;
  }

  return {
    LIMITE: LIMITE,
    adicionar: adicionar, garantir: garantir, urlEmCache: urlEmCache,
    apagarLocal: apagarLocal, sincronizar: sincronizar, tentarDeNovo: tentarDeNovo,
    espacoUsado: espacoUsado, arquivosDe: arquivosDe, extensaoDe: extensaoDe,
    blobParaBase64: blobParaBase64, obter: obter
  };
})();
