/* ═══════════════════════════════════════════════════════
   CRM — PROSPECTOS
═══════════════════════════════════════════════════════ */

var _colunas = [
  { key: 'novo',             label: 'Novo' },
  { key: 'em_contato',       label: 'Em contato' },
  { key: 'proposta_enviada', label: 'Proposta enviada' },
  { key: 'negociacao',       label: 'Negociação' },
  { key: 'ganho',            label: 'Ganho' },
  { key: 'perdido',          label: 'Perdido' },
  { key: 'inativo',          label: 'Inativo' }
];

async function carregarProspectos() {
  var wrap = document.getElementById('kanban-wrap');
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';

  var { data, ok } = await sf('/rest/v1/prospectos?select=*&order=created_at.desc');
  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar prospectos.</div>'; return; }

  var hoje = new Date().toISOString().slice(0, 10);
  var grupos = {};
  _colunas.forEach(function(c) { grupos[c.key] = []; });
  data.forEach(function(p) { if (grupos[p.status]) grupos[p.status].push(p); });

  wrap.innerHTML = _colunas.map(function(col) {
    var cards = grupos[col.key].map(function(p) {
      var vencido = p.proximo_contato && p.proximo_contato < hoje;
      var proxLabel = p.proximo_contato
        ? '<div class="kc-prox' + (vencido ? ' vencido' : '') + '"><i class="ti ti-calendar"></i> ' +
          new Date(p.proximo_contato + 'T12:00:00').toLocaleDateString('pt-BR') + (vencido ? ' ⚠' : '') + '</div>'
        : '';
      return '<div class="kanban-card s-' + col.key + '" onclick=\'abrirModalProspecto(' + JSON.stringify(p) + ')\'>' +
        '<div class="kc-empresa">' + _esc(p.empresa) + '</div>' +
        '<div class="kc-contato">' + _esc(p.contato) + (p.cargo ? ' · ' + _esc(p.cargo) : '') + '</div>' +
        (p.telefone ? '<div class="kc-tel">' + _esc(p.telefone) + '</div>' : '') +
        proxLabel +
        '</div>';
    }).join('');
    return '<div class="kanban-col">' +
      '<div class="kanban-col-hdr"><span>' + col.label + '</span>' +
      '<span class="kanban-col-cnt">' + grupos[col.key].length + '</span></div>' +
      (cards || '<div style="font-size:12px;color:#C4C9D4;text-align:center;padding:10px 0">—</div>') +
      '</div>';
  }).join('');
}

async function abrirModalProspecto(p) {
  document.getElementById('mpr-id').value = p ? p.id : '';
  document.getElementById('mpr-titulo').textContent = p ? p.empresa : 'Novo Prospecto';
  document.getElementById('mpr-empresa').value = p ? (p.empresa || '') : '';
  document.getElementById('mpr-contato').value = p ? (p.contato || '') : '';
  document.getElementById('mpr-cargo').value = p ? (p.cargo || '') : '';
  document.getElementById('mpr-telefone').value = p ? (p.telefone || '') : '';
  document.getElementById('mpr-email').value = p ? (p.email || '') : '';
  document.getElementById('mpr-cidade').value = p ? (p.cidade || '') : '';
  document.getElementById('mpr-segmento').value = p ? (p.segmento || '') : '';
  document.getElementById('mpr-origem').value = p ? (p.origem || '') : '';
  document.getElementById('mpr-status').value = p ? (p.status || 'novo') : 'novo';
  document.getElementById('mpr-prox').value = p ? (p.proximo_contato || '') : '';
  document.getElementById('mpr-interesse').value = p ? (p.interesse || '') : '';
  document.getElementById('mpr-obs').value = p ? (p.observacao || '') : '';

  var historicoWrap = document.getElementById('mpr-historico-wrap');
  var listEl = document.getElementById('mpr-interacoes');
  if (p && p.id) {
    historicoWrap.style.display = 'block';
    listEl.innerHTML = '<li style="padding:8px 0;color:#9CA3AF;font-size:13px">Carregando...</li>';
    await _carregarInteracoes(p.id);
  } else {
    historicoWrap.style.display = 'none';
    listEl.innerHTML = '';
  }

  document.getElementById('modal-prospecto').classList.add('open');
}

