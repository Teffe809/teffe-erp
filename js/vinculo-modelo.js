/* ═══════════════════════════════════════════════════════
   VÍNCULO POR MODELO — insumos e peças compatíveis por modelo de equipamento
   (equipamento_insumos.modelo / equipamento_pecas.modelo — texto, cobre
   todas as unidades daquele modelo)
═══════════════════════════════════════════════════════ */

var _vmInsumosVinculados = []; // ids de insumos vinculados ao modelo selecionado
var _vmPecasVinculadas = []; // ids de peças vinculadas ao modelo selecionado

// Extrai o array de uma resposta de sf(); se a query falhar (tabela/coluna
// inexistente, RLS etc.) o PostgREST retorna um objeto de erro em vez de um
// array — sem essa checagem, um .map() nesse objeto quebra silenciosamente
// e trava a tela em "Carregando..." para sempre.
function _vmDataOuErro(res, nomeConsulta) {
  if (res && res.ok && Array.isArray(res.data)) return res.data;
  var msg = (res && res.data && res.data.message) ? res.data.message : ('Falha ao consultar ' + nomeConsulta + '.');
  throw new Error(msg);
}

async function carregarVinculoModelo() {
  var sel = document.getElementById('vm-modelo');
  var modeloAtual = sel.value;
  sel.innerHTML = '<option value="">Carregando modelos...</option>';
  document.getElementById('vm-conteudo').style.display = 'none';

  try {
    var res = await sf('/rest/v1/equipamentos?select=modelo&order=modelo.asc');
    var data = _vmDataOuErro(res, 'equipamentos');
    var modelos = Array.from(new Set(data.map(function (e) { return e.modelo; }).filter(Boolean))).sort();

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
  } catch (err) {
    console.error('[carregarVinculoModelo]', err);
    sel.innerHTML = '<option value="">Erro ao carregar modelos</option>';
  }
}

async function vmCarregarVinculos() {
  var modelo = document.getElementById('vm-modelo').value;
  var conteudo = document.getElementById('vm-conteudo');
  if (!modelo) { conteudo.style.display = 'none'; return; }
  conteudo.style.display = 'block';
  var insumosWrap = document.getElementById('vm-lista-insumos');
  var pecasWrap = document.getElementById('vm-lista-pecas');
  insumosWrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';
  pecasWrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';

  try {
    var resultados = await Promise.all([
      sf('/rest/v1/insumos?select=id,nome,codigo,tipo&order=nome.asc'),
      sf('/rest/v1/pecas?select=id,codigo,descricao&order=descricao.asc'),
      sf('/rest/v1/equipamento_insumos?modelo=eq.' + encodeURIComponent(modelo) + '&select=insumo_id'),
      sf('/rest/v1/equipamento_pecas?modelo=eq.' + encodeURIComponent(modelo) + '&select=peca_id')
    ]);

    var insumos = _vmDataOuErro(resultados[0], 'insumos');
    var pecas = _vmDataOuErro(resultados[1], 'pecas');
    var linksInsumos = _vmDataOuErro(resultados[2], 'equipamento_insumos');
    var linksPecas = _vmDataOuErro(resultados[3], 'equipamento_pecas');

    _vmInsumosVinculados = linksInsumos.map(function (l) { return l.insumo_id; });
    _vmPecasVinculadas = linksPecas.map(function (l) { return l.peca_id; });

    _vmRenderInsumos(insumos);
    _vmRenderPecas(pecas);
  } catch (err) {
    console.error('[vmCarregarVinculos]', err);
    var msg = '<div class="tbl-empty">Erro ao carregar: ' + _esc(err.message) + '</div>';
    insumosWrap.innerHTML = msg;
    pecasWrap.innerHTML = msg;
  }
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

  try {
    await Promise.all([
      _vmSincronizar('equipamento_insumos', 'insumo_id', modelo, _vmInsumosVinculados),
      _vmSincronizar('equipamento_pecas', 'peca_id', modelo, _vmPecasVinculadas)
    ]);
    registrarLog('vinculo_modelo_atualizado', { modelo: modelo, insumos: _vmInsumosVinculados.length, pecas: _vmPecasVinculadas.length });
    alert('Vínculos do modelo "' + modelo + '" salvos com sucesso!');
  } catch (err) {
    console.error('[vmSalvarVinculos]', err);
    alert('Erro ao salvar vínculos: ' + err.message);
  }

  btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy"></i> Salvar Vínculos';
}

