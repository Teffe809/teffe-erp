/* ═══════════════════════════════════════════════════════
   CHAMADOS — visão administrativa
═══════════════════════════════════════════════════════ */

async function erpChamCarregar() {
  if (!_erpTecs.length) await erpTecCarregar();

  const wrap = document.getElementById('cham-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';

  const filtroStatus  = (document.getElementById('cham-filtro-status') || {}).value || '';
  const filtroTec     = (document.getElementById('cham-filtro-tec')    || {}).value || '';
  const filtroCliente = (document.getElementById('cham-filtro-cliente') || {}).value || '';
  const filtroTipo    = (document.getElementById('cham-filtro-tipo')    || {}).value || '';
  const filtroInicio  = (document.getElementById('cham-filtro-inicio')  || {}).value || '';
  const filtroFim     = (document.getElementById('cham-filtro-fim')     || {}).value || '';

  let q = '/rest/v1/chamados?select=*&order=created_at.desc';
  if (filtroStatus  && filtroStatus  !== 'todos') q += '&status=eq.' + filtroStatus;
  if (filtroTipo    && filtroTipo    !== 'todos') q += '&tipo_chamado=eq.' + filtroTipo;
  if (filtroTec === 'is_null') q += '&tecnico_id=is.null';
  else if (filtroTec) q += '&tecnico_id=eq.' + filtroTec;
  if (filtroCliente) q += '&cliente_id=eq.' + filtroCliente;
  if (filtroInicio)  q += '&created_at=gte.' + filtroInicio + 'T00:00:00';
  if (filtroFim)     q += '&created_at=lte.'  + filtroFim   + 'T23:59:59';

  const { data, ok, status: httpSt } = await sf(q);
  console.log('[erpChamCarregar] ok:', ok, '| status:', httpSt, '| rows:', data && data.length);

  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar chamados (HTTP ' + httpSt + ').</div>'; return; }
  if (!data.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhum chamado encontrado com os filtros selecionados.</div>'; return; }

  // Batch load clientes
  var clienteMap = {};
  try {
    var cliIds = [...new Set(data.map(function(r) { return r.cliente_id; }).filter(Boolean))];
    if (cliIds.length) {
      var cr = await sf('/rest/v1/clientes?id=in.(' + cliIds.join(',') + ')&select=id,razao_social,fantasia,codigo');
      (cr.data || []).forEach(function(c) { clienteMap[c.id] = c; });
    }
  } catch(e) {}

  const psLabel = { solicitado: '⚠️ Solicitado', faturado: 'Faturado', despachado: 'Despachado', entregue: '✅ Entregue' };
  const tipoLabel = { assistencia: 'Assistência', instalacao: 'Instalação', suprimento: 'Suprimento', preventiva: 'Preventiva', outro: 'Outro' };
  const tipoColor = { assistencia: '#DC2626', instalacao: '#2563EB', suprimento: '#7C3AED', preventiva: '#059669', outro: '#9CA3AF' };

  const rows = data.map(function(r) {
    const cli = clienteMap[r.cliente_id];
    const cliNome = cli ? (cli.razao_social || cli.fantasia || '–') : '–';
    const cliCodigo = cli && cli.codigo ? '<small style="color:#9CA3AF;font-family:monospace"> [' + cli.codigo + ']</small>' : '';

    const ps = r.pecas_status;
    const pecasBadge = ps
      ? '<span style="font-size:11px;padding:2px 6px;border-radius:3px;background:#FEF3C7;color:#92400E">' + (psLabel[ps] || ps) + '</span>'
      : '–';
    const pecasBtn = ps === 'solicitado'
      ? '<br><button class="btn-secondary" style="margin-top:3px;font-size:11px;padding:2px 8px" onclick="event.stopPropagation();erpChamFaturarPecas(\'' + r.id + '\')">Faturar</button>'
      : ps === 'faturado'
      ? '<br><button class="btn-secondary" style="margin-top:3px;font-size:11px;padding:2px 8px" onclick="event.stopPropagation();erpChamDespacharPecas(\'' + r.id + '\')">Despachar</button>'
      : ps === 'despachado'
      ? '<br><button class="btn-secondary" style="margin-top:3px;font-size:11px;padding:2px 8px" onclick="event.stopPropagation();erpChamConfirmarEntrega(\'' + r.id + '\',\'' + (r.tecnico_id || '') + '\',\'' + (r.numero || r.id.slice(0,6)) + '\')">Confirmar Entrega</button>'
      : '';

    const tipo = r.tipo_chamado || 'outro';
    const tipoBadge = '<span style="font-size:11px;padding:2px 7px;border-radius:3px;background:' + (tipoColor[tipo]||'#9CA3AF') + '22;color:' + (tipoColor[tipo]||'#9CA3AF') + ';font-weight:600">' + (tipoLabel[tipo] || tipo) + '</span>';

    const tecSel = '<select class="adm-sel-inline" style="font-size:12px;padding:3px 5px;max-width:140px" onchange="erpChamRedistribuir(\'' + r.id + '\',this.value)">' +
      '<option value="">Sem técnico</option>' +
      _erpTecs.map(function(t) {
        return '<option value="' + t.id + '"' + (t.id === r.tecnico_id ? ' selected' : '') + '>' + _esc(t.nome) + '</option>';
      }).join('') + '</select>';

    return '<tr style="cursor:pointer" onclick="erpChamAbrirDetalhe(' + JSON.stringify(JSON.stringify(r)) + ')">' +
      '<td><b>#' + (r.numero || r.id.slice(0,6)) + '</b></td>' +
      '<td><span>' + _esc(cliNome) + '</span>' + cliCodigo + '</td>' +
      '<td>' + tipoBadge + '</td>' +
      '<td class="adm-td-trunc" title="' + _esc((r.descricao||'').replace(/"/g,'&quot;')) + '">' + _esc(r.descricao || r.titulo || '–') + '</td>' +
      '<td>' + _esc(r.solicitante_nome || '–') + '</td>' +
      '<td><span class="badge badge-' + r.status + '">' + r.status + '</span></td>' +
      '<td onclick="event.stopPropagation()">' + pecasBadge + pecasBtn + '</td>' +
      '<td onclick="event.stopPropagation()">' + tecSel + '</td>' +
      '<td>' + new Date(r.created_at).toLocaleDateString('pt-BR') + '</td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table">' +
    '<thead><tr><th>#</th><th>Cliente</th><th>Tipo</th><th>Descrição</th><th>Solicitante</th><th>Status</th><th>Peças</th><th>Técnico</th><th>Data</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

async function erpChamRedistribuir(chamadoId, tecnicoId) {
  const { ok } = await sf('/rest/v1/chamados?id=eq.' + chamadoId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ tecnico_id: tecnicoId || null })
  });
  if (!ok) alert('Erro ao redistribuir chamado.');
}

// ── FLUXO PEÇAS ──
async function erpChamFaturarPecas(id) {
  const { ok } = await sf('/rest/v1/chamados?id=eq.' + id, { method: 'PATCH', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ pecas_status: 'faturado' }) });
  if (!ok) { alert('Erro ao atualizar status de peças.'); return; }
  erpChamCarregar();
}

async function erpChamDespacharPecas(id) {
  const { ok } = await sf('/rest/v1/chamados?id=eq.' + id, { method: 'PATCH', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ pecas_status: 'despachado' }) });
  if (!ok) { alert('Erro ao atualizar status de peças.'); return; }
  erpChamCarregar();
}

