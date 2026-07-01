/* ═══════════════════════════════════════════════════════
   INSUMOS — toners, cartuchos, cilindros, etc.
   Schema: id, nome, codigo, modelo_equipamento,
   marca_equipamento, tipo, quantidade_estoque,
   quantidade_minima, fornecedor_id, observacoes
═══════════════════════════════════════════════════════ */

var _insumosData = [];
var _minsModelosSelecionados = []; // modelos marcados no checklist do modal de insumo

async function carregarInsumos() {
  const wrap = document.getElementById('ins-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';

  const filTipo   = (document.getElementById('fil-ins-tipo')   || {}).value || '';
  const filModelo = (document.getElementById('fil-ins-modelo') || {}).value || '';
  let q = '/rest/v1/insumos?select=*&order=nome.asc';
  if (filTipo)   q += '&tipo=eq.' + encodeURIComponent(filTipo);
  if (filModelo) q += '&modelo_equipamento=ilike.*' + encodeURIComponent(filModelo) + '*';

  const { data, ok } = await sf(q);
  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar insumos.</div>'; return; }
  if (!data.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhum insumo cadastrado.</div>'; return; }
  _insumosData = data;

  const tipoLabel = { toner: 'Toner', cartucho: 'Cartucho', cilindro: 'Cilindro', fita: 'Fita', outro: 'Outro' };
  const rows = data.map(function(i) {
    const alerta = i.quantidade_estoque <= i.quantidade_minima;
    const alertaBadge = alerta
      ? '<span class="badge" style="background:#FEE2E2;color:#DC2626">Baixo</span>'
      : '<span class="badge" style="background:#DCFCE7;color:#16A34A">OK</span>';
    return '<tr' + (alerta ? ' style="background:#FFF5F5"' : '') + '>' +
      '<td>' + (i.codigo ? '<strong style="font-family:monospace;font-size:14px">' + _esc(i.codigo) + '</strong><br>' : '') + '<small style="color:#374151">' + _esc(i.nome) + '</small></td>' +
      '<td>' + (tipoLabel[i.tipo] || i.tipo || '—') + '</td>' +
      '<td>' + _esc(i.modelo_equipamento || '—') + '</td>' +
      '<td>' + (i.quantidade_estoque || 0) + '</td>' +
      '<td>' + (i.quantidade_minima || 1) + '</td>' +
      '<td>' + alertaBadge + '</td>' +
      '<td>' +
        '<button class="btn-icon" title="Editar" onclick=\'abrirModalInsumo(' + JSON.stringify(i) + ')\'><i class="ti ti-pencil"></i></button>' +
        '<button class="btn-icon" title="Excluir" onclick="excluirInsumo(\'' + i.id + '\')" style="color:#DC2626"><i class="ti ti-trash"></i></button>' +
      '</td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table">' +
    '<thead><tr><th>Nome</th><th>Tipo</th><th>Modelo Equip.</th><th>Qtd</th><th>Mín.</th><th>Alerta</th><th></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

async function abrirModalInsumo(i) {
  document.getElementById('mins-id').value = i ? i.id : '';
  document.getElementById('mins-titulo').textContent = i ? 'Editar Insumo' : 'Novo Insumo';
  document.getElementById('mins-nome').value = i ? (i.nome || '') : '';
  document.getElementById('mins-codigo').value = i ? (i.codigo || '') : '';
  document.getElementById('mins-tipo').value = i ? (i.tipo || 'toner') : 'toner';
  document.getElementById('mins-modelo').value = i ? (i.modelo_equipamento || '') : '';
  document.getElementById('mins-marca').value = i ? (i.marca_equipamento || '') : '';
  document.getElementById('mins-qtd-estoque').value = i ? (i.quantidade_estoque || 0) : 0;
  document.getElementById('mins-qtd-minima').value = i ? (i.quantidade_minima || 1) : 1;
  document.getElementById('mins-obs').value = i ? (i.observacoes || '') : '';

  var sel = document.getElementById('mins-fornecedor');
  var fornId = i ? (i.fornecedor_id || '') : '';
  sel.innerHTML = '<option value="">Carregando...</option>';
  try {
    var res = await sf('/rest/v1/fornecedores?select=id,nome&order=nome.asc');
    sel.innerHTML = '<option value="">— Sem fornecedor —</option>' +
      (Array.isArray(res.data) ? res.data : []).map(function(f) {
        return '<option value="' + f.id + '"' + (f.id === fornId ? ' selected' : '') + '>' + _esc(f.nome) + '</option>';
      }).join('');
  } catch(e) {
    sel.innerHTML = '<option value="">— Erro ao carregar —</option>';
  }

  await _minsCarregarModelosChecklist(i ? i.id : null);

  document.getElementById('modal-insumo').classList.add('open');
}

// Checklist "este insumo serve para quais modelos?" — lista todos os modelos
// já cadastrados em Equipamentos e marca os já vinculados (equipamento_insumos).
async function _minsCarregarModelosChecklist(insumoId) {
  var wrap = document.getElementById('mins-lista-modelos');
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';
  try {
    var modelos = await vmListarModelosExistentes();
    var vinculados = [];
    if (insumoId) {
      var res = await sf('/rest/v1/equipamento_insumos?insumo_id=eq.' + insumoId + '&select=modelo');
      vinculados = (res.ok && Array.isArray(res.data)) ? res.data.map(function(l) { return l.modelo; }).filter(Boolean) : [];
    }
    _minsModelosSelecionados = vinculados.slice();

    if (!modelos.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhum modelo cadastrado em Equipamentos.</div>'; return; }

    wrap.innerHTML = modelos.map(function(m) {
      var checked = vinculados.indexOf(m) !== -1;
      return '<label class="vm-check-item"><input type="checkbox" value="' + _esc(m) + '" ' + (checked ? 'checked' : '') + ' onchange="_minsToggleModelo(this.value,this.checked)"/> <span>' + _esc(m) + '</span></label>';
    }).join('');
  } catch(err) {
    console.error('[_minsCarregarModelosChecklist]', err);
    wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar modelos.</div>';
  }
}

function _minsToggleModelo(modelo, checked) {
  var idx = _minsModelosSelecionados.indexOf(modelo);
  if (checked && idx === -1) _minsModelosSelecionados.push(modelo);
  else if (!checked && idx !== -1) _minsModelosSelecionados.splice(idx, 1);
}

async function salvarInsumo() {
  var id   = document.getElementById('mins-id').value;
  var nome = document.getElementById('mins-nome').value.trim();
  if (!nome) { alert('Informe o nome do insumo.'); return; }

  var payload = {
    nome: paraMaiusculo(nome),
    codigo:               paraMaiusculo(document.getElementById('mins-codigo').value.trim()) || null,
    tipo:                 document.getElementById('mins-tipo').value || 'toner',
    modelo_equipamento:   paraMaiusculo(document.getElementById('mins-modelo').value.trim()) || null,
    marca_equipamento:    paraMaiusculo(document.getElementById('mins-marca').value.trim()) || null,
    quantidade_estoque:   parseInt(document.getElementById('mins-qtd-estoque').value) || 0,
    quantidade_minima:    parseInt(document.getElementById('mins-qtd-minima').value) || 1,
    fornecedor_id:        document.getElementById('mins-fornecedor').value || null,
    observacoes:          paraMaiusculo(document.getElementById('mins-obs').value.trim()) || null,
  };

  var method = id ? 'PATCH' : 'POST';
  var path   = id ? '/rest/v1/insumos?id=eq.' + id : '/rest/v1/insumos';
  var prefer = id ? 'return=minimal' : 'return=representation';
  var { ok, data } = await sf(path, { method, headers: { 'Prefer': prefer }, body: JSON.stringify(payload) });

  if (!ok) { alert('Erro ao salvar: ' + (data && data.message ? data.message : JSON.stringify(data))); return; }

  var insumoId = id || (Array.isArray(data) && data[0] ? data[0].id : null);
  if (insumoId) {
    try {
      await vmSincronizarPorItem('equipamento_insumos', 'insumo_id', insumoId, _minsModelosSelecionados);
    } catch (err) {
      alert('Insumo salvo, mas houve erro ao salvar os modelos compatíveis: ' + err.message);
    }
  }

  fecharModal('modal-insumo');
  carregarInsumos();
}

async function excluirInsumo(id) {
  if (!confirm('Excluir este insumo?')) return;
  var { ok } = await sf('/rest/v1/insumos?id=eq.' + id, { method: 'DELETE' });
  if (!ok) { alert('Erro ao excluir insumo.'); return; }
  carregarInsumos();
}
