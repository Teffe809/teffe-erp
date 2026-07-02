/* ═══════════════════════════════════════════════════════
   ANÁLISE DE CHAMADOS — modal "Total de Chamados" (painel com Chart.js)
═══════════════════════════════════════════════════════ */

var _tcCharts = {}; // instâncias Chart.js ativas, para destruir ao reabrir o modal

// Extrai o array de uma resposta de sf(); se a query falhar (coluna/tabela
// inexistente, RLS, CDN do Chart.js fora do ar etc.) o PostgREST devolve um
// objeto de erro em vez de array — sem essa checagem, um .filter()/.map()
// nesse objeto quebra silenciosamente e trava o modal em "Carregando..."
// para sempre. Mesmo padrão de js/vinculo-modelo.js (_vmDataOuErro).
function _tcDataOuErro(res, nomeConsulta) {
  if (res && res.ok && Array.isArray(res.data)) return res.data;
  var msg = (res && res.data && res.data.message) ? res.data.message : ('Falha ao consultar ' + nomeConsulta + '.');
  throw new Error(msg);
}

// Lê o filtro de período direto do DOM (sem estado JS paralelo) — por padrão
// mostra todos os chamados/suprimentos criados HOJE, qualquer status.
function _tcCalcularPeriodo() {
  var periodoSel = document.getElementById('tc-periodo');
  var periodo = periodoSel ? periodoSel.value : 'hoje';
  var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  var inicio, fim = new Date();

  if (periodo === 'personalizado') {
    var deStr = (document.getElementById('tc-data-de') || {}).value;
    var ateStr = (document.getElementById('tc-data-ate') || {}).value;
    inicio = deStr ? new Date(deStr + 'T00:00:00') : hoje;
    fim = ateStr ? new Date(ateStr + 'T23:59:59.999') : fim;
  } else if (periodo === '7dias') {
    inicio = new Date(hoje); inicio.setDate(inicio.getDate() - 6);
  } else if (periodo === '30dias') {
    inicio = new Date(hoje); inicio.setDate(inicio.getDate() - 29);
  } else { // hoje
    inicio = hoje;
  }
  return { inicio: inicio, fim: fim };
}

function tcMudarPeriodo() {
  var periodo = document.getElementById('tc-periodo').value;
  var customWrap = document.getElementById('tc-periodo-custom');
  if (customWrap) customWrap.style.display = periodo === 'personalizado' ? 'flex' : 'none';
  if (periodo === 'personalizado') {
    var de = document.getElementById('tc-data-de').value;
    var ate = document.getElementById('tc-data-ate').value;
    if (!de || !ate) return; // aguarda as duas datas antes de recarregar
  }
  abrirModalTotalChamados();
}

async function abrirModalTotalChamados() {
  document.getElementById('modal-total-chamados').classList.add('open');
  document.getElementById('tc-loading').style.display = 'block';
  document.getElementById('tc-loading').textContent = 'Carregando...';
  document.getElementById('tc-conteudo').style.display = 'none';

  var periodo = _tcCalcularPeriodo();
  var inicioISO = periodo.inicio.toISOString();
  var fimISO = periodo.fim.toISOString();

  try {
    var resultados = await Promise.all([
      sf('/rest/v1/chamados?select=id,status,status_tecnico,tipo_chamado,tipo_servico,pecas_status,created_at,data_abertura,sla_pausado,sla_pausa_inicio,sla_tempo_pausado&created_at=gte.' + inicioISO + '&created_at=lte.' + fimISO),
      sf('/rest/v1/solicitacoes_suprimento?select=id,status,created_at&created_at=gte.' + inicioISO + '&created_at=lte.' + fimISO)
    ]);

    var chamados = _tcDataOuErro(resultados[0], 'chamados');
    var suprimentos = _tcDataOuErro(resultados[1], 'solicitacoes_suprimento');

    // Dentro/Fora do SLA só faz sentido para chamados ainda não encerrados.
    var naoEncerrados = chamados.filter(function (c) { return ERP_STATUS_ENCERRADOS.indexOf(c.status) === -1; });
    // em_atendimento/em_deslocamento vivem em status_tecnico (coluna dedicada já
    // usada pelo portal do técnico — repo teffe-site), não na coluna status geral.
    var emAtendimento = naoEncerrados.filter(function (c) { return c.status_tecnico === 'em_atendimento'; }).length;
    var emDeslocamento = naoEncerrados.filter(function (c) { return c.status_tecnico === 'em_deslocamento'; }).length;

    var suprimentoAberto = suprimentos.filter(function (s) { return ERP_STATUS_SUPRIMENTO_TERMINAL.indexOf(s.status) === -1; }).length;
    var suprimentoFaturado = suprimentos.filter(function (s) { return s.status === 'faturado'; }).length;

    var dentroSla = 0, foraSla = 0;
    naoEncerrados.forEach(function (c) { if (_slaChamadoDentro(c)) dentroSla++; else foraSla++; });

    _tcRenderKpis({
      total: chamados.length, // todos os status no período selecionado
      emAtendimento: emAtendimento,
      emDeslocamento: emDeslocamento,
      suprimentoAberto: suprimentoAberto,
      suprimentoFaturado: suprimentoFaturado
    });

    _tcRenderGraficos(chamados, dentroSla, foraSla);

    document.getElementById('tc-loading').style.display = 'none';
    document.getElementById('tc-conteudo').style.display = 'block';
  } catch (err) {
    console.error('[abrirModalTotalChamados]', err);
    document.getElementById('tc-loading').textContent = 'Erro ao carregar: ' + err.message;
    document.getElementById('tc-conteudo').style.display = 'none';
  }
}

function _tcRenderKpis(v) {
  var wrap = document.getElementById('tc-kpi-grid');
  var itens = [
    { label: 'Total no Período', value: v.total },
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

  if (typeof Chart === 'undefined') {
    wrap.innerHTML = '<div class="tbl-empty">Não foi possível carregar a biblioteca de gráficos (Chart.js). Verifique sua conexão e recarregue a página.</div>';
    return;
  }

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
// Prazo padrão: 12h úteis (720min) — antes 8h (480min).
var TC_SLA_MINUTOS_POR_TIPO = {
  corretiva: 720, assistencia: 720, instalacao: 720, desinstalacao: 720, troca_pecas: 720, troca_de_pecas: 720,
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
  var limiteMin = TC_SLA_MINUTOS_POR_TIPO[tipo] || 720;
  var pausadoMin = chamado.sla_tempo_pausado || 0;
  if (chamado.sla_pausado && chamado.sla_pausa_inicio) {
    pausadoMin += Math.floor((new Date() - new Date(chamado.sla_pausa_inicio)) / 60000);
  }
  var decorridoMin = _slaMinutosUteis(abertura, pausadoMin);
  return decorridoMin <= limiteMin;
}
