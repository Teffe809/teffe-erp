/* ═══════════════════════════════════════════════════════
   EQUIPAMENTOS — schema: id, created_at, codigo_teffe,
   marca, modelo, serial, fornecedor_id, data_compra,
   garantia_dias, data_vencimento_garantia (gerada),
   tipo_impressao, status, localizacao, observacoes,
   ultimo_contador
═══════════════════════════════════════════════════════ */

async function carregarEquipamentos() {
  const wrap = document.getElementById('equip-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';

  const busca = (document.getElementById('fil-equip-busca') || {}).value || '';
  let q = '/rest/v1/equipamentos?select=*&order=created_at.desc';
  if (busca.trim()) {
    const enc = encodeURIComponent(busca.trim());
    q += '&or=(serial.ilike.*' + enc + '*,codigo_teffe.ilike.*' + enc + '*,modelo.ilike.*' + enc + '*,marca.ilike.*' + enc + '*)';
  }

  const { data, ok } = await sf(q);
  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar equipamentos.</div>'; return; }
  if (!data.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhum equipamento cadastrado.</div>'; return; }

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  function garantiaBadge(e) {
    if (!e.data_vencimento_garantia) return '<span style="color:#9CA3AF">—</span>';
    var venc = new Date(e.data_vencimento_garantia + 'T12:00:00');
    var dias = Math.ceil((venc - hoje) / 86400000);
    if (dias < 0) return '<span class="badge" style="background:#FEE2E2;color:#DC2626">Vencida</span>';
    if (dias <= 90) return '<span class="badge" style="background:#FEF9C3;color:#CA8A04">' + dias + ' dias</span>';
    return '<span class="badge" style="background:#DCFCE7;color:#16A34A">' + dias + ' dias</span>';
  }

  function tipoLabel(t) {
    return t === 'colorido'
      ? '<span class="badge" style="background:#EEF3FB;color:#1A3F80">Colorido</span>'
      : '<span class="badge" style="background:#F3F4F6;color:#4B5563">Monocromático</span>';
  }

  function statusLabel(s) {
    if (s === 'instalado')  return '<span class="badge badge-ativo">Instalado</span>';
    if (s === 'manutencao') return '<span class="badge" style="background:#FFF4E6;color:#C96000">Manutenção</span>';
    return '<span class="badge" style="background:#DBEAFE;color:#1D4ED8">Disponível</span>';
  }

  const rows = data.map(function(e) {
    return '<tr>' +
      '<td><strong>' + _esc(e.codigo_teffe || '—') + '</strong></td>' +
      '<td>' + _esc(e.marca || '—') + '</td>' +
      '<td>' + _esc(e.modelo || '—') + '</td>' +
      '<td><code>' + _esc(e.serial || '—') + '</code></td>' +
      '<td>' + garantiaBadge(e) + '</td>' +
      '<td>' + statusLabel(e.status) + '</td>' +
      '<td>' + tipoLabel(e.tipo_impressao) + '</td>' +
      '<td>' +
        '<button class="btn-icon" title="Editar" onclick=\'abrirModalEquipamento(' + JSON.stringify(e) + ')\'><i class="ti ti-pencil"></i></button>' +
        '<button class="btn-icon" title="Excluir" onclick="excluirEquipamento(\'' + e.id + '\')" style="color:#DC2626"><i class="ti ti-trash"></i></button>' +
      '</td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table">' +
    '<thead><tr>' +
      '<th>Código Teffe</th><th>Marca</th><th>Modelo</th><th>Serial</th>' +
      '<th>Garantia</th><th>Status</th><th>Tipo</th><th></th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

/* ── Insumos Compatíveis (estado local do modal) ── */
var _meqInsumos = []; // [{id?:'link-uuid', insumo_id, nome, codigo, cor}]

async function abrirModalEquipamento(e) {
  // Reset insumos state
  _meqInsumos = [];
  document.getElementById('meq-insumo-busca').value = '';
  document.getElementById('meq-insumo-resultado').style.display = 'none';
  document.getElementById('meq-insumo-resultado').innerHTML = '';
  document.getElementById('meq-insumo-lista').innerHTML = '';

  document.getElementById('meq-id').value = e ? e.id : '';
  document.getElementById('meq-titulo').textContent = e ? 'Editar Equipamento' : 'Novo Equipamento';
  document.getElementById('meq-codigo-teffe').value = e ? (e.codigo_teffe || '') : '';
  document.getElementById('meq-serial').value = e ? (e.serial || '') : '';
  document.getElementById('meq-marca').value = e ? (e.marca || '') : '';
  document.getElementById('meq-modelo').value = e ? (e.modelo || '') : '';
  document.getElementById('meq-data-compra').value = e ? (e.data_compra || '') : '';
  document.getElementById('meq-garantia-dias').value = e ? (e.garantia_dias || '') : '';
  document.getElementById('meq-localizacao').value = e ? (e.localizacao || '') : '';
  document.getElementById('meq-obs').value = e ? (e.observacoes || '') : '';
  document.getElementById('meq-status').value = e ? (e.status || 'disponivel') : 'disponivel';
  document.getElementById('meq-ultimo-contador').value = e ? (e.ultimo_contador || 0) : 0;
  meqAtualizarVencimentoGarantia();

  var tipo = e ? (e.tipo_impressao || 'monocromatico') : 'monocromatico';
  document.getElementById('meq-tipo-mono').checked = tipo !== 'colorido';
  document.getElementById('meq-tipo-color').checked = tipo === 'colorido';

  var sel = document.getElementById('meq-fornecedor');
  var fornId = e ? (e.fornecedor_id || '') : '';
  sel.innerHTML = '<option value="">Carregando...</option>';
  try {
    var res = await sf('/rest/v1/fornecedores?select=id,nome&order=nome.asc');
    sel.innerHTML = '<option value="">— Sem fornecedor —</option>' +
      (Array.isArray(res.data) ? res.data : []).map(function(f) {
        return '<option value="' + f.id + '"' + (f.id === fornId ? ' selected' : '') + '>' + _esc(f.nome || f.id) + '</option>';
      }).join('');
  } catch(err) {
    console.warn('[Equipamentos] falha ao carregar fornecedores:', err);
    sel.innerHTML = '<option value="">— Erro ao carregar —</option>';
  }

  // Carregar insumos já vinculados ao equipamento
  if (e && e.id) {
    try {
      var linkRes = await sf('/rest/v1/equipamento_insumos?equipamento_id=eq.' + e.id + '&select=*');
      var links = Array.isArray(linkRes.data) ? linkRes.data : [];
      if (links.length) {
        var insumoIds = links.map(function(l) { return l.insumo_id; }).filter(Boolean);
        var insumoRes = await sf('/rest/v1/insumos?id=in.(' + insumoIds.join(',') + ')&select=id,nome,codigo');
        var insumoMap = {};
        (Array.isArray(insumoRes.data) ? insumoRes.data : []).forEach(function(i) { insumoMap[i.id] = i; });
        _meqInsumos = links.map(function(l) {
          var info = insumoMap[l.insumo_id] || {};
          return { _link_id: l.id, insumo_id: l.insumo_id, nome: info.nome || '?', codigo: info.codigo || '', cor: l.cor || '' };
        });
      }
    } catch(err) { console.warn('[Equipamentos] falha ao carregar insumos vinculados:', err); }
  }
  _meqRenderInsumosList();

  document.getElementById('modal-equipamento').classList.add('open');
}

function meqAtualizarVencimentoGarantia() {
  var dataCompra = document.getElementById('meq-data-compra').value;
  var dias = parseInt(document.getElementById('meq-garantia-dias').value);
  var wrap = document.getElementById('meq-garantia-vence-wrap');
  var span = document.getElementById('meq-garantia-vence');
  if (!wrap || !span) return;
  if (dataCompra && dias > 0) {
    var d = new Date(dataCompra + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    span.textContent = 'Vence em: ' + d.toLocaleDateString('pt-BR');
    wrap.style.display = 'block';
  } else {
    wrap.style.display = 'none';
  }
}

async function salvarEquipamento() {
  var id     = document.getElementById('meq-id').value;
  var serial = document.getElementById('meq-serial').value.trim();
  var marca  = document.getElementById('meq-marca').value.trim();
  var modelo = document.getElementById('meq-modelo').value.trim();
  if (!marca)  { alert('Informe a marca.'); return; }
  if (!modelo) { alert('Informe o modelo.'); return; }

  var tipo = document.querySelector('input[name="meq-tipo-impressao"]:checked');
  var payload = {
    marca,
    modelo,
    serial: serial || null,
    fornecedor_id: document.getElementById('meq-fornecedor').value || null,
    data_compra: document.getElementById('meq-data-compra').value || null,
    garantia_dias: parseInt(document.getElementById('meq-garantia-dias').value) || null,
    tipo_impressao: tipo ? tipo.value : 'monocromatico',
    status: document.getElementById('meq-status').value || 'disponivel',
    localizacao: document.getElementById('meq-localizacao').value.trim() || null,
    observacoes: document.getElementById('meq-obs').value.trim() || null,
    ultimo_contador: parseInt(document.getElementById('meq-ultimo-contador').value) || 0,
  };

  console.log('[Equipamentos] payload:', payload);

  var method = id ? 'PATCH' : 'POST';
  var path   = id ? '/rest/v1/equipamentos?id=eq.' + id : '/rest/v1/equipamentos';
  var prefer = id ? 'return=minimal' : 'return=representation';

  var { ok, data: resData } = await sf(path, { method, headers: { 'Prefer': prefer }, body: JSON.stringify(payload) });

  if (!ok) {
    alert('Erro ao salvar: ' + (resData && resData.message ? resData.message : JSON.stringify(resData)));
    return;
  }

  var equipamentoId = id || (Array.isArray(resData) && resData[0] ? resData[0].id : null);

  if (!id && Array.isArray(resData) && resData[0] && resData[0].codigo_teffe) {
    alert('Equipamento cadastrado!\nCódigo Teffe: ' + resData[0].codigo_teffe);
  }

  if (equipamentoId) await _meqSincronizarInsumos(equipamentoId);

  fecharModal('modal-equipamento');
  carregarEquipamentos();
}

async function _meqSincronizarInsumos(equipamentoId) {
  // Carregar vínculos existentes no banco
  var existRes = await sf('/rest/v1/equipamento_insumos?equipamento_id=eq.' + equipamentoId + '&select=id,insumo_id');
  var existentes = Array.isArray(existRes.data) ? existRes.data : [];
  var existIds = existentes.map(function(l) { return l.insumo_id; });
  var localIds  = _meqInsumos.map(function(i) { return i.insumo_id; });

  // Remover os que foram desvinculados
  var paraRemover = existentes.filter(function(l) { return localIds.indexOf(l.insumo_id) === -1; });
  for (var r = 0; r < paraRemover.length; r++) {
    await sf('/rest/v1/equipamento_insumos?id=eq.' + paraRemover[r].id, { method: 'DELETE' });
  }

  // Inserir os novos
  var paraAdicionar = _meqInsumos.filter(function(i) { return existIds.indexOf(i.insumo_id) === -1; });
  for (var a = 0; a < paraAdicionar.length; a++) {
    var item = paraAdicionar[a];
    await sf('/rest/v1/equipamento_insumos', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ equipamento_id: equipamentoId, insumo_id: item.insumo_id, cor: item.cor || null })
    });
  }

  // Atualizar cor de vínculos que já existiam
  var paraAtualizar = _meqInsumos.filter(function(i) {
    var exist = existentes.find(function(l) { return l.insumo_id === i.insumo_id; });
    return exist && (i.cor || '') !== (i._cor_original || '');
  });
  for (var u = 0; u < paraAtualizar.length; u++) {
    var upd = paraAtualizar[u];
    var link = existentes.find(function(l) { return l.insumo_id === upd.insumo_id; });
    if (link) {
      await sf('/rest/v1/equipamento_insumos?id=eq.' + link.id, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ cor: upd.cor || null })
      });
    }
  }
}