async function erpChamConfirmarEntrega(id, tecnicoId, numChamado) {
  const { ok } = await sf('/rest/v1/chamados?id=eq.' + id, { method: 'PATCH', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ pecas_status: 'entregue' }) });
  if (!ok) { alert('Erro ao confirmar entrega.'); return; }
  // Notificar técnico por e-mail
  if (tecnicoId) {
    const tec = _erpTecs.find(function(t) { return t.id === tecnicoId; });
    if (tec && tec.email && _erpTok) {
      const html = '<p>Olá <strong>' + (tec.nome || 'Técnico') + '</strong>,</p><p>As peças para o chamado <strong>#' + numChamado + '</strong> foram entregues. Por favor, acesse o portal e inicie o atendimento.</p><p>Atenciosamente,<br><strong>Teffe Tecnologia</strong></p>';
      erpEnviarEmail(tec.email, 'Peças Disponíveis — Chamado #' + numChamado + ' — Teffe Tecnologia', html).catch(function() {});
    }
  }
  erpChamCarregar();
}

// ── DETALHE CHAMADO ──
async function erpChamAbrirDetalhe(jsonStr) {
  const c = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
  const fmt  = function(v) { return v ? new Date(v).toLocaleString('pt-BR') : '–'; };
  const fmtD = function(v) { return v ? new Date(v).toLocaleDateString('pt-BR') : '–'; };
  const statusLabels = { aberto: 'Aberto', andamento: 'Em andamento', encerrado: 'Encerrado', concluido: 'Concluído', resolvido: 'Resolvido' };
  const prioLabels   = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
  const encerrado = ['encerrado','concluido','resolvido'].includes(c.status);

  // Peças utilizadas — batch load para evitar JOIN
  c._pecas = [];
  try {
    const { data: pRows } = await sf('/rest/v1/chamado_pecas?chamado_id=eq.' + c.id + '&select=*');
    if (pRows && pRows.length) {
      const pecaIds = [...new Set(pRows.map(function(p) { return p.peca_id; }).filter(Boolean))];
      var pecaMap = {};
      if (pecaIds.length) {
        const { data: pecas } = await sf('/rest/v1/pecas?id=in.(' + pecaIds.join(',') + ')&select=id,codigo,descricao,unidade');
        (pecas || []).forEach(function(p) { pecaMap[p.id] = p; });
      }
      c._pecas = pRows.map(function(p) { return { ...p, pecas: pecaMap[p.peca_id] || null }; });
    }
  } catch(e) {}

  const pecasHtml = c._pecas.length
    ? '<div class="adm-det-section"><div class="adm-det-label">Peças Utilizadas</div>' +
      '<table class="erp-table" style="margin-top:6px"><thead><tr><th>Código</th><th>Descrição</th><th>Qtd.</th></tr></thead><tbody>' +
      c._pecas.map(function(p) {
        return '<tr><td>' + ((p.pecas && p.pecas.codigo) || '–') + '</td>' +
          '<td>' + ((p.pecas && p.pecas.descricao) || '–') + '</td>' +
          '<td>' + (p.quantidade || 0) + ' ' + ((p.pecas && p.pecas.unidade) || 'un') + '</td></tr>';
      }).join('') + '</tbody></table></div>'
    : '';

  document.getElementById('erp-cham-detalhe-corpo').innerHTML =
    '<div class="adm-det-grid">' +
      '<div class="adm-det-row"><span class="adm-det-label">Número</span><span class="adm-det-val">#' + (c.numero || c.id.slice(0,6)) + '</span></div>' +
      '<div class="adm-det-row"><span class="adm-det-label">Abertura</span><span class="adm-det-val">' + fmt(c.created_at) + '</span></div>' +
      '<div class="adm-det-row"><span class="adm-det-label">Status</span><span class="adm-det-val"><span class="badge badge-' + c.status + '">' + (statusLabels[c.status] || c.status) + '</span></span></div>' +
      (c.tipo_chamado ? '<div class="adm-det-row"><span class="adm-det-label">Tipo</span><span class="adm-det-val">' + c.tipo_chamado + '</span></div>' : '') +
      (c.solicitante_nome ? '<div class="adm-det-row"><span class="adm-det-label">Solicitante</span><span class="adm-det-val">' + _esc(c.solicitante_nome) + '</span></div>' : '') +
      (c.solicitante_telefone ? '<div class="adm-det-row"><span class="adm-det-label">Telefone</span><span class="adm-det-val">' + _esc(c.solicitante_telefone) + '</span></div>' : '') +
      (c.solicitante_email ? '<div class="adm-det-row"><span class="adm-det-label">E-mail</span><span class="adm-det-val">' + _esc(c.solicitante_email) + '</span></div>' : '') +
      (c.prioridade ? '<div class="adm-det-row"><span class="adm-det-label">Prioridade</span><span class="adm-det-val">' + (prioLabels[c.prioridade] || c.prioridade) + '</span></div>' : '') +
      (c.tecnico ? '<div class="adm-det-row"><span class="adm-det-label">Técnico</span><span class="adm-det-val">' + _esc(c.tecnico) + '</span></div>' : '') +
    '</div>' +
    (c.descricao ? '<div class="adm-det-section"><div class="adm-det-label">Descrição</div><div class="adm-det-text">' + c.descricao.replace(/\n/g, '<br>') + '</div></div>' : '') +
    (encerrado && c.resolucao ? '<div class="adm-det-section"><div class="adm-det-label">Resolução do Técnico</div><div class="adm-det-text adm-det-resolucao">' + c.resolucao.replace(/\n/g, '<br>') + '</div></div>' : '') +
    pecasHtml +
    (c.data_fechamento ? '<div class="adm-det-row" style="margin-top:12px"><span class="adm-det-label">Data de Fechamento</span><span class="adm-det-val">' + fmtD(c.data_fechamento) + '</span></div>' : '');

  document.getElementById('erp-cham-detalhe-btn-os').onclick = function() { erpChamImprimirOS(c); };
  document.getElementById('modal-cham-detalhe').classList.add('open');
}

