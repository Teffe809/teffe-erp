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

  var [clientesRes, contratosRes, chamadosRes, boletosRes, pecasRes, fechRes] = await Promise.all([
    sf('/rest/v1/clientes?select=id&ativo=eq.true'),
    sf('/rest/v1/contratos?select=id&status=eq.ativo'),
    sf('/rest/v1/chamados?select=id&status=eq.aberto'),
    sf('/rest/v1/boletos?select=id&status=eq.a_vencer'),
    sf('/rest/v1/pecas?select=id,estoque_atual,estoque_minimo&ativo=eq.true'),
    sf('/rest/v1/fechamentos_mensais?select=contrato_id&mes_referencia=gte.' + mesIni + '&mes_referencia=lt.' + proxMesIni)
  ]);

  var clientesAtivos = (clientesRes.data || []).length;
  var contratosAtivosData = contratosRes.data || [];
  var contratosAtivos = contratosAtivosData.length;
  var chamadosAbertos = (chamadosRes.data || []).length;
  var boletosAVencer = (boletosRes.data || []).length;
  var pecasAlerta = (pecasRes.data || []).filter(function (p) {
    return (p.estoque_atual != null ? p.estoque_atual : 0) <= (p.estoque_minimo || 0);
  }).length;

  var contratosComFechamento = {};
  (fechRes.data || []).forEach(function (f) { if (f.contrato_id) contratosComFechamento[f.contrato_id] = true; });
  var fechamentosPendentes = contratosAtivosData.filter(function (c) { return !contratosComFechamento[c.id]; }).length;

  var cards = [
    { icon: 'ti-users', label: 'Clientes ativos', value: clientesAtivos, view: 'clientes', modulo: 'clientes', cor: 'azul' },
    { icon: 'ti-file-text', label: 'Contratos ativos', value: contratosAtivos, view: 'contratos', modulo: 'comercial', cor: 'azul' },
    { icon: 'ti-headset', label: 'Chamados abertos', value: chamadosAbertos, view: 'chamados-admin', modulo: 'admin', cor: chamadosAbertos > 0 ? 'laranja' : 'green' },
    { icon: 'ti-receipt', label: 'Boletos a vencer', value: boletosAVencer, view: 'boletos', modulo: 'financeiro', cor: 'laranja' },
    { icon: 'ti-alert-triangle', label: 'Itens em alerta no estoque', value: pecasAlerta, view: 'alertas', modulo: 'estoque', cor: pecasAlerta > 0 ? 'red' : 'green' },
    { icon: 'ti-calendar-month', label: 'Fechamentos pendentes', value: fechamentosPendentes, view: 'fechamentos', modulo: 'operacional', cor: fechamentosPendentes > 0 ? 'orange' : 'green' }
  ];

  var permitidos = cards.filter(function (c) { return _erpTemPermissao(c.modulo); });

  wrap.innerHTML = permitidos.length ? permitidos.map(function (c) {
    return '<div class="dash-card" onclick="erpShowView(\'' + c.view + '\')">' +
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
