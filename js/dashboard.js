/* ═══════════════════════════════════════════════════════
   DASHBOARD INICIAL
═══════════════════════════════════════════════════════ */

var _DASH_ACESSO_RAPIDO = [
  { view: 'clientes', modulo: 'clientes', label: 'Clientes', icon: 'ti-building' },
  { view: 'contratos', modulo: 'comercial', label: 'Contratos', icon: 'ti-file-text' },
  { view: 'chamados-admin', modulo: 'admin', label: 'Chamados', icon: 'ti-headset' },
  { view: 'boletos', modulo: 'financeiro', label: 'Boletos', icon: 'ti-receipt' },
  { view: 'fechamentos', modulo: 'operacional', label: 'Fechamentos', icon: 'ti-calendar-month' },
  { view: 'equipamentos', modulo: 'estoque', label: 'Equipamentos', icon: 'ti-printer' },
  { view: 'fin-dashboard', modulo: 'financeiro', label: 'Financeiro', icon: 'ti-chart-bar' },
  { view: 'prospectos', modulo: 'crm', label: 'CRM', icon: 'ti-users' }
];

// Extrai o array de uma resposta de sf(); se a query falhar, o PostgREST
// devolve um objeto de erro (truthy) em vez de array — "res.data || []" não
// protege contra isso, então usamos essa checagem explícita em todo o painel.
function _dashArr(res) {
  return (res && res.ok && Array.isArray(res.data)) ? res.data : [];
}

async function carregarDashboard() {
  _dashRenderLogo();
  _dashRenderMsgAcesso();
  _dashRenderSaudacao();
  _dashRenderAcessoRapido();

  var wrap = document.getElementById('dash-cards-wrap');
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';

  var hoje = new Date();
  var mesIni = hoje.toISOString().slice(0, 7) + '-01';
  var proxMesIni = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1).toISOString().slice(0, 10);
  var hojeIniISO = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  var [contratosRes, chamadosRes, suprimentoRes, boletosRes, pecasRes, fechRes, chamHojeRes, supHojeRes] = await Promise.all([
    sf('/rest/v1/contratos?select=id&status=eq.ativo'),
    sf('/rest/v1/chamados?select=id,status,status_tecnico&status=not.in.(' + ERP_STATUS_ENCERRADOS.join(',') + ')'),
    sf('/rest/v1/solicitacoes_suprimento?select=id,numero,status&status=not.in.(' + ERP_STATUS_SUPRIMENTO_TERMINAL.join(',') + ')'),
    sf('/rest/v1/boletos?select=id&status=eq.a_vencer'),
    sf('/rest/v1/pecas?select=id,estoque_atual,estoque_minimo&ativo=eq.true'),
    sf('/rest/v1/fechamentos_mensais?select=contrato_id&mes_referencia=gte.' + mesIni + '&mes_referencia=lt.' + proxMesIni),
    // "Total de Chamados" (Bloco H): soma TODOS os tipos abertos HOJE
    // (assistência, suprimento, instalação, desinstalação), independente de
    // status — mesmo critério padrão ("hoje") do modal Painel Analítico.
    sf('/rest/v1/chamados?select=id&created_at=gte.' + hojeIniISO),
    sf('/rest/v1/solicitacoes_suprimento?select=id,numero&created_at=gte.' + hojeIniISO)
  ]);

  var contratosAtivosData = _dashArr(contratosRes);
  var chamadosNaoEncerrados = _dashArr(chamadosRes);
  // Total de Chamados do dia: chamados (qualquer tipo) + pedidos de
  // suprimento distintos (agrupados por numero, mesmo critério do card
  // "Suprimento em Aberto" logo abaixo) criados hoje.
  var totalChamadosHoje = _dashArr(chamHojeRes).length;
  var totalSuprimentoHoje = new Set(_dashArr(supHojeRes).map(function (s) {
    return s.numero != null ? s.numero : s.id;
  })).size;
  var totalGeralHoje = totalChamadosHoje + totalSuprimentoHoje;
  // status_tecnico é a coluna dedicada já usada pelo portal do técnico (repo
  // teffe-site) — 'em_atendimento' confirmado em produção. O mesmo critério
  // é usado no filtro "cham-filtro-status-tecnico" de Admin > Chamados, pra
  // que o card e o destino do clique sempre concordem.
  var emAtendimento = chamadosNaoEncerrados.filter(function (c) {
    return c.status_tecnico === 'em_atendimento';
  }).length;
  // Conta PEDIDOS distintos (numero), não linhas — um pedido pode ter vários
  // itens (várias linhas com o mesmo numero, ver enviarSuprimento() em
  // teffe-site), e a tela Admin > Solicitações de Suprimento também agrupa
  // por numero. Sem isso os dois números nunca batem.
  var suprimentoAberto = new Set(_dashArr(suprimentoRes).map(function (s) {
    return s.numero != null ? s.numero : s.id;
  })).size;
  var boletosAVencer = _dashArr(boletosRes).length;
  var pecasAlerta = _dashArr(pecasRes).filter(function (p) {
    return (p.estoque_atual != null ? p.estoque_atual : 0) <= (p.estoque_minimo || 0);
  }).length;

  var contratosComFechamento = {};
  _dashArr(fechRes).forEach(function (f) { if (f.contrato_id) contratosComFechamento[f.contrato_id] = true; });
  var fechamentosPendentes = contratosAtivosData.filter(function (c) { return !contratosComFechamento[c.id]; }).length;

  var cards = [
    { icon: 'ti-headset', label: 'Total de Chamados', value: totalGeralHoje, click: 'abrirModalTotalChamados()', modulo: 'admin', cor: totalGeralHoje > 0 ? 'laranja' : 'green' },
    { icon: 'ti-package', label: 'Suprimento em Aberto', value: suprimentoAberto, view: 'solicitacoes-suprimento', modulo: 'admin', cor: suprimentoAberto > 0 ? 'laranja' : 'green' },
    { icon: 'ti-car', label: 'Chamados em Atendimento', value: emAtendimento, click: 'irParaChamadosEmAtendimento()', modulo: 'admin', cor: emAtendimento > 0 ? 'azul' : 'green' },
    { icon: 'ti-receipt', label: 'Boletos a vencer', value: boletosAVencer, view: 'boletos', modulo: 'financeiro', cor: 'laranja' },
    { icon: 'ti-alert-triangle', label: 'Itens em alerta no estoque', value: pecasAlerta, view: 'alertas', modulo: 'estoque', cor: pecasAlerta > 0 ? 'red' : 'green' },
    { icon: 'ti-calendar-month', label: 'Fechamentos pendentes', value: fechamentosPendentes, click: 'irParaFechamentosPendentes()', modulo: 'operacional', cor: fechamentosPendentes > 0 ? 'orange' : 'green' }
  ];

  var permitidos = cards.filter(function (c) { return _erpTemPermissao(c.modulo); });

  wrap.innerHTML = permitidos.length ? permitidos.map(function (c) {
    var acao = c.click || ("erpShowView('" + c.view + "')");
    return '<div class="dash-card" onclick="' + acao + '">' +
      '<div class="dash-card-ico ' + c.cor + '"><i class="ti ' + c.icon + '"></i></div>' +
      '<div><div class="dash-card-value">' + c.value + '</div><div class="dash-card-label">' + c.label + '</div></div>' +
      '</div>';
  }).join('') : '<div class="tbl-empty">Nenhum indicador disponível para o seu perfil de acesso.</div>';
}

