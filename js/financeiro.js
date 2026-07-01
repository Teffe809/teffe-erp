/* ═══════════════════════════════════════════════════════
   FINANCEIRO — DASHBOARD
═══════════════════════════════════════════════════════ */

async function carregarDashboardFin() {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const mesInicio = hoje.getFullYear() + '-' + String(hoje.getMonth()+1).padStart(2,'0') + '-01';
  const mesFim = hoje.getFullYear() + '-' + String(hoje.getMonth()+1).padStart(2,'0') + '-' + _ultimoDiaMes(hoje.getFullYear(), hoje.getMonth()+1);

  const [recRes, pagRes] = await Promise.all([
    sf('/rest/v1/financeiro_receber?select=valor,vencimento,status&vencimento=gte.' + mesInicio + '&vencimento=lte.' + mesFim),
    sf('/rest/v1/financeiro_pagar?select=valor,vencimento,status&vencimento=gte.' + mesInicio + '&vencimento=lte.' + mesFim)
  ]);

  const receber = _arrOuVazio(recRes);
  const pagar = _arrOuVazio(pagRes);
  const hojeStr = hoje.toISOString().slice(0,10);

  const totalReceber = receber.filter(r => r.status !== 'cancelado').reduce((s,r) => s + Number(r.valor), 0);
  const totalPagar = pagar.filter(p => p.status !== 'cancelado').reduce((s,p) => s + Number(p.valor), 0);
  const saldo = totalReceber - totalPagar;
  const atrasadasRec = receber.filter(r => r.status !== 'pago' && r.status !== 'cancelado' && r.vencimento < hojeStr).length;
  const atrasadasPag = pagar.filter(p => p.status !== 'pago' && p.status !== 'cancelado' && p.vencimento < hojeStr).length;
  const totalAtrasadas = atrasadasRec + atrasadasPag;

  const fmt = v => 'R$ ' + Number(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.').replace('.',',').replace(/,(\d{3})/g,'.$1').replace(/\./,'XXX').replace('XXX',',');

  document.getElementById('fin-cards-wrap').innerHTML =
    _finCard('Total a Receber', fmt(totalReceber), 'green', 'No mês corrente') +
    _finCard('Total a Pagar', fmt(totalPagar), 'red', 'No mês corrente') +
    _finCard('Saldo Projetado', fmt(saldo), saldo >= 0 ? 'green' : 'red', 'Receitas − Despesas') +
    _finCard('Contas Atrasadas', totalAtrasadas, totalAtrasadas > 0 ? 'orange' : '', totalAtrasadas + ' receber + pagar');

  await _renderBarChart();
}

function _finCard(label, value, cls, sub) {
  return '<div class="fin-card"><div class="fc-label">' + label + '</div>' +
    '<div class="fc-value ' + (cls||'') + '">' + value + '</div>' +
    '<div class="fc-sub">' + sub + '</div></div>';
}

async function _renderBarChart() {
  const wrap = document.getElementById('fin-barchart');
  if (!wrap) return;
  const hoje = new Date();
  var meses = [];
  for (var i = 5; i >= 0; i--) {
    var d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({ y: d.getFullYear(), m: d.getMonth() + 1 });
  }

  const queries = meses.map(function(m) {
    var ini = m.y + '-' + String(m.m).padStart(2,'0') + '-01';
    var fim = m.y + '-' + String(m.m).padStart(2,'0') + '-' + _ultimoDiaMes(m.y, m.m);
    return Promise.all([
      sf('/rest/v1/financeiro_receber?select=valor&status=eq.pago&vencimento=gte.' + ini + '&vencimento=lte.' + fim),
      sf('/rest/v1/financeiro_pagar?select=valor&status=eq.pago&vencimento=gte.' + ini + '&vencimento=lte.' + fim)
    ]);
  });
  const results = await Promise.all(queries);

  const dados = results.map(function(r, i) {
    var rec = _arrOuVazio(r[0]).reduce((s,x) => s + Number(x.valor), 0);
    var des = _arrOuVazio(r[1]).reduce((s,x) => s + Number(x.valor), 0);
    return { rec, des, mes: meses[i] };
  });

  var maxVal = Math.max(...dados.map(d => Math.max(d.rec, d.des)), 1);
  var nomesMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  wrap.innerHTML = dados.map(function(d) {
    var hRec = Math.round((d.rec / maxVal) * 100);
    var hDes = Math.round((d.des / maxVal) * 100);
    var lbl = nomesMes[d.mes.m - 1] + '/' + String(d.mes.y).slice(2);
    return '<div class="bar-group">' +
      '<div class="bars">' +
      '<div class="bar receita" style="height:' + hRec + 'px" title="Receitas: R$ ' + d.rec.toFixed(2) + '"></div>' +
      '<div class="bar despesa" style="height:' + hDes + 'px" title="Despesas: R$ ' + d.des.toFixed(2) + '"></div>' +
      '</div>' +
      '<div class="bar-lbl">' + lbl + '</div>' +
      '</div>';
  }).join('');
}

/* ═══════════════════════════════════════════════════════
   CONTAS A RECEBER
═══════════════════════════════════════════════════════ */

async function carregarReceber() {
  const wrap = document.getElementById('receber-wrap');
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';
  const hoje = new Date().toISOString().slice(0,10);

  var qs = '/rest/v1/financeiro_receber?select=*&order=vencimento.asc';
  var status = document.getElementById('fil-rec-status').value;
  var mes = document.getElementById('fil-rec-mes').value;
  if (mes) { var _p = mes.split('-'); qs += '&vencimento=gte.' + mes + '-01&vencimento=lte.' + mes + '-' + _ultimoDiaMes(+_p[0], +_p[1]); }

  const { data, ok } = await sf(qs);
  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar.</div>'; return; }

  // Busca nomes dos clientes em segunda chamada para evitar join
  var clienteMap = {};
  var ids = [...new Set((Array.isArray(data) ? data : []).map(r => r.cliente_id).filter(Boolean))];
  if (ids.length) {
    var cRes = await sf('/rest/v1/clientes?select=id,razao_social,fantasia&id=in.(' + ids.join(',') + ')');
    (Array.isArray(cRes.data) ? cRes.data : []).forEach(function(c) {
      clienteMap[c.id] = c.razao_social || c.fantasia || null;
    });
  }

  var lista = data.map(function(r) {
    var efStatus = (r.status === 'pendente' && r.vencimento < hoje) ? 'atrasado' : r.status;
    return Object.assign({}, r, { _efStatus: efStatus });
  });
  if (status) lista = lista.filter(r => r._efStatus === status);
  if (!lista.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhuma conta encontrada.</div>'; return; }

  var rows = lista.map(function(r) {
    var cli = clienteMap[r.cliente_id] || (r.cliente_id ? 'Cliente não encontrado' : '—');
    var venc = r.vencimento ? new Date(r.vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    var val = 'R$ ' + Number(r.valor).toFixed(2).replace('.', ',');
    var badge = '<span class="badge badge-' + r._efStatus + '">' + _fStatusLabel(r._efStatus) + '</span>';
    var rowCls = r._efStatus === 'atrasado' ? ' class="row-atrasado"' : '';
    var btnPago = r.status !== 'pago' && r.status !== 'cancelado'
      ? '<button class="btn-icon" title="Marcar pago" onclick="abrirModalPagamento(\'' + r.id + '\',\'receber\')"><i class="ti ti-check" style="color:#16A34A"></i></button>'
      : '';
    return '<tr' + rowCls + '>' +
      '<td>' + _esc(cli) + '</td>' +
      '<td>' + _esc(r.descricao) + '</td>' +
      '<td><strong>' + val + '</strong></td>' +
      '<td>' + venc + '</td>' +
      '<td>' + badge + '</td>' +
      '<td>' + (r.data_pagamento ? new Date(r.data_pagamento+'T12:00:00').toLocaleDateString('pt-BR') : '—') + '</td>' +
      '<td>' + btnPago + '</td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table">' +
    '<thead><tr><th>Cliente</th><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Pagamento</th><th></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

/* ═══════════════════════════════════════════════════════
   CONTAS A PAGAR
═══════════════════════════════════════════════════════ */

async function carregarPagar() {
  const wrap = document.getElementById('pagar-wrap');
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';
  const hoje = new Date().toISOString().slice(0,10);

  var qs = '/rest/v1/financeiro_pagar?select=*,fornecedores(nome)&order=vencimento.asc';
  var cat = document.getElementById('fil-pag-cat').value;
  var status = document.getElementById('fil-pag-status').value;
  var mes = document.getElementById('fil-pag-mes').value;
  if (cat) qs += '&categoria=eq.' + cat;
  if (mes) { var _p = mes.split('-'); qs += '&vencimento=gte.' + mes + '-01&vencimento=lte.' + mes + '-' + _ultimoDiaMes(+_p[0], +_p[1]); }

  const { data, ok } = await sf(qs);
  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar.</div>'; return; }

  var lista = data.map(function(p) {
    var efStatus = (p.status === 'pendente' && p.vencimento < hoje) ? 'atrasado' : p.status;
    return Object.assign({}, p, { _efStatus: efStatus });
  });
  if (status) lista = lista.filter(p => p._efStatus === status);
  if (!lista.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhuma conta encontrada.</div>'; return; }

  var catLabel = { fornecedor:'Fornecedor', aluguel:'Aluguel', pro_labore:'Pró-labore', lucro_socio:'Lucro Sócio',
    imposto:'Imposto', contador:'Contador', funcionario:'Funcionário', despesa_geral:'Despesa Geral', outro:'Outro' };

  var rows = lista.map(function(p) {
    var forn = p.fornecedores ? p.fornecedores.nome : '—';
    var venc = p.vencimento ? new Date(p.vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    var val = 'R$ ' + Number(p.valor).toFixed(2).replace('.', ',');
    var badge = '<span class="badge badge-' + p._efStatus + '">' + _fStatusLabel(p._efStatus) + '</span>';
    var rowCls = p._efStatus === 'atrasado' ? ' class="row-atrasado"' : '';
    var btnPago = p.status !== 'pago' && p.status !== 'cancelado'
      ? '<button class="btn-icon" title="Marcar pago" onclick="abrirModalPagamento(\'' + p.id + '\',\'pagar\')"><i class="ti ti-check" style="color:#16A34A"></i></button>'
      : '';
    var recIcon = p.recorrente ? '<i class="ti ti-refresh" title="Recorrente" style="color:#9CA3AF;font-size:13px"></i>' : '';
    return '<tr' + rowCls + '>' +
      '<td>' + _esc(p.descricao) + ' ' + recIcon + '</td>' +
      '<td><span class="badge badge-inactive">' + (catLabel[p.categoria]||p.categoria) + '</span></td>' +
      '<td><strong>' + val + '</strong></td>' +
      '<td>' + venc + '</td>' +
      '<td>' + badge + '</td>' +
      '<td>' + _esc(forn) + '</td>' +
      '<td>' +
        btnPago +
        '<button class="btn-icon" title="Editar" onclick=\'abrirModalContaPagar(' + JSON.stringify(p) + ')\'><i class="ti ti-pencil"></i></button>' +
        '<button class="btn-icon" title="Excluir" onclick="excluirContaPagar(\'' + p.id + '\')"><i class="ti ti-trash" style="color:#DC2626"></i></button>' +
      '</td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table">' +
    '<thead><tr><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Fornecedor</th><th></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

async function abrirModalContaPagar(p) {
  await _carregarFornecedoresSelect('mcp-forn');
  document.getElementById('mcp-id').value = p ? p.id : '';
  document.getElementById('mcp-titulo').textContent = p ? 'Editar Conta' : 'Nova Conta a Pagar';
  document.getElementById('mcp-desc').value = p ? (p.descricao || '') : '';
  document.getElementById('mcp-cat').value = p ? (p.categoria || '') : '';
  document.getElementById('mcp-forn').value = p ? (p.fornecedor_id || '') : '';
  document.getElementById('mcp-valor').value = p ? (p.valor || '') : '';
  document.getElementById('mcp-venc').value = p ? (p.vencimento || '') : '';
  document.getElementById('mcp-status').value = p ? (p.status || 'pendente') : 'pendente';
  document.getElementById('mcp-data-pag').value = p ? (p.data_pagamento || '') : '';
  document.getElementById('mcp-recorrente').checked = p ? !!p.recorrente : false;
  document.getElementById('mcp-obs').value = p ? (p.observacao || '') : '';
  document.getElementById('modal-conta-pagar').classList.add('open');
}

async function salvarContaPagar() {
  const id = document.getElementById('mcp-id').value;
  const desc = document.getElementById('mcp-desc').value.trim();
  const cat = document.getElementById('mcp-cat').value;
  const valor = parseFloat(document.getElementById('mcp-valor').value);
  const venc = document.getElementById('mcp-venc').value;
  if (!desc) { alert('Informe a descrição.'); return; }
  if (!cat) { alert('Selecione a categoria.'); return; }
  if (!valor || valor <= 0) { alert('Informe o valor.'); return; }
  if (!venc) { alert('Informe o vencimento.'); return; }

  const payload = {
    descricao: desc,
    categoria: cat,
    valor,
    vencimento: venc,
    status: document.getElementById('mcp-status').value,
    data_pagamento: document.getElementById('mcp-data-pag').value || null,
    fornecedor_id: document.getElementById('mcp-forn').value || null,
    recorrente: document.getElementById('mcp-recorrente').checked,
    observacao: document.getElementById('mcp-obs').value.trim() || null
  };

  var res;
  if (id) {
    res = await sf('/rest/v1/financeiro_pagar?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(payload) });
  } else {
    res = await sf('/rest/v1/financeiro_pagar', { method: 'POST', body: JSON.stringify(payload), headers: { 'Prefer': 'return=minimal' } });
  }
  if (!res.ok) { alert('Erro ao salvar: ' + JSON.stringify(res.data)); return; }
  fecharModal('modal-conta-pagar');
  carregarPagar();
}

async function excluirContaPagar(id) {
  if (!confirm('Excluir esta conta?')) return;
  const res = await sf('/rest/v1/financeiro_pagar?id=eq.' + id, { method: 'DELETE' });
  if (!res.ok) { alert('Erro ao excluir: ' + JSON.stringify(res.data)); return; }
  carregarPagar();
}

/* ═══════════════════════════════════════════════════════
   MARCAR COMO PAGO
═══════════════════════════════════════════════════════ */

function abrirModalPagamento(id, tabela) {
  document.getElementById('mpag-id').value = id;
  document.getElementById('mpag-tabela').value = tabela;
  document.getElementById('mpag-data').value = new Date().toISOString().slice(0,10);
  document.getElementById('mpag-obs').value = '';
  document.getElementById('modal-pagamento').classList.add('open');
}

// confirmarPagamento unificado em index.html (suporta receber, pagar e boleto)

/* ═══════════════════════════════════════════════════════
   FLUXO DE CAIXA
═══════════════════════════════════════════════════════ */

async function carregarFluxo() {
  const wrap = document.getElementById('fluxo-wrap');
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';
  const meses = parseInt(document.getElementById('fil-fluxo-periodo').value) || 6;
  const hoje = new Date();

  var periodos = [];
  for (var i = 0; i < meses; i++) {
    var d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    periodos.push({ y: d.getFullYear(), m: d.getMonth() + 1 });
  }

  const queries = periodos.map(function(p) {
    var ini = p.y + '-' + String(p.m).padStart(2,'0') + '-01';
    var fim = p.y + '-' + String(p.m).padStart(2,'0') + '-' + _ultimoDiaMes(p.y, p.m);
    return Promise.all([
      sf('/rest/v1/financeiro_receber?select=valor&status=neq.cancelado&vencimento=gte.' + ini + '&vencimento=lte.' + fim),
      sf('/rest/v1/financeiro_pagar?select=valor&status=neq.cancelado&vencimento=gte.' + ini + '&vencimento=lte.' + fim)
    ]);
  });
  const results = await Promise.all(queries);

  var saldoAcum = 0;
  var nomesMes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  var rows = results.map(function(r, i) {
    var rec = _arrOuVazio(r[0]).reduce((s,x) => s + Number(x.valor), 0);
    var des = _arrOuVazio(r[1]).reduce((s,x) => s + Number(x.valor), 0);
    var saldo = rec - des;
    saldoAcum += saldo;
    var mes = nomesMes[periodos[i].m - 1] + '/' + periodos[i].y;
    var fmt = function(v) { return 'R$ ' + Math.abs(v).toFixed(2).replace('.', ','); };
    return '<tr>' +
      '<td>' + mes + '</td>' +
      '<td class="pos">' + fmt(rec) + '</td>' +
      '<td class="neg">' + fmt(des) + '</td>' +
      '<td class="' + (saldo >= 0 ? 'pos' : 'neg') + '">' + (saldo < 0 ? '− ' : '') + fmt(saldo) + '</td>' +
      '<td class="' + (saldoAcum >= 0 ? 'pos' : 'neg') + '">' + (saldoAcum < 0 ? '− ' : '') + fmt(saldoAcum) + '</td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table fluxo-table">' +
    '<thead><tr><th>Mês</th><th>Entradas Prev.</th><th>Saídas Prev.</th><th>Saldo do Mês</th><th>Saldo Acumulado</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */

function _fStatusLabel(s) {
  return { pendente:'Pendente', pago:'Pago', atrasado:'Atrasado', cancelado:'Cancelado' }[s] || s;
}

// new Date(y, m, 0).getDate() — m é 1-indexed; day 0 do mês seguinte = último dia do mês atual
function _ultimoDiaMes(y, m) {
  return new Date(y, m, 0).getDate();
}

document.addEventListener('DOMContentLoaded', function() {
  var hoje = new Date();
  var mesAtual = hoje.getFullYear() + '-' + String(hoje.getMonth()+1).padStart(2,'0');
  var elRec = document.getElementById('fil-rec-mes');
  var elPag = document.getElementById('fil-pag-mes');
  if (elRec) elRec.value = mesAtual;
  if (elPag) elPag.value = mesAtual;
});
