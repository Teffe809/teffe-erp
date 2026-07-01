/* ═══════════════════════════════════════════════════════
   ANÁLISE DE CHAMADOS — modal "Total de Chamados" (painel com Chart.js)
═══════════════════════════════════════════════════════ */

var _tcCharts = {}; // instâncias Chart.js ativas, para destruir ao reabrir o modal

async function abrirModalTotalChamados() {
  document.getElementById('modal-total-chamados').classList.add('open');
  document.getElementById('tc-loading').style.display = 'block';
  document.getElementById('tc-conteudo').style.display = 'none';

  var [chamRes, suprRes] = await Promise.all([
    sf('/rest/v1/chamados?select=id,status,tipo_chamado,pecas_status,created_at'),
    sf('/rest/v1/solicitacoes_suprimento?select=id,status')
  ]);

  var chamados = chamRes.data || [];
  var suprimentos = suprRes.data || [];

  var naoEncerrados = chamados.filter(function (c) { return ERP_STATUS_ENCERRADOS.indexOf(c.status) === -1; });
  var emAtendimento = naoEncerrados.filter(function (c) { return c.status === 'em_atendimento'; }).length;
  var emDeslocamento = naoEncerrados.filter(function (c) { return c.status === 'em_deslocamento'; }).length;

  var suprimentoAberto = suprimentos.filter(function (s) { return ERP_STATUS_SUPRIMENTO_TERMINAL.indexOf(s.status) === -1; }).length;
  var suprimentoFaturado = suprimentos.filter(function (s) { return s.status === 'faturado'; }).length;

  var dentroSla = 0, foraSla = 0;
  naoEncerrados.forEach(function (c) { if (_slaChamadoDentro(c)) dentroSla++; else foraSla++; });

  _tcRenderKpis({
    total: naoEncerrados.length,
    emAtendimento: emAtendimento,
    emDeslocamento: emDeslocamento,
    suprimentoAberto: suprimentoAberto,
    suprimentoFaturado: suprimentoFaturado
  });

  _tcRenderGraficos(chamados, dentroSla, foraSla);

  document.getElementById('tc-loading').style.display = 'none';
  document.getElementById('tc-conteudo').style.display = 'block';
}

function _tcRenderKpis(v) {
  var wrap = document.getElementById('tc-kpi-grid');
  var itens = [
    { label: 'Total Não Encerrados', value: v.total },
    { label: 'Em Atendimento', value: v.emAtendimento },
    { label: 'Em Deslocamento', value: v.emDeslocamento },
    { label: 'Suprimento em Aberto', value: v.suprimentoAberto },
    { label: 'Suprimento Faturado', value: v.suprimentoFaturado }
  ];
  wrap.innerHTML = itens.map(function (i) {
    return '<div class="tc-kpi-card"><div class="tc-kpi-value">' + i.value + '</div><div class="tc-kpi-label">' + i.label + '</div></div>';
  }).join('');
}

var _TC_STATUS_ORDEM = ['aberto', 'em_deslocamento', 'em_atendimento', 'andamento', 'encerrado', 'concluido', 'resolvido'];
var _TC_STATUS_LABEL = { aberto: 'Aberto', em_deslocamento: 'Em Deslocamento', em_atendimento: 'Em Atendimento', andamento: 'Andamento', encerrado: 'Encerrado', concluido: 'Concluído', resolvido: 'Resolvido' };

function _tcContarPorStatus(lista, tipo) {
  var filtrados = lista.filter(function (c) { return c.tipo_chamado === tipo; });
  var contagem = {};
  filtrados.forEach(function (c) { contagem[c.status] = (contagem[c.status] || 0) + 1; });
  var presentes = _TC_STATUS_ORDEM.filter(function (s) { return contagem[s]; });
  return {
    labels: presentes.length ? presentes.map(function (s) { return _TC_STATUS_LABEL[s] || s; }) : ['Sem dados'],
    data: presentes.length ? presentes.map(function (s) { return contagem[s]; }) : [0]
  };
}

