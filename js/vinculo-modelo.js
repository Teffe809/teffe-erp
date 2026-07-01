/* ═══════════════════════════════════════════════════════
   VÍNCULO POR MODELO — insumos e peças compatíveis por modelo de equipamento
   (equipamento_insumos.modelo / equipamento_pecas.modelo — texto, cobre
   todas as unidades daquele modelo)
═══════════════════════════════════════════════════════ */

var _vmInsumosVinculados = []; // ids de insumos vinculados ao modelo selecionado
var _vmPecasVinculadas = []; // ids de peças vinculadas ao modelo selecionado

async function carregarVinculoModelo() {
  var sel = document.getElementById('vm-modelo');
  var modeloAtual = sel.value;
  sel.innerHTML = '<option value="">Carregando modelos...</option>';
  document.getElementById('vm-conteudo').style.display = 'none';

  var { data } = await sf('/rest/v1/equipamentos?select=modelo&order=modelo.asc');
  var modelos = Array.from(new Set((data || []).map(function (e) { return e.modelo; }).filter(Boolean))).sort();

  if (!modelos.length) {
    sel.innerHTML = '<option value="">Nenhum modelo cadastrado em Equipamentos</option>';
    return;
  }

  sel.innerHTML = '<option value="">Selecione um modelo...</option>' +
    modelos.map(function (m) { return '<option value="' + _esc(m) + '">' + _esc(m) + '</option>'; }).join('');
  if (modeloAtual && modelos.indexOf(modeloAtual) !== -1) {
    sel.value = modeloAtual;
    vmCarregarVinculos();
  }
}

async function vmCarregarVinculos() {
  var modelo = document.getElementById('vm-modelo').value;
  var conteudo = document.getElementById('vm-conteudo');
  if (!modelo) { conteudo.style.display = 'none'; return; }
  conteudo.style.display = 'block';
  document.getElementById('vm-lista-insumos').innerHTML = '<div class="tbl-loading">Carregando...</div>';
  document.getElementById('vm-lista-pecas').innerHTML = '<div class="tbl-loading">Carregando...</div>';

  var [insumosRes, pecasRes, linkInsumosRes, linkPecasRes] = await Promise.all([
    sf('/rest/v1/insumos?select=id,nome,codigo,tipo&order=nome.asc'),
    sf('/rest/v1/pecas?select=id,codigo,descricao&order=descricao.asc'),
    sf('/rest/v1/equipamento_insumos?modelo=eq.' + encodeURIComponent(modelo) + '&select=insumo_id'),
    sf('/rest/v1/equipamento_pecas?modelo=eq.' + encodeURIComponent(modelo) + '&select=peca_id')
  ]);

  _vmInsumosVinculados = (linkInsumosRes.data || []).map(function (l) { return l.insumo_id; });
  _vmPecasVinculadas = (linkPecasRes.data || []).map(function (l) { return l.peca_id; });

  _vmRenderInsumos(insumosRes.data || []);
  _vmRenderPecas(pecasRes.data || []);
}

function _vmRenderInsumos(insumos) {
  var wrap = document.getElementById('vm-lista-insumos');
  if (!insumos.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhum insumo cadastrado.</div>'; return; }
  var tipoLabel = { toner: 'Toner', cartucho: 'Cartucho', cilindro: 'Cilindro', fita: 'Fita', outro: 'Outro' };
  wrap.innerHTML = insumos.map(function (i) {
    var checked = _vmInsumosVinculados.indexOf(i.id) !== -1;
    return '<label class="vm-check-item">' +
      '<input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="vmToggleInsumo(\'' + i.id + '\',this.checked)"/>' +
      '<span>' + _esc(i.nome) + (i.codigo ? ' <small style="color:#9CA3AF">(' + _esc(i.codigo) + ')</small>' : '') +
      ' <small style="color:#6366F1">' + (tipoLabel[i.tipo] || i.tipo || '') + '</small></span>' +
      '</label>';
  }).join('');
}

function _vmRenderPecas(pecas) {
  var wrap = document.getElementById('vm-lista-pecas');
  if (!pecas.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhuma peça cadastrada.</div>'; return; }
  wrap.innerHTML = pecas.map(function (p) {
    var checked = _vmPecasVinculadas.indexOf(p.id) !== -1;
    return '<label class="vm-check-item">' +
      '<input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="vmTogglePeca(\'' + p.id + '\',this.checked)"/>' +
      '<span>' + _esc(p.descricao) + (p.codigo ? ' <small style="color:#9CA3AF">(' + _esc(p.codigo) + ')</small>' : '') + '</span>' +
      '</label>';
  }).join('');
}

function vmToggleInsumo(id, checked) {
  var idx = _vmInsumosVinculados.indexOf(id);
  if (checked && idx === -1) _vmInsumosVinculados.push(id);
  else if (!checked && idx !== -1) _vmInsumosVinculados.splice(idx, 1);
}

function vmTogglePeca(id, checked) {
  var idx = _vmPecasVinculadas.indexOf(id);
  if (checked && idx === -1) _vmPecasVinculadas.push(id);
  else if (!checked && idx !== -1) _vmPecasVinculadas.splice(idx, 1);
}

async function vmSalvarVinculos() {
  var modelo = document.getElementById('vm-modelo').value;
  if (!modelo) return;
  var btn = document.getElementById('vm-btn-salvar');
  btn.disabled = true; btn.textContent = 'Salvando...';

  await Promise.all([
    _vmSincronizar('equipamento_insumos', 'insumo_id', modelo, _vmInsumosVinculados),
    _vmSincronizar('equipamento_pecas', 'peca_id', modelo, _vmPecasVinculadas)
  ]);

  btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy"></i> Salvar Vínculos';
  registrarLog('vinculo_modelo_atualizado', { modelo: modelo, insumos: _vmInsumosVinculados.length, pecas: _vmPecasVinculadas.length });
  alert('Vínculos do modelo "' + modelo + '" salvos com sucesso!');
}

async function _vmSincronizar(tabela, campoId, modelo, idsDesejados) {
  var { data } = await sf('/rest/v1/' + tabela + '?modelo=eq.' + encodeURIComponent(modelo) + '&select=id,' + campoId);
  var existentes = data || [];
  var existentesIds = existentes.map(function (l) { return l[campoId]; });

  var paraRemover = existentes.filter(function (l) { return idsDesejados.indexOf(l[campoId]) === -1; });
  var paraAdicionar = idsDesejados.filter(function (id) { return existentesIds.indexOf(id) === -1; });

  var ops = [];
  paraRemover.forEach(function (l) {
    ops.push(sf('/rest/v1/' + tabela + '?id=eq.' + l.id, { method: 'DELETE' }));
  });
  paraAdicionar.forEach(function (id) {
    var body = { modelo: modelo };
    body[campoId] = id;
    ops.push(sf('/rest/v1/' + tabela, { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify(body) }));
  });
  await Promise.all(ops);
}
