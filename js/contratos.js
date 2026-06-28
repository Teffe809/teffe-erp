/* ═══════════════════════════════════════════════════════
   CONTRATOS
   Colunas reais: id, created_at, cliente_id, numero,
   descricao, data_inicio, data_fim, valor_mensal, status,
   dia_vencimento, duracao_meses, indice_reajuste, observacao
═══════════════════════════════════════════════════════ */

async function carregarContratos() {
  const wrap = document.querySelector('#view-contratos .table-wrap');
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';

  const { data, ok, status: httpStatus } = await sf('/rest/v1/contratos?select=*&order=created_at.desc');
  console.log('[carregarContratos] ok:', ok, '| status:', httpStatus, '| rows:', data && data.length);
  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar contratos.</div>'; return; }
  if (!data.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhum contrato cadastrado.</div>'; return; }

  // Carrega nomes dos clientes em uma única query
  var clienteMap = {};
  try {
    var clienteIds = [...new Set(data.map(function(c){ return c.cliente_id; }).filter(Boolean))];
    if (clienteIds.length) {
      var cr = await sf('/rest/v1/clientes?id=in.(' + clienteIds.join(',') + ')&select=id,razao_social,codigo');
      (cr.data || []).forEach(function(cli) { clienteMap[cli.id] = cli; });
    }
  } catch(e) { console.warn('[carregarContratos] erro ao carregar clientes:', e); }

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const rows = data.map(function(c) {
    const cli = clienteMap[c.cliente_id];
    const clienteNome = cli ? (cli.razao_social || '—') : '—';
    const clienteCodigo = cli && cli.codigo ? cli.codigo : null;
    const fim = c.data_fim ? new Date(c.data_fim + 'T12:00:00') : null;
    const diasFim = fim ? Math.ceil((fim - hoje) / 86400000) : null;
    const statusBadge = '<span class="badge badge-' + c.status + '">' + _cStatusLabel(c.status) + '</span>';
    const servicos = Array.isArray(c.servicos_contratados) ? c.servicos_contratados : [];
    const servicosBadges = servicos.map(function(s) {
      const cores = { Impressao: '#0A4B8D', Notebook: '#7C3AED', Desktop: '#065F46', 'TEFFE IA': '#F87A13' };
      return '<span class="badge" style="background:' + (cores[s] || '#6B7280') + ';color:#fff;margin-right:3px">' + _esc(s) + '</span>';
    }).join('');
    const valor = c.valor_mensal ? 'R$ ' + Number(c.valor_mensal).toFixed(2).replace('.', ',') : '—';
    const dtInicio = c.data_inicio ? new Date(c.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const dtFim = fim ? fim.toLocaleDateString('pt-BR') : '—';
    const diasLabel = diasFim === null ? '<span style="color:#9CA3AF">—</span>'
      : diasFim < 0
        ? '<span style="color:#DC2626;font-weight:700">Vencido</span>'
        : diasFim <= 60
          ? '<span style="color:#D97706;font-weight:700">' + diasFim + ' dias</span>'
          : '<span style="color:#9CA3AF">' + diasFim + ' dias</span>';
    const rowCls = diasFim !== null && diasFim <= 60 && c.status === 'ativo' ? ' class="row-vencendo"' : '';
    const clienteLabel = clienteCodigo
      ? '<span style="font-family:monospace;background:#E5E7EB;padding:1px 5px;border-radius:4px;font-size:11px;margin-right:5px">' + _esc(clienteCodigo) + '</span>' + _esc(clienteNome)
      : _esc(clienteNome);
    return '<tr' + rowCls + '>' +
      '<td><strong>' + clienteLabel + '</strong></td>' +
      '<td>' + _esc(c.numero || '—') + '</td>' +
      '<td>' + _esc(c.descricao || '—') + '</td>' +
      '<td>' + dtInicio + '</td>' +
      '<td>' + dtFim + '</td>' +
      '<td>' + (c.duracao_meses || '—') + ' meses</td>' +
      '<td><strong>' + valor + '</strong></td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + (servicosBadges || '<span style="color:#9CA3AF">—</span>') + '</td>' +
      '<td>' + diasLabel + '</td>' +
      '<td>' +
        '<button class="btn-icon" title="Editar" onclick=\'abrirModalContrato(' + JSON.stringify(c) + ')\'><i class="ti ti-pencil"></i></button>' +
        (c.status === 'ativo' ? '<button class="btn-icon" title="Renovar" onclick="renovarContrato(\'' + c.id + '\')"><i class="ti ti-refresh" style="color:#3730A3"></i></button>' : '') +
        '<button class="btn-icon" title="Excluir" onclick="excluirContrato(\'' + c.id + '\')"><i class="ti ti-trash" style="color:#DC2626"></i></button>' +
      '</td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table">' +
    '<thead><tr><th>Cliente</th><th>Número</th><th>Descrição</th><th>Início</th><th>Fim</th><th>Duração</th><th>Valor/mês</th><th>Status</th><th>Serviços</th><th>Vencimento</th><th></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

// Estado dos equipamentos do contrato em edição
var _mcEquipamentos = []; // [{id, codigo_teffe, marca, modelo, serial}]

async function abrirModalContrato(c) {
  document.getElementById('mc-id').value = c ? c.id : '';
  document.getElementById('mc-titulo').textContent = c ? 'Editar Contrato' : 'Novo Contrato';
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
  try { document.getElementById('mc-arquivo').value = ''; } catch(e) {}
  var srvAtivos = c && Array.isArray(c.servicos_contratados) ? c.servicos_contratados : [];
  ['mc-srv-impressao','mc-srv-notebook','mc-srv-desktop','mc-srv-teffe-ia'].forEach(function(elId) {
    var el = document.getElementById(elId);
    if (el) el.checked = false;
  });
  srvAtivos.forEach(function(s) {
    var elId = 'mc-srv-' + s.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '');
    var el = document.getElementById(elId);
    if (el) el.checked = true;
  });

  // Busca de cliente — exibe cliente selecionado se editando
  _mcEquipamentos = [];
  mcLimparBuscaCliente();
  if (c && c.cliente_id) {
    // Carrega dados do cliente para exibir nome
    try {
      var cr = await sf('/rest/v1/clientes?id=eq.' + c.cliente_id + '&select=id,razao_social,cnpj,codigo');
      if (cr.data && cr.data[0]) mcDefinirCliente(cr.data[0], false);
    } catch(e) { console.warn('[Contratos] erro ao carregar cliente:', e); }
    // Carrega equipamentos vinculados
    try {
      var er = await sf('/rest/v1/contrato_equipamentos?contrato_id=eq.' + c.id + '&select=*,equipamentos(*)');
      _mcEquipamentos = (er.data || []).filter(function(v){ return !!v.equipamentos; }).map(function(v){ return v.equipamentos; });
    } catch(e) { console.warn('[Contratos] erro ao carregar equipamentos:', e); }
  }
  document.getElementById('mc-equip-busca').value = '';
  document.getElementById('mc-equip-resultado').innerHTML = '';
  mcRenderEquipamentosLista();

  document.getElementById('modal-contrato').classList.add('open');
}

function mcLimparBuscaCliente() {
  document.getElementById('mc-cliente').value = '';
  document.getElementById('mc-busca-cli').value = '';
  document.getElementById('mc-busca-resultado').style.display = 'none';
  document.getElementById('mc-busca-resultado').innerHTML = '';
  document.getElementById('mc-cliente-selecionado').style.display = 'none';
  document.getElementById('mc-cliente-selecionado').innerHTML = '';
}

function mcDefinirCliente(c, mostrarBadge) {
  if (mostrarBadge === undefined) mostrarBadge = true;
  document.getElementById('mc-cliente').value = c.id;
  document.getElementById('mc-busca-resultado').style.display = 'none';
  document.getElementById('mc-busca-resultado').innerHTML = '';
  if (mostrarBadge) document.getElementById('mc-busca-cli').value = '';
  var sel = document.getElementById('mc-cliente-selecionado');
  sel.style.display = 'block';
  sel.innerHTML = '<i class="ti ti-check" style="color:#16A34A"></i> <strong>' + _esc(c.razao_social) + '</strong>' +
    (c.codigo ? ' <span style="font-family:monospace;background:#E5E7EB;padding:1px 5px;border-radius:4px">' + _esc(c.codigo) + '</span>' : '') +
    (c.cnpj ? '<span style="color:#6B7280;margin-left:8px">' + _esc(c.cnpj) + '</span>' : '') +
    ' <button type="button" onclick="mcLimparBuscaCliente()" style="background:none;border:none;cursor:pointer;color:#DC2626;margin-left:8px;font-size:13px">Trocar</button>';
}

var _mcBuscaTimer = null;
function mcBuscarClienteDebounce() {
  clearTimeout(_mcBuscaTimer);
  _mcBuscaTimer = setTimeout(mcBuscarCliente, 300);
}

async function mcBuscarCliente() {
  var busca = document.getElementById('mc-busca-cli').value.trim();
  var tipo  = document.getElementById('mc-busca-tipo').value;
  var resEl = document.getElementById('mc-busca-resultado');
  if (!busca) { resEl.style.display = 'none'; return; }

  resEl.innerHTML = '<div style="color:#6B7280;padding:6px 0">Buscando...</div>';
  resEl.style.display = 'block';

  var q = '/rest/v1/clientes?select=id,razao_social,cnpj,codigo&order=razao_social.asc&limit=8';
  var enc = encodeURIComponent(busca);
  if (tipo === 'nome')   q += '&razao_social=ilike.*' + enc + '*';
  else if (tipo === 'cnpj')   q += '&cnpj=ilike.*' + enc + '*';
  else if (tipo === 'codigo') q += '&codigo=ilike.*' + enc + '*';

  try {
    var { data } = await sf(q);
    if (!data || !data.length) {
      resEl.innerHTML = '<div style="color:#6B7280;padding:6px 0">Nenhum cliente encontrado.</div>';
      return;
    }
    resEl.innerHTML = data.map(function(c) {
      return '<div class="mc-busca-item" onclick=\'mcDefinirCliente(' + JSON.stringify(c) + ')\'>' +
        '<span class="mc-busca-nome">' + _esc(c.razao_social) + '</span>' +
        '<span class="mc-busca-sub">' + (c.codigo ? 'Cód: ' + c.codigo : '') + (c.cnpj ? ' · CNPJ: ' + c.cnpj : '') + '</span>' +
        '</div>';
    }).join('');
  } catch(e) {
    resEl.innerHTML = '<div style="color:#DC2626;padding:6px 0">Erro ao buscar clientes.</div>';
  }
}

async function mcBuscarEquipamento() {
  var busca = document.getElementById('mc-equip-busca').value.trim().toUpperCase();
  var resEl = document.getElementById('mc-equip-resultado');
  if (!busca) { resEl.innerHTML = ''; return; }

  var enc = encodeURIComponent(busca);
  var q = '/rest/v1/equipamentos?select=*&or=(codigo_teffe.ilike.*' + enc + '*,serial.ilike.*' + enc + '*)&limit=5&status=neq.manutencao';

  try {
    var { data } = await sf(q);
    if (!data || !data.length) {
      resEl.innerHTML = '<div style="color:#6B7280;font-size:13px;padding:4px 0">Nenhum equipamento encontrado.</div>';
      return;
    }
    resEl.innerHTML = data.map(function(e) {
      var jaAdicionado = _mcEquipamentos.some(function(x){ return x.id === e.id; });
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;margin-top:4px">' +
        '<div>' +
          '<strong>' + _esc(e.marca || '') + ' ' + _esc(e.modelo || '') + '</strong>' +
          '<span style="font-size:12px;color:#6B7280;margin-left:8px">Serial: ' + _esc(e.serial || '—') + ' · Teffe: ' + _esc(e.codigo_teffe || '—') + '</span>' +
        '</div>' +
        (jaAdicionado
          ? '<span style="font-size:12px;color:#16A34A">Já adicionado</span>'
          : '<button type="button" class="btn-primary" style="padding:4px 12px;font-size:12px" onclick=\'mcAdicionarEquipamento(' + JSON.stringify(e) + ')\'>Adicionar</button>'
        ) +
      '</div>';
    }).join('');
  } catch(err) {
    resEl.innerHTML = '<div style="color:#DC2626;font-size:13px">Erro ao buscar equipamentos.</div>';
  }
}

function mcAdicionarEquipamento(e) {
  if (_mcEquipamentos.some(function(x){ return x.id === e.id; })) return;
  _mcEquipamentos.push(e);
  document.getElementById('mc-equip-busca').value = '';
  document.getElementById('mc-equip-resultado').innerHTML = '';
  mcRenderEquipamentosLista();
}

function mcRemoverEquipamento(equipId) {
  _mcEquipamentos = _mcEquipamentos.filter(function(x){ return x.id !== equipId; });
  mcRenderEquipamentosLista();
}

function mcRenderEquipamentosLista() {
  var el = document.getElementById('mc-equip-lista');
  if (!el) return;
  if (!_mcEquipamentos.length) {
    el.innerHTML = '<div style="color:#9CA3AF;font-size:13px;padding:4px 0">Nenhum equipamento vinculado.</div>';
    return;
  }
  el.innerHTML = _mcEquipamentos.map(function(e) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;margin-top:4px">' +
      '<div>' +
        '<strong>' + _esc(e.marca || '') + ' ' + _esc(e.modelo || '') + '</strong>' +
        '<span style="font-size:12px;color:#6B7280;margin-left:8px">Serial: ' + _esc(e.serial || '—') + ' · Teffe: ' + _esc(e.codigo_teffe || '—') + '</span>' +
      '</div>' +
      '<button type="button" class="btn-icon" style="color:#DC2626" title="Remover" onclick="mcRemoverEquipamento(\'' + e.id + '\')"><i class="ti ti-trash"></i></button>' +
    '</div>';
  }).join('');
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

  const servicosSelecionados = ['Impressao', 'Notebook', 'Desktop', 'TEFFE IA'].filter(function(s) {
    return document.getElementById('mc-srv-' + s.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '')) &&
           document.getElementById('mc-srv-' + s.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '')).checked;
  });

  const fileInput = document.getElementById('mc-arquivo');
  let arquivoUrl = null;
  if (fileInput && fileInput.files[0]) {
    const file = fileInput.files[0];
    const path = (numero || 'contrato') + '_' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    arquivoUrl = await _uploadArquivo('contratos-pdf', path, file);
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
    observacao: document.getElementById('mc-obs').value.trim() || null,
    servicos_contratados: servicosSelecionados
  };
  if (arquivoUrl) payload.arquivo_url = arquivoUrl;

  console.log('[salvarContrato] payload:', payload);

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
  console.log('[salvarContrato] resposta ok:', res.ok, '| data:', res.data);
  if (!res.ok) { alert('Erro ao salvar contrato: ' + JSON.stringify(res.data)); return; }

  var contratoIdFinal = id || null;
  if (!id) {
    // Busca o ID do contrato recém criado (uma única query reutilizada para parcelas + equipamentos)
    const q = await sf('/rest/v1/contratos?numero=eq.' + encodeURIComponent(numero) + '&select=id&order=created_at.desc&limit=1');
    contratoIdFinal = Array.isArray(q.data) && q.data[0] ? q.data[0].id : null;
    console.log('[salvarContrato] contratoId:', contratoIdFinal, '| numero:', numero);
    if (contratoIdFinal) {
      await _gerarParcelas(contratoIdFinal, clienteId, inicio, duracao, diaVenc, valor, numero);
    } else {
      console.error('[salvarContrato] contratoId não encontrado — parcelas NÃO geradas. q:', q);
      alert('Contrato salvo, mas não foi possível gerar as parcelas. Verifique o console.');
    }
  }
  if (contratoIdFinal) await _sincronizarEquipamentosContrato(contratoIdFinal, numero);

  registrarLog(id ? 'contrato_editado' : 'contrato_criado', { numero, cliente_id: clienteId });
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
  const sel = document.getElementById(selId);
  if (!sel) return;
  sel.innerHTML = '<option value="">Carregando...</option>';
  const { data } = await sf('/rest/v1/clientes?select=id,nome,empresa&order=nome.asc');
  sel.innerHTML = '<option value="">Selecione o cliente...</option>';
  (Array.isArray(data) ? data : []).forEach(function(c) {
    var opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.empresa || c.nome || c.id;
    sel.appendChild(opt);
  });
}

function _cStatusLabel(s) {
  return { ativo: 'Ativo', encerrado: 'Encerrado', cancelado: 'Cancelado', em_renovacao: 'Em Renovação' }[s] || s;
}

function _mesAno(d) {
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

async function _sincronizarEquipamentosContrato(contratoId, numero) {
  if (!_mcEquipamentos.length) return;

  // Carrega vínculos existentes para saber o que adicionar/remover
  var existentes = [];
  try {
    var er = await sf('/rest/v1/contrato_equipamentos?contrato_id=eq.' + contratoId + '&select=equipamento_id');
    existentes = (er.data || []).map(function(v){ return v.equipamento_id; });
  } catch(e) { console.warn('[_sincronizarEquipamentosContrato] erro ao carregar existentes:', e); }

  var novosIds = _mcEquipamentos.map(function(e){ return e.id; });

  // Adicionar novos
  var paraBuscarEmail = null;
  try {
    var sess = await _supabase.auth.getSession();
    paraBuscarEmail = sess && sess.data && sess.data.session ? sess.data.session.user.email : null;
  } catch(e) {}

  for (var i = 0; i < _mcEquipamentos.length; i++) {
    var eq = _mcEquipamentos[i];
    if (existentes.includes(eq.id)) continue;
    await sf('/rest/v1/contrato_equipamentos', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ contrato_id: contratoId, equipamento_id: eq.id, adicionado_por: paraBuscarEmail })
    });
    registrarLog('equipamento_adicionado', { contrato_id: contratoId, equipamento_id: eq.id, modelo: eq.modelo, serial: eq.serial, numero });
  }

  // Remover os que saíram da lista
  for (var j = 0; j < existentes.length; j++) {
    var exId = existentes[j];
    if (novosIds.includes(exId)) continue;
    await sf('/rest/v1/contrato_equipamentos?contrato_id=eq.' + contratoId + '&equipamento_id=eq.' + exId, { method: 'DELETE' });
    var eq2 = _mcEquipamentos.find(function(x){ return x.id === exId; }) || { id: exId };
    registrarLog('equipamento_removido', { contrato_id: contratoId, equipamento_id: exId, numero });
  }
}