var _dashLogoRenderizado = false;
function _dashRenderLogo() {
  if (_dashLogoRenderizado) return;
  var el = document.getElementById('dash-logo-wrap');
  if (!el) return;
  el.innerHTML = _TEFFE_SVG;
  _dashLogoRenderizado = true;
}

function _dashRenderMsgAcesso() {
  var el = document.getElementById('dash-msg-acesso');
  if (!el) return;
  if (_erpMsgAcesso) {
    document.getElementById('dash-msg-acesso-texto').textContent = _erpMsgAcesso;
    el.style.display = 'flex';
    _erpMsgAcesso = null;
  } else {
    el.style.display = 'none';
  }
}

function _dashRenderSaudacao() {
  var el = document.getElementById('dash-saudacao');
  if (!el) return;
  var nome = (_erpPerfil && _erpPerfil.nome) || _erpNome || 'usuário';
  var agora = new Date();
  var dataFmt = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  var horaFmt = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  el.innerHTML = '<h1>Olá, ' + _esc(nome) + '! Bem-vindo ao sistema Teffe Tecnologia.</h1>' +
    '<p>' + _esc(dataFmt.charAt(0).toUpperCase() + dataFmt.slice(1)) + ' às ' + horaFmt + '</p>';
}

function _dashRenderAcessoRapido() {
  var wrap = document.getElementById('dash-acesso-rapido');
  if (!wrap) return;
  var permitidos = _DASH_ACESSO_RAPIDO.filter(function (i) { return _erpTemPermissao(i.modulo); });
  wrap.innerHTML = permitidos.length ? permitidos.map(function (i) {
    return '<button class="dash-mod-card" onclick="erpShowView(\'' + i.view + '\')">' +
      '<i class="ti ' + i.icon + '"></i><span>' + i.label + '</span>' +
      '</button>';
  }).join('') : '<div class="tbl-empty">Nenhum módulo disponível para o seu perfil de acesso.</div>';
}