function erpChamFecharDetalhe() {
  document.getElementById('modal-cham-detalhe').classList.remove('open');
}

// ── NOVO CHAMADO ──
async function erpChamAbrirNovo() {
  if (!_erpTecs.length) await erpTecCarregar();

  const { data: clis } = await sf('/rest/v1/clientes?select=id,razao_social,fantasia&order=razao_social.asc');
  const selCli = document.getElementById('nc-cliente');
  selCli.innerHTML = '<option value="">Selecione o cliente...</option>' +
    (Array.isArray(clis) ? clis : []).map(function(c) {
      return '<option value="' + c.id + '">' + _esc(c.razao_social || c.fantasia || c.id) + '</option>';
    }).join('');

  const selTec = document.getElementById('nc-tec');
  selTec.innerHTML = '<option value="">Sem técnico atribuído</option>' +
    _erpTecs.map(function(t) {
      return '<option value="' + t.id + '">' + _esc(t.nome) + '</option>';
    }).join('');

  document.getElementById('nc-equip').innerHTML = '<option value="">Selecione o cliente primeiro...</option>';
  document.getElementById('nc-tipo').value = 'assistencia';
  document.getElementById('nc-prio').value = 'normal';
  document.getElementById('nc-desc').value = '';
  document.getElementById('nc-data').value = new Date().toISOString().slice(0,10);
  const erroEl = document.getElementById('nc-erro');
  erroEl.style.display = 'none'; erroEl.textContent = '';
  const btn = document.getElementById('nc-btn-salvar');
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> Criar Chamado';

  document.getElementById('modal-cham-novo').classList.add('open');
}

