/* ===== MeuNotas — interface ===== */
(function () {
  'use strict';

  var vista = { visao: 'hoje', projeto: '', busca: '', selecionado: '', editando: '' };
  var ultimoApagado = null;
  var GRUPOS = ['Atrasadas', 'Hoje', 'Amanhã', 'Próximos 7 dias', 'Mais adiante', 'Sem prazo', 'Concluídas'];

  /* ---------------- arranque ---------------- */

  function iniciar() {
    S.carregar();
    G.carregar();

    vista.visao = S.prefs.visao || 'hoje';
    vista.projeto = S.prefs.projeto || '';
    if (vista.visao === 'projeto' && S.nomesDeProjeto().indexOf(vista.projeto) < 0) {
      vista.visao = 'hoje'; vista.projeto = '';
    }
    aplicarTema(S.prefs.tema);
    U.el('#ordem').value = S.prefs.ordem || 'prazo';
    U.el('#mostrar-feitas').checked = !!S.prefs.mostrarFeitas;

    ligarEventos();
    S.aoMudar(function (mudancaLocal) {
      desenhar();
      if (mudancaLocal) agendarSync();
    });
    G.aoEstado(mostrarEstadoSync);

    desenhar();
    if (G.configurado()) {
      G.sincronizar();
    } else {
      mostrarEstadoSync('local', 'sincronia não configurada');
      setTimeout(function () { abrirModal('#modal-config'); }, 400);
    }

    // relê de tempos em tempos e ao voltar para a aba
    setInterval(function () { if (!document.hidden) G.sincronizar(); }, 120000);
    // ao voltar para a aba puxa novidades; ao sair, empurra o que está pendente
    document.addEventListener('visibilitychange', function () { G.sincronizar(); });
    window.addEventListener('online', function () { G.sincronizar(); });

    // avisos de prazo
    avisarPrazos();
    setInterval(avisarPrazos, 1800000);
    // vira o dia: redesenha para os prazos mudarem de faixa
    setInterval(function () {
      if (marcoDoDia !== U.hoje()) { marcoDoDia = U.hoje(); desenhar(); }
    }, 60000);

    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(function () { /* ignora */ });
    }
  }

  var marcoDoDia = U.hoje();
  var agendarSync = U.debounce(function () { G.sincronizar(); }, 2500);

  /* ---------------- tema ---------------- */

  function aplicarTema(tema) {
    document.documentElement.setAttribute('data-tema', tema === 'claro' ? 'claro' : 'escuro');
    S.prefs.tema = tema === 'claro' ? 'claro' : 'escuro';
    S.salvarPrefs();
  }

  /* ---------------- desenho ---------------- */

  function desenhar() {
    desenharLateral();
    desenharCabecalho();
    desenharLista();
    atualizarTituloAba();
  }

  function desenharLateral() {
    var c = S.contagens();
    U.els('[data-conta]').forEach(function (e) {
      var n = c[e.getAttribute('data-conta')] || 0;
      e.textContent = n ? String(n) : '';
    });
    U.els('.link-visao[data-visao]').forEach(function (b) {
      b.classList.toggle('ativo', vista.visao === b.getAttribute('data-visao') && !vista.busca);
    });

    var mapa = S.contagemPorProjeto();
    var nomes = Object.keys(mapa);
    var alvo = U.el('#lista-projetos');
    if (!nomes.length) {
      alvo.innerHTML = '<div class="grupo-titulo" style="font-weight:400;text-transform:none;letter-spacing:0">nenhum ainda — use <code>#nome</code></div>';
    } else {
      alvo.innerHTML = nomes.map(function (nome) {
        return '<button class="link-visao projeto' + (vista.visao === 'projeto' && vista.projeto === nome && !vista.busca ? ' ativo' : '') + '"' +
          ' data-projeto="' + U.escapar(nome) + '" title="' + U.escapar(nome) + ' — clique duplo renomeia">' +
          '<span class="bolinha" style="background:' + U.corDoNome(nome) + '"></span>' +
          '<span class="rotulo">' + U.escapar(nome) + '</span>' +
          '<span class="conta">' + (mapa[nome] || '') + '</span></button>';
      }).join('');
    }

    var itens = S.vivos();
    var feitasHoje = itens.filter(function (i) { return i.feito && String(i.feitoEm).slice(0, 10) === U.hoje(); }).length;
    U.el('#resumo-lateral').innerHTML =
      itens.filter(function (i) { return !i.feito; }).length + ' em aberto · ' + feitasHoje + ' feitas hoje<br>' +
      (G.configurado()
        ? 'última sincronia: ' + (G.ultimaSincronia ? U.dataHoraLegivel(G.ultimaSincronia) : '—')
        : '<span style="color:var(--alerta)">só nesta máquina</span>');
  }

  function tituloDaVisao() {
    if (vista.busca) return 'Busca: “' + vista.busca + '”';
    return {
      hoje: 'Hoje', atrasadas: 'Atrasadas', semana: 'Próximos 7 dias', fixadas: 'Fixadas',
      entrada: 'Sem projeto', tudo: 'Tudo em aberto', feitas: 'Concluídas',
      projeto: vista.projeto
    }[vista.visao] || 'Hoje';
  }

  function desenharCabecalho() {
    U.el('#titulo-lista').textContent = tituloDaVisao();
    U.el('#btn-limpar-busca').hidden = !vista.busca;
  }

  function grupoDe(it) {
    if (it.feito) return 'Concluídas';
    if (!it.prazo) return 'Sem prazo';
    var n = U.diasAte(it.prazo);
    if (n < 0) return 'Atrasadas';
    if (n === 0) return 'Hoje';
    if (n === 1) return 'Amanhã';
    if (n <= 7) return 'Próximos 7 dias';
    return 'Mais adiante';
  }

  function desenharLista() {
    var itens = S.listar({
      visao: vista.visao, projeto: vista.projeto, busca: vista.busca,
      ordem: U.el('#ordem').value, mostrarFeitas: U.el('#mostrar-feitas').checked
    });
    var alvo = U.el('#lista');

    if (!itens.length) {
      alvo.innerHTML = '<div class="vazio"><div class="grande">' + (vista.busca ? '⌕' : '✓') + '</div>' +
        (vista.busca ? 'Nada encontrado para “' + U.escapar(vista.busca) + '”.'
          : 'Nada aqui. Anota algo na barra de cima.') + '</div>';
      return;
    }

    var agrupar = U.el('#ordem').value === 'prazo' && !vista.busca;
    var html = '';
    if (agrupar) {
      var ordenados = itens.slice().sort(function (a, b) {
        return GRUPOS.indexOf(grupoDe(a)) - GRUPOS.indexOf(grupoDe(b));
      });
      var atual = null;
      ordenados.forEach(function (it) {
        var g = grupoDe(it);
        if (g !== atual) { atual = g; html += '<div class="faixa-dia">' + g + '</div>'; }
        html += cartao(it);
      });
    } else {
      html = itens.map(cartao).join('');
    }
    alvo.innerHTML = html;
  }

  /** escapa o texto e envolve os trechos que casam com a busca */
  function realcar(texto, termo) {
    var cru = String(texto == null ? '' : texto);
    if (!termo) return U.escapar(cru);

    // dobrar() mantém o tamanho, então as posições valem no texto original
    var alvo = U.dobrar(cru);
    var faixas = [];
    termo.trim().split(/\s+/).filter(Boolean).forEach(function (p) {
      var busca = U.dobrar(p);
      if (!busca) return;
      var i = 0;
      while (true) {
        var pos = alvo.indexOf(busca, i);
        if (pos < 0) break;
        faixas.push([pos, pos + busca.length]);
        i = pos + busca.length;
      }
    });
    if (!faixas.length) return U.escapar(cru);

    faixas.sort(function (a, b) { return a[0] - b[0]; });
    var juntas = [faixas[0]];
    faixas.slice(1).forEach(function (f) {
      var ultima = juntas[juntas.length - 1];
      if (f[0] <= ultima[1]) ultima[1] = Math.max(ultima[1], f[1]);
      else juntas.push(f);
    });

    var saida = '', pos = 0;
    juntas.forEach(function (f) {
      saida += U.escapar(cru.slice(pos, f[0])) +
        '<span class="marca-busca">' + U.escapar(cru.slice(f[0], f[1])) + '</span>';
      pos = f[1];
    });
    return saida + U.escapar(cru.slice(pos));
  }

  function detalhesEmHtml(it) {
    var linhas = String(it.detalhes || '').split('\n');
    return linhas.map(function (l, idx) {
      var m = l.match(/^\s*[-*]\s*\[( |x|X)\]\s?(.*)$/);
      if (m) {
        var pronta = m[1].toLowerCase() === 'x';
        return '<label class="sub' + (pronta ? ' pronta' : '') + '">' +
          '<input type="checkbox" data-sub="' + idx + '"' + (pronta ? ' checked' : '') + '>' +
          '<span>' + realcar(m[2], vista.busca) + '</span></label>';
      }
      return '<div>' + (l.trim() ? realcar(l, vista.busca) : '&nbsp;') + '</div>';
    }).join('');
  }

  function cartao(it) {
    var dias = it.prazo ? U.diasAte(it.prazo) : null;
    var classes = ['item'];
    if (it.feito) classes.push('feito');
    else if (dias !== null && dias < 0) classes.push('atrasado');
    else if (dias === 0) classes.push('hoje');
    else if (it.fixado) classes.push('fixado');
    if (it.id === vista.selecionado) classes.push('selecionado');

    var chips = '';
    if (it.projeto) {
      chips += '<span class="chip projeto" data-ir-projeto="' + U.escapar(it.projeto) + '">' +
        '<span class="bolinha" style="background:' + U.corDoNome(it.projeto) + '"></span>' + U.escapar(it.projeto) + '</span>';
    }
    if (it.prazo) {
      var cl = dias < 0 ? ' prazo-atrasado' : (dias === 0 ? ' prazo-hoje' : '');
      chips += '<span class="chip' + cl + '" title="' + it.prazo.split('-').reverse().join('/') + '">◔ ' + U.prazoLegivel(it.prazo) + '</span>';
    }
    it.tags.forEach(function (t) { chips += '<span class="chip tag">' + U.escapar(t) + '</span>'; });
    if (it.feito && it.feitoEm) chips += '<span class="chip">✓ ' + U.dataHoraLegivel(it.feitoEm) + '</span>';

    return '<div class="' + classes.join(' ') + '" data-id="' + it.id + '">' +
      '<input class="caixa" type="checkbox"' + (it.feito ? ' checked' : '') + ' title="Concluir (x)">' +
      '<div class="item-meio">' +
      '<div class="item-titulo">' + (it.fixado ? '★ ' : '') + realcar(it.titulo, vista.busca) + '</div>' +
      (chips ? '<div class="item-chips">' + chips + '</div>' : '') +
      (it.detalhes ? '<div class="item-detalhes">' + detalhesEmHtml(it) + '</div>' : '') +
      '</div>' +
      '<div class="item-acoes">' +
      '<button class="acao' + (it.fixado ? ' on' : '') + '" data-acao="fixar" title="Fixar (f)">★</button>' +
      '<button class="acao" data-acao="editar" title="Editar (e)">✎</button>' +
      '<button class="acao" data-acao="apagar" title="Apagar (Del)">🗑</button>' +
      '</div></div>';
  }

  function atualizarTituloAba() {
    var c = S.contagens();
    var urgentes = c.atrasadas + S.vivos().filter(function (i) {
      return !i.feito && i.prazo && U.diasAte(i.prazo) === 0;
    }).length;
    document.title = (urgentes ? '(' + urgentes + ') ' : '') + 'MeuNotas';
  }

  /* ---------------- estado da sincronia ---------------- */

  function mostrarEstadoSync(nome, msg) {
    var pill = U.el('#pill-sync');
    pill.setAttribute('data-estado', nome);
    var rotulos = { local: 'Local', sincronizando: 'Sincronizando…', ok: 'Sincronizado', erro: 'Erro', pendente: 'Pendente' };
    U.el('#pill-texto').textContent = rotulos[nome] || nome;
    pill.title = nome === 'erro' ? 'Erro: ' + msg
      : nome === 'ok' ? 'Sincronizado em ' + U.dataHoraLegivel(msg) + ' — clique para sincronizar agora'
        : nome === 'local' ? (msg || 'sem sincronia') + ' — clique para configurar'
          : 'Sincronizando…';
    if (nome === 'erro') U.toast('Sincronia falhou: ' + msg, 6000);
    if (nome === 'ok') desenharLateral();
  }

  /* ---------------- eventos ---------------- */

  function ligarEventos() {
    // captura
    var entrada = U.el('#entrada');
    entrada.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); anotar(); }
      if (ev.key === 'Escape') { entrada.value = ''; U.el('#captura-dica').innerHTML = ''; entrada.blur(); }
    });
    entrada.addEventListener('input', function () {
      U.el('#captura-dica').innerHTML = P.previa(entrada.value);
    });
    U.el('#btn-add').addEventListener('click', anotar);

    // busca
    var busca = U.el('#busca');
    busca.addEventListener('input', U.debounce(function () {
      vista.busca = busca.value.trim();
      desenhar();
    }, 120));
    busca.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { busca.value = ''; vista.busca = ''; desenhar(); busca.blur(); }
    });
    U.el('#btn-limpar-busca').addEventListener('click', function () {
      busca.value = ''; vista.busca = ''; desenhar();
    });

    // visões e projetos
    U.els('.link-visao[data-visao]').forEach(function (b) {
      b.addEventListener('click', function () {
        irPara(b.getAttribute('data-visao'), '');
      });
    });
    U.el('#lista-projetos').addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-projeto]');
      if (b) irPara('projeto', b.getAttribute('data-projeto'));
    });
    U.el('#lista-projetos').addEventListener('dblclick', function (ev) {
      var b = ev.target.closest('button[data-projeto]');
      if (b) renomearProjetoNaLateral(b);
    });
    U.el('#btn-novo-projeto').addEventListener('click', function () {
      entrada.focus();
      entrada.value = entrada.value.trim() ? entrada.value.trim() + ' #' : '#';
      U.toast('Digite o nome do projeto depois do # e anote algo nele');
    });

    U.el('#ordem').addEventListener('change', function () {
      S.prefs.ordem = U.el('#ordem').value; S.salvarPrefs(); desenharLista();
    });
    U.el('#mostrar-feitas').addEventListener('change', function () {
      S.prefs.mostrarFeitas = U.el('#mostrar-feitas').checked; S.salvarPrefs(); desenharLista();
    });

    // lista
    var lista = U.el('#lista');
    lista.addEventListener('click', function (ev) {
      var cartao = ev.target.closest('.item');
      if (!cartao) return;
      var id = cartao.getAttribute('data-id');

      if (ev.target.classList.contains('caixa')) { S.alternarFeito(id); return; }

      var sub = ev.target.closest('input[data-sub]');
      if (sub) { alternarSubtarefa(id, Number(sub.getAttribute('data-sub'))); return; }

      var chip = ev.target.closest('[data-ir-projeto]');
      if (chip) { irPara('projeto', chip.getAttribute('data-ir-projeto')); return; }

      var acao = ev.target.closest('[data-acao]');
      if (acao) {
        var qual = acao.getAttribute('data-acao');
        if (qual === 'fixar') S.alternarFixado(id);
        if (qual === 'editar') abrirEditor(id);
        if (qual === 'apagar') apagarComDesfazer(id);
        return;
      }
      selecionar(id);
    });
    lista.addEventListener('dblclick', function (ev) {
      var cartao = ev.target.closest('.item');
      if (cartao && !ev.target.closest('input,button,[data-ir-projeto]')) abrirEditor(cartao.getAttribute('data-id'));
    });

    // topo
    U.el('#pill-sync').addEventListener('click', function () {
      if (G.configurado()) G.sincronizar(); else abrirModal('#modal-config');
    });
    U.el('#btn-tema').addEventListener('click', function () {
      aplicarTema(S.prefs.tema === 'claro' ? 'escuro' : 'claro');
    });
    U.el('#btn-config').addEventListener('click', function () { abrirConfig(); });
    U.el('#btn-ajuda').addEventListener('click', function () { abrirModal('#modal-ajuda'); });
    U.el('#btn-menu').addEventListener('click', function () {
      U.el('#lateral').classList.toggle('aberta');
    });

    // modais
    U.els('[data-fechar-modal]').forEach(function (b) {
      b.addEventListener('click', function () { fecharModais(); });
    });
    U.els('.fundo-modal').forEach(function (f) {
      f.addEventListener('mousedown', function (ev) { if (ev.target === f) fecharModais(); });
    });

    ligarEditor();
    ligarConfig();
    document.addEventListener('keydown', atalhos);
  }

  function irPara(visao, projeto) {
    vista.visao = visao;
    vista.projeto = projeto || '';
    vista.busca = '';
    U.el('#busca').value = '';
    S.prefs.visao = visao; S.prefs.projeto = vista.projeto; S.salvarPrefs();
    U.el('#lateral').classList.remove('aberta');
    desenhar();
  }

  function selecionar(id) {
    vista.selecionado = id;
    U.els('.item').forEach(function (c) {
      c.classList.toggle('selecionado', c.getAttribute('data-id') === id);
    });
  }

  function anotar() {
    var entrada = U.el('#entrada');
    var texto = entrada.value.trim();
    if (!texto) return;
    var campos = P.interpretar(texto);
    // dentro de um projeto, herda o projeto quando nada for informado
    if (!campos.projeto && vista.visao === 'projeto') campos.projeto = vista.projeto;
    if (!campos.prazo && vista.visao === 'hoje') campos.prazo = U.hoje();
    var it = S.adicionar(campos);
    if (!it) return;
    entrada.value = '';
    U.el('#captura-dica').innerHTML = '';
    U.toast('Anotado' + (it.projeto ? ' em ' + it.projeto : '') + (it.prazo ? ' · ' + U.prazoLegivel(it.prazo) : ''));
    selecionar(it.id);
  }

  function alternarSubtarefa(id, indice) {
    var it = S.porId(id);
    if (!it) return;
    var linhas = String(it.detalhes).split('\n');
    var l = linhas[indice];
    if (l === undefined) return;
    linhas[indice] = /\[\s\]/.test(l) ? l.replace(/\[\s\]/, '[x]') : l.replace(/\[[xX]\]/, '[ ]');
    S.atualizar(id, { detalhes: linhas.join('\n') });
  }

  function apagarComDesfazer(id) {
    var copia = S.apagar(id);
    if (!copia) return;
    ultimoApagado = copia;
    var t = U.el('#toast');
    t.innerHTML = 'Apagado. <button class="botao" id="btn-desfazer" style="height:24px;margin-left:8px">Desfazer (Ctrl+Z)</button>';
    t.hidden = false;
    U.el('#btn-desfazer').addEventListener('click', desfazer);
    setTimeout(function () { if (t.contains(U.el('#btn-desfazer'))) t.hidden = true; }, 7000);
  }

  function desfazer() {
    if (!ultimoApagado) return;
    S.restaurar(ultimoApagado);
    ultimoApagado = null;
    U.el('#toast').hidden = true;
    U.toast('Restaurado');
  }

  function renomearProjetoNaLateral(botao) {
    var antigo = botao.getAttribute('data-projeto');
    var rotulo = botao.querySelector('.rotulo');
    var campo = document.createElement('input');
    campo.type = 'text';
    campo.value = antigo;
    campo.style.cssText = 'flex:1;min-width:0;background:var(--fundo);border:1px solid var(--acento);border-radius:6px;padding:2px 6px';
    rotulo.replaceWith(campo);
    campo.focus();
    campo.select();
    function encerrar(salvar) {
      var novo = campo.value.trim();
      if (salvar && novo && novo !== antigo) {
        S.renomearProjeto(antigo, novo);
        if (vista.projeto === antigo) { vista.projeto = novo; S.prefs.projeto = novo; S.salvarPrefs(); }
        U.toast('Projeto renomeado para ' + novo);
      }
      desenhar();
    }
    campo.addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if (ev.key === 'Enter') encerrar(true);
      if (ev.key === 'Escape') encerrar(false);
    });
    campo.addEventListener('blur', function () { encerrar(true); });
    campo.addEventListener('click', function (ev) { ev.stopPropagation(); });
    campo.addEventListener('dblclick', function (ev) { ev.stopPropagation(); });
  }

  /* ---------------- atalhos ---------------- */

  function digitando(alvo) {
    return alvo && /^(input|textarea|select)$/i.test(alvo.tagName);
  }

  function atalhos(ev) {
    var modalAberto = U.els('.fundo-modal').some(function (f) { return !f.hidden; });

    if (ev.key === 'Escape') {
      if (modalAberto) { fecharModais(); return; }
      if (vista.busca) { U.el('#busca').value = ''; vista.busca = ''; desenhar(); }
      return;
    }
    if (modalAberto) {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && !U.el('#modal-item').hidden) {
        ev.preventDefault(); salvarEditor();
      }
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault(); U.el('#busca').focus(); U.el('#busca').select(); return;
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !digitando(ev.target)) {
      ev.preventDefault(); desfazer(); return;
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (digitando(ev.target)) return;

    var visiveis = U.els('.item').map(function (c) { return c.getAttribute('data-id'); });
    var pos = visiveis.indexOf(vista.selecionado);

    switch (ev.key) {
      case 'n': ev.preventDefault(); U.el('#entrada').focus(); break;
      case '/': ev.preventDefault(); U.el('#busca').focus(); break;
      case 's': ev.preventDefault(); G.configurado() ? G.sincronizar() : abrirConfig(); break;
      case '?': abrirModal('#modal-ajuda'); break;
      case 'j': case 'ArrowDown':
        ev.preventDefault();
        if (visiveis.length) { selecionar(visiveis[Math.min(pos + 1, visiveis.length - 1)]); rolarAteSelecionado(); }
        break;
      case 'k': case 'ArrowUp':
        ev.preventDefault();
        if (visiveis.length) { selecionar(visiveis[pos <= 0 ? 0 : pos - 1]); rolarAteSelecionado(); }
        break;
      case 'x': case ' ':
        if (vista.selecionado) { ev.preventDefault(); S.alternarFeito(vista.selecionado); }
        break;
      case 'f':
        if (vista.selecionado) { ev.preventDefault(); S.alternarFixado(vista.selecionado); }
        break;
      case 'e': case 'Enter':
        if (vista.selecionado) { ev.preventDefault(); abrirEditor(vista.selecionado); }
        break;
      case 'Delete':
        if (vista.selecionado) { ev.preventDefault(); apagarComDesfazer(vista.selecionado); }
        break;
    }
  }

  function rolarAteSelecionado() {
    var c = document.querySelector('.item.selecionado');
    if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest' });
  }

  /* ---------------- modais ---------------- */

  function abrirModal(sel) {
    U.el(sel).hidden = false;
  }
  function fecharModais() {
    U.els('.fundo-modal').forEach(function (f) { f.hidden = true; });
    vista.editando = '';
  }

  function ligarEditor() {
    U.el('#ed-salvar').addEventListener('click', salvarEditor);
    U.el('#ed-apagar').addEventListener('click', function () {
      var id = vista.editando;
      fecharModais();
      if (id) apagarComDesfazer(id);
    });
  }

  function abrirEditor(id) {
    var it = S.porId(id);
    if (!it) return;
    vista.editando = id;
    U.el('#modal-item-titulo').textContent = 'Editar anotação';
    U.el('#ed-titulo').value = it.titulo;
    U.el('#ed-detalhes').value = it.detalhes;
    U.el('#ed-projeto').value = it.projeto;
    U.el('#ed-prazo').value = it.prazo || '';
    U.el('#ed-tags').value = it.tags.join(' ');
    U.el('#ed-fixado').checked = it.fixado;
    U.el('#datalist-projetos').innerHTML = S.nomesDeProjeto().map(function (n) {
      return '<option value="' + U.escapar(n) + '">';
    }).join('');
    U.el('#ed-meta').textContent = 'Criada em ' + U.dataHoraLegivel(it.criadoEm) +
      ' · alterada em ' + U.dataHoraLegivel(it.atualizadoEm) + (it.feito ? ' · concluída em ' + U.dataHoraLegivel(it.feitoEm) : '');
    abrirModal('#modal-item');
    setTimeout(function () { U.el('#ed-titulo').focus(); }, 30);
  }

  function salvarEditor() {
    var id = vista.editando;
    if (!id) return;
    S.atualizar(id, {
      titulo: U.el('#ed-titulo').value.trim(),
      detalhes: U.el('#ed-detalhes').value,
      projeto: U.el('#ed-projeto').value.trim(),
      prazo: U.el('#ed-prazo').value || '',
      tags: U.el('#ed-tags').value.split(/[\s,]+/).filter(Boolean),
      fixado: U.el('#ed-fixado').checked
    });
    fecharModais();
    U.toast('Salvo');
  }

  /* ---------------- configuração ---------------- */

  function abrirConfig() {
    var c = G.cfg;
    U.el('#cf-owner').value = c.owner || '';
    U.el('#cf-repo').value = c.repo || '';
    U.el('#cf-branch').value = c.branch || 'main';
    U.el('#cf-caminho').value = c.caminho || 'dados/notas.json';
    U.el('#cf-token').value = c.token || '';
    U.el('#cf-espelho').checked = c.espelho !== false;
    U.el('#cf-status').textContent = '';
    U.el('#cf-status').className = 'status-inline';
    U.el('#cf-info').innerHTML = 'Itens guardados: ' + S.vivos().length +
      ' · última sincronia: ' + (G.ultimaSincronia ? U.dataHoraLegivel(G.ultimaSincronia) : 'nunca');
    abrirModal('#modal-config');
  }

  function lerFormularioConfig() {
    return {
      owner: U.el('#cf-owner').value.trim(),
      repo: U.el('#cf-repo').value.trim(),
      branch: U.el('#cf-branch').value.trim() || 'main',
      caminho: U.el('#cf-caminho').value.trim().replace(/^\/+/, '') || 'dados/notas.json',
      token: U.el('#cf-token').value.trim(),
      espelho: U.el('#cf-espelho').checked
    };
  }

  function statusConfig(texto, tipo) {
    var e = U.el('#cf-status');
    e.textContent = texto;
    e.className = 'status-inline' + (tipo ? ' ' + tipo : '');
  }

  function ligarConfig() {
    U.el('#cf-testar').addEventListener('click', function () {
      G.salvarCfg(lerFormularioConfig());
      statusConfig('testando…');
      G.testar().then(function (r) {
        statusConfig('ok: ' + r.repo + ' (' + (r.privado ? 'privado' : 'público') + '), branch ' + r.branch + ', ' + r.permissao, 'ok');
      }).catch(function (e) {
        statusConfig(e.message, 'erro');
      });
    });

    U.el('#cf-salvar').addEventListener('click', function () {
      var antigo = G.cfg.caminho;
      var novo = lerFormularioConfig();
      G.salvarCfg(novo);
      if (antigo !== novo.caminho) G.zerarShas();
      statusConfig('sincronizando…');
      G.sincronizar().then(function (ok) {
        if (ok) {
          statusConfig('sincronizado', 'ok');
          desenhar();
          setTimeout(fecharModais, 700);
        } else {
          statusConfig('não deu — veja a mensagem de erro acima/no aviso', 'erro');
        }
      });
    });

    U.el('#cf-exportar').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(S.dados, null, 1)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'meunotas-' + U.hoje() + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    });

    U.el('#cf-importar').addEventListener('click', function () { U.el('#cf-arquivo').click(); });
    U.el('#cf-arquivo').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (!f) return;
      var leitor = new FileReader();
      leitor.onload = function () {
        try {
          var pacote = JSON.parse(String(leitor.result));
          S.substituir(S.mesclar(S.dados, pacote));
          S.salvar(true);
          statusConfig('importado e mesclado', 'ok');
          desenhar();
        } catch (e) {
          statusConfig('arquivo inválido: ' + e.message, 'erro');
        }
      };
      leitor.readAsText(f);
      ev.target.value = '';
    });

    U.el('#cf-notificar').addEventListener('click', function () {
      if (!('Notification' in window)) { statusConfig('este navegador não avisa', 'erro'); return; }
      Notification.requestPermission().then(function (p) {
        S.prefs.avisos = p === 'granted';
        S.salvarPrefs();
        statusConfig(p === 'granted' ? 'avisos ativados' : 'avisos negados pelo navegador', p === 'granted' ? 'ok' : 'erro');
        if (p === 'granted') avisarPrazos(true);
      });
    });

    // dois cliques para zerar, sem caixa de diálogo do navegador
    var zerar = U.el('#cf-zerar'), armado = false, timerZerar;
    zerar.addEventListener('click', function () {
      if (!armado) {
        armado = true;
        zerar.textContent = 'Clique de novo para apagar tudo daqui';
        timerZerar = setTimeout(function () { armado = false; zerar.textContent = 'Apagar dados locais'; }, 5000);
        return;
      }
      clearTimeout(timerZerar);
      armado = false;
      zerar.textContent = 'Apagar dados locais';
      localStorage.removeItem('meunotas.dados');
      G.zerarShas();
      S.substituir({ v: 1, itens: [], projetos: [] });
      statusConfig('dados locais apagados (o que está no GitHub continua lá)', 'ok');
      desenhar();
    });
  }

  /* ---------------- avisos de prazo ---------------- */

  function avisarPrazos(forcar) {
    if (!S.prefs.avisos || !('Notification' in window) || Notification.permission !== 'granted') return;
    var abertas = S.vivos().filter(function (i) { return !i.feito && i.prazo; });
    var atrasadas = abertas.filter(function (i) { return U.diasAte(i.prazo) < 0; });
    var deHoje = abertas.filter(function (i) { return U.diasAte(i.prazo) === 0; });
    if (!atrasadas.length && !deHoje.length) return;

    var chave = 'meunotas.aviso.' + U.hoje();
    if (!forcar && localStorage.getItem(chave)) return;
    try { localStorage.setItem(chave, '1'); } catch (e) { /* ignora */ }

    var corpo = [];
    if (atrasadas.length) corpo.push(atrasadas.length + ' atrasada(s)');
    if (deHoje.length) corpo.push(deHoje.length + ' para hoje');
    var exemplo = (atrasadas[0] || deHoje[0]);
    new Notification('MeuNotas — ' + corpo.join(' e '), {
      body: exemplo ? '• ' + exemplo.titulo : '',
      icon: 'icone.svg'
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
