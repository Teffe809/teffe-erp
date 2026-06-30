/* ═══════════════════════════════════════════════════════
   CONTRATOS
   Colunas: id, created_at, cliente_id, numero,
   descricao, data_inicio, data_fim, valor_mensal, status,
   dia_vencimento, duracao_meses, indice_reajuste, observacao,
   tipo_contrato, valor_fixo, valor_pagina_pb, valor_pagina_color,
   franquia_paginas, valor_franquia, valor_excedente_pb,
   valor_excedente_color, rollover_ativo, contador_inicial_pb,
   contador_inicial_color
═══════════════════════════════════════════════════════ */

var _fcContratoAtual = null;
var _fcFechamentosData = [];

var _TEFFE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 580 175" style="height:60px;width:auto;display:block;"><rect width="580" height="175" fill="#ffffff"/><polygon points="95,31 140,57 140,109 95,135 50,109 50,57" fill="none" stroke="#E07820" stroke-width="5" stroke-linejoin="round"/><polygon points="95,37 135,60 135,106 95,129 55,106 55,60" fill="#ffffff"/><polygon points="95,43 130,63 130,103 95,123 60,103 60,63" fill="#1A2E5A"/><rect x="78" y="62" width="34" height="6" rx="2.5" fill="#E07820"/><rect x="91" y="62" width="7" height="30" rx="2.5" fill="#E07820"/><line x1="140" y1="57" x2="163" y2="44" stroke="#E07820" stroke-width="1.8"/><circle cx="166" cy="42" r="3.8" fill="#E07820"/><line x1="140" y1="109" x2="163" y2="122" stroke="#E07820" stroke-width="1.8"/><circle cx="166" cy="124" r="3.8" fill="#E07820"/><line x1="95" y1="135" x2="95" y2="158" stroke="#E07820" stroke-width="1.8"/><circle cx="95" cy="161" r="3.8" fill="#E07820"/><line x1="50" y1="109" x2="27" y2="122" stroke="#E07820" stroke-width="1.8"/><circle cx="24" cy="124" r="3.8" fill="#E07820"/><line x1="50" y1="57" x2="27" y2="44" stroke="#E07820" stroke-width="1.8"/><circle cx="24" cy="42" r="3.8" fill="#E07820"/><text font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="76" x="200" y="103"><tspan fill="#1A2E5A">TE</tspan><tspan fill="#E07820">FFE</tspan></text><rect x="200" y="111" width="310" height="3" rx="1.5" fill="#E07820"/><text x="202" y="139" font-family="Arial,sans-serif" font-weight="700" font-size="15" fill="#E07820" letter-spacing="6">TECNOLOGIA</text></svg>';

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

  const _tipoBadgeCfg = { manutencao: { l: 'Manutenção', bg: '#DBEAFE', c: '#1D4ED8' }, locacao: { l: 'Locação', bg: '#DCFCE7', c: '#15803D' }, avulso: { l: 'Avulso', bg: '#FED7AA', c: '#C2410C' } };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const rows = data.map(function(c) {
    const cli = clienteMap[c.cliente_id];
    const clienteNome = cli ? (cli.razao_social || '—') : '—';
    const clienteCodigo = cli && cli.codigo ? cli.codigo : null;
    const fim = c.data_fim ? new Date(c.data_fim + 'T12:00:00') : null;
    const diasFim = fim ? Math.ceil((fim - hoje) / 86400000) : null;
    const statusBadge = '<span class="badge badge-' + c.status + '">' + _cStatusLabel(c.status) + '</span>';
    const tb = c.tipo_contrato ? (_tipoBadgeCfg[c.tipo_contrato] || { l: c.tipo_contrato, bg: '#E5E7EB', c: '#374151' }) : null;
    const tipoBadge = tb ? '<span class="badge" style="background:' + tb.bg + ';color:' + tb.c + '">' + tb.l + '</span>' : '—';
    const valor = c.valor_mensal ? 'R$ ' + Number(c.valor_mensal).toFixed(2).replace('.', ',') : '—';
    const dtInicio = c.data_inicio ? new Date(c.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const dtFim = fim ? fim.toLocaleDateString('pt-BR') : '—';
    const rowCls = diasFim !== null && diasFim <= 60 && c.status === 'ativo' ? ' class="row-vencendo"' : '';
    const clienteLabel = clienteCodigo
      ? '<span style="font-family:monospace;background:#E5E7EB;padding:1px 5px;border-radius:4px;font-size:11px;margin-right:5px">' + _esc(clienteCodigo) + '</span>' + _esc(clienteNome)
      : _esc(clienteNome);
    var cJson = JSON.stringify(c);
    return '<tr' + rowCls + '>' +
      '<td style="white-space:nowrap"><strong>' + clienteLabel + '</strong></td>' +
      '<td style="white-space:nowrap;font-family:monospace">' + _esc(c.numero || '—') + '</td>' +
      '<td>' + tipoBadge + '</td>' +
      '<td style="white-space:nowrap">' + dtInicio + '</td>' +
      '<td style="white-space:nowrap">' + dtFim + '</td>' +
      '<td style="white-space:nowrap"><strong>' + valor + '</strong></td>' +
      '<td>' + statusBadge + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button class="btn-icon" title="Detalhes e Fechamentos" onclick=\'abrirDetalheContrato(' + cJson + ')\'><i class="ti ti-eye" style="color:#1D4ED8"></i></button>' +
        '<button class="btn-icon" title="Editar" onclick=\'abrirModalContrato(' + cJson + ')\'><i class="ti ti-pencil"></i></button>' +
        '<button class="btn-icon" title="Excluir" onclick="excluirContrato(\'' + c.id + '\')"><i class="ti ti-trash" style="color:#DC2626"></i></button>' +
      '</td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table">' +
    '<thead><tr>' +
      '<th>Cliente</th><th>Número</th><th>Tipo</th><th>Início</th><th>Fim</th><th>Valor/mês</th><th>Status</th><th></th>' +
    '</tr></thead>' +
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
  // Tipo e campos extras
  var _tipo = c ? (c.tipo_contrato || 'manutencao') : 'manutencao';
  document.getElementById('mc-tipo').value = _tipo;
  document.getElementById('mc-val-pb').value = c ? (c.valor_pagina_pb || '') : '';
  document.getElementById('mc-val-color').value = c ? (c.valor_pagina_color || '') : '';
  document.getElementById('mc-franquia-pag').value = c ? (c.franquia_paginas || '') : '';
  document.getElementById('mc-exc-pb').value = c ? (c.valor_excedente_pb || '') : '';
  document.getElementById('mc-exc-color').value = c ? (c.valor_excedente_color || '') : '';
  var rolloverEl = document.getElementById('mc-rollover');
  if (rolloverEl) rolloverEl.checked = c ? (c.rollover_ativo || false) : false;
  document.getElementById('mc-cont-pb').value = c ? (c.contador_inicial_pb || 0) : 0;
  document.getElementById('mc-cont-color').value = c ? (c.contador_inicial_color || 0) : 0;
  mcToggleTipoContrato();
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
    try {
      var cr = await sf('/rest/v1/clientes?id=eq.' + c.cliente_id + '&select=id,razao_social,cnpj,codigo');
      if (cr.data && cr.data[0]) mcDefinirCliente(cr.data[0], false);
    } catch(e) { console.warn('[Contratos] erro ao carregar cliente:', e); }
    try {
      var er = await sf('/rest/v1/contrato_equipamentos?contrato_id=eq.' + c.id + '&select=equipamento_id');
      var eqIds = (er.data || []).map(function(v) { return v.equipamento_id; }).filter(Boolean);
      if (eqIds.length) {
        var eqRes = await sf('/rest/v1/equipamentos?id=in.(' + eqIds.join(',') + ')&select=*');
        _mcEquipamentos = Array.isArray(eqRes.data) ? eqRes.data : [];
      }
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

  const tipo = document.getElementById('mc-tipo').value || 'manutencao';
  if (!clienteId) { alert('Selecione o cliente.'); return; }
  if (!inicio) { alert('Informe a data de início.'); return; }
  if (tipo !== 'avulso' && !duracao) { alert('Selecione a duração.'); return; }
  if (tipo !== 'avulso' && (!valor || valor <= 0)) { alert('Informe o valor mensal.'); return; }

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

  var _rollEl = document.getElementById('mc-rollover');
  const payload = {
    cliente_id: clienteId,
    numero,
    descricao: document.getElementById('mc-descricao').value.trim() || null,
    data_inicio: inicio,
    data_fim: fim || null,
    duracao_meses: duracao || null,
    valor_mensal: valor || 0,
    dia_vencimento: diaVenc,
    status: document.getElementById('mc-status').value,
    indice_reajuste: document.getElementById('mc-indice').value,
    observacao: document.getElementById('mc-obs').value.trim() || null,
    servicos_contratados: servicosSelecionados,
    tipo_contrato: tipo,
    valor_pagina_pb: parseFloat(document.getElementById('mc-val-pb').value) || null,
    valor_pagina_color: parseFloat(document.getElementById('mc-val-color').value) || null,
    franquia_paginas: parseInt(document.getElementById('mc-franquia-pag').value) || null,
    valor_excedente_pb: parseFloat(document.getElementById('mc-exc-pb').value) || null,
    valor_excedente_color: parseFloat(document.getElementById('mc-exc-color').value) || null,
    rollover_ativo: _rollEl ? _rollEl.checked : false,
    contador_inicial_pb: parseInt(document.getElementById('mc-cont-pb').value) || 0,
    contador_inicial_color: parseInt(document.getElementById('mc-cont-color').value) || 0,
    valor_fixo: tipo === 'manutencao' ? (valor || null) : null,
    valor_franquia: tipo === 'locacao' ? (valor || null) : null,
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
    const q = await sf('/rest/v1/contratos?numero=eq.' + encodeURIComponent(numero) + '&select=id&order=created_at.desc&limit=1');
    contratoIdFinal = Array.isArray(q.data) && q.data[0] ? q.data[0].id : null;
    console.log('[salvarContrato] contratoId:', contratoIdFinal, '| numero:', numero);
    if (contratoIdFinal && tipo !== 'avulso' && duracao && valor > 0) {
      await _gerarParcelas(contratoIdFinal, clienteId, inicio, duracao, diaVenc, valor, numero);
    } else if (!contratoIdFinal) {
      console.error('[salvarContrato] contratoId não encontrado. q:', q);
      alert('Contrato salvo, mas não foi possível gerar as parcelas. Verifique o console.');
    }
  }
  if (contratoIdFinal) await _sincronizarEquipamentosContrato(contratoIdFinal, numero);

  registrarLog(id ? 'contrato_editado' : 'contrato_criado', { numero, cliente_id: clienteId });
  fecharModal('modal-contrato');
  carregarContratos();
}

function _fmtDateLocal(d) {
  // Formata Date como YYYY-MM-DD usando hora local (evita problema de fuso com toISOString)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function _gerarParcelas(contratoId, clienteId, inicio, duracao, diaVenc, valor, numero) {
  // Determina a primeira data de vencimento que NÃO está no passado:
  // Se hoje já passou do dia de vencimento deste mês → primeira parcela no mês seguinte.
  var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  var vencMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), diaVenc);
  // baseMes: índice JS (0=Jan). Se hoje >= vencMesAtual, avança um mês.
  var baseAno = hoje.getFullYear();
  var baseMes = (hoje >= vencMesAtual) ? hoje.getMonth() + 1 : hoje.getMonth();

  var parcelas = [];
  for (var i = 0; i < duracao; i++) {
    // new Date(year, month, day) — month é 0-indexed; overflow de mês é tratado automaticamente
    var vencDate = new Date(baseAno, baseMes + i, diaVenc);
    parcelas.push({
      contrato_id: contratoId,
      cliente_id: clienteId,
      descricao: 'Mensalidade ' + numero + ' - Mês ' + (i + 1) + '/' + duracao,
      valor: valor,
      vencimento: _fmtDateLocal(vencDate),
      status: 'pendente'
    });
  }

  console.log('[_gerarParcelas] gerando', parcelas.length, 'parcelas para contrato', contratoId,
    '| primeira:', parcelas[0] && parcelas[0].vencimento, '| última:', parcelas[parcelas.length-1] && parcelas[parcelas.length-1].vencimento);

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
  if (!confirm('Excluir este contrato? Esta ação não pode ser desfeita.')) return;

  // Verificar boletos vinculados
  const { data: boletos } = await sf('/rest/v1/boletos?contrato_id=eq.' + id + '&select=id&limit=1');
  if (boletos && boletos.length) {
    alert('Este contrato possui boletos lançados.\nExclua os boletos vinculados antes de excluir o contrato.');
    return;
  }

  // Remover registros dependentes primeiro
  await sf('/rest/v1/financeiro_receber?contrato_id=eq.' + id, { method: 'DELETE' });
  await sf('/rest/v1/contrato_equipamentos?contrato_id=eq.' + id, { method: 'DELETE' });

  const res = await sf('/rest/v1/contratos?id=eq.' + id, { method: 'DELETE' });
  if (!res.ok) { alert('Erro ao excluir: ' + (res.data && res.data.message ? res.data.message : JSON.stringify(res.data))); return; }
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

// ── TIPO DINÂMICO ──
function mcToggleTipoContrato() {
  var tipo = document.getElementById('mc-tipo').value;
  document.getElementById('mc-campos-manutencao').style.display = tipo === 'manutencao' ? '' : 'none';
  document.getElementById('mc-campos-locacao').style.display   = tipo === 'locacao'     ? '' : 'none';
  document.getElementById('mc-campos-contadores').style.display = tipo !== 'avulso'     ? '' : 'none';
  document.getElementById('mc-campos-avulso').style.display    = tipo === 'avulso'      ? '' : 'none';
  var valRow = document.getElementById('mc-valor-row');
  if (valRow) valRow.style.display = tipo === 'avulso' ? 'none' : '';
  var lbl = document.getElementById('mc-valor-label');
  if (lbl) lbl.textContent = tipo === 'locacao' ? 'Valor da Franquia (R$) *' : tipo === 'avulso' ? 'Valor estimado (R$)' : 'Valor Mensal (R$) *';
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

/* ═══════════════════════════════════════════════════════
   FECHAMENTO MENSAL
═══════════════════════════════════════════════════════ */

async function abrirDetalheContrato(c) {
  _fcContratoAtual = c;
  var tb = { manutencao: { l: 'Manutenção', bg: '#DBEAFE', c: '#1D4ED8' }, locacao: { l: 'Locação', bg: '#DCFCE7', c: '#15803D' }, avulso: { l: 'Avulso', bg: '#FED7AA', c: '#C2410C' } };
  var t = tb[c.tipo_contrato] || { l: c.tipo_contrato || '—', bg: '#E5E7EB', c: '#374151' };
  var tipoBadge = '<span class="badge" style="background:' + t.bg + ';color:' + t.c + '">' + t.l + '</span>';
  document.getElementById('det-contrato-titulo').textContent = 'Contrato ' + (c.numero || '') + ' — Detalhes e Fechamentos';

  var servicos = Array.isArray(c.servicos_contratados) ? c.servicos_contratados : [];
  var cores = { Impressao: '#0A4B8D', Notebook: '#7C3AED', Desktop: '#065F46', 'TEFFE IA': '#F87A13' };
  var servicosBadges = servicos.length
    ? servicos.map(function(s) { return '<span class="badge" style="background:' + (cores[s]||'#6B7280') + ';color:#fff;margin-right:3px">' + _esc(s) + '</span>'; }).join('')
    : '<span style="color:#9CA3AF">—</span>';
  var dtInicio = c.data_inicio ? new Date(c.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
  var dtFim = c.data_fim ? new Date(c.data_fim + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
  var fmt2 = function(v) { return v ? 'R$ ' + Number(v).toFixed(2).replace('.', ',') : '—'; };

  function di(label, val) {
    return val ? '<div class="adm-det-row"><span class="adm-det-label">' + label + '</span><span class="adm-det-val">' + val + '</span></div>' : '';
  }

  var infoHtml = '<div class="adm-det-grid" style="grid-template-columns:1fr 1fr 1fr;gap:6px 16px;margin-bottom:12px">' +
    di('Número', '<strong style="font-family:monospace">' + _esc(c.numero || '—') + '</strong>') +
    di('Tipo', tipoBadge) +
    di('Status', '<span class="badge badge-' + c.status + '">' + _cStatusLabel(c.status) + '</span>') +
    di('Início', dtInicio) +
    di('Fim', dtFim) +
    di('Duração', c.duracao_meses ? c.duracao_meses + ' meses' : '—') +
    di('Dia Vencimento', c.dia_vencimento ? 'Dia ' + c.dia_vencimento : '—') +
    di('Valor Mensal', '<strong>' + fmt2(c.valor_mensal) + '</strong>') +
    di('Índice', c.indice_reajuste || '—') +
    (c.tipo_contrato === 'manutencao' ? di('Pág PB', c.valor_pagina_pb ? 'R$ ' + Number(c.valor_pagina_pb).toFixed(4) : '—') : '') +
    (c.tipo_contrato === 'manutencao' ? di('Pág Color', c.valor_pagina_color ? 'R$ ' + Number(c.valor_pagina_color).toFixed(4) : '—') : '') +
    (c.tipo_contrato === 'locacao' ? di('Franquia', c.franquia_paginas ? c.franquia_paginas + ' págs' : '—') : '') +
    (c.tipo_contrato === 'locacao' ? di('Excedente PB', c.valor_excedente_pb ? 'R$ ' + Number(c.valor_excedente_pb).toFixed(4) : '—') : '') +
    (c.tipo_contrato === 'locacao' ? di('Excedente Color', c.valor_excedente_color ? 'R$ ' + Number(c.valor_excedente_color).toFixed(4) : '—') : '') +
    (c.tipo_contrato === 'locacao' ? di('Rollover', c.rollover_ativo ? '<span style="color:#15803D">✓ Ativo</span>' : 'Inativo') : '') +
    '</div>' +
    (servicos.length ? di('Serviços', servicosBadges) : '') +
    (c.descricao ? '<div style="margin-top:8px"><span class="adm-det-label">Descrição</span><div style="color:#374151;margin-top:3px">' + _esc(c.descricao) + '</div></div>' : '') +
    (c.observacao ? '<div style="margin-top:8px"><span class="adm-det-label">Observação</span><div style="color:#374151;margin-top:3px">' + _esc(c.observacao) + '</div></div>' : '');

  document.getElementById('det-contrato-info').innerHTML = infoHtml;
  await fcCarregarFechamentos(c.id);
  document.getElementById('modal-detalhe-contrato').classList.add('open');
}

async function fcCarregarFechamentos(contratoId) {
  var wrap = document.getElementById('fc-lista-wrap');
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';
  var r = await sf('/rest/v1/fechamentos_mensais?contrato_id=eq.' + contratoId + '&select=*&order=mes_referencia.desc');
  var rows = Array.isArray(r.data) ? r.data : [];
  _fcFechamentosData = rows;
  console.log('[fcCarregarFechamentos] rows:', rows.length, '| _fcContratoAtual:', _fcContratoAtual && _fcContratoAtual.id);
  if (!rows.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhum fechamento registrado. Clique em "+ Novo Fechamento" para começar.</div>'; return; }
  var html = '<table class="erp-table"><thead><tr><th>Mês</th><th>Págs PB</th><th>Págs Color</th><th>Valor Fixo</th><th>Excedente</th><th>Total</th><th>Boleto</th><th></th></tr></thead><tbody>';
  rows.forEach(function(f, idx) {
    var mesLabel = f.mes_referencia ? new Date(f.mes_referencia + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '—';
    var ppb = (f.contador_pb_atual || 0) - (f.contador_pb_anterior || 0);
    var pcol = (f.contador_color_atual || 0) - (f.contador_color_anterior || 0);
    var total = 'R$ ' + Number(f.valor_total || 0).toFixed(2).replace('.', ',');
    var boletoSt = f.boleto_gerado
      ? '<span class="badge" style="background:#DCFCE7;color:#15803D">Gerado</span>'
      : '<span class="badge" style="background:#FEF3C7;color:#B45309">Pendente</span>';
    html += '<tr><td><strong>' + mesLabel + '</strong></td><td>' + ppb + '</td><td>' + pcol + '</td>' +
      '<td>R$ ' + Number(f.valor_fixo || 0).toFixed(2).replace('.', ',') + '</td>' +
      '<td>R$ ' + Number(f.valor_excedente || 0).toFixed(2).replace('.', ',') + '</td>' +
      '<td><strong>' + total + '</strong></td><td>' + boletoSt + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button class="btn-icon" title="Extrato PDF" onclick="fcImprimirExtrato(' + idx + ')"><i class="ti ti-file-text" style="color:#1D4ED8"></i></button>' +
        '<button class="btn-icon" title="Excluir fechamento" onclick="fcExcluirFechamento(\'' + f.id + '\',\'' + contratoId + '\')"><i class="ti ti-trash" style="color:#DC2626"></i></button>' +
      '</td></tr>';
  });
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

async function fcExcluirFechamento(id, contratoId) {
  if (!confirm('Tem certeza que deseja excluir este fechamento?\n\nATENÇÃO: O boleto gerado NÃO será excluído automaticamente.')) return;
  var r = await sf('/rest/v1/fechamentos_mensais?id=eq.' + id, { method: 'DELETE' });
  if (!r.ok) { alert('Erro ao excluir: ' + JSON.stringify(r.data)); return; }
  await fcCarregarFechamentos(contratoId);
  if (typeof carregarFechamentosView === 'function') carregarFechamentosView();
}

async function fcImprimirExtrato(idx) {
  var f = _fcFechamentosData[idx];
  var c = _fcContratoAtual;
  if (!f || !c) { alert('Dados do fechamento não encontrados.'); return; }

  var clienteNome = '—', clienteCidade = '';
  try {
    var cr = await sf('/rest/v1/clientes?id=eq.' + c.cliente_id + '&select=razao_social,cidade&limit=1');
    if (cr.data && cr.data[0]) { clienteNome = cr.data[0].razao_social || '—'; clienteCidade = cr.data[0].cidade || ''; }
  } catch(e) {}

  var equips = [];
  try {
    var er = await sf('/rest/v1/contrato_equipamentos?contrato_id=eq.' + c.id + '&select=equipamento_id');
    var eqIds = (er.data || []).map(function(v){ return v.equipamento_id; }).filter(Boolean);
    if (eqIds.length) {
      var eqRes = await sf('/rest/v1/equipamentos?id=in.(' + eqIds.join(',') + ')&select=id,marca,modelo,serial,codigo_teffe');
      equips = Array.isArray(eqRes.data) ? eqRes.data : [];
    }
  } catch(e) {}

  _abrirExtratoFechamento(f, c, clienteNome, clienteCidade, equips);
}

function _abrirExtratoFechamento(f, c, clienteNome, clienteCidade, equips) {
  var esc = function(v) { return (v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
  var fmt = function(v) { return Number(v || 0).toFixed(2).replace('.', ','); };

  var mesDate = f.mes_referencia ? new Date(f.mes_referencia + 'T12:00:00') : new Date();
  var mesLabel = mesDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  var mesUpper = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);

  var diaVenc = c.dia_vencimento || 10;
  var mp = (f.mes_referencia || '').split('-');
  var vencDate = new Date(parseInt(mp[0]), parseInt(mp[1] || 1), diaVenc);
  var vencFmt = vencDate.toLocaleDateString('pt-BR');

  var tipoLabel = { manutencao:'MANUTENÇÃO', locacao:'LOCAÇÃO', avulso:'AVULSO' }[c.tipo_contrato] || (c.tipo_contrato||'').toUpperCase();
  var isManutencao = c.tipo_contrato === 'manutencao';

  var pagPb = (f.contador_pb_atual || 0) - (f.contador_pb_anterior || 0);
  var pagColor = (f.contador_color_atual || 0) - (f.contador_color_anterior || 0);
  var valUnitPb = Number(c.valor_pagina_pb || 0);
  var valUnitColor = Number(c.valor_pagina_color || 0);
  var totalPb = pagPb * valUnitPb;
  var totalColor = pagColor * valUnitColor;
  var valorFixo = Number(f.valor_fixo || 0);
  var valorExcedente = Number(f.valor_excedente || 0);
  var total = Number(f.valor_total || 0);

  // Seção de equipamentos com tabela de contadores
  var equipHtml = '';
  if (equips.length === 0) {
    equipHtml = '<div style="padding:20px;color:#666;font-size:13px">Nenhum equipamento vinculado.</div>';
  } else {
    equips.forEach(function(eq, i) {
      equipHtml += '<div style="padding:20px;border-bottom:1px solid #eee;">' +
        '<h3 style="color:#0A4B8D;border-bottom:1px solid #F87A13;padding-bottom:5px;margin:0 0 6px;font-size:14px;">EQUIPAMENTO: ' + esc((eq.marca||'') + ' ' + (eq.modelo||'')) + '</h3>' +
        '<p style="color:#666;font-size:12px;margin:0 0 10px">Serial: ' + esc(eq.serial||'—') + ' | Código Teffe: ' + esc(eq.codigo_teffe||'—') + '</p>';
      if (i === 0) {
        equipHtml +=
          '<table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:13px;">' +
          '<thead><tr style="background:#0A4B8D;color:white;">' +
            '<th style="padding:8px;text-align:left;">DESCRIÇÃO</th>' +
            '<th style="padding:8px;text-align:right;">ANTERIOR</th>' +
            '<th style="padding:8px;text-align:right;">ATUAL</th>' +
            '<th style="padding:8px;text-align:right;">PÁGINAS</th>' +
            '<th style="padding:8px;text-align:right;">VALOR UNIT.</th>' +
            '<th style="padding:8px;text-align:right;">TOTAL</th>' +
          '</tr></thead><tbody>' +
          '<tr style="background:#f9f9f9;">' +
            '<td style="padding:8px;border:1px solid #ddd;">Impressão PB</td>' +
            '<td style="padding:8px;text-align:right;border:1px solid #ddd;">' + (f.contador_pb_anterior||0) + '</td>' +
            '<td style="padding:8px;text-align:right;border:1px solid #ddd;">' + (f.contador_pb_atual||0) + '</td>' +
            '<td style="padding:8px;text-align:right;border:1px solid #ddd;">' + pagPb + '</td>' +
            '<td style="padding:8px;text-align:right;border:1px solid #ddd;">R$ ' + fmt(valUnitPb) + '</td>' +
            '<td style="padding:8px;text-align:right;border:1px solid #ddd;">R$ ' + fmt(totalPb) + '</td>' +
          '</tr><tr>' +
            '<td style="padding:8px;border:1px solid #ddd;">Impressão Colorida</td>' +
            '<td style="padding:8px;text-align:right;border:1px solid #ddd;">' + (f.contador_color_anterior||0) + '</td>' +
            '<td style="padding:8px;text-align:right;border:1px solid #ddd;">' + (f.contador_color_atual||0) + '</td>' +
            '<td style="padding:8px;text-align:right;border:1px solid #ddd;">' + pagColor + '</td>' +
            '<td style="padding:8px;text-align:right;border:1px solid #ddd;">R$ ' + fmt(valUnitColor) + '</td>' +
            '<td style="padding:8px;text-align:right;border:1px solid #ddd;">R$ ' + fmt(totalColor) + '</td>' +
          '</tr></tbody></table>';
      } else {
        equipHtml += '<p style="font-size:12px;color:#888;">Contadores consolidados no equipamento principal.</p>';
      }
      equipHtml += '</div>';
    });
  }

  // Resumo financeiro
  var finHtml = '<div style="padding:20px;">' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
    '<tr><td style="padding:8px;border:1px solid #eee;"><strong>Valor Fixo Mensal</strong></td>' +
      '<td style="padding:8px;text-align:right;border:1px solid #eee;">R$ ' + fmt(valorFixo) + '</td></tr>';

  if (isManutencao) {
    finHtml += '<tr style="background:#f9f9f9;"><td style="padding:8px;border:1px solid #eee;"><strong>Valor Produção PB (' + pagPb + ' págs × R$ ' + fmt(valUnitPb) + ')</strong></td>' +
      '<td style="padding:8px;text-align:right;border:1px solid #eee;">R$ ' + fmt(totalPb) + '</td></tr>' +
      '<tr><td style="padding:8px;border:1px solid #eee;"><strong>Valor Produção Colorida (' + pagColor + ' págs × R$ ' + fmt(valUnitColor) + ')</strong></td>' +
      '<td style="padding:8px;text-align:right;border:1px solid #eee;">R$ ' + fmt(totalColor) + '</td></tr>';
  } else {
    if (f.rollover_credito_usado > 0) {
      finHtml += '<tr style="background:#EDE9FE;"><td style="padding:8px;border:1px solid #eee;"><strong>Rollover abatido</strong></td>' +
        '<td style="padding:8px;text-align:right;border:1px solid #eee;color:#7C3AED;">−' + f.rollover_credito_usado + ' págs</td></tr>';
    }
    if (valorExcedente > 0) {
      finHtml += '<tr style="background:#FEF2F2;"><td style="padding:8px;border:1px solid #eee;"><strong>Excedente</strong></td>' +
        '<td style="padding:8px;text-align:right;border:1px solid #eee;color:#DC2626;">R$ ' + fmt(valorExcedente) + '</td></tr>';
    }
  }

  finHtml +=
    '<tr style="background:#0A4B8D;color:white;">' +
      '<td style="padding:12px;border:1px solid #0A4B8D;"><strong>TOTAL A PAGAR</strong></td>' +
      '<td style="padding:12px;text-align:right;font-size:18px;border:1px solid #0A4B8D;"><strong>R$ ' + fmt(total) + '</strong></td>' +
    '</tr></table>' +
    '<div style="margin-top:20px;padding:15px;background:#E8F0FB;border-left:4px solid #F87A13;border-radius:4px;">' +
      '<p style="margin:0;color:#0A4B8D;"><strong>⚠️ Este extrato é meramente informativo.</strong></p>' +
      '<p style="margin:5px 0 0;color:#666;font-size:12px;">O boleto bancário será enviado separadamente com vencimento em <strong>' + vencFmt + '</strong>.</p>' +
    '</div></div>';

  var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>' +
    '<title>Extrato ' + esc(mesUpper) + ' — ' + esc(c.numero||'') + '</title>' +
    '<style>*{box-sizing:border-box;}body{font-family:Arial,sans-serif;font-size:13px;color:#1a1a1a;background:#fff;margin:0;padding:0;}' +
    '@media print{.np{display:none!important;}@page{size:A4;margin:10mm;}}</style></head><body>' +
    '<div class="np" style="display:flex;gap:10px;justify-content:flex-end;padding:12px 20px;background:#F8FAFC;border-bottom:1px solid #E2E8F0;">' +
      '<button onclick="window.close()" style="padding:8px 18px;border:1px solid #D1D5DB;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">Fechar</button>' +
      '<button onclick="window.print()" style="padding:8px 22px;border:none;border-radius:6px;background:#0A4B8D;color:#fff;font-weight:700;cursor:pointer;font-size:13px;">⎙ Imprimir / Salvar PDF</button>' +
    '</div>' +
    '<div style="background:#0A4B8D;padding:24px 30px;display:flex;justify-content:space-between;align-items:center;">' +
      '<div>' +
        '<div style="background:#fff;border-radius:8px;padding:6px 14px;display:inline-block;margin-bottom:6px;">' + _TEFFE_SVG + '</div>' +
        '<p style="color:#F87A13;margin:2px 0 0;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">EXTRATO DE FECHAMENTO MENSAL</p>' +
      '</div>' +
      '<div style="color:white;text-align:right;font-size:12px;line-height:1.9;"><p style="margin:0">contato@teffe.com.br</p><p style="margin:0">(14) 99828-9248</p><p style="margin:0">teffe.com.br</p></div>' +
    '</div>' +
    '<div style="padding:20px;border-bottom:2px solid #0A4B8D;">' +
      '<h2 style="color:#0A4B8D;margin:0 0 12px;font-size:18px;">EXTRATO — ' + esc(mesUpper.toUpperCase()) + '</h2>' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
        '<tr><td style="padding:5px 10px 5px 0;width:130px;color:#666;font-weight:700;">CLIENTE:</td><td style="padding:5px 0;">' + esc(clienteNome) + (clienteCidade ? ' — ' + esc(clienteCidade) : '') + '</td></tr>' +
        '<tr><td style="padding:5px 10px 5px 0;color:#666;font-weight:700;">CONTRATO:</td><td style="padding:5px 0;"><strong>' + esc(c.numero||'—') + '</strong> | ' + tipoLabel + '</td></tr>' +
        '<tr><td style="padding:5px 10px 5px 0;color:#666;font-weight:700;">PERÍODO:</td><td style="padding:5px 0;">' + esc(mesUpper) + '</td></tr>' +
        '<tr><td style="padding:5px 10px 5px 0;color:#666;font-weight:700;">VENCIMENTO:</td><td style="padding:5px 0;"><strong>' + vencFmt + '</strong></td></tr>' +
      '</table>' +
    '</div>' +
    equipHtml + finHtml +
    '<div style="background:#0A4B8D;padding:15px;text-align:center;margin-top:30px;">' +
      '<p style="color:white;margin:0;font-size:11px;">Teffe Tecnologia © 2026 | contato@teffe.com.br | (14) 99828-9248 | teffe.com.br</p>' +
    '</div>' +
    '<script>window.onload=function(){window.print();}<\/script></body></html>';

  var w = window.open('', '_blank', 'width=960,height=860');
  if (w) { w.document.open(); w.document.write(html); w.document.close(); }
}

async function fcAbrirNovoFechamento() {
  var c = _fcContratoAtual;
  if (!c || !c.id) return;

  // Re-fetch para garantir dados frescos (contador_inicial_pb pode estar stale no onclick cache)
  var cRes = await sf('/rest/v1/contratos?id=eq.' + c.id + '&select=*&limit=1');
  if (cRes.data && cRes.data[0]) { c = cRes.data[0]; _fcContratoAtual = c; }

  // Último fechamento para pegar contadores anteriores
  var r = await sf('/rest/v1/fechamentos_mensais?contrato_id=eq.' + c.id + '&select=*&order=mes_referencia.desc&limit=1');
  var ultimo = r.data && r.data[0] ? r.data[0] : null;
  var pbAnt = ultimo ? ultimo.contador_pb_atual : (c.contador_inicial_pb != null ? c.contador_inicial_pb : 0);
  var colorAnt = ultimo ? ultimo.contador_color_atual : (c.contador_inicial_color != null ? c.contador_inicial_color : 0);
  console.log('[fcAbrirNovoFechamento] ultimo:', ultimo ? 'sim (id=' + ultimo.id + ')' : 'nenhum',
    '| contador_inicial_pb:', c.contador_inicial_pb, '| pbAnt usado:', pbAnt,
    '| contador_inicial_color:', c.contador_inicial_color, '| colorAnt usado:', colorAnt);

  // Equipamentos do contrato (informativo)
  var equips = [];
  try {
    var er = await sf('/rest/v1/contrato_equipamentos?contrato_id=eq.' + c.id + '&select=equipamento_id');
    var eqIds = (er.data || []).map(function(v) { return v.equipamento_id; }).filter(Boolean);
    if (eqIds.length) {
      var eqRes = await sf('/rest/v1/equipamentos?id=in.(' + eqIds.join(',') + ')&select=id,marca,modelo,serial,codigo_teffe');
      equips = Array.isArray(eqRes.data) ? eqRes.data : [];
    }
  } catch(e) {}

  // Mês atual
  var hoje = new Date();
  document.getElementById('fc-mes').value = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');

  // Contadores anteriores
  document.getElementById('fc-cont-pb-ant').textContent = pbAnt;
  document.getElementById('fc-cont-color-ant').textContent = colorAnt;
  document.getElementById('fc-cont-pb-ant-val').value = pbAnt;
  document.getElementById('fc-cont-color-ant-val').value = colorAnt;
  document.getElementById('fc-cont-pb').value = '';
  document.getElementById('fc-cont-color').value = '';

  // Equipamentos (info)
  var equipWrap = document.getElementById('fc-equip-info');
  if (equips.length) {
    equipWrap.innerHTML = equips.map(function(e) {
      return '<span style="font-size:12px;color:#374151;margin-right:12px"><strong>' + _esc((e.marca || '') + ' ' + (e.modelo || '')) + '</strong>' + (e.serial ? ' S/N:' + e.serial : '') + '</span>';
    }).join('');
  } else { equipWrap.innerHTML = ''; }

  // Info de valores
  var valorBase = c.tipo_contrato === 'locacao' ? (c.valor_franquia || c.valor_mensal || 0) : (c.valor_fixo || c.valor_mensal || 0);
  document.getElementById('fc-valor-fixo-info').textContent = 'R$ ' + Number(valorBase).toFixed(2).replace('.', ',');
  document.getElementById('fc-franquia-info').textContent = c.franquia_paginas ? c.franquia_paginas + ' páginas' : '—';
  document.getElementById('fc-tipo-hidden').value = c.tipo_contrato || 'manutencao';

  // Rollover info
  var rolloverEl = document.getElementById('fc-rollover-info');
  rolloverEl.style.display = 'none';
  if (c.tipo_contrato === 'locacao' && c.rollover_ativo) {
    rolloverEl.style.display = 'block';
    var rv = await sf('/rest/v1/rollover_creditos?contrato_id=eq.' + c.id + '&expirado=eq.false&validade=gte.' + hoje.toISOString().slice(0, 10) + '&select=paginas_credito,paginas_usadas&order=validade.asc');
    var creditos = rv.data || [];
    var totalCredito = creditos.reduce(function(acc, cr) { return acc + (cr.paginas_credito - cr.paginas_usadas); }, 0);
    rolloverEl.innerHTML = '<div style="background:#EDE9FE;border:1px solid #C4B5FD;border-radius:6px;padding:8px 12px;font-size:13px"><strong>Rollover disponível:</strong> ' + totalCredito + ' páginas de crédito (' + creditos.length + ' lote(s))</div>';
  }

  // Reset
  document.getElementById('fc-resumo').innerHTML = '';
  document.getElementById('fc-calc-total').value = '';
  document.getElementById('fc-calc-val-fixo').value = '';
  document.getElementById('fc-calc-val-pag').value = '';
  document.getElementById('fc-calc-val-exc').value = '';
  document.getElementById('fc-calc-rollover-usado').value = '0';
  document.getElementById('fc-calc-excedente-pag').value = '0';
  document.getElementById('fc-calc-sobra-pag').value = '0';
  document.getElementById('fc-obs').value = '';
  document.getElementById('fc-gerar-boleto').checked = true;
  document.getElementById('fc-btn-confirmar').disabled = false;
  document.getElementById('fc-btn-confirmar').innerHTML = '<i class="ti ti-check"></i> Confirmar e Gerar Boleto';

  document.getElementById('modal-fechamento-mensal').classList.add('open');
}

async function fcCalcular() {
  var c = _fcContratoAtual;
  if (!c) return;

  var pbAntRaw = parseInt(document.getElementById('fc-cont-pb-ant-val').value);
  var colorAntRaw = parseInt(document.getElementById('fc-cont-color-ant-val').value);
  var pbAnt = isNaN(pbAntRaw) ? 0 : pbAntRaw;
  var colorAnt = isNaN(colorAntRaw) ? 0 : colorAntRaw;
  var pbAtual = parseInt(document.getElementById('fc-cont-pb').value);
  var colorAtual = parseInt(document.getElementById('fc-cont-color').value);
  var resumoEl = document.getElementById('fc-resumo');

  if (isNaN(pbAtual) || isNaN(colorAtual) || document.getElementById('fc-cont-pb').value === '' || document.getElementById('fc-cont-color').value === '') {
    resumoEl.innerHTML = '<div style="color:#6B7280;font-size:13px;padding:8px">Preencha os dois contadores para ver o cálculo.</div>';
    document.getElementById('fc-calc-total').value = '';
    return;
  }

  var pagPb = pbAtual - pbAnt;
  var pagColor = colorAtual - colorAnt;
  if (pagPb < 0 || pagColor < 0) {
    resumoEl.innerHTML = '<div style="color:#DC2626;font-size:13px;padding:8px">Contador atual não pode ser menor que o anterior.</div>';
    document.getElementById('fc-calc-total').value = '';
    return;
  }

  var tipo = c.tipo_contrato || 'manutencao';
  var valorFixo = 0, valorPaginas = 0, valorExcedente = 0;
  var rolloverUsado = 0, sobraPages = 0, excessPages = 0;

  if (tipo === 'manutencao') {
    valorFixo = Number(c.valor_fixo || c.valor_mensal || 0);
    valorPaginas = (pagPb * Number(c.valor_pagina_pb || 0)) + (pagColor * Number(c.valor_pagina_color || 0));
  } else if (tipo === 'locacao') {
    // Valor mínimo = valor_fixo (taxa fixa) + valor_franquia (franquia de páginas)
    valorFixo = Number(c.valor_fixo || 0) + Number(c.valor_franquia || c.valor_mensal || 0);
    var totalPag = pagPb + pagColor;
    var franquia = c.franquia_paginas || 0;
    var excedente = Math.max(0, totalPag - franquia);
    sobraPages = Math.max(0, franquia - totalPag);

    if (excedente > 0 && c.rollover_ativo) {
      var hoje = new Date();
      var rv = await sf('/rest/v1/rollover_creditos?contrato_id=eq.' + c.id + '&expirado=eq.false&validade=gte.' + hoje.toISOString().slice(0,10) + '&select=paginas_credito,paginas_usadas&order=validade.asc');
      var creditos = rv.data || [];
      var restExc = excedente;
      for (var i = 0; i < creditos.length && restExc > 0; i++) {
        var disp = creditos[i].paginas_credito - creditos[i].paginas_usadas;
        var usar = Math.min(disp, restExc);
        rolloverUsado += usar;
        restExc -= usar;
      }
      excedente = restExc;
    }
    excessPages = excedente;
    var totalRod = pagPb + pagColor || 1;
    var ratioColor = pagColor / totalRod;
    var ratioPb = 1 - ratioColor;
    valorExcedente = (excedente * ratioPb * Number(c.valor_excedente_pb || 0)) + (excedente * ratioColor * Number(c.valor_excedente_color || 0));
  }

  var total = valorFixo + valorPaginas + valorExcedente;

  // Store calculated values
  document.getElementById('fc-calc-total').value = total.toFixed(2);
  document.getElementById('fc-calc-val-fixo').value = valorFixo.toFixed(2);
  document.getElementById('fc-calc-val-pag').value = valorPaginas.toFixed(2);
  document.getElementById('fc-calc-val-exc').value = valorExcedente.toFixed(2);
  document.getElementById('fc-calc-rollover-usado').value = rolloverUsado;
  document.getElementById('fc-calc-excedente-pag').value = excessPages;
  document.getElementById('fc-calc-sobra-pag').value = sobraPages;

  // Calcula vencimento do boleto: dia_vencimento do mês seguinte ao mês de referência
  var mes = document.getElementById('fc-mes').value; // 'YYYY-MM'
  var diaVencC = c.dia_vencimento || 10;
  var mesParts = mes.split('-');
  // parseInt('06') = 6 → julho em JS (0-indexed) — já avança um mês naturalmente
  var vencBoleto = new Date(parseInt(mesParts[0]), parseInt(mesParts[1]), diaVencC);
  var vencBoletoFmt = vencBoleto.toLocaleDateString('pt-BR');

  var fmt = function(v) { return 'R$ ' + v.toFixed(2).replace('.', ','); };
  var html = '<div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:12px 14px">' +
    '<div style="font-weight:700;color:#0369A1;margin-bottom:10px;font-size:13px">Resumo do Fechamento</div>' +
    '<div style="display:grid;grid-template-columns:1fr auto;gap:4px 24px;font-size:13px">' +
    '<span>Páginas PB rodadas:</span><span><strong>' + pagPb + '</strong></span>' +
    '<span>Páginas Color rodadas:</span><span><strong>' + pagColor + '</strong></span>';

  if (tipo === 'locacao') {
    html += '<span>Total de páginas:</span><span>' + (pagPb + pagColor) + '</span>';
    html += '<span>Franquia:</span><span>' + (c.franquia_paginas || 0) + ' págs</span>';
    if (sobraPages > 0) html += '<span style="color:#15803D">Sobra → crédito rollover:</span><span style="color:#15803D">+' + sobraPages + ' págs (90 dias)</span>';
    if (rolloverUsado > 0) html += '<span style="color:#7C3AED">Rollover abatido:</span><span style="color:#7C3AED">−' + rolloverUsado + ' págs</span>';
    if (excessPages > 0) html += '<span style="color:#DC2626">Excedente cobrado:</span><span style="color:#DC2626">' + excessPages + ' págs</span>';
  }

  html += '<span style="padding-top:6px;border-top:1px solid #BAE6FD;margin-top:4px">Valor fixo/franquia:</span><span style="padding-top:6px;border-top:1px solid #BAE6FD;margin-top:4px">' + fmt(valorFixo) + '</span>';
  if (valorPaginas > 0) html += '<span>Valor páginas:</span><span>' + fmt(valorPaginas) + '</span>';
  if (valorExcedente > 0) html += '<span style="color:#DC2626">Valor excedente:</span><span style="color:#DC2626">' + fmt(valorExcedente) + '</span>';
  html += '<span style="font-weight:700;font-size:15px;border-top:2px solid #0369A1;padding-top:6px;margin-top:6px">TOTAL:</span>' +
    '<span style="font-weight:700;font-size:15px;color:#0369A1;border-top:2px solid #0369A1;padding-top:6px;margin-top:6px">' + fmt(total) + '</span>' +
    '<span style="color:#059669;font-weight:600;border-top:1px solid #BAE6FD;padding-top:4px;margin-top:2px">Vencimento do boleto:</span>' +
    '<span style="color:#059669;font-weight:700;border-top:1px solid #BAE6FD;padding-top:4px;margin-top:2px">' + vencBoletoFmt + '</span>';
  html += '</div></div>';
  resumoEl.innerHTML = html;
}

async function fcSalvarFechamento() {
  var c = _fcContratoAtual;
  if (!c) return;

  var mes = document.getElementById('fc-mes').value;
  var pbAntRaw = parseInt(document.getElementById('fc-cont-pb-ant-val').value);
  var colorAntRaw = parseInt(document.getElementById('fc-cont-color-ant-val').value);
  var pbAnt = isNaN(pbAntRaw) ? 0 : pbAntRaw;
  var colorAnt = isNaN(colorAntRaw) ? 0 : colorAntRaw;
  var pbAtual = parseInt(document.getElementById('fc-cont-pb').value);
  var colorAtual = parseInt(document.getElementById('fc-cont-color').value);
  var totalStr = document.getElementById('fc-calc-total').value;
  var obs = document.getElementById('fc-obs').value.trim();
  var gerarBoleto = document.getElementById('fc-gerar-boleto').checked;

  if (!mes) { alert('Informe o mês de referência.'); return; }
  if (isNaN(pbAtual) || isNaN(colorAtual) || document.getElementById('fc-cont-pb').value === '') { alert('Preencha os contadores e calcule antes de confirmar.'); return; }
  if (!totalStr) { alert('Clique nos campos de contador para calcular antes de confirmar.'); return; }

  var total = parseFloat(totalStr);
  var pagPb = pbAtual - pbAnt;
  var pagColor = colorAtual - colorAnt;
  if (pagPb < 0 || pagColor < 0) { alert('Contador atual não pode ser menor que o anterior.'); return; }

  var rolloverUsado = parseInt(document.getElementById('fc-calc-rollover-usado').value) || 0;
  var excessPages = parseInt(document.getElementById('fc-calc-excedente-pag').value) || 0;
  var sobraPages = parseInt(document.getElementById('fc-calc-sobra-pag').value) || 0;
  var valorFixo = parseFloat(document.getElementById('fc-calc-val-fixo').value) || 0;
  var valorPaginas = parseFloat(document.getElementById('fc-calc-val-pag').value) || 0;
  var valorExcedente = parseFloat(document.getElementById('fc-calc-val-exc').value) || 0;

  var btn = document.getElementById('fc-btn-confirmar');
  btn.disabled = true; btn.textContent = 'Salvando...';

  var payload = {
    contrato_id: c.id,
    equipamento_id: null,
    mes_referencia: mes + '-01',
    contador_pb_anterior: pbAnt,
    contador_pb_atual: pbAtual,
    contador_color_anterior: colorAnt,
    contador_color_atual: colorAtual,
    franquia_usada: Math.min(c.franquia_paginas || 0, pagPb + pagColor),
    franquia_excedente: excessPages + rolloverUsado,
    rollover_credito_usado: rolloverUsado,
    valor_fixo: valorFixo,
    valor_paginas: valorPaginas,
    valor_excedente: valorExcedente,
    valor_total: total,
    observacao: obs || null,
    boleto_gerado: gerarBoleto
  };

  var r = await sf('/rest/v1/fechamentos_mensais', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> Confirmar e Gerar Boleto';
    alert('Erro ao salvar fechamento: ' + JSON.stringify(r.data));
    return;
  }

  var hoje = new Date();

  // Atualizar rollover — usar créditos mais antigos
  if (c.tipo_contrato === 'locacao' && c.rollover_ativo && rolloverUsado > 0) {
    var rv = await sf('/rest/v1/rollover_creditos?contrato_id=eq.' + c.id + '&expirado=eq.false&validade=gte.' + hoje.toISOString().slice(0,10) + '&select=*&order=validade.asc');
    var creditos = rv.data || [];
    var restUsado = rolloverUsado;
    for (var i = 0; i < creditos.length && restUsado > 0; i++) {
      var cr = creditos[i];
      var disp = cr.paginas_credito - cr.paginas_usadas;
      var usar = Math.min(disp, restUsado);
      var novoUsado = cr.paginas_usadas + usar;
      await sf('/rest/v1/rollover_creditos?id=eq.' + cr.id, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ paginas_usadas: novoUsado, expirado: novoUsado >= cr.paginas_credito })
      });
      restUsado -= usar;
    }
  }

  // Criar crédito de rollover se houve sobra
  if (c.tipo_contrato === 'locacao' && c.rollover_ativo && sobraPages > 0) {
    var validade = new Date(hoje);
    validade.setDate(validade.getDate() + 90);
    await sf('/rest/v1/rollover_creditos', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        contrato_id: c.id,
        mes_origem: mes + '-01',
        paginas_credito: sobraPages,
        paginas_usadas: 0,
        validade: validade.toISOString().slice(0, 10),
        expirado: false
      })
    });
  }

  // Gerar boleto
  if (gerarBoleto && total > 0) {
    var mesPartesSalvar = mes.split('-');
    var nomeMes = new Date(parseInt(mesPartesSalvar[0]), parseInt(mesPartesSalvar[1]) - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    var diaVenc = c.dia_vencimento || 10;
    // Vencimento: dia_vencimento do mês seguinte ao mês de referência (sem toISOString para evitar fuso)
    var vencBoletoDate = new Date(parseInt(mesPartesSalvar[0]), parseInt(mesPartesSalvar[1]), diaVenc);
    await sf('/rest/v1/boletos', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        cliente_id: c.cliente_id,
        contrato_id: c.id,
        descricao: 'Referente ao fechamento de ' + nomeMes + ' — ' + (c.numero || ''),
        valor: total,
        vencimento: _fmtDateLocal(vencBoletoDate),
        status: 'a_vencer'
      })
    });
  }

  registrarLog('fechamento_mensal_criado', { contrato_id: c.id, mes, total });
  console.log('[fcSalvarFechamento] salvo OK | contrato:', c.id, '| recarregando fechamentos...');
  fecharModal('modal-fechamento-mensal');
  await fcCarregarFechamentos(c.id);
  console.log('[fcSalvarFechamento] _fcFechamentosData após reload:', _fcFechamentosData.length, 'rows');
  if (typeof carregarFechamentosView === 'function') carregarFechamentosView();
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> Confirmar e Gerar Boleto';
}