async function _vmSincronizar(tabela, campoId, modelo, idsDesejados) {
  var res = await sf('/rest/v1/' + tabela + '?modelo=eq.' + encodeURIComponent(modelo) + '&select=id,' + campoId);
  var existentes = _vmDataOuErro(res, tabela);
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

  var resultados = await Promise.all(ops);
  var falha = resultados.find(function (r) { return !r.ok; });
  if (falha) throw new Error((falha.data && falha.data.message) || ('Falha ao sincronizar ' + tabela + '.'));
}

/* ── Vínculo em massa reaproveitável por outras telas (cadastro de insumo/
   peça/equipamento — ver js/insumos.js, js/estoque.js, js/equipamentos.js) ── */
async function vmVincularModelo(tabela, campoId, modelo, idsDesejados) {
  if (!modelo) return;
  await _vmSincronizar(tabela, campoId, modelo, idsDesejados || []);
}

// Todos os modelos já cadastrados em Equipamentos (distinct), para popular
// checklists de "compatível com quais modelos" em outras telas de cadastro.
async function vmListarModelosExistentes() {
  var res = await sf('/rest/v1/equipamentos?select=modelo&order=modelo.asc');
  var data = _vmDataOuErro(res, 'equipamentos');
  return Array.from(new Set(data.map(function (e) { return e.modelo; }).filter(Boolean))).sort();
}

// Sincroniza vínculos a partir do ITEM (insumo ou peça) — inverso de
// _vmSincronizar, que sincroniza a partir do modelo. Usado nos checklists
// "este item serve para quais modelos" dos cadastros de insumo/peça.
async function vmSincronizarPorItem(tabela, campoId, itemId, modelosDesejados) {
  var res = await sf('/rest/v1/' + tabela + '?' + campoId + '=eq.' + itemId + '&select=id,modelo');
  var existentes = _vmDataOuErro(res, tabela);
  var existentesModelos = existentes.map(function (l) { return l.modelo; });

  var paraRemover = existentes.filter(function (l) { return modelosDesejados.indexOf(l.modelo) === -1; });
  var paraAdicionar = modelosDesejados.filter(function (m) { return existentesModelos.indexOf(m) === -1; });

  var ops = [];
  paraRemover.forEach(function (l) {
    ops.push(sf('/rest/v1/' + tabela + '?id=eq.' + l.id, { method: 'DELETE' }));
  });
  paraAdicionar.forEach(function (m) {
    var body = { modelo: m };
    body[campoId] = itemId;
    ops.push(sf('/rest/v1/' + tabela, { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify(body) }));
  });

  var resultados = await Promise.all(ops);
  var falha = resultados.find(function (r) { return !r.ok; });
  if (falha) throw new Error((falha.data && falha.data.message) || ('Falha ao sincronizar ' + tabela + '.'));
}

// Navega para a tela de Vínculo por Modelo já com um modelo específico
// selecionado — usada logo após cadastrar um equipamento de modelo novo.
async function vmAbrirParaModeloNovo(modelo) {
  erpShowView('vinculo-modelo');
  await carregarVinculoModelo();
  var sel = document.getElementById('vm-modelo');
  var existe = Array.prototype.some.call(sel.options, function (o) { return o.value === modelo; });
  if (existe) {
    sel.value = modelo;
    await vmCarregarVinculos();
  }
}
