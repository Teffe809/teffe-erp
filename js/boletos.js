/* ═══════════════════════════════════════════════════════
   BOLETOS
═══════════════════════════════════════════════════════ */

async function carregarBoletos() {
  const wrap = document.getElementById('boletos-wrap');
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';
  const hoje = new Date().toISOString().slice(0, 10);

  await _atualizarBoletosVencidos(hoje);

  var qs = '/rest/v1/boletos?select=*&order=vencimento.asc';
  var status = (document.getElementById('fil-bol-status') || {}).value || '';
  var mes = (document.getElementById('fil-bol-mes') || {}).value || '';
  if (mes) {
    var _p = mes.split('-');
    var ano = +_p[0], mesNum = +_p[1];
    var primeiroDia = mes + '-01';
    var ultimoDia = mes + '-' + String(new Date(ano, mesNum, 0).getDate()).padStart(2, '0');
    qs += '&vencimento=gte.' + primeiroDia + '&vencimento=lte.' + ultimoDia;
  }
  if (status) qs += '&status=eq.' + status;

  const { data, ok } = await sf(qs);
  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar boletos.</div>'; return; }
  if (!data.length) { wrap.innerHTML = '<div class="tbl-empty">' + (mes ? 'Nenhum boleto encontrado para este período.' : 'Nenhum boleto encontrado.') + '</div>'; return; }

  // Busca nomes dos clientes em chamada separada
  var clienteIds = [...new Set(data.filter(function(b){ return b.cliente_id; }).map(function(b){ return b.cliente_id; }))];
  var clienteMap = {};
  if (clienteIds.length) {
    var cRes = await sf('/rest/v1/clientes?id=in.(' + clienteIds.join(',') + ')&select=id,razao_social,fantasia');
    if (cRes.ok && cRes.data) {
      cRes.data.forEach(function(c){ clienteMap[c.id] = c.fantasia || c.razao_social || '—'; });
    }
  }

  const statusMap = { a_vencer: 'A Vencer', vencido: 'Vencido', pago: 'Pago' };
  const statusCls = { a_vencer: 'badge-pendente', vencido: 'badge-atrasado', pago: 'badge-pago' };

  const rows = data.map(function(b) {
    const cli = clienteMap[b.cliente_id] || '—';
    const venc = b.vencimento ? new Date(b.vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const val = 'R$ ' + Number(b.valor).toFixed(2).replace('.', ',');
    const tooltip = b.status === 'vencido' ? ' title="Pode levar até 5 dias úteis para compensação"' : '';
    const badge = '<span class="badge ' + (statusCls[b.status] || '') + '"' + tooltip + '>' + (statusMap[b.status] || b.status) + '</span>';
    const rowCls = b.status === 'vencido' ? ' class="row-atrasado"' : '';
    const btnPago = b.status !== 'pago'
      ? '<button class="btn-icon" title="Marcar pago" onclick="abrirModalPagamentoBoleto(\'' + b.id + '\')"><i class="ti ti-check" style="color:#16A34A"></i></button>'
      : '';
    const btnPdf = b.arquivo_url
      ? '<a class="btn-icon" href="' + _esc(b.arquivo_url) + '" target="_blank" title="Download PDF"><i class="ti ti-download"></i></a>'
      : '';
    const btnEdit = '<button class="btn-icon" title="Editar" onclick=\'abrirModalBoleto(' + JSON.stringify(b) + ')\'><i class="ti ti-pencil"></i></button>';
    const btnDel  = '<button class="btn-icon" title="Excluir" onclick="excluirBoleto(\'' + b.id + '\')"><i class="ti ti-trash" style="color:#DC2626"></i></button>';
    return '<tr' + rowCls + '>' +
      '<td><strong>' + _esc(cli) + '</strong></td>' +
      '<td>' + _esc(b.numero_boleto || '—') + '</td>' +
      '<td>' + _esc(b.numero_nf || '—') + '</td>' +
      '<td><strong>' + val + '</strong></td>' +
      '<td>' + venc + '</td>' +
      '<td>' + badge + '</td>' +
      '<td>' + btnPago + btnPdf + btnEdit + btnDel + '</td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table">' +
    '<thead><tr><th>Cliente</th><th>Nº Boleto</th><th>NF</th><th>Valor</th><th>Vencimento</th><th>Status</th><th></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

async function _atualizarBoletosVencidos(hoje) {
  await sf('/rest/v1/boletos?status=eq.a_vencer&vencimento=lt.' + hoje, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'vencido' }),
    headers: { 'Prefer': 'return=minimal' }
  });
}

async function abrirModalBoleto(b) {
  await _carregarClientesSelectBoleto('mbol-cliente');
  document.getElementById('mbol-id').value = b ? b.id : '';
  document.getElementById('mbol-titulo').textContent = b ? 'Editar Boleto' : 'Novo Boleto';
  document.getElementById('mbol-cliente').value = b ? (b.cliente_id || '') : '';
  document.getElementById('mbol-contrato').innerHTML = '<option value="">Nenhum</option>';
  if (b && b.cliente_id) await _carregarContratosSelectBoleto(b.cliente_id, b.contrato_id);
  document.getElementById('mbol-nf').value = b ? (b.numero_nf || '') : '';
  document.getElementById('mbol-numero').value = b ? (b.numero_boleto || '') : '';
  document.getElementById('mbol-valor').value = b ? (b.valor || '') : '';
  document.getElementById('mbol-venc').value = b ? (b.vencimento || '') : '';
  document.getElementById('mbol-obs').value = b ? (b.observacao || '') : '';
  document.getElementById('mbol-arquivo').value = '';
  document.getElementById('modal-boleto').classList.add('open');
}

async function _carregarClientesSelectBoleto(selId) {
  const { data } = await sf('/rest/v1/clientes?select=id,razao_social,fantasia&ativo=eq.true&order=razao_social.asc');
  const sel = document.getElementById(selId);
  const cur = sel.value;
  sel.innerHTML = '<option value="">Selecione o cliente...</option>';
  (Array.isArray(data) ? data : []).forEach(function(c) {
    var opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.fantasia || c.razao_social;
    sel.appendChild(opt);
  });
  if (cur) sel.value = cur;
}

async function _carregarContratosSelectBoleto(clienteId, contratoIdAtual) {
  const sel = document.getElementById('mbol-contrato');
  sel.innerHTML = '<option value="">Nenhum</option>';
  if (!clienteId) return;
  const { data } = await sf('/rest/v1/contratos?cliente_id=eq.' + clienteId + '&select=id,numero,descricao&status=eq.ativo&order=numero.asc');
  (Array.isArray(data) ? data : []).forEach(function(c) {
    var opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = (c.numero || c.id) + (c.descricao ? ' — ' + c.descricao : '');
    sel.appendChild(opt);
  });
  if (contratoIdAtual) sel.value = contratoIdAtual;
}

async function salvarBoleto() {
  const id = document.getElementById('mbol-id').value;
  const clienteId = document.getElementById('mbol-cliente').value;
  const valor = parseFloat(document.getElementById('mbol-valor').value);
  const venc = document.getElementById('mbol-venc').value;
  if (!clienteId) { alert('Selecione o cliente.'); return; }
  if (!valor || valor <= 0) { alert('Informe o valor.'); return; }
  if (!venc) { alert('Informe o vencimento.'); return; }

  const hoje = new Date().toISOString().slice(0, 10);
  const statusCalc = venc < hoje ? 'vencido' : 'a_vencer';

  const fileInput = document.getElementById('mbol-arquivo');
  let arquivoUrl = null;
  if (fileInput && fileInput.files[0]) {
    const file = fileInput.files[0];
    const path = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    arquivoUrl = await _uploadArquivo('boletos-pdf', path, file);
    if (!arquivoUrl) { alert('Erro ao fazer upload do PDF. Verifique o bucket boletos-pdf.'); return; }
  }

  const payload = {
    cliente_id: clienteId,
    contrato_id: document.getElementById('mbol-contrato').value || null,
    numero_nf: document.getElementById('mbol-nf').value.trim() || null,
    numero_boleto: document.getElementById('mbol-numero').value.trim() || null,
    valor,
    vencimento: venc,
    status: statusCalc,
    observacao: document.getElementById('mbol-obs').value.trim() || null
  };
  if (arquivoUrl) payload.arquivo_url = arquivoUrl;

  console.log('[salvarBoleto] clienteId:', clienteId, '| payload:', JSON.stringify(payload));

  let res;
  if (id) {
    res = await sf('/rest/v1/boletos?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(payload) });
  } else {
    res = await sf('/rest/v1/boletos', { method: 'POST', body: JSON.stringify(payload), headers: { 'Prefer': 'return=minimal' } });
  }
  if (!res.ok) { alert('Erro ao salvar boleto: ' + JSON.stringify(res.data)); return; }
  registrarLog(id ? 'boleto_editado' : 'boleto_criado', { cliente_id: clienteId, valor });
  alert('Boleto salvo com sucesso!');
  fecharModal('modal-boleto');
  carregarBoletos();
}

function abrirModalPagamentoBoleto(id) {
  document.getElementById('mpag-id').value = id;
  document.getElementById('mpag-tabela').value = 'boleto';
  document.getElementById('mpag-data').value = new Date().toISOString().slice(0, 10);
  document.getElementById('mpag-obs').value = '';
  document.getElementById('modal-pagamento').classList.add('open');
}

async function excluirBoleto(id) {
  if (!confirm('Excluir este boleto? Esta ação não pode ser desfeita.')) return;
  const { ok, data: errData } = await sf('/rest/v1/boletos?id=eq.' + id, { method: 'DELETE' });
  if (!ok) { alert('Erro ao excluir boleto: ' + JSON.stringify(errData)); return; }
  registrarLog('boleto_excluido', { id });
  carregarBoletos();
}

async function confirmarPagamentoBoleto(id, data) {
  const res = await sf('/rest/v1/boletos?id=eq.' + id, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'pago', data_pagamento: data })
  });
  if (!res.ok) { alert('Erro ao atualizar: ' + JSON.stringify(res.data)); return; }
  registrarLog('boleto_pago', { id, data_pagamento: data });
  carregarBoletos();
}

