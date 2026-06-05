/* ═══════════════════════════════════════════════════════
   CONTRATOS
   Colunas reais: id, created_at, cliente_id, numero,
   descricao, data_inicio, data_fim, valor_mensal, status,
   dia_vencimento, duracao_meses, indice_reajuste, observacao
═══════════════════════════════════════════════════════ */

async function carregarContratos() {
  const wrap = document.querySelector('#view-contratos .table-wrap');
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';
  const { data, ok } = await sf('/rest/v1/contratos?select=*,clientes(nome,empresa)&order=data_fim.asc');
  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar contratos.</div>'; return; }
  if (!data.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhum contrato cadastrado.</div>'; return; }

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const rows = data.map(function(c) {
    const fim = new Date(c.data_fim + 'T12:00:00');
    const diasFim = Math.ceil((fim - hoje) / 86400000);
    const cliente = c.clientes ? (c.clientes.nome || c.clientes.empresa || '—') : '—';
    const statusBadge = '<span class="badge badge-' + c.status + '">' + _cStatusLabel(c.status) + '</span>';
    const valor = 'R$ ' + Number(c.valor_mensal).toFixed(2).replace('.', ',');
    const dtInicio = new Date(c.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR');
    const dtFim = fim.toLocaleDateString('pt-BR');
    const diasLabel = diasFim < 0
      ? '<span style="color:#DC2626;font-weight:700">Vencido</span>'
      : diasFim <= 60
        ? '<span style="color:#D97706;font-weight:700">' + diasFim + ' dias</span>'
        : '<span style="color:#9CA3AF">' + diasFim + ' dias</span>';
    const rowCls = diasFim <= 60 && c.status === 'ativo' ? ' class="row-vencendo"' : '';
    return '<tr' + rowCls + '>' +
      '<td><strong>' + _esc(cliente) + '</strong></td>' +
      '<td>' + _esc(c.numero || '—') + '</td>' +
      '<td>' + _esc(c.descricao || '—') + '</td>' +
      '<td>' + dtInicio + '</td>' +
      '<td>' + dtFim + '</td>' +
      '<td>' + (c.duracao_meses || '—') + ' meses</td>' +
      '<td><strong>' + valor + '</strong></td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + diasLabel + '</td>' +
      '<td>' +
        '<button class="btn-icon" title="Editar" onclick=\'abrirModalContrato(' + JSON.stringify(c) + ')\'><i class="ti ti-pencil"></i></button>' +
        (c.status === 'ativo' ? '<button class="btn-icon" title="Renovar" onclick="renovarContrato(\'' + c.id + '\')"><i class="ti ti-refresh" style="color:#3730A3"></i></button>' : '') +
        '<button class="btn-icon" title="Excluir" onclick="excluirContrato(\'' + c.id + '\')"><i class="ti ti-trash" style="color:#DC2626"></i></button>' +
      '</td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table">' +
    '<thead><tr><th>Cliente</th><th>Número</th><th>Descrição</th><th>Início</th><th>Fim</th><th>Duração</th><th>Valor/mês</th><th>Status</th><th>Vencimento</th><th></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

async function abrirModalContrato(c) {
  try { await _carregarClientesSelect('mc-cliente'); } catch(e) { console.warn('[Contratos] falha ao carregar clientes:', e); }
  document.getElementById('mc-id').value = c ? c.id : '';
  document.getElementById('mc-titulo').textContent = c ? 'Editar Contrato' : 'Novo Contrato';
  document.getElementById('mc-cliente').value = c ? (c.cliente_id || '') : '';
  document.getElementById('mc-numero').value = c ? (c.numero || '') : '';
  document.getElementById('mc-descricao').value = c ? (c.descricao || '') : '';
  document.getElementById('mc-status').value = c ? (c.status || 'ativo') : 'ativo';
  document.getElementById('mc-inicio').value = c ? (c.data_inicio || '') : '';
  document.getElementById('mc-duracao').value = c ? (c.duracao_meses || '') : '';
  document.getElementById('mc-fim').value = c ? (c.data_fim || '') : '';
  document.getElementById('mc-dia-venc').value = c ? (c.dia_vencimento || 10) : 10;
  document.getElementById('mc-valor').value = c ? (c.valor_mensal || '') : '';
  document.getElementById('mc-indice').value = c ? (c.indice_reajuste || 'IGP-M') : 'IGP-M';
  document.getElementById('mc-obs').value = c ? (c.observacao || '') : '';
  document.getElementById('modal-contrato').classList.add('open');
}

function calcularFimContrato() {
  var inicio = document.getElementById('mc-inicio').value;
  var dur = parseInt(document.getElementById('mc-duracao').value);
  if (!inicio || !dur) return;
  var d = new Date(inicio + 'T12:00:00');
  d.setMonth(d.getMonth() + dur);
  d.setDate(d.getDate() - 1);
  document.getElementById('mc-fim').value = d.toISOString().slice(0, 10);
}

async function salvarContrato() {
  const id = document.getElementById('mc-id').value;
  const clienteId = document.getElementById('mc-cliente').value;
  const inicio = document.getElementById('mc-inicio').value;
  const duracao = parseInt(document.getElementById('mc-duracao').value);
  const fim = document.getElementById('mc-fim').value;
  const valor = parseFloat(document.getElementById('mc-valor').value);
  const diaVenc = parseInt(document.getElementById('mc-dia-venc').value) || 10;

  if (!clienteId) { alert('Selecione o cliente.'); return; }
  if (!inicio) { alert('Informe a data de início.'); return; }
  if (!duracao) { alert('Selecione a duração.'); return; }
  if (!valor || valor <= 0) { alert('Informe o valor mensal.'); return; }

  var numeroManual = document.getElementById('mc-numero').value.trim();
  var numero = numeroManual || null;
  if (!id && !numeroManual) {
    const countRes = await sf('/rest/v1/contratos?select=id');
    const total = Array.isArray(countRes.data) ? countRes.data.length : 0;
    numero = 'CT-' + String(total + 1).padStart(3, '0');
    document.getElementById('mc-numero').value = numero;
  }

  const payload = {
    cliente_id: clienteId,
    numero,
    descricao: document.getElementById('mc-descricao').value.trim() || null,
    data_inicio: inicio,
    data_fim: fim,
    duracao_meses: duracao,
    valor_mensal: valor,
    dia_vencimento: diaVenc,
    status: document.getElementById('mc-status').value,
    indice_reajuste: document.getElementById('mc-indice').value,
    observacao: document.getElementById('mc-obs').value.trim() || null
  };

  let res;
  if (id) {
    res = await sf('/rest/v1/contratos?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(payload) });
  } else {
    res = await sf('/rest/v1/contratos', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Prefer': 'return=minimal' }
    });
  }
  if (!res.ok) { alert('Erro ao salvar contrato: ' + JSON.stringify(res.data)); return; }

  if (!id) {
    // Busca o ID do contrato recém criado pelo numero (mais confiável que return=representation)
    const q = await sf('/rest/v1/contratos?numero=eq.' + encodeURIComponent(numero) + '&select=id&order=created_at.desc&limit=1');
    const contratoId = Array.isArray(q.data) && q.data[0] ? q.data[0].id : null;
    console.log('[salvarContrato] contratoId:', contratoId, '| numero:', numero, '| q.data:', q.data);
    if (contratoId) {
      await _gerarParcelas(contratoId, clienteId, inicio, duracao, diaVenc, valor, numero);
    } else {
      console.error('[salvarContrato] contratoId não encontrado — parcelas NÃO geradas. q:', q);
      alert('Contrato salvo, mas não foi possível gerar as parcelas. Verifique o console.');
    }
  }

  fecharModal('modal-contrato');
  carregarContratos();
}

async function _gerarParcelas(contratoId, clienteId, inicio, duracao, diaVenc, valor, numero) {
  const parcelas = [];
  for (var i = 0; i < duracao; i++) {
    var d = new Date(inicio + 'T12:00:00');
    d.setMonth(d.getMonth() + i);
    d.setDate(diaVenc);
    var venc = d.toISOString().slice(0, 10);
    parcelas.push({
      contrato_id: contratoId,
      cliente_id: clienteId,
      descricao: 'Mensalidade ' + numero + ' - Mês ' + (i + 1) + '/' + duracao,
      valor: valor,
      vencimento: venc,
      status: 'pendente'
    });
  }

  console.log('[_gerarParcelas] gerando', parcelas.length, 'parcelas para contrato', contratoId);
  for (var j = 0; j < parcelas.length; j += 10) {
    var lote = parcelas.slice(j, j + 10);
    var res = await sf('/rest/v1/financeiro_receber', {
      method: 'POST',
      body: JSON.stringify(lote),
      headers: { 'Prefer': 'return=minimal' }
    });
    if (!res.ok) {
      console.error('[_gerarParcelas] Erro no lote ' + (j / 10 + 1) + ':', res.status, res.data);
    } else {
      console.log('[_gerarParcelas] Lote ' + (j / 10 + 1) + ' inserido OK (' + lote.length + ' parcelas)');
    }
  }
}

async function renovarContrato(id) {
  if (!confirm('Iniciar renovação deste contrato?')) return;
  const res = await sf('/rest/v1/contratos?id=eq.' + id, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'em_renovacao' })
  });
  if (!res.ok) { alert('Erro ao atualizar status.'); return; }
  carregarContratos();
}

async function excluirContrato(id) {
  if (!confirm('Excluir este contrato? As parcelas geradas NÃO serão excluídas automaticamente.')) return;
  const res = await sf('/rest/v1/contratos?id=eq.' + id, { method: 'DELETE' });
  if (!res.ok) { alert('Erro ao excluir: ' + JSON.stringify(res.data)); return; }
  carregarContratos();
}

async function _carregarClientesSelect(selId) {
  const { data } = await sf('/rest/v1/clientes?select=id,nome,empresa&order=nome.asc');
  const sel = document.getElementById(selId);
  const cur = sel.value;
  sel.innerHTML = '<option value="">Selecione o cliente...</option>';
  (Array.isArray(data) ? data : []).forEach(function(c) {
    var opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.nome || c.empresa || c.id;
    sel.appendChild(opt);
  });
  if (cur) sel.value = cur;
}

function _cStatusLabel(s) {
  return { ativo: 'Ativo', encerrado: 'Encerrado', cancelado: 'Cancelado', em_renovacao: 'Em Renovação' }[s] || s;
}

function _mesAno(d) {
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}
