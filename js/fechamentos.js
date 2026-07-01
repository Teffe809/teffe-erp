/* ═══════════════════════════════════════════════════════
   FECHAMENTOS — View global de todos os fechamentos mensais
═══════════════════════════════════════════════════════ */

var _fchTodos = [];
var _fchFiltrados = [];
var _fchContratosMap = {};
var _fchClientesMap = {};

async function carregarFechamentosView() {
  var wrap = document.getElementById('fch-lista-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';

  var fr = await sf('/rest/v1/fechamentos_mensais?select=*&order=mes_referencia.desc');
  if (!fr.ok || !Array.isArray(fr.data)) {
    wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar fechamentos.</div>';
    return;
  }
  _fchTodos = fr.data;

  _fchContratosMap = {};
  _fchClientesMap = {};

  var cIds = [];
  _fchTodos.forEach(function(f) { if (f.contrato_id && cIds.indexOf(f.contrato_id) === -1) cIds.push(f.contrato_id); });

  if (cIds.length) {
    var cr = await sf('/rest/v1/contratos?id=in.(' + cIds.join(',') + ')&select=*');
    var contratosData = (cr.ok && Array.isArray(cr.data)) ? cr.data : [];
    contratosData.forEach(function(c) { _fchContratosMap[c.id] = c; });

    var cliIds = [];
    contratosData.forEach(function(c) { if (c.cliente_id && cliIds.indexOf(c.cliente_id) === -1) cliIds.push(c.cliente_id); });
    if (cliIds.length) {
      var clr = await sf('/rest/v1/clientes?id=in.(' + cliIds.join(',') + ')&select=id,razao_social,fantasia,cidade,codigo');
      var clientesData = (clr.ok && Array.isArray(clr.data)) ? clr.data : [];
      clientesData.forEach(function(cl) { _fchClientesMap[cl.id] = cl; });
    }
  }

  // Popula filtro de clientes
  var cliSel = document.getElementById('fch-filter-cliente');
  if (cliSel) {
    cliSel.innerHTML = '<option value="">Todos os clientes</option>';
    var clientesOrdenados = Object.values(_fchClientesMap).sort(function(a, b) {
      return (a.razao_social || '').localeCompare(b.razao_social || '');
    });
    clientesOrdenados.forEach(function(cl) {
      var opt = document.createElement('option');
      opt.value = cl.id;
      opt.textContent = (cl.codigo ? '[' + cl.codigo + '] ' : '') + (cl.razao_social || cl.fantasia || cl.id);
      cliSel.appendChild(opt);
    });
  }

  fchRenderizarTabela();
}

function fchAplicarFiltros() {
  fchRenderizarTabela();
}

// Navegação a partir do card "Fechamentos pendentes" do dashboard — pré-filtra
// pelo mês atual. carregarFechamentosView() roda de forma assíncrona (via
// erpShowView), mas como só lemos/ajustamos o valor do <input type="month">
// (elemento estático, já existe no DOM) antes de qualquer await interno dela
// ceder o controle, não há corrida: quando ela chamar fchRenderizarTabela()
// ao final, o filtro já estará com o mês atual selecionado.
function irParaFechamentosPendentes() {
  erpShowView('fechamentos');
  var mesInput = document.getElementById('fch-filter-mes');
  if (mesInput) mesInput.value = new Date().toISOString().slice(0, 7);
  var boletoInput = document.getElementById('fch-filter-boleto');
  if (boletoInput) boletoInput.value = '';
}

function fchRenderizarTabela() {
  var wrap = document.getElementById('fch-lista-wrap');
  if (!wrap) return;

  var mesFiltro = (document.getElementById('fch-filter-mes') || {}).value || '';
  var cliFiltro = (document.getElementById('fch-filter-cliente') || {}).value || '';
  var boletoFiltro = (document.getElementById('fch-filter-boleto') || {}).value || '';

  var lista = _fchTodos.filter(function(f) {
    if (mesFiltro && !(f.mes_referencia || '').startsWith(mesFiltro)) return false;
    if (cliFiltro) {
      var c = _fchContratosMap[f.contrato_id];
      if (!c || c.cliente_id !== cliFiltro) return false;
    }
    if (boletoFiltro === 'gerado' && !f.boleto_gerado) return false;
    if (boletoFiltro === 'pendente' && f.boleto_gerado) return false;
    return true;
  });

  _fchFiltrados = lista;

  if (!lista.length) {
    wrap.innerHTML = '<div class="tbl-empty">Nenhum fechamento encontrado com os filtros selecionados.</div>';
    return;
  }

  var html = '<table class="erp-table"><thead><tr>' +
    '<th>Cliente</th><th>Contrato</th><th>Mês</th>' +
    '<th>Págs PB</th><th>Págs Color</th>' +
    '<th>Total</th><th>Boleto</th><th></th>' +
    '</tr></thead><tbody>';

  lista.forEach(function(f, idx) {
    var c = _fchContratosMap[f.contrato_id] || {};
    var cli = _fchClientesMap[c.cliente_id] || {};
    var clienteNome = cli.razao_social || cli.fantasia || '—';
    var codCli = cli.codigo ? '<span style="font-family:monospace;background:#E5E7EB;padding:1px 5px;border-radius:4px;font-size:11px;margin-right:4px">' + cli.codigo + '</span>' : '';
    var mesLabel = f.mes_referencia
      ? new Date(f.mes_referencia + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      : '—';
    var ppb = (f.contador_pb_atual || 0) - (f.contador_pb_anterior || 0);
    var pcol = (f.contador_color_atual || 0) - (f.contador_color_anterior || 0);
    var total = 'R$ ' + Number(f.valor_total || 0).toFixed(2).replace('.', ',');
    var boletoSt = f.boleto_gerado
      ? '<span class="badge" style="background:#DCFCE7;color:#15803D">Gerado</span>'
      : '<span class="badge" style="background:#FEF3C7;color:#B45309">Pendente</span>';

    html += '<tr>' +
      '<td>' + codCli + clienteNome + '</td>' +
      '<td style="font-family:monospace;white-space:nowrap">' + (c.numero || '—') + '</td>' +
      '<td style="white-space:nowrap">' + mesLabel + '</td>' +
      '<td>' + ppb + '</td>' +
      '<td>' + pcol + '</td>' +
      '<td><strong>' + total + '</strong></td>' +
      '<td>' + boletoSt + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button class="btn-icon" title="Extrato PDF" onclick="fchGerarExtrato(' + idx + ')"><i class="ti ti-file-text" style="color:#1D4ED8"></i></button>' +
        '<button class="btn-icon" title="Excluir" onclick="fchExcluir(\'' + f.id + '\')"><i class="ti ti-trash" style="color:#DC2626"></i></button>' +
      '</td>' +
    '</tr>';
  });

  html += '</tbody></table>';
  wrap.innerHTML = html;
}

async function fchGerarExtrato(idx) {
  var f = _fchFiltrados[idx];
  if (!f) return;
  var c = _fchContratosMap[f.contrato_id] || {};
  var cli = _fchClientesMap[c.cliente_id] || {};
  var clienteNome = cli.razao_social || cli.fantasia || '—';
  var clienteCidade = cli.cidade || '';

  var equips = [];
  try {
    var er = await sf('/rest/v1/contrato_equipamentos?contrato_id=eq.' + c.id + '&select=equipamento_id');
    var eqIds = _arrOuVazio(er).map(function(v) { return v.equipamento_id; }).filter(Boolean);
    if (eqIds.length) {
      var eqRes = await sf('/rest/v1/equipamentos?id=in.(' + eqIds.join(',') + ')&select=id,marca,modelo,serial,codigo_teffe');
      equips = _arrOuVazio(eqRes);
    }
  } catch(e) {}

  _abrirExtratoFechamento(f, c, clienteNome, clienteCidade, equips);
}

async function fchExcluir(id) {
  if (!confirm('Tem certeza que deseja excluir este fechamento?\n\nATENÇÃO: O boleto gerado NÃO será excluído automaticamente.')) return;
  var r = await sf('/rest/v1/fechamentos_mensais?id=eq.' + id, { method: 'DELETE' });
  if (!r.ok) { alert('Erro ao excluir: ' + JSON.stringify(r.data)); return; }
  await carregarFechamentosView();
}

async function fchNovoFechamento() {
  var sel = document.getElementById('fch-select-contrato');
  sel.innerHTML = '<option value="">Selecione um contrato...</option>';
  sel.disabled = true;

  var cr = await sf('/rest/v1/contratos?status=eq.ativo&select=id,numero,cliente_id&order=numero.asc');
  var contratos = _arrOuVazio(cr);

  var cliIds = [];
  contratos.forEach(function(c) { if (c.cliente_id && cliIds.indexOf(c.cliente_id) === -1) cliIds.push(c.cliente_id); });
  var cliNomes = {};
  if (cliIds.length) {
    var clr = await sf('/rest/v1/clientes?id=in.(' + cliIds.join(',') + ')&select=id,razao_social');
    _arrOuVazio(clr).forEach(function(cl) { cliNomes[cl.id] = cl.razao_social; });
  }

  contratos.forEach(function(c) {
    var opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = (c.numero || '—') + ' — ' + (cliNomes[c.cliente_id] || c.cliente_id);
    sel.appendChild(opt);
  });
  sel.disabled = false;

  document.getElementById('modal-selecionar-contrato').classList.add('open');
}

async function fchConfirmarContrato() {
  var contratoId = document.getElementById('fch-select-contrato').value;
  if (!contratoId) { alert('Selecione um contrato.'); return; }

  var cr = await sf('/rest/v1/contratos?id=eq.' + contratoId + '&select=*&limit=1');
  if (!cr.data || !cr.data[0]) { alert('Contrato não encontrado.'); return; }

  _fcContratoAtual = cr.data[0];
  fecharModal('modal-selecionar-contrato');
  await fcAbrirNovoFechamento();
}