/* ═══════════════════════════════════════════════════════
   LOGS
═══════════════════════════════════════════════════════ */

async function carregarLogs() {
  const wrap = document.getElementById('logs-wrap');
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';

  var qs = '/rest/v1/logs_sistema?select=*&order=created_at.desc&limit=300';
  var filtroData = document.getElementById('fil-log-data') ? document.getElementById('fil-log-data').value : '';
  var filtroUser = document.getElementById('fil-log-user') ? document.getElementById('fil-log-user').value.trim() : '';
  if (filtroData) qs += '&created_at=gte.' + filtroData + 'T00:00:00&created_at=lte.' + filtroData + 'T23:59:59';
  if (filtroUser) qs += '&usuario_email=ilike.*' + encodeURIComponent(filtroUser) + '*';

  const { data, ok } = await sf(qs);
  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar logs.</div>'; return; }
  if (!data.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhum log encontrado.</div>'; return; }

  const rows = data.map(function(l) {
    const dt = new Date(l.created_at).toLocaleString('pt-BR');
    const det = l.detalhes ? JSON.stringify(l.detalhes) : '—';
    return '<tr>' +
      '<td style="white-space:nowrap">' + dt + '</td>' +
      '<td>' + _esc(l.usuario_email || '—') + '</td>' +
      '<td><code>' + _esc(l.acao || '—') + '</code></td>' +
      '<td><small style="color:#6B7280">' + _esc(det) + '</small></td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table">' +
    '<thead><tr><th>Data/Hora</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}
