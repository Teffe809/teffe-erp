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
      const html = '<p>Olá <strong>' + (tec.nome ? capitalizarNome(tec.nome) : 'Técnico') + '</strong>,</p><p>As peças para o chamado <strong>#' + numChamado + '</strong> foram entregues. Por favor, acesse o portal e inicie o atendimento.</p><p>Atenciosamente,<br><strong>Teffe Tecnologia</strong></p>';
      erpEnviarEmail(tec.email, 'Peças Disponíveis — Chamado #' + numChamado + ' — Teffe Tecnologia', html).catch(function() {});
    }
  }
  erpChamCarregar();
}

// ── DETALHE CHAMADO ──
async function erpChamAbrirDetalhe(jsonStr) {
  const c = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
  const corpo = document.getElementById('erp-cham-detalhe-corpo');
  corpo.innerHTML = '<div class="tbl-loading" style="padding:20px">Carregando detalhes...</div>';
  document.getElementById('modal-cham-detalhe').classList.add('open');

  const fmt  = function(v) { return v ? new Date(v).toLocaleString('pt-BR') : '–'; };
  const fmtD = function(v) { return v ? new Date(v).toLocaleDateString('pt-BR') : '–'; };
  const statusLabels = { aberto: 'Aberto', em_deslocamento: 'Em deslocamento', em_atendimento: 'Em atendimento', andamento: 'Em andamento', encerrado: 'Encerrado', concluido: 'Concluído', resolvido: 'Resolvido' };
  const prioLabels   = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
  const tipoLabels   = { assistencia: 'Assistência Técnica', instalacao: 'Instalação', suprimento: 'Suprimento', preventiva: 'Preventiva', outro: 'Outro' };
  const tipoColor    = { assistencia: '#DC2626', instalacao: '#2563EB', suprimento: '#7C3AED', preventiva: '#059669', outro: '#9CA3AF' };
  const encerrado = ['encerrado','concluido','resolvido'].includes(c.status);

  // Carregar dados paralelos
  var equipamento = null, clienteNome = '–', pecas = [];

  await Promise.all([
    // Equipamento
    c.equipamento_id ? sf('/rest/v1/equipamentos?id=eq.' + c.equipamento_id + '&select=id,marca,modelo,serial,codigo_teffe').then(function(r) {
      equipamento = r.data && r.data[0] ? r.data[0] : null;
    }) : Promise.resolve(),
    // Cliente
    c.cliente_id ? sf('/rest/v1/clientes?id=eq.' + c.cliente_id + '&select=razao_social,fantasia,codigo').then(function(r) {
      if (r.data && r.data[0]) {
        var cl = r.data[0];
        clienteNome = (cl.razao_social || cl.fantasia || '–') + (cl.codigo ? ' [' + cl.codigo + ']' : '');
      }
    }) : Promise.resolve(),
    // Peças utilizadas
    sf('/rest/v1/chamado_pecas?chamado_id=eq.' + c.id + '&select=*').then(async function(r) {
      var pRows = r.data || [];
      if (pRows.length) {
        var pecaIds = [...new Set(pRows.map(function(p) { return p.peca_id; }).filter(Boolean))];
        var pecaMap = {};
        if (pecaIds.length) {
          var pr = await sf('/rest/v1/pecas?id=in.(' + pecaIds.join(',') + ')&select=id,codigo,descricao,unidade');
          (pr.data || []).forEach(function(p) { pecaMap[p.id] = p; });
        }
        pecas = pRows.map(function(p) { return Object.assign({}, p, { _peca: pecaMap[p.peca_id] || null }); });
      }
    })
  ]).catch(function() {});

  c._pecas = pecas;

  // Técnico responsável
  var tecNome = '–';
  if (c.tecnico_id) {
    var tec = _erpTecs.find(function(t) { return t.id === c.tecnico_id; });
    tecNome = tec ? tec.nome : c.tecnico || '–';
  }

  var tipoHtml = c.tipo_chamado
    ? '<span style="padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;background:' + (tipoColor[c.tipo_chamado]||'#9CA3AF') + '22;color:' + (tipoColor[c.tipo_chamado]||'#9CA3AF') + '">' + (tipoLabels[c.tipo_chamado] || c.tipo_chamado) + '</span>'
    : '–';

  function det(label, value) {
    if (!value || value === '–') return '';
    return '<div class="adm-det-row"><span class="adm-det-label">' + label + '</span><span class="adm-det-val">' + value + '</span></div>';
  }

  var equipHtml = equipamento
    ? ((equipamento.marca ? equipamento.marca + ' ' : '') + (equipamento.modelo || '') +
       (equipamento.serial ? ' — S/N: ' + equipamento.serial : '') +
       (equipamento.codigo_teffe ? ' [' + equipamento.codigo_teffe + ']' : ''))
    : '–';

  var pecasHtml = pecas.length
    ? '<div class="adm-det-section" style="margin-top:16px"><div class="adm-det-label" style="margin-bottom:8px">Peças Utilizadas</div>' +
      '<table class="erp-table"><thead><tr><th>Código</th><th>Descrição</th><th>Qtd.</th></tr></thead><tbody>' +
      pecas.map(function(p) {
        return '<tr><td><code>' + _esc((p._peca && p._peca.codigo) || '–') + '</code></td>' +
          '<td>' + _esc((p._peca && p._peca.descricao) || '–') + '</td>' +
          '<td>' + (p.quantidade || 0) + ' ' + ((p._peca && p._peca.unidade) || 'un') + '</td></tr>';
      }).join('') + '</tbody></table></div>'
    : '';

  // Fotos
  var fotosArr = [];
  try { fotosArr = Array.isArray(c.fotos) ? c.fotos : (c.fotos ? JSON.parse(c.fotos) : []); } catch(e) {}
  var fotosHtml = fotosArr.length
    ? '<div class="adm-det-section" style="margin-top:16px"><div class="adm-det-label" style="margin-bottom:8px">Fotos</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
      fotosArr.map(function(url) {
        return '<a href="' + _esc(url) + '" target="_blank"><img src="' + _esc(url) + '" style="width:100px;height:100px;object-fit:cover;border-radius:6px;border:1px solid #E5E7EB"/></a>';
      }).join('') + '</div></div>'
    : '';

  corpo.innerHTML =
    '<div class="adm-det-grid" style="grid-template-columns:1fr 1fr 1fr;gap:8px 16px;margin-bottom:16px">' +
      '<div class="adm-det-row"><span class="adm-det-label">Número</span><span class="adm-det-val" style="font-family:monospace;font-size:16px;font-weight:700">#' + (c.numero || c.id.slice(0,6)) + '</span></div>' +
      '<div class="adm-det-row"><span class="adm-det-label">Status</span><span class="adm-det-val"><span class="badge badge-' + c.status + '">' + (statusLabels[c.status] || c.status) + '</span></span></div>' +
      '<div class="adm-det-row"><span class="adm-det-label">Tipo</span><span class="adm-det-val">' + tipoHtml + '</span></div>' +
      '<div class="adm-det-row"><span class="adm-det-label">Prioridade</span><span class="adm-det-val">' + (prioLabels[c.prioridade] || c.prioridade || '–') + '</span></div>' +
      '<div class="adm-det-row"><span class="adm-det-label">Técnico</span><span class="adm-det-val">' + _esc(tecNome) + '</span></div>' +
      '<div class="adm-det-row"><span class="adm-det-label">Cliente</span><span class="adm-det-val">' + _esc(clienteNome) + '</span></div>' +
    '</div>' +

    '<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px 14px;margin-bottom:14px">' +
      '<div style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Solicitante</div>' +
      '<div class="adm-det-grid" style="grid-template-columns:1fr 1fr 1fr;gap:6px 16px">' +
        det('Nome', _esc(c.solicitante_nome || '–')) +
        det('Telefone', _esc(c.solicitante_telefone || '')) +
        det('E-mail', _esc(c.solicitante_email || '')) +
      '</div>' +
    '</div>' +

    '<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px 14px;margin-bottom:14px">' +
      '<div style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Equipamento</div>' +
      '<div class="adm-det-val" style="font-size:14px">' + _esc(equipHtml) + '</div>' +
    '</div>' +

    '<div class="adm-det-grid" style="grid-template-columns:1fr 1fr 1fr 1fr;gap:6px 16px;margin-bottom:14px">' +
      det('Abertura', fmt(c.created_at || c.data_abertura)) +
      det('Deslocamento', fmt(c.data_deslocamento)) +
      det('Atendimento', fmt(c.data_atendimento)) +
      det('Encerramento', fmtD(c.data_fechamento)) +
    '</div>' +

    (c.descricao ? '<div class="adm-det-section"><div class="adm-det-label" style="margin-bottom:6px">Descrição do Defeito</div><div class="adm-det-text">' + _esc(c.descricao).replace(/\n/g,'<br>') + '</div></div>' : '') +
    (encerrado && c.resolucao ? '<div class="adm-det-section" style="margin-top:12px"><div class="adm-det-label" style="margin-bottom:6px">Resolução do Técnico</div><div class="adm-det-text adm-det-resolucao">' + _esc(c.resolucao).replace(/\n/g,'<br>') + '</div></div>' : '') +
    pecasHtml +
    fotosHtml +
    '<div class="adm-det-section" style="margin-top:16px;background:#FFFBEB;border:1.5px solid #FCD34D;border-radius:9px;padding:12px 14px">' +
      '<div class="adm-det-label" style="color:#92400E;margin-bottom:8px">⚠️ Observações Internas (uso interno)</div>' +
      '<textarea id="erp-obs-interna-ta" class="ac-input" rows="3" placeholder="Anotações internas — NÃO visível ao cliente...">' + (c.observacoes_internas ? _esc(c.observacoes_internas) : '') + '</textarea>' +
      '<button id="erp-obs-interna-btn" class="adm-btn adm-btn-sm adm-btn-outline" style="margin-top:8px" onclick="erpSalvarObsInterna(\'' + c.id + '\')">' +
        '<i class="ti ti-device-floppy"></i> Salvar observação' +
      '</button>' +
    '</div>';

  document.getElementById('erp-cham-detalhe-btn-os').onclick = function() { erpChamImprimirOS(c, clienteNome, equipamento, tecNome); };

  // Botão boleto avulso
  var btnBoletoAvulso = document.getElementById('erp-cham-detalhe-btn-boleto-avulso');
  if (btnBoletoAvulso) {
    if (c.tipo_chamado === 'avulso') {
      btnBoletoAvulso.style.display = 'inline-flex';
      btnBoletoAvulso.onclick = function() { erpChamGerarBoletoAvulso(c, clienteNome); };
    } else {
      btnBoletoAvulso.style.display = 'none';
    }
  }
}

