/* ===== MeuNotas — estado, persistência local e mesclagem ===== */
var S = (function () {
  'use strict';

  var CHAVE = 'meunotas.dados';
  var CHAVE_PREFS = 'meunotas.prefs';
  var DIAS_LIXEIRA = 45;          // quanto tempo guardamos a marca de "apagado"
  var ouvintes = [];

  var dados = { v: 1, itens: [], projetos: [], atualizadoEm: U.agora() };
  var prefs = { tema: 'escuro', visao: 'hoje', projeto: '', ordem: 'prazo', mostrarFeitas: false, avisos: false };

  /* ---------- persistência ---------- */

  function normalizarItem(it) {
    return {
      id: it.id || U.id(),
      titulo: String(it.titulo || '').trim(),
      detalhes: String(it.detalhes || ''),
      projeto: String(it.projeto || '').trim(),
      tags: Array.isArray(it.tags) ? it.tags.map(String) : [],
      prazo: it.prazo || '',
      feito: !!it.feito,
      feitoEm: it.feitoEm || '',
      fixado: !!it.fixado,
      apagado: !!it.apagado,
      criadoEm: it.criadoEm || U.agora(),
      atualizadoEm: it.atualizadoEm || it.criadoEm || U.agora()
    };
  }

  function normalizarPacote(bruto) {
    var d = bruto && typeof bruto === 'object' ? bruto : {};
    var itens = Array.isArray(d.itens) ? d.itens.map(normalizarItem) : [];
    var projetos = Array.isArray(d.projetos) ? d.projetos.filter(Boolean).map(function (p) {
      return typeof p === 'string' ? { nome: p } : { nome: String(p.nome || '').trim() };
    }).filter(function (p) { return p.nome; }) : [];
    return { v: 1, itens: itens, projetos: projetos, atualizadoEm: d.atualizadoEm || U.agora() };
  }

  function carregar() {
    try {
      var cru = localStorage.getItem(CHAVE);
      if (cru) dados = normalizarPacote(JSON.parse(cru));
    } catch (e) { console.warn('dados locais ilegíveis', e); }
    try {
      var p = localStorage.getItem(CHAVE_PREFS);
      if (p) prefs = Object.assign(prefs, JSON.parse(p));
    } catch (e) { /* ignora */ }
    return dados;
  }

  function salvarPrefs() {
    try { localStorage.setItem(CHAVE_PREFS, JSON.stringify(prefs)); } catch (e) { /* ignora */ }
  }

  /** grava local e avisa quem escuta. local=true quando a mudança nasceu aqui (precisa subir). */
  function salvar(mudancaLocal) {
    dados.atualizadoEm = U.agora();
    try {
      localStorage.setItem(CHAVE, JSON.stringify(dados));
    } catch (e) {
      U.toast('Falha ao gravar localmente: ' + e.message, 5000);
    }
    ouvintes.forEach(function (fn) { fn(!!mudancaLocal); });
  }

  function aoMudar(fn) { ouvintes.push(fn); }

  /* ---------- consultas ---------- */

  function vivos() {
    return dados.itens.filter(function (i) { return !i.apagado; });
  }

  function porId(id) {
    for (var i = 0; i < dados.itens.length; i++) if (dados.itens[i].id === id) return dados.itens[i];
    return null;
  }

  function nomesDeProjeto() {
    var mapa = {};
    dados.projetos.forEach(function (p) { mapa[p.nome] = true; });
    vivos().forEach(function (i) { if (i.projeto) mapa[i.projeto] = true; });
    return Object.keys(mapa).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  }

  function registrarProjeto(nome) {
    nome = String(nome || '').trim();
    if (!nome) return;
    var existe = dados.projetos.some(function (p) { return U.normalizar(p.nome) === U.normalizar(nome); });
    if (!existe) dados.projetos.push({ nome: nome });
  }

  /** usa o nome já cadastrado quando só a caixa/acento diferem */
  function nomeCanonico(nome) {
    nome = String(nome || '').trim();
    if (!nome) return '';
    var alvo = U.normalizar(nome);
    var achou = nomesDeProjeto().filter(function (n) { return U.normalizar(n) === alvo; })[0];
    return achou || nome;
  }

  /* ---------- escrita ---------- */

  function adicionar(campos) {
    var it = normalizarItem({
      titulo: campos.titulo,
      detalhes: campos.detalhes,
      projeto: nomeCanonico(campos.projeto),
      tags: campos.tags,
      prazo: campos.prazo,
      fixado: campos.fixado
    });
    if (!it.titulo && !it.detalhes) return null;
    if (!it.titulo) it.titulo = it.detalhes.split('\n')[0].slice(0, 80);
    registrarProjeto(it.projeto);
    dados.itens.unshift(it);
    salvar(true);
    return it;
  }

  function atualizar(id, campos) {
    var it = porId(id);
    if (!it) return null;
    Object.keys(campos).forEach(function (k) { it[k] = campos[k]; });
    if (campos.projeto !== undefined) {
      it.projeto = nomeCanonico(campos.projeto);
      registrarProjeto(it.projeto);
    }
    if (campos.feito !== undefined) it.feitoEm = campos.feito ? U.agora() : '';
    it.atualizadoEm = U.agora();
    salvar(true);
    return it;
  }

  function alternarFeito(id) {
    var it = porId(id);
    if (it) atualizar(id, { feito: !it.feito });
  }

  function alternarFixado(id) {
    var it = porId(id);
    if (it) atualizar(id, { fixado: !it.fixado });
  }

  function apagar(id) {
    var it = porId(id);
    if (!it) return null;
    var copia = Object.assign({}, it);
    it.apagado = true;
    it.atualizadoEm = U.agora();
    salvar(true);
    return copia;                 // devolve para permitir desfazer
  }

  function restaurar(copia) {
    var it = porId(copia.id);
    if (it) {
      Object.assign(it, copia, { apagado: false, atualizadoEm: U.agora() });
    } else {
      dados.itens.unshift(normalizarItem(Object.assign({}, copia, { apagado: false })));
    }
    salvar(true);
  }

  function renomearProjeto(antigo, novo) {
    novo = String(novo || '').trim();
    vivos().forEach(function (i) {
      if (i.projeto === antigo) { i.projeto = novo; i.atualizadoEm = U.agora(); }
    });
    dados.projetos = dados.projetos.filter(function (p) { return p.nome !== antigo; });
    if (novo) registrarProjeto(novo);
    salvar(true);
  }

  function limparConcluidas(projeto) {
    var n = 0;
    vivos().forEach(function (i) {
      if (i.feito && (!projeto || i.projeto === projeto)) {
        i.apagado = true; i.atualizadoEm = U.agora(); n++;
      }
    });
    if (n) salvar(true);
    return n;
  }

  /* ---------- filtro / ordenação ---------- */

  function combinaBusca(it, termo) {
    if (!termo) return true;
    var alvo = U.normalizar([it.titulo, it.detalhes, it.projeto, it.tags.join(' ')].join(' \n '));
    return U.normalizar(termo).split(/\s+/).every(function (parte) { return alvo.indexOf(parte) >= 0; });
  }

  function listar(op) {
    var visao = op.visao || 'hoje';
    var termo = (op.busca || '').trim();
    var lista = vivos();

    if (termo) {
      lista = lista.filter(function (i) { return combinaBusca(i, termo); });
    } else if (visao === 'feitas') {
      lista = lista.filter(function (i) { return i.feito; });
    } else {
      if (!op.mostrarFeitas) lista = lista.filter(function (i) { return !i.feito; });
      if (visao === 'projeto') {
        lista = lista.filter(function (i) { return i.projeto === op.projeto; });
      } else if (visao === 'hoje') {
        lista = lista.filter(function (i) { return i.fixado || (i.prazo && U.diasAte(i.prazo) <= 0); });
      } else if (visao === 'atrasadas') {
        lista = lista.filter(function (i) { return i.prazo && U.diasAte(i.prazo) < 0; });
      } else if (visao === 'semana') {
        lista = lista.filter(function (i) { return i.prazo && U.diasAte(i.prazo) <= 7; });
      } else if (visao === 'fixadas') {
        lista = lista.filter(function (i) { return i.fixado; });
      } else if (visao === 'entrada') {
        lista = lista.filter(function (i) { return !i.projeto; });
      }
      // 'tudo' = tudo que está em aberto
    }

    var ordem = op.ordem || 'prazo';
    lista.sort(function (a, b) {
      if (a.feito !== b.feito) return a.feito ? 1 : -1;
      if (ordem !== 'alfabetica' && a.fixado !== b.fixado) return a.fixado ? -1 : 1;
      if (ordem === 'prazo') {
        var pa = a.prazo || '9999-99-99', pb = b.prazo || '9999-99-99';
        if (pa !== pb) return pa < pb ? -1 : 1;
        return a.criadoEm < b.criadoEm ? 1 : -1;
      }
      if (ordem === 'recentes') return a.criadoEm < b.criadoEm ? 1 : -1;
      if (ordem === 'antigas') return a.criadoEm > b.criadoEm ? 1 : -1;
      return a.titulo.localeCompare(b.titulo, 'pt-BR');
    });
    return lista;
  }

  function contagens() {
    var abertas = vivos().filter(function (i) { return !i.feito; });
    function n(f) { return abertas.filter(f).length; }
    return {
      hoje: n(function (i) { return i.fixado || (i.prazo && U.diasAte(i.prazo) <= 0); }),
      atrasadas: n(function (i) { return i.prazo && U.diasAte(i.prazo) < 0; }),
      semana: n(function (i) { return i.prazo && U.diasAte(i.prazo) <= 7; }),
      fixadas: n(function (i) { return i.fixado; }),
      entrada: n(function (i) { return !i.projeto; }),
      tudo: abertas.length,
      feitas: vivos().filter(function (i) { return i.feito; }).length
    };
  }

  function contagemPorProjeto() {
    var mapa = {};
    nomesDeProjeto().forEach(function (nome) { mapa[nome] = 0; });
    vivos().forEach(function (i) {
      if (i.projeto && !i.feito) mapa[i.projeto] = (mapa[i.projeto] || 0) + 1;
    });
    return mapa;
  }

  /* ---------- mesclagem (sincronia entre máquinas) ---------- */

  /** vence o item com atualizadoEm mais novo; apagados viram lápide temporária */
  function mesclar(local, remoto) {
    var a = normalizarPacote(local), b = normalizarPacote(remoto);
    var mapa = {};
    a.itens.concat(b.itens).forEach(function (it) {
      var atual = mapa[it.id];
      if (!atual || String(it.atualizadoEm) > String(atual.atualizadoEm)) mapa[it.id] = it;
    });

    var limite = new Date(Date.now() - DIAS_LIXEIRA * 86400000).toISOString();
    var itens = Object.keys(mapa).map(function (k) { return mapa[k]; })
      .filter(function (it) { return !(it.apagado && String(it.atualizadoEm) < limite); });

    var nomes = {};
    a.projetos.concat(b.projetos).forEach(function (p) { nomes[p.nome] = true; });

    return {
      v: 1,
      itens: itens,
      projetos: Object.keys(nomes).map(function (nome) { return { nome: nome }; }),
      atualizadoEm: U.agora()
    };
  }

  function substituir(novos) {
    dados = normalizarPacote(novos);
    salvar(false);
  }

  /** comparação estável, ignorando o carimbo do pacote */
  function assinatura(pacote) {
    var d = normalizarPacote(pacote);
    var itens = d.itens.slice().sort(function (x, y) { return x.id < y.id ? -1 : 1; })
      .map(function (i) {
        return [i.id, i.titulo, i.detalhes, i.projeto, i.tags.join(','), i.prazo,
          i.feito ? 1 : 0, i.fixado ? 1 : 0, i.apagado ? 1 : 0, i.atualizadoEm].join('|');
      });
    var projetos = d.projetos.map(function (p) { return p.nome; }).sort();
    return JSON.stringify([itens, projetos]);
  }

  /* ---------- espelho legível ---------- */

  function paraMarkdown() {
    var linhas = ['# Minhas anotações', '', '_Gerado pelo MeuNotas em ' + U.dataHoraLegivel(U.agora()) + '. Editar aqui não é recomendado — use o app._', ''];
    var abertas = vivos().filter(function (i) { return !i.feito; });
    var atrasadas = abertas.filter(function (i) { return i.prazo && U.diasAte(i.prazo) < 0; });
    var hoje = abertas.filter(function (i) { return i.prazo && U.diasAte(i.prazo) === 0; });

    function bloco(titulo, itens) {
      if (!itens.length) return;
      linhas.push('## ' + titulo, '');
      itens.forEach(function (i) {
        var extra = [];
        if (i.prazo) extra.push('prazo ' + i.prazo.split('-').reverse().join('/'));
        if (i.projeto) extra.push('#' + i.projeto);
        i.tags.forEach(function (t) { extra.push('@' + t); });
        linhas.push('- [ ] ' + (i.fixado ? '★ ' : '') + i.titulo + (extra.length ? '  _(' + extra.join(' · ') + ')_' : ''));
        if (i.detalhes) {
          i.detalhes.split('\n').forEach(function (l) { linhas.push('      ' + l); });
        }
      });
      linhas.push('');
    }

    bloco('⚠ Atrasadas', atrasadas);
    bloco('◉ Para hoje', hoje);

    nomesDeProjeto().forEach(function (nome) {
      bloco('Projeto: ' + nome, abertas.filter(function (i) {
        return i.projeto === nome && atrasadas.indexOf(i) < 0 && hoje.indexOf(i) < 0;
      }));
    });
    bloco('Sem projeto', abertas.filter(function (i) {
      return !i.projeto && atrasadas.indexOf(i) < 0 && hoje.indexOf(i) < 0;
    }));

    var feitas = vivos().filter(function (i) { return i.feito; })
      .sort(function (a, b) { return a.feitoEm < b.feitoEm ? 1 : -1; }).slice(0, 60);
    if (feitas.length) {
      linhas.push('## ✓ Concluídas recentemente', '');
      feitas.forEach(function (i) {
        linhas.push('- [x] ' + i.titulo + (i.projeto ? '  _(#' + i.projeto + ')_' : ''));
      });
      linhas.push('');
    }
    return linhas.join('\n');
  }

  return {
    carregar: carregar, salvar: salvar, aoMudar: aoMudar,
    get dados() { return dados; },
    get prefs() { return prefs; },
    salvarPrefs: salvarPrefs,
    vivos: vivos, porId: porId, nomesDeProjeto: nomesDeProjeto, registrarProjeto: registrarProjeto,
    adicionar: adicionar, atualizar: atualizar, alternarFeito: alternarFeito, alternarFixado: alternarFixado,
    apagar: apagar, restaurar: restaurar, renomearProjeto: renomearProjeto, limparConcluidas: limparConcluidas,
    listar: listar, contagens: contagens, contagemPorProjeto: contagemPorProjeto,
    mesclar: mesclar, substituir: substituir, assinatura: assinatura,
    normalizarPacote: normalizarPacote, paraMarkdown: paraMarkdown
  };
})();