async function meqBuscarInsumo() {
  var q = (document.getElementById('meq-insumo-busca').value || '').trim();
  var resDiv = document.getElementById('meq-insumo-resultado');
  if (q.length < 2) { resDiv.style.display = 'none'; resDiv.innerHTML = ''; return; }

  resDiv.innerHTML = '<div style="padding:6px 10px;color:#6B7280;font-size:13px">Buscando...</div>';
  resDiv.style.display = 'block';

  var { data } = await sf('/rest/v1/insumos?select=id,nome,codigo,tipo&or=(nome.ilike.*' + encodeURIComponent(q) + '*,codigo.ilike.*' + encodeURIComponent(q) + '*)&order=nome.asc&limit=10');
  if (!data || !data.length) {
    resDiv.innerHTML = '<div style="padding:6px 10px;color:#6B7280;font-size:13px">Nenhum insumo encontrado.</div>';
    return;
  }

  var tipoLabel = { toner: 'Toner', cartucho: 'Cartucho', cilindro: 'Cilindro', fita: 'Fita', outro: 'Outro' };
  resDiv.innerHTML = data.map(function(i) {
    var jaAdicionado = _meqInsumos.some(function(x) { return x.insumo_id === i.id; });
    var label = _esc(i.nome) + (i.codigo ? ' <small style="color:#9CA3AF">' + _esc(i.codigo) + '</small>' : '') +
      ' <small style="color:#6366F1">' + (tipoLabel[i.tipo] || i.tipo) + '</small>';
    if (jaAdicionado) {
      return '<div style="padding:7px 10px;font-size:13px;color:#9CA3AF;display:flex;justify-content:space-between">' +
        label + '<span style="font-style:italic">já vinculado</span></div>';
    }
    return '<div class="mc-busca-item" onclick=\'meqAdicionarInsumo(' + JSON.stringify(i) + ')\' style="cursor:pointer;padding:7px 10px;font-size:13px;display:flex;justify-content:space-between;align-items:center">' +
      '<span>' + label + '</span>' +
      '<button class="btn-secondary" style="padding:2px 8px;font-size:12px" onclick=\'event.stopPropagation();meqAdicionarInsumo(' + JSON.stringify(i) + ')\'>Vincular</button>' +
      '</div>';
  }).join('');
}