function erpChamFecharNovo() {
  document.getElementById('modal-cham-novo').classList.remove('open');
}

async function erpChamNcOnClienteChange() {
  const clienteId = document.getElementById('nc-cliente').value;
  const sel = document.getElementById('nc-equip');
  if (!clienteId) { sel.innerHTML = '<option value="">Selecione o cliente primeiro...</option>'; return; }
  sel.innerHTML = '<option value="">Carregando equipamentos...</option>';
  try {
    const { data: contratos } = await sf('/rest/v1/contratos?cliente_id=eq.' + clienteId + '&status=eq.ativo&select=id');
    if (!contratos || !contratos.length) {
      sel.innerHTML = '<option value="">Nenhum contrato ativo para este cliente</option>';
      return;
    }
    const contratoIds = contratos.map(function(c) { return c.id; }).join(',');
    const { data: vinculos } = await sf('/rest/v1/contrato_equipamentos?contrato_id=in.(' + contratoIds + ')&select=equipamento_id');
    const equipIds = (vinculos || []).map(function(v) { return v.equipamento_id; }).filter(Boolean);
    if (!equipIds.length) { sel.innerHTML = '<option value="">Nenhum equipamento vinculado ao contrato</option>'; return; }
    const { data: equips } = await sf('/rest/v1/equipamentos?id=in.(' + equipIds.join(',') + ')&select=id,marca,modelo,serial,codigo_teffe');
    sel.innerHTML = '<option value="">— Sem equipamento específico —</option>';
    (equips || []).forEach(function(e) {
      const opt = document.createElement('option');
      opt.value = e.id;
      const serial = e.serial || e.codigo_teffe;
      opt.textContent = (e.marca ? e.marca + ' ' : '') + (e.modelo || '–') + (serial ? ' — ' + serial : '');
      sel.appendChild(opt);
    });
  } catch(err) {
    console.error('[erpChamNcOnClienteChange]', err);
    sel.innerHTML = '<option value="">Erro ao carregar equipamentos</option>';
  }
}