function _tcCor(nomeVar) {
  return getComputedStyle(document.documentElement).getPropertyValue(nomeVar).trim();
}

function _tcDestruirGrafico(id) {
  if (_tcCharts[id]) { _tcCharts[id].destroy(); delete _tcCharts[id]; }
}

function _tcRenderGraficos(chamados, dentroSla, foraSla) {
  var azul = _tcCor('--azul'), verde = _tcCor('--green'), vermelho = _tcCor('--red');

  var wrap = document.getElementById('tc-chart-grid');
  wrap.innerHTML =
    '<div class="tc-chart-card"><div class="tc-chart-title">Assistência por Status</div><canvas id="tc-chart-assistencia"></canvas></div>' +
    '<div class="tc-chart-card"><div class="tc-chart-title">Instalação por Status</div><canvas id="tc-chart-instalacao"></canvas></div>' +
    '<div class="tc-chart-card"><div class="tc-chart-title">Desinstalação por Status</div><canvas id="tc-chart-desinstalacao"></canvas></div>' +
    '<div class="tc-chart-card"><div class="tc-chart-title">Dentro do SLA × Fora do SLA</div><canvas id="tc-chart-sla"></canvas></div>';

  ['assistencia', 'instalacao', 'desinstalacao'].forEach(function (tipo) {
    var id = 'tc-chart-' + tipo;
    _tcDestruirGrafico(id);
    var agg = _tcContarPorStatus(chamados, tipo);
    var ctx = document.getElementById(id).getContext('2d');
    _tcCharts[id] = new Chart(ctx, {
      type: 'bar',
      data: { labels: agg.labels, datasets: [{ label: 'Chamados', data: agg.data, backgroundColor: azul, borderRadius: 4, maxBarThickness: 46 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  });

  _tcDestruirGrafico('tc-chart-sla');
  var ctxSla = document.getElementById('tc-chart-sla').getContext('2d');
  _tcCharts['tc-chart-sla'] = new Chart(ctxSla, {
    type: 'doughnut',
    data: { labels: ['Dentro do SLA', 'Fora do SLA'], datasets: [{ data: [dentroSla, foraSla], backgroundColor: [verde, vermelho] }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

/* ── SLA: 8h corridas em horário comercial (08h–18h, seg–sex), pausando
   enquanto o chamado estiver aguardando peças (pecas_status pendente) ── */

function _slaBusinessMsElapsed(start, end) {
  var BUSINESS_START_H = 8, BUSINESS_END_H = 18;
  var cursor = new Date(start);
  var endTime = new Date(end);
  if (endTime <= cursor) return 0;

  var ms = 0;
  var diasMax = 400; // trava de segurança contra dados inválidos
  while (cursor < endTime && diasMax-- > 0) {
    var dia = cursor.getDay(); // 0=domingo, 6=sábado
    var dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), BUSINESS_START_H, 0, 0, 0);
    var dayEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), BUSINESS_END_H, 0, 0, 0);
    if (dia !== 0 && dia !== 6) {
      var segStart = cursor > dayStart ? cursor : dayStart;
      var segEnd = endTime < dayEnd ? endTime : dayEnd;
      if (segStart < segEnd) ms += (segEnd - segStart);
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 0, 0, 0, 0);
  }
  return ms;
}

function _slaChamadoDentro(chamado) {
  if (!chamado.created_at) return true;
  var aguardandoPecas = ['solicitado', 'faturado', 'despachado'].indexOf(chamado.pecas_status) !== -1;
  if (aguardandoPecas) return true; // SLA pausado enquanto aguarda peças
  var LIMITE_MS = 8 * 60 * 60 * 1000;
  var decorridoMs = _slaBusinessMsElapsed(chamado.created_at, new Date());
  return decorridoMs <= LIMITE_MS;
}