async function erpSalvarObsInterna(id) {
  var ta = document.getElementById('erp-obs-interna-ta');
  if (!ta) return;
  var val = ta.value.trim();
  var btn = document.getElementById('erp-obs-interna-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Salvando...'; }
  var { ok } = await sf('/rest/v1/chamados?id=eq.' + id, { method: 'PATCH', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ observacoes_internas: val || null }) });
  if (!ok) { alert('Erro ao salvar observação.'); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy"></i> Salvar observação'; } return; }
  if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Salvo'; setTimeout(function() { btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy"></i> Salvar observação'; }, 1800); }
}

async function erpChamGerarBoletoAvulso(c, clienteNome) {
  var valorBase = c.valor_servico || 0;
  // Soma peças utilizadas
  if (c._pecas && c._pecas.length) {
    c._pecas.forEach(function(p) { valorBase += (p.quantidade || 1) * (p._peca && p._peca.valor_unitario ? p._peca.valor_unitario : 0); });
  }
  var valorStr = prompt('Valor do boleto avulso (R$):\nValor do serviço: ' + (c.valor_servico || 0), valorBase.toFixed(2));
  if (valorStr === null) return;
  var valor = parseFloat(valorStr.replace(',', '.'));
  if (isNaN(valor) || valor <= 0) { alert('Valor inválido.'); return; }
  var vencStr = prompt('Data de vencimento (AAAA-MM-DD):', new Date(Date.now() + 7*86400000).toISOString().slice(0,10));
  if (!vencStr) return;
  var r = await sf('/rest/v1/boletos', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      cliente_id: c.cliente_id,
      descricao: 'Chamado avulso #' + (c.numero || c.id.slice(0,6)) + (clienteNome ? ' — ' + clienteNome : ''),
      valor: valor,
      vencimento: vencStr,
      status: 'a_vencer'
    })
  });
  if (!r.ok) { alert('Erro ao gerar boleto: ' + JSON.stringify(r.data)); return; }
  registrarLog('boleto_avulso_criado', { chamado_id: c.id, valor });
  alert('Boleto avulso de R$ ' + valor.toFixed(2).replace('.', ',') + ' criado com sucesso!');
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
  var vWrap = document.getElementById('nc-valor-wrap');
  if (vWrap) { vWrap.style.display = 'none'; }
  var vSvc = document.getElementById('nc-valor-servico');
  if (vSvc) vSvc.value = '';
  const erroEl = document.getElementById('nc-erro');
  erroEl.style.display = 'none'; erroEl.textContent = '';
  const btn = document.getElementById('nc-btn-salvar');
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> Criar Chamado';

  document.getElementById('modal-cham-novo').classList.add('open');
}