async function erpChamSalvarNovo() {
  const clienteId = document.getElementById('nc-cliente').value;
  const desc = document.getElementById('nc-desc').value.trim();
  const erroEl = document.getElementById('nc-erro');
  const btn = document.getElementById('nc-btn-salvar');
  erroEl.style.display = 'none';
  if (!clienteId) { erroEl.style.display = 'block'; erroEl.textContent = 'Selecione o cliente.'; return; }
  if (!desc) { erroEl.style.display = 'block'; erroEl.textContent = 'Informe a descrição do chamado.'; return; }
  btn.disabled = true; btn.textContent = 'Criando...';

  const payload = {
    tipo_chamado:   document.getElementById('nc-tipo').value,
    cliente_id:     clienteId,
    equipamento_id: document.getElementById('nc-equip').value || null,
    tecnico_id:     document.getElementById('nc-tec').value || null,
    descricao:      desc,
    prioridade:     document.getElementById('nc-prio').value,
    data_prevista:  document.getElementById('nc-data').value || null,
    data_abertura:  new Date().toISOString().slice(0,10),
    status: 'aberto'
  };

  const { ok, data } = await sf('/rest/v1/chamados', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify(payload)
  });
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> Criar Chamado';
  if (!ok) {
    erroEl.style.display = 'block';
    erroEl.textContent = data && data.message ? data.message : 'Erro ao criar chamado. Verifique permissões RLS.';
    return;
  }
  registrarLog('chamado_criado', { cliente_id: clienteId, tipo: payload.tipo_chamado });
  erpChamFecharNovo();
  erpChamCarregar();
}