function meqAdicionarInsumo(i) {
  if (_meqInsumos.some(function(x) { return x.insumo_id === i.id; })) return;
  _meqInsumos.push({ insumo_id: i.id, nome: i.nome, codigo: i.codigo || '', cor: '' });
  document.getElementById('meq-insumo-busca').value = '';
  document.getElementById('meq-insumo-resultado').style.display = 'none';
  document.getElementById('meq-insumo-resultado').innerHTML = '';
  _meqRenderInsumosList();
}

function meqRemoverInsumo(insumoId) {
  _meqInsumos = _meqInsumos.filter(function(x) { return x.insumo_id !== insumoId; });
  _meqRenderInsumosList();
}

function meqAtualizarCor(insumoId, cor) {
  var item = _meqInsumos.find(function(x) { return x.insumo_id === insumoId; });
  if (item) item.cor = cor;
}

function _meqRenderInsumosList() {
  var lista = document.getElementById('meq-insumo-lista');
  if (!_meqInsumos.length) {
    lista.innerHTML = '<div style="font-size:12px;color:#9CA3AF;padding:4px 0">Nenhum insumo vinculado.</div>';
    return;
  }
  lista.innerHTML = _meqInsumos.map(function(i) {
    return '<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid #F3F4F6">' +
      '<span style="flex:1;font-size:13px"><strong>' + _esc(i.nome) + '</strong>' + (i.codigo ? ' <small style="color:#9CA3AF">(' + _esc(i.codigo) + ')</small>' : '') + '</span>' +
      '<input type="text" placeholder="Cor (ex: preto)" value="' + _esc(i.cor) + '" style="width:100px;font-size:12px;padding:3px 6px" oninput="meqAtualizarCor(\'' + i.insumo_id + '\',this.value)"/>' +
      '<button class="btn-icon" title="Remover" onclick="meqRemoverInsumo(\'' + i.insumo_id + '\')" style="color:#DC2626"><i class="ti ti-x"></i></button>' +
      '</div>';
  }).join('');
}

async function excluirEquipamento(id) {
  if (!confirm('Excluir este equipamento? Essa ação não pode ser desfeita.')) return;
  var { ok } = await sf('/rest/v1/equipamentos?id=eq.' + id, { method: 'DELETE' });
  if (!ok) { alert('Erro ao excluir equipamento.'); return; }
  carregarEquipamentos();
}
