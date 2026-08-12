/* ===== MeuNotas — interpretação da barra de captura =====
   Sintaxe:  texto  %area  #projeto  +tipo  @tag  !prazo  *  :: detalhes
*/
var P = (function () {
  'use strict';

  var SEMANA = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };

  /** apelidos digitáveis para os tipos de anotação */
  var APELIDOS_TIPO = {
    tarefa: 'tarefa', tarefas: 'tarefa', task: 'tarefa', fazer: 'tarefa',
    nota: 'nota', notas: 'nota', anotacao: 'nota', info: 'nota',
    ideia: 'ideia', ideias: 'ideia', idea: 'ideia',
    lembrete: 'lembrete', lembrar: 'lembrete', lembra: 'lembrete', alarme: 'lembrete'
  };

  function interpretarTipo(bruto) {
    var t = U.normalizar(bruto).trim();
    return APELIDOS_TIPO[t] || null;
  }

  /** próxima ocorrência do dia da semana (hoje conta) */
  function proximoDiaSemana(alvo) {
    var d = U.textoParaData(U.hoje());
    var delta = (alvo - d.getDay() + 7) % 7;
    return U.somaDias(U.hoje(), delta);
  }

  /** '!token' -> 'YYYY-MM-DD' ou null */
  function interpretarPrazo(bruto) {
    var t = U.normalizar(bruto).trim();
    if (!t) return null;

    if (t === 'hoje' || t === 'hj') return U.hoje();
    if (t === 'amanha' || t === 'am') return U.somaDias(U.hoje(), 1);
    if (t === 'depois') return U.somaDias(U.hoje(), 2);
    if (t === 'ontem') return U.somaDias(U.hoje(), -1);

    var abrev = t.slice(0, 3);
    if (SEMANA.hasOwnProperty(abrev) && t.length <= 8) return proximoDiaSemana(SEMANA[abrev]);

    // 3d = em 3 dias | 2s = em 2 semanas | 1m = em 1 mês
    var rel = t.match(/^(\d{1,3})([dsm])$/);
    if (rel) {
      var n = Number(rel[1]);
      if (rel[2] === 'd') return U.somaDias(U.hoje(), n);
      if (rel[2] === 's') return U.somaDias(U.hoje(), n * 7);
      var d = U.textoParaData(U.hoje());
      d.setMonth(d.getMonth() + n);
      return U.dataParaTexto(d);
    }

    // 12/03 | 12/03/2026 | 12-03 | 12.03
    var dm = t.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
    if (dm) {
      var dia = Number(dm[1]), mes = Number(dm[2]) - 1;
      var ano = dm[3] ? Number(dm[3]) : new Date().getFullYear();
      if (ano < 100) ano += 2000;
      var alvo = new Date(ano, mes, dia);
      if (isNaN(alvo) || alvo.getMonth() !== mes || alvo.getDate() !== dia) return null;
      // sem ano informado e data já passou -> assume ano que vem
      if (!dm[3] && U.dataParaTexto(alvo) < U.hoje()) alvo.setFullYear(ano + 1);
      return U.dataParaTexto(alvo);
    }

    // 2026-03-12
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

    // só o dia do mês: 15 -> dia 15 deste mês (ou do próximo, se já passou)
    var soDia = t.match(/^(\d{1,2})$/);
    if (soDia) {
      var hj = U.textoParaData(U.hoje());
      var cand = new Date(hj.getFullYear(), hj.getMonth(), Number(soDia[1]));
      if (cand.getDate() !== Number(soDia[1])) return null;
      if (U.dataParaTexto(cand) < U.hoje()) cand.setMonth(cand.getMonth() + 1);
      return U.dataParaTexto(cand);
    }

    return null;
  }

  /** interpreta a linha digitada */
  function interpretar(linha) {
    var texto = String(linha || '');
    var detalhes = '';

    var corte = texto.indexOf('::');
    if (corte >= 0) {
      detalhes = texto.slice(corte + 2).trim();
      texto = texto.slice(0, corte);
    }

    var area = '', projeto = '', tipo = '', tags = [], prazo = '', fixado = false, sobrou = [];

    texto.split(/\s+/).forEach(function (tk) {
      if (!tk) return;
      if (tk === '*') { fixado = true; return; }
      if (tk.charAt(0) === '%' && tk.length > 1) { area = tk.slice(1).replace(/[_]+/g, ' ').trim(); return; }
      if (tk.charAt(0) === '#' && tk.length > 1) { projeto = tk.slice(1).replace(/[_]+/g, ' ').trim(); return; }
      if (tk.charAt(0) === '@' && tk.length > 1) { tags.push(tk.slice(1)); return; }
      if (tk.charAt(0) === '+' && tk.length > 1) {
        var t = interpretarTipo(tk.slice(1));
        if (t) { tipo = t; return; }
      }
      if (tk.charAt(0) === '!' && tk.length > 1) {
        var p = interpretarPrazo(tk.slice(1));
        if (p) { prazo = p; return; }
      }
      sobrou.push(tk);
    });

    var titulo = sobrou.join(' ').trim();
    if (titulo.charAt(0) === '*') { fixado = true; titulo = titulo.slice(1).trim(); }

    return {
      titulo: titulo, detalhes: detalhes, area: area, projeto: projeto,
      tipo: tipo, tags: tags, prazo: prazo, fixado: fixado
    };
  }

  /** resumo do que foi entendido, para mostrar embaixo da barra */
  function previa(linha) {
    if (!String(linha || '').trim()) return '';
    var r = interpretar(linha);
    var partes = [];
    if (r.area) partes.push('área <b>' + U.escapar(r.area) + '</b>');
    if (r.tipo) partes.push('tipo <b>' + U.escapar(S.tipoPorId(r.tipo).rotulo) + '</b>');
    if (r.projeto) partes.push('projeto <b>' + U.escapar(r.projeto) + '</b>');
    if (r.prazo) partes.push('prazo <b>' + U.prazoLegivel(r.prazo) + '</b> (' + r.prazo.split('-').reverse().join('/') + ')');
    if (r.tags.length) partes.push('tags <b>' + U.escapar(r.tags.join(', ')) + '</b>');
    if (r.fixado) partes.push('<b>fixada</b>');
    if (r.detalhes) partes.push('com detalhes');
    if (!partes.length) return '';
    return '↳ ' + partes.join(' · ');
  }

  return {
    interpretar: interpretar, interpretarPrazo: interpretarPrazo,
    interpretarTipo: interpretarTipo, previa: previa
  };
})();