// ── IMPRIMIR OS ──
function erpChamImprimirOS(c) {
  const fmt  = function(v) { return v ? new Date(v).toLocaleString('pt-BR') : '–'; };
  const fmtD = function(v) { return v ? new Date(v).toLocaleDateString('pt-BR') : '–'; };
  const statusLabels = { aberto: 'Aberto', andamento: 'Em andamento', encerrado: 'Encerrado', concluido: 'Concluído', resolvido: 'Resolvido' };
  const prioLabels   = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
  const encerrado = ['encerrado','concluido','resolvido'].includes(c.status);
  const num = c.numero || c.id.slice(0,6);
  const resolucaoEsc = (c.resolucao || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const descEsc      = (c.descricao  || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const rows = [
    ['Número', '#' + num],
    ['Abertura', fmt(c.created_at)],
    ['Status', statusLabels[c.status] || c.status],
    ['Tipo', c.tipo_chamado || '—'],
    c.solicitante_nome     && ['Solicitante', c.solicitante_nome],
    c.solicitante_telefone && ['Telefone', c.solicitante_telefone],
    c.solicitante_email    && ['E-mail', c.solicitante_email],
    c.prioridade           && ['Prioridade', prioLabels[c.prioridade] || c.prioridade],
    c.tecnico              && ['Técnico', c.tecnico],
    c.data_fechamento      && ['Data de Fechamento', fmtD(c.data_fechamento)],
  ].filter(Boolean);

  const rowsHTML = rows.map(function(r) { return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>'; }).join('');

  const pecasHtml = c._pecas && c._pecas.length
    ? '<div class="os-section"><div class="os-section-title">Peças Utilizadas</div><table class="os-table"><thead><tr><th style="width:120px">Código</th><th>Descrição</th><th style="width:70px;text-align:center">Qtd.</th></tr></thead><tbody>' +
      c._pecas.map(function(p) {
        return '<tr><td>' + ((p.pecas && p.pecas.codigo) || '–') + '</td><td>' + ((p.pecas && p.pecas.descricao) || '–') + '</td><td style="text-align:center">' + (p.quantidade || 0) + ' ' + ((p.pecas && p.pecas.unidade) || 'un') + '</td></tr>';
      }).join('') + '</tbody></table></div>'
    : '';

  const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>OS #' + num + ' — Teffe Tecnologia</title>' +
    '<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;font-size:13px;color:#222;background:#fff;padding:32px;}' +
    '.os-header{display:flex;align-items:center;gap:20px;border-bottom:3px solid #E07820;padding-bottom:16px;margin-bottom:20px;}' +
    '.os-header img{height:50px;}.os-header-text h1{font-size:18px;font-weight:900;color:#1A3F80;}.os-header-text p{font-size:12px;color:#555;margin-top:2px;}' +
    'table.os-table{width:100%;border-collapse:collapse;margin-bottom:18px;}table.os-table th{width:210px;text-align:left;background:#f0f4fa;padding:7px 10px;font-weight:700;border:1px solid #dde3ee;color:#1A3F80;vertical-align:top;}table.os-table td{padding:7px 10px;border:1px solid #dde3ee;}' +
    '.os-section{margin-bottom:16px;}.os-section-title{font-size:11px;font-weight:700;color:#E07820;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;border-bottom:1px solid #f0d0a0;padding-bottom:4px;}' +
    '.os-text-block{border:1px solid #dde3ee;border-radius:4px;padding:10px 12px;min-height:60px;line-height:1.6;background:#fafbfd;white-space:pre-wrap;}' +
    '.os-resolucao{width:100%;min-height:100px;border:1px solid #bbb;border-radius:4px;padding:10px 12px;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;resize:vertical;background:#fafbfd;color:#222;}' +
    '.os-assinaturas{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px;}.os-assinatura{border-top:1px solid #888;padding-top:8px;text-align:center;font-size:12px;color:#555;}' +
    '.os-footer{text-align:center;font-size:11px;color:#888;border-top:1px solid #dde3ee;padding-top:12px;margin-top:32px;}' +
    '.os-btns{display:flex;gap:12px;justify-content:flex-end;margin-bottom:20px;}.os-btn{padding:8px 20px;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;}' +
    '.os-btn-print{background:#1A3F80;color:#fff;}.os-btn-close{background:#eee;color:#333;}' +
    '@media print{.os-btns{display:none!important;}body{padding:16px;}@page{size:A4;margin:18mm 16mm;}}' +
    '</style></head><body>' +
    '<div class="os-btns"><button class="os-btn os-btn-close" onclick="window.close()">Fechar</button><button class="os-btn os-btn-print" onclick="window.print()">Imprimir</button></div>' +
    '<div class="os-header"><img src="https://teffe.com.br/assets/images/logo-teffe.png" alt="Teffe Tecnologia"/><div class="os-header-text"><h1>ORDEM DE SERVIÇO Nº ' + num + '</h1><p>Teffe Tecnologia — Suporte e Assistência Técnica</p></div></div>' +
    '<div class="os-section"><div class="os-section-title">Dados do Chamado</div><table class="os-table">' + rowsHTML + '</table></div>' +
    (descEsc ? '<div class="os-section"><div class="os-section-title">Descrição do Problema</div><div class="os-text-block">' + descEsc + '</div></div>' : '') +
    pecasHtml +
    '<div class="os-section"><div class="os-section-title">Solução / Resolução do Técnico</div><textarea class="os-resolucao" placeholder="Descreva a solução aplicada...">' + resolucaoEsc + '</textarea></div>' +
    '<div class="os-assinaturas"><div class="os-assinatura">Assinatura do Técnico</div><div class="os-assinatura">Assinatura do Cliente</div></div>' +
    '<div class="os-footer">Teffe Tecnologia — teffe.com.br — (14) 99828-9248</div>' +
    '<script>window.onload=function(){window.print();}<\/script>' +
    '</body></html>';

  const w = window.open('', '_blank', 'width=860,height=760');
  if (w) { w.document.open(); w.document.write(html); w.document.close(); }
}
