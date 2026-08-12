/* ===== MeuNotas — utilidades ===== */
var U = (function () {
  'use strict';

  function id() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function agora() { return new Date().toISOString(); }

  /* --- datas em texto local YYYY-MM-DD (sem fuso, sem surpresa) --- */
  function dataParaTexto(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dia = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + dia;
  }
  function hoje() { return dataParaTexto(new Date()); }
  function textoParaData(t) {
    var p = String(t).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function somaDias(t, n) {
    var d = textoParaData(t);
    d.setDate(d.getDate() + n);
    return dataParaTexto(d);
  }
  /** dias entre hoje e a data (negativo = passado) */
  function diasAte(t) {
    if (!t) return null;
    return Math.round((textoParaData(t) - textoParaData(hoje())) / 86400000);
  }

  var DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  function prazoLegivel(t) {
    var n = diasAte(t);
    if (n === null) return '';
    if (n === 0) return 'hoje';
    if (n === 1) return 'amanhã';
    if (n === -1) return 'ontem';
    if (n < 0) return Math.abs(n) + ' dias atrás';
    if (n <= 6) return DIAS_SEMANA[textoParaData(t).getDay()];
    var d = textoParaData(t);
    return d.getDate() + ' ' + MESES[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
  }

  function dataHoraLegivel(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function escapar(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** remove acento e caixa, para busca tolerante */
  function normalizar(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  /** versão sem acento e minúscula preservando o tamanho (para realçar trechos) */
  function dobrar(s) {
    var texto = String(s == null ? '' : s), saida = '';
    for (var i = 0; i < texto.length; i++) {
      var ch = texto[i];
      var base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      saida += (base.length === 1 ? base : ch).toLowerCase();
    }
    return saida;
  }

  /** cor estável a partir do nome do projeto */
  function corDoNome(nome) {
    var h = 0, s = normalizar(nome);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return 'hsl(' + h + ' 65% 58%)';
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /** base64 <-> texto, seguro para acentos/emoji */
  function paraBase64(texto) {
    var bytes = new TextEncoder().encode(texto), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function deBase64(b64) {
    var bin = atob(String(b64).replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function el(sel) { return document.querySelector(sel); }
  function els(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  var timerToast;
  function toast(msg, ms) {
    var t = el('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(timerToast);
    timerToast = setTimeout(function () { t.hidden = true; }, ms || 2600);
  }

  return {
    id: id, agora: agora, hoje: hoje, dataParaTexto: dataParaTexto, textoParaData: textoParaData,
    somaDias: somaDias, diasAte: diasAte, prazoLegivel: prazoLegivel, dataHoraLegivel: dataHoraLegivel,
    escapar: escapar, normalizar: normalizar, dobrar: dobrar, corDoNome: corDoNome, debounce: debounce,
    paraBase64: paraBase64, deBase64: deBase64, el: el, els: els, toast: toast,
    DIAS_SEMANA: DIAS_SEMANA
  };
})();