async function salvarProspecto() {
  var id = document.getElementById('mpr-id').value;
  var empresa = document.getElementById('mpr-empresa').value.trim();
  var contato = document.getElementById('mpr-contato').value.trim();
  if (!empresa) { alert('Informe o nome da empresa.'); return; }
  if (!contato) { alert('Informe o nome do contato.'); return; }

  var payload = {
    empresa,
    contato,
    cargo: document.getElementById('mpr-cargo').value.trim() || null,
    telefone: document.getElementById('mpr-telefone').value.trim() || null,
    email: document.getElementById('mpr-email').value.trim() || null,
    cidade: document.getElementById('mpr-cidade').value.trim() || null,
    segmento: document.getElementById('mpr-segmento').value.trim() || null,
    origem: document.getElementById('mpr-origem').value.trim() || null,
    status: document.getElementById('mpr-status').value,
    proximo_contato: document.getElementById('mpr-prox').value || null,
    interesse: document.getElementById('mpr-interesse').value.trim() || null,
    observacao: document.getElementById('mpr-obs').value.trim() || null
  };

  var res;
  if (id) {
    res = await sf('/rest/v1/prospectos?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(payload) });
  } else {
    res = await sf('/rest/v1/prospectos', { method: 'POST', body: JSON.stringify(payload), headers: { 'Prefer': 'return=minimal' } });
  }

  if (!res.ok) { alert('Erro ao salvar: ' + JSON.stringify(res.data)); return; }
  fecharModal('modal-prospecto');
  carregarProspectos();
}

/* ═══════════════════════════════════════════════════════
   INTERAÇÕES
═══════════════════════════════════════════════════════ */

async function _carregarInteracoes(prospectoId) {
  var listEl = document.getElementById('mpr-interacoes');
  var { data, ok } = await sf('/rest/v1/prospecto_interacoes?prospecto_id=eq.' + prospectoId + '&order=data.desc');
  if (!ok || !data || !data.length) {
    listEl.innerHTML = '<li style="padding:8px 0;color:#9CA3AF;font-size:13px">Nenhuma interação registrada.</li>';
    return;
  }

  var tipoIco = { ligacao:'ti-phone', email:'ti-mail', visita:'ti-map-pin', whatsapp:'ti-brand-whatsapp', reuniao:'ti-users', outro:'ti-dots-circle-horizontal' };
  var tipoLabel = { ligacao:'Ligação', email:'E-mail', visita:'Visita', whatsapp:'WhatsApp', reuniao:'Reunião', outro:'Outro' };

  listEl.innerHTML = data.map(function(i) {
    var ico = tipoIco[i.tipo] || 'ti-message';
    var dt = i.data ? new Date(i.data + 'T12:00:00').toLocaleDateString('pt-BR') : '';
    var reacao = i.reacao
      ? '<span class="int-reacao reacao-' + i.reacao + '">' + i.reacao.charAt(0).toUpperCase() + i.reacao.slice(1) + '</span>'
      : '';
    var prox = i.proximo_contato
      ? '<span style="font-size:11px;color:#6B7280;margin-left:8px"><i class="ti ti-calendar"></i> ' + new Date(i.proximo_contato+'T12:00:00').toLocaleDateString('pt-BR') + '</span>'
      : '';
    return '<li class="int-item">' +
      '<div class="int-ico"><i class="ti ' + ico + '"></i></div>' +
      '<div class="int-body">' +
      '<div class="int-meta"><span class="int-tipo">' + (tipoLabel[i.tipo]||i.tipo) + '</span><span class="int-data">' + dt + (i.responsavel ? ' · ' + _esc(i.responsavel) : '') + '</span></div>' +
      '<div class="int-desc">' + _esc(i.descricao) + '</div>' +
      reacao + prox +
      '</div></li>';
  }).join('');
}

function abrirModalInteracao() {
  var prospectoId = document.getElementById('mpr-id').value;
  if (!prospectoId) { alert('Salve o prospecto antes de registrar interações.'); return; }
  document.getElementById('mi-prospecto-id').value = prospectoId;
  document.getElementById('mi-data').value = new Date().toISOString().slice(0,10);
  document.getElementById('mi-tipo').value = 'ligacao';
  document.getElementById('mi-desc').value = '';
  document.getElementById('mi-reacao').value = '';
  document.getElementById('mi-prox').value = '';
  document.getElementById('mi-resp').value = '';
  document.getElementById('modal-interacao').classList.add('open');
}

async function salvarInteracao() {
  var prospectoId = document.getElementById('mi-prospecto-id').value;
  var data = document.getElementById('mi-data').value;
  var desc = document.getElementById('mi-desc').value.trim();
  if (!data) { alert('Informe a data.'); return; }
  if (!desc) { alert('Informe a descrição.'); return; }

  var prox = document.getElementById('mi-prox').value;
  var payload = {
    prospecto_id: prospectoId,
    data,
    tipo: document.getElementById('mi-tipo').value,
    descricao: desc,
    reacao: document.getElementById('mi-reacao').value || null,
    proximo_contato: prox || null,
    responsavel: document.getElementById('mi-resp').value.trim() || null
  };

  var res = await sf('/rest/v1/prospecto_interacoes', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Prefer': 'return=minimal' }
  });
  if (!res.ok) { alert('Erro ao salvar interação: ' + JSON.stringify(res.data)); return; }

  if (prox) {
    await sf('/rest/v1/prospectos?id=eq.' + prospectoId, {
      method: 'PATCH',
      body: JSON.stringify({ proximo_contato: prox })
    });
    document.getElementById('mpr-prox').value = prox;
  }

  fecharModal('modal-interacao');
  await _carregarInteracoes(prospectoId);
}
