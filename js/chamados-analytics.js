/* ═══════════════════════════════════════════════════════
   ANÁLISE DE CHAMADOS — modal "Total de Chamados" (painel com Chart.js)
═══════════════════════════════════════════════════════ */

var _tcCharts = {}; // instâncias Chart.js ativas, para destruir ao reabrir o modal

async function abrirModalTotalChamados() {
  document.getElementById('modal-total-chamados').classList.add('open');
  document.getElementById('tc-loading').style.display = 'block';
  document.getElementById('tc-conteudo').style.display = 'none';

  var [chamRes, suprRes] = await Promise.all([
    sf('/rest/v1/chamados?select=id,status,status_tecnico,tipo_chamado,tipo_servico,pecas_status,created_at,data_abertura,sla_pausado,sla_pausa_inicio,sla_tempo_pausado'),
    sf('/rest/v1/solicitacoes_suprimento?select=id,status')
  ]);

  var chamados = chamRes.data || [];
  var suprimentos = suprRes.data || [];

  var naoEncerrados = chamados.filter(function (c) { return ERP_STATUS_ENCERRADOS.indexOf(c.status) === -1; });
  // em_atendimento/em_deslocamento vivem em status_tecnico (coluna dedicada já usada
  // pelo portal do técnico — repo teffe-site), não na coluna status geral do chamado.
  var emAtendimento = naoEncerrados.filter(function (c) { return c.status_tecnico === 'em_atendimento'; }).length;
  var emDeslocamento = naoEncerrados.filter(function (c) { return c.status_tecnico === 'em_deslocamento'; }).length;

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

var _TC_STATUS_ORDEM = ['aberto', 'andamento', 'encerrado', 'concluido', 'resolvido'];
var _TC_STATUS_LABEL = { aberto: 'Aberto', andamento: 'Andamento', encerrado: 'Encerrado', concluido: 'Concluído', resolvido: 'Resolvido' };

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

/* ── SLA: portado de calcularSLAUtil (repo teffe-site/js/supabase.js), a mesma
   lógica que o portal do técnico já usa — 08h-12h e 13h-18h, seg-sex, com pausa
   real via sla_pausado/sla_pausa_inicio/sla_tempo_pausado (minutos acumulados). ── */

// Minutos de SLA por tipo, mesmo mapa (TEC_SLA_MAP) do portal do técnico.
var TC_SLA_MINUTOS_POR_TIPO = {
  corretiva: 480, assistencia: 480, instalacao: 480, desinstalacao: 480, troca_pecas: 480, troca_de_pecas: 480,
  manutencao: 1440, manutencao_preventiva: 1440, vistoria: 1440, visita_tecnica: 1440
};

function _slaMinutosUteis(dataAbertura, minutosPausados) {
  var IM = 8 * 60, FM = 12 * 60, IT = 13 * 60, FT = 18 * 60;
  var total = 0;
  var cur = new Date(dataAbertura);
  var agora = new Date();
  if (cur >= agora) return 0;

  var iter = 100000; // trava de segurança contra dados inválidos
  while (cur < agora && iter-- > 0) {
    var dia = cur.getDay();
    if (dia === 0) { var n = new Date(cur); n.setDate(n.getDate() + 1); n.setHours(8, 0, 0, 0); cur = n; continue; }
    if (dia === 6) { var n2 = new Date(cur); n2.setDate(n2.getDate() + 2); n2.setHours(8, 0, 0, 0); cur = n2; continue; }
    var md = cur.getHours() * 60 + cur.getMinutes();
    if (md < IM) { cur = new Date(cur); cur.setHours(8, 0, 0, 0); continue; }
    if (md >= FM && md < IT) { cur = new Date(cur); cur.setHours(13, 0, 0, 0); continue; }
    if (md >= FT) { var n3 = new Date(cur); n3.setDate(n3.getDate() + 1); n3.setHours(8, 0, 0, 0); cur = n3; continue; }
    var segEnd = new Date(cur);
    if (md < FM) segEnd.setHours(12, 0, 0, 0); else segEnd.setHours(18, 0, 0, 0);
    var end = segEnd < agora ? segEnd : agora;
    total += (end - cur) / 60000;
    cur = end;
    if (end < segEnd) break;
    if (cur.getHours() === 12) cur.setHours(13, 0, 0, 0);
    else { var n4 = new Date(cur); n4.setDate(n4.getDate() + 1); n4.setHours(8, 0, 0, 0); cur = n4; }
  }
  return Math.max(0, Math.floor(total) - (minutosPausados || 0));
}

function _slaChamadoDentro(chamado) {
  var abertura = chamado.data_abertura || chamado.created_at;
  if (!abertura) return true;
  var tipo = chamado.tipo_servico || chamado.tipo_chamado || '';
  var limiteMin = TC_SLA_MINUTOS_POR_TIPO[tipo] || 480;
  var pausadoMin = chamado.sla_tempo_pausado || 0;
  if (chamado.sla_pausado && chamado.sla_pausa_inicio) {
    pausadoMin += Math.floor((new Date() - new Date(chamado.sla_pausa_inicio)) / 60000);
  }
  var decorridoMin = _slaMinutosUteis(abertura, pausadoMin);
  return decorridoMin <= limiteMin;
}
