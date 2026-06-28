/* ═══════════════════════════════════════════════════════
   EQUIPAMENTOS
═══════════════════════════════════════════════════════ */

async function carregarEquipamentos() {
  const wrap = document.getElementById('equip-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';

  const busca = (document.getElementById('fil-equip-busca') || {}).value || '';
  let q = '/rest/v1/equipamentos?select=*&order=created_at.desc';
  if (busca.trim()) {
    const enc = encodeURIComponent(busca.trim());
    q += '&or=(serial.ilike.*' + enc + '*,codigo.ilike.*' + enc + '*,modelo.ilike.*' + enc + '*,marca.ilike.*' + enc + '*)';
  }

  const { data, ok } = await sf(q);
  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar equipamentos.</div>'; return; }
  if (!data.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhum equipamento encontrado.</div>'; return; }

  const tipoLabel = function(t) {
    return t === 'colorido' ? '<span class="badge" style="background:#EEF3FB;color:#1A3F80">Colorido</span>'
                            : '<span class="badge" style="background:#F3F4F6;color:#4B5563">Monocromático</span>';
  };

  const statusLabel = function(s) {
    if (!s || s === 'ativo') return '<span class="badge badge-ativo">Ativo</span>';
    if (s === 'em_manutencao') return '<span class="badge" style="background:#FFF4E6;color:#C96000">Manutenção</span>';
    return '<span class="badge badge-encerrado">Inativo</span>';
  };

  const rows = data.map(function(e) {
    return '<tr>' +
      '<td><strong>' + _esc(e.serial || '—') + '</strong>' +
        (e.codigo ? '<br><small style="color:#9CA3AF">TEFFE-' + _esc(e.codigo) + '</small>' : '') + '</td>' +
      '<td>' + _esc(e.marca || '—') + '</td>' +
      '<td>' + _esc(e.modelo || '—') + '</td>' +
      '<td>' + _esc(e.localizacao || '—') + '</td>' +
      '<td>' + tipoLabel(e.tipo_impressao) + '</td>' +
      '<td>' + statusLabel(e.status) + '</td>' +
      '<td>' +
        '<button class="btn-icon" title="Editar" onclick=\'abrirModalEquipamento(' + JSON.stringify(e) + ')\'><i class="ti ti-pencil"></i></button>' +
        '<button class="btn-icon" title="Excluir" onclick="excluirEquipamento(\'' + e.id + '\')" style="color:#DC2626"><i class="ti ti-trash"></i></button>' +
      '</td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table">' +
    '<thead><tr>' +
      '<th>Serial / Código</th><th>Marca</th><th>Modelo</th><th>Localização</th><th>Tipo</th><th>Status</th><th></th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

async function abrirModalEquipamento(e) {
  document.getElementById('meq-id').value = e ? e.id : '';
  document.getElementById('meq-titulo').textContent = e ? 'Editar Equipamento' : 'Novo Equipamento';
  document.getElementById('meq-serial').value = e ? (e.serial || '') : '';
  document.getElementById('meq-codigo').value = e ? (e.codigo || '') : '';
  document.getElementById('meq-marca').value = e ? (e.marca || '') : '';
  document.getElementById('meq-modelo').value = e ? (e.modelo || '') : '';
  document.getElementById('meq-status').value = e ? (e.status || 'ativo') : 'ativo';
  document.getElementById('meq-obs').value = e ? (e.observacoes || '') : '';

  const tipo = e ? (e.tipo_impressao || 'monocromatico') : 'monocromatico';
  document.getElementById('meq-tipo-mono').checked = tipo !== 'colorido';
  document.getElementById('meq-tipo-color').checked = tipo === 'colorido';

  // Carregar clientes no select (try/catch garante que modal abre mesmo se falhar)
  const sel = document.getElementById('meq-cliente');
  const clienteId = e ? (e.cliente_id || '') : '';
  sel.innerHTML = '<option value="">Carregando...</option>';
  try {
    const { data: clientes } = await sf('/rest/v1/clientes?select=id,empresa,nome&order=empresa.asc');
    sel.innerHTML = '<option value="">— Sem cliente vinculado —</option>' +
      (Array.isArray(clientes) ? clientes : []).map(function(c) {
        const label = c.empresa || c.nome || '—';
        return '<option value="' + c.id + '"' + (c.id === clienteId ? ' selected' : '') + '>' + _esc(label) + '</option>';
      }).join('');
  } catch(err) {
    console.warn('[Equipamentos] falha ao carregar clientes:', err);
    sel.innerHTML = '<option value="">— Erro ao carregar clientes —</option>';
  }

  document.getElementById('modal-equipamento').classList.add('open');
}

async function salvarEquipamento() {
  const id = document.getElementById('meq-id').value;
  const serial = document.getElementById('meq-serial').value.trim();
  const marca = document.getElementById('meq-marca').value.trim();
  const modelo = document.getElementById('meq-modelo').value.trim();
  if (!serial) { alert('Informe o número de série.'); return; }
  if (!marca)  { alert('Informe a marca.'); return; }
  if (!modelo) { alert('Informe o modelo.'); return; }

  const tipo = document.querySelector('input[name="meq-tipo-impressao"]:checked');
  const payload = {
    serial,
    codigo: document.getElementById('meq-codigo').value.trim() || null,
    marca,
    modelo,
    cliente_id: document.getElementById('meq-cliente').value || null,
    tipo_impressao: tipo ? tipo.value : 'monocromatico',
    status: document.getElementById('meq-status').value || 'ativo',
    observacoes: document.getElementById('meq-obs').value.trim() || null,
  };

  console.log('[Equipamentos] payload:', payload);

  const method = id ? 'PATCH' : 'POST';
  const path = id
    ? '/rest/v1/equipamentos?id=eq.' + id
    : '/rest/v1/equipamentos';

  const { ok, data: errData } = await sf(path, {
    method,
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify(payload),
  });

  if (!ok) {
    alert('Erro ao salvar: ' + (errData && errData.message ? errData.message : JSON.stringify(errData)));
    return;
  }

  fecharModal('modal-equipamento');
  carregarEquipamentos();
}

async function excluirEquipamento(id) {
  if (!confirm('Excluir este equipamento? Essa ação não pode ser desfeita.')) return;
  const { ok } = await sf('/rest/v1/equipamentos?id=eq.' + id, { method: 'DELETE' });
  if (!ok) { alert('Erro ao excluir equipamento.'); return; }
  carregarEquipamentos();
}