function erpChamFecharNovo() {
  document.getElementById('modal-cham-novo').classList.remove('open');
}

function erpChamNcOnTipoChange() {
  var tipo = document.getElementById('nc-tipo').value;
  var vWrap = document.getElementById('nc-valor-wrap');
  if (vWrap) vWrap.style.display = tipo === 'avulso' ? 'block' : 'none';
  erpChamNcOnClienteChange();
}

async function erpChamNcOnClienteChange() {
  const tipo = document.getElementById('nc-tipo').value;
  const clienteId = document.getElementById('nc-cliente').value;
  const sel = document.getElementById('nc-equip');

  if (tipo === 'avulso') {
    sel.innerHTML = '<option value="">— Não aplicável para chamado avulso —</option>';
    return;
  }
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

  const tipoChamado = document.getElementById('nc-tipo').value;
  const payload = {
    tipo_chamado:   tipoChamado,
    cliente_id:     clienteId,
    equipamento_id: tipoChamado === 'avulso' ? null : (document.getElementById('nc-equip').value || null),
    tecnico_id:     document.getElementById('nc-tec').value || null,
    descricao:      desc,
    prioridade:     document.getElementById('nc-prio').value,
    data_prevista:  document.getElementById('nc-data').value || null,
    data_abertura:  new Date().toISOString().slice(0,10),
    status: 'aberto'
  };
  var valorSvcStr = document.getElementById('nc-valor-servico') ? document.getElementById('nc-valor-servico').value : '';
  if (tipoChamado === 'avulso' && valorSvcStr) payload.valor_servico = parseFloat(valorSvcStr) || null;

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
function erpChamImprimirOS(c, clienteNome, equipamento, tecNome) {
  const fmt  = function(v) { return v ? new Date(v).toLocaleString('pt-BR') : '–'; };
  const fmtD = function(v) { return v ? new Date(v).toLocaleDateString('pt-BR') : '–'; };
  const esc  = function(v) { return (v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
  const statusLabels = { aberto: 'Aberto', em_deslocamento: 'Em deslocamento', em_atendimento: 'Em atendimento', andamento: 'Em andamento', encerrado: 'Encerrado', concluido: 'Concluído', resolvido: 'Resolvido' };
  const prioLabels   = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
  const tipoLabels   = { assistencia: 'Assistência Técnica', instalacao: 'Instalação', suprimento: 'Suprimento', preventiva: 'Preventiva', outro: 'Outro' };
  const encerrado = ['encerrado','concluido','resolvido'].includes(c.status);
  const num = c.numero || c.id.slice(0,6);

  var equipStr = '–';
  if (equipamento) {
    equipStr = (equipamento.marca ? equipamento.marca + ' ' : '') + (equipamento.modelo || '') +
      (equipamento.serial ? ' — S/N: ' + equipamento.serial : '') +
      (equipamento.codigo_teffe ? ' [Teffe: ' + equipamento.codigo_teffe + ']' : '');
  }

  function row(label, value) {
    if (!value || value === '–') return '';
    return '<tr><th>' + label + '</th><td>' + esc(value) + '</td></tr>';
  }

  const dadosRows =
    row('Número', '#' + num) +
    row('Status', statusLabels[c.status] || c.status) +
    row('Tipo', tipoLabels[c.tipo_chamado] || c.tipo_chamado || '') +
    row('Prioridade', prioLabels[c.prioridade] || c.prioridade || '') +
    row('Cliente', clienteNome || '') +
    row('Equipamento', equipStr) +
    row('Técnico Responsável', tecNome || c.tecnico || '');

  const datasRows =
    row('Abertura', fmt(c.created_at || c.data_abertura)) +
    row('Deslocamento', fmt(c.data_deslocamento)) +
    row('Atendimento', fmt(c.data_atendimento)) +
    row('Encerramento', fmtD(c.data_fechamento));

  const solicitanteRows =
    row('Nome', c.solicitante_nome || '') +
    row('Telefone', c.solicitante_telefone || '') +
    row('E-mail', c.solicitante_email || '');

  const pecasHtml = c._pecas && c._pecas.length
    ? '<div class="os-section"><div class="os-section-title">Peças Utilizadas</div>' +
      '<table class="os-table"><thead><tr><th style="width:120px">Código</th><th>Descrição</th><th style="width:70px;text-align:center">Qtd.</th></tr></thead><tbody>' +
      c._pecas.map(function(p) {
        var peca = p._peca || p.pecas || {};
        return '<tr><td>' + esc(peca.codigo || '–') + '</td><td>' + esc(peca.descricao || '–') + '</td><td style="text-align:center">' + (p.quantidade || 0) + ' ' + esc(peca.unidade || 'un') + '</td></tr>';
      }).join('') + '</tbody></table></div>'
    : '';

  const css = `*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,sans-serif;font-size:12px;color:#1a1a1a;background:#fff;padding:28px 36px;}
.os-header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #E07820;padding-bottom:14px;margin-bottom:20px;}
.os-header img{height:48px;}
.os-header-right{text-align:right;}
.os-num{font-size:22px;font-weight:900;color:#1A3F80;letter-spacing:-.5px;}
.os-sub{font-size:11px;color:#666;margin-top:2px;}
.os-section{margin-bottom:16px;}
.os-section-title{font-size:10px;font-weight:700;color:#E07820;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;border-bottom:1.5px solid #f0d0a0;padding-bottom:3px;}
table.os-table{width:100%;border-collapse:collapse;margin-bottom:0;}
table.os-table th{width:200px;text-align:left;background:#EEF2FA;padding:6px 10px;font-weight:700;border:1px solid #D0D9EE;color:#1A3F80;vertical-align:top;font-size:11px;}
table.os-table td{padding:6px 10px;border:1px solid #D0D9EE;font-size:12px;}
.os-text-block{border:1px solid #D0D9EE;border-radius:4px;padding:10px 12px;min-height:60px;line-height:1.7;background:#fafbfd;white-space:pre-wrap;font-size:12px;}
.os-resolucao-box{border:1px solid #D0D9EE;border-radius:4px;padding:10px 12px;min-height:80px;background:#F0FDF4;font-size:12px;line-height:1.7;white-space:pre-wrap;}
.os-resolucao-blank{border:1px solid #D0D9EE;border-radius:4px;padding:10px 12px;min-height:80px;background:#fafbfd;}
.os-assinaturas{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:48px;}
.os-assinatura{border-top:1px solid #888;padding-top:8px;text-align:center;font-size:11px;color:#555;}
.os-footer{text-align:center;font-size:10px;color:#888;border-top:1px solid #D0D9EE;padding-top:10px;margin-top:28px;}
.os-btns{display:flex;gap:12px;justify-content:flex-end;margin-bottom:20px;}
.os-btn{padding:8px 22px;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;}
.os-btn-print{background:#1A3F80;color:#fff;}.os-btn-close{background:#eee;color:#333;}
@media print{.os-btns{display:none!important;}body{padding:16px;}@page{size:A4;margin:15mm 14mm;}}`;

  const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>' +
    '<title>OS #' + num + ' — Teffe Tecnologia</title>' +
    '<style>' + css + '</style></head><body>' +
    '<div class="os-btns">' +
      '<button class="os-btn os-btn-close" onclick="window.close()">Fechar</button>' +
      '<button class="os-btn os-btn-print" onclick="window.print()"><strong>⎙</strong> Imprimir / Salvar PDF</button>' +
    '</div>' +
    '<div class="os-header">' +
      '<img src="https://teffe.com.br/assets/images/logo-teffe.png" alt="Teffe Tecnologia"/>' +
      '<div class="os-header-right"><div class="os-num">OS Nº ' + num + '</div><div class="os-sub">Teffe Tecnologia — Suporte e Assistência Técnica</div><div class="os-sub">Emitida em ' + new Date().toLocaleString('pt-BR') + '</div></div>' +
    '</div>' +
    '<div class="os-section"><div class="os-section-title">Dados do Chamado</div><table class="os-table">' + dadosRows + '</table></div>' +
    (datasRows ? '<div class="os-section"><div class="os-section-title">Datas</div><table class="os-table">' + datasRows + '</table></div>' : '') +
    (solicitanteRows ? '<div class="os-section"><div class="os-section-title">Solicitante</div><table class="os-table">' + solicitanteRows + '</table></div>' : '') +
    (c.descricao ? '<div class="os-section"><div class="os-section-title">Descrição do Defeito</div><div class="os-text-block">' + esc(c.descricao) + '</div></div>' : '') +
    pecasHtml +
    '<div class="os-section"><div class="os-section-title">Resolução / Solução Aplicada</div>' +
      (encerrado && c.resolucao
        ? '<div class="os-resolucao-box">' + esc(c.resolucao) + '</div>'
        : '<div class="os-resolucao-blank"></div>') +
    '</div>' +
    '<div class="os-assinaturas"><div class="os-assinatura">Assinatura do Técnico</div><div class="os-assinatura">Assinatura do Cliente / Responsável</div></div>' +
    '<div class="os-footer">Teffe Tecnologia — teffe.com.br — (14) 99828-9248 — Documento gerado em ' + new Date().toLocaleString('pt-BR') + '</div>' +
    '<script>window.onload=function(){window.print();}<\/script>' +
    '</body></html>';

  const w = window.open('', '_blank', 'width=900,height=820');
  if (w) { w.document.open(); w.document.write(html); w.document.close(); }
}
