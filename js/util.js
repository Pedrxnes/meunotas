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

  /* ---------- cores ---------- */

  /** só aceita #rgb / #rrggbb; devolve '' quando não serve (dado velho, lixo, vazio) */
  function corValida(cor) {
    var s = String(cor == null ? '' : cor).trim();
    if (/^#[0-9a-f]{3}$/i.test(s)) return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
    return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : '';
  }

  function doisDigitos(n) {
    var h = Math.max(0, Math.min(255, Math.round(n))).toString(16);
    return h.length === 1 ? '0' + h : h;
  }

  function hslParaHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s = s / 100; l = l / 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = l - c / 2;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return '#' + doisDigitos((r + m) * 255) + doisDigitos((g + m) * 255) + doisDigitos((b + m) * 255);
  }

  /** cor automática, estável a partir do nome — usada enquanto ninguém escolheu uma */
  function corDoNome(nome) {
    var h = 0, s = normalizar(nome);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return hslParaHex(h, 65, 58);
  }

  function paraRgb(cor) {
    var hex = corValida(cor);
    if (!hex) return [111, 119, 137];
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }

  function corComAlfa(cor, a) {
    var c = paraRgb(cor);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  function escurecer(cor, fator) {
    var c = paraRgb(cor);
    return '#' + doisDigitos(c[0] * (1 - fator)) + doisDigitos(c[1] * (1 - fator)) + doisDigitos(c[2] * (1 - fator));
  }

  /** preto ou branco — o que se lê melhor por cima da cor escolhida */
  function contrasteDe(cor) {
    var c = paraRgb(cor).map(function (v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    var lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return lum > 0.42 ? '#12141a' : '#ffffff';
  }

  /** hex -> [h, s, l] */
  function paraHsl(cor) {
    var c = paraRgb(cor).map(function (v) { return v / 255; });
    var max = Math.max(c[0], c[1], c[2]), min = Math.min(c[0], c[1], c[2]);
    var l = (max + min) / 2, h = 0, s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === c[0]) h = (c[1] - c[2]) / d + (c[1] < c[2] ? 6 : 0);
      else if (max === c[1]) h = (c[2] - c[0]) / d + 2;
      else h = (c[0] - c[1]) / d + 4;
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }

  /** o tema em uso agora — as cores derivadas mudam com ele */
  function temaEscuro() {
    return document.documentElement.getAttribute('data-tema') !== 'claro';
  }

  /**
   * a mesma cor, com o brilho ajustado para se ler por cima do fundo do tema.
   * é o que deixa a cor do projeto discreta em vez de um bloco chapado.
   */
  function corLegivel(cor) {
    var hsl = paraHsl(cor);
    var s = Math.min(hsl[1], 78);
    var l = temaEscuro() ? Math.max(hsl[2], 68) : Math.min(hsl[2], 38);
    return hslParaHex(hsl[0], s, l);
  }

  /** fundo bem leve na cor do projeto — a marca de cor que sobrou depois de tirar a faixa */
  function corDeFundo(cor) {
    return corComAlfa(cor, temaEscuro() ? 0.18 : 0.12);
  }

  function tamanhoLegivel(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1048576).toFixed(1).replace('.', ',') + ' MB';
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
    escapar: escapar, normalizar: normalizar, dobrar: dobrar, debounce: debounce,
    corDoNome: corDoNome, corValida: corValida, hslParaHex: hslParaHex,
    corComAlfa: corComAlfa, escurecer: escurecer, contrasteDe: contrasteDe,
    paraHsl: paraHsl, corLegivel: corLegivel, corDeFundo: corDeFundo,
    temaEscuro: temaEscuro, tamanhoLegivel: tamanhoLegivel,
    paraBase64: paraBase64, deBase64: deBase64, el: el, els: els, toast: toast,
    DIAS_SEMANA: DIAS_SEMANA
  };
})();
