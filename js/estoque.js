/* ═══════════════════════════════════════════════════════
   PEÇAS
═══════════════════════════════════════════════════════ */

async function carregarPecas() {
  const wrap = document.querySelector('#view-pecas .table-wrap');
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';
  const { data, ok } = await sf('/rest/v1/pecas?select=*,fornecedores(nome)&order=descricao.asc');
  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar peças.</div>'; return; }
  if (!data.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhuma peça cadastrada.</div>'; return; }

  const rows = data.map(function (p) {
    const estoque = p.estoque_atual != null ? p.estoque_atual : 0;
    const min = p.estoque_minimo || 0;
    let badge, cls = '';
    if (!p.ativo) { badge = '<span class="badge badge-inactive">Inativa</span>'; }
    else if (estoque === 0) { badge = '<span class="badge badge-critical">Crítico</span>'; cls = 'stock-critical'; }
    else if (estoque <= min) { badge = '<span class="badge badge-low">Baixo</span>'; }
    else { badge = '<span class="badge badge-ok">OK</span>'; }

    const custo = p.custo ? 'R$ ' + Number(p.custo).toFixed(2) : '—';
    const venda = p.preco_venda ? 'R$ ' + Number(p.preco_venda).toFixed(2) : '—';
    const margem = p.custo && p.preco_venda
      ? (((p.preco_venda - p.custo) / p.custo) * 100).toFixed(0) + '%'
      : '—';
    const margemCls = p.preco_venda > p.custo ? 'margem-pos' : (p.preco_venda < p.custo ? 'margem-neg' : '');
    const forn = p.fornecedores ? p.fornecedores.nome : '—';

    return '<tr>' +
      '<td><strong>' + _esc(p.descricao) + '</strong>' + (p.codigo ? '<br><small style="color:#9CA3AF">' + _esc(p.codigo) + '</small>' : '') + '</td>' +
      '<td class="' + cls + '">' + estoque + ' / ' + min + '</td>' +
      '<td>' + badge + '</td>' +
      '<td>' + custo + '</td>' +
      '<td>' + venda + '</td>' +
      '<td class="' + margemCls + '">' + margem + '</td>' +
      '<td>' + _esc(forn) + '</td>' +
      '<td><button class="btn-icon" title="Editar" onclick=\'abrirModalPeca(' + JSON.stringify(p) + ')\'><i class="ti ti-pencil"></i></button>' +
      '<button class="btn-icon" title="Excluir" onclick="excluirPeca(\'' + p.id + '\')"><i class="ti ti-trash" style="color:#DC2626"></i></button></td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table">' +
    '<thead><tr><th>Peça</th><th>Estoque/Mín</th><th>Status</th><th>Custo</th><th>Venda</th><th>Margem</th><th>Fornecedor</th><th></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

async function abrirModalPeca(p) {
  await _carregarFornecedoresSelect('mp-fornecedor');
  const id = p ? p.id : '';
  document.getElementById('mp-id').value = id;
  document.getElementById('mp-titulo').textContent = p ? 'Editar Peça' : 'Nova Peça';
  document.getElementById('mp-codigo').value = p ? (p.codigo || '') : '';
  document.getElementById('mp-descricao').value = p ? (p.descricao || '') : '';
  document.getElementById('mp-modelo').value = p ? (p.modelo_equipamento || '') : '';
  document.getElementById('mp-vida-util').value = p ? (p.vida_util_meses || '') : '';
  document.getElementById('mp-estoque-min').value = p ? (p.estoque_minimo || 0) : 0;
  document.getElementById('mp-custo').value = p ? (p.custo || '') : '';
  document.getElementById('mp-preco-venda').value = p ? (p.preco_venda || '') : '';
  document.getElementById('mp-fornecedor').value = p ? (p.fornecedor_id || '') : '';
  document.getElementById('mp-ativo').checked = p ? (p.ativo !== false) : true;
  document.getElementById('modal-peca').classList.add('open');
}

async function salvarPeca() {
  const id = document.getElementById('mp-id').value;
  const descricao = document.getElementById('mp-descricao').value.trim();
  if (!descricao) { alert('Informe a descrição da peça.'); return; }

  const payload = {
    codigo: document.getElementById('mp-codigo').value.trim() || null,
    descricao,
    modelo_equipamento: document.getElementById('mp-modelo').value.trim() || null,
    vida_util_meses: document.getElementById('mp-vida-util').value.trim() || null,
    estoque_minimo: parseInt(document.getElementById('mp-estoque-min').value) || 0,
    custo: parseFloat(document.getElementById('mp-custo').value) || null,
    preco_venda: parseFloat(document.getElementById('mp-preco-venda').value) || null,
    fornecedor_id: document.getElementById('mp-fornecedor').value || null,
    ativo: document.getElementById('mp-ativo').checked
  };

  let res;
  if (id) {
    res = await sf('/rest/v1/pecas?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(payload) });
  } else {
    res = await sf('/rest/v1/pecas', { method: 'POST', body: JSON.stringify(payload), headers: { 'Prefer': 'return=minimal' } });
  }

  if (!res.ok) { alert('Erro ao salvar peça: ' + JSON.stringify(res.data)); return; }
  fecharModal('modal-peca');
  carregarPecas();
}

async function excluirPeca(id) {
  if (!confirm('Excluir esta peça? A ação não pode ser desfeita.')) return;
  const res = await sf('/rest/v1/pecas?id=eq.' + id, { method: 'DELETE' });
  if (!res.ok) { alert('Erro ao excluir: ' + JSON.stringify(res.data)); return; }
  carregarPecas();
}

/* ═══════════════════════════════════════════════════════
   FORNECEDORES
═══════════════════════════════════════════════════════ */

async function carregarFornecedores() {
  const wrap = document.querySelector('#view-fornecedores .table-wrap');
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';
  const { data, ok } = await sf('/rest/v1/fornecedores?select=*&order=nome.asc');
  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar fornecedores.</div>'; return; }
  if (!data.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhum fornecedor cadastrado.</div>'; return; }

  const rows = data.map(function (f) {
    return '<tr>' +
      '<td><strong>' + _esc(f.nome) + '</strong></td>' +
      '<td>' + _esc(f.cnpj || '—') + '</td>' +
      '<td>' + _esc(f.telefone || '—') + '</td>' +
      '<td>' + _esc(f.email || '—') + '</td>' +
      '<td>' + _esc(f.contato || '—') + '</td>' +
      '<td><button class="btn-icon" title="Editar" onclick=\'abrirModalFornecedor(' + JSON.stringify(f) + ')\'><i class="ti ti-pencil"></i></button>' +
      '<button class="btn-icon" title="Excluir" onclick="excluirFornecedor(\'' + f.id + '\')"><i class="ti ti-trash" style="color:#DC2626"></i></button></td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table">' +
    '<thead><tr><th>Nome</th><th>CNPJ</th><th>Telefone</th><th>E-mail</th><th>Contato</th><th></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

async function abrirModalFornecedor(f) {
  document.getElementById('mf-id').value = f ? f.id : '';
  document.getElementById('mf-titulo').textContent = f ? 'Editar Fornecedor' : 'Novo Fornecedor';
  document.getElementById('mf-nome').value = f ? (f.nome || '') : '';
  document.getElementById('mf-cnpj').value = f ? (f.cnpj || '') : '';
  document.getElementById('mf-telefone').value = f ? (f.telefone || '') : '';
  document.getElementById('mf-email').value = f ? (f.email || '') : '';
  document.getElementById('mf-contato').value = f ? (f.contato || '') : '';
  document.getElementById('modal-fornecedor').classList.add('open');
}

async function salvarFornecedor() {
  const id = document.getElementById('mf-id').value;
  const nome = document.getElementById('mf-nome').value.trim();
  if (!nome) { alert('Informe o nome do fornecedor.'); return; }

  const payload = {
    nome,
    cnpj: document.getElementById('mf-cnpj').value.trim() || null,
    telefone: document.getElementById('mf-telefone').value.trim() || null,
    email: document.getElementById('mf-email').value.trim() || null,
    contato: document.getElementById('mf-contato').value.trim() || null
  };

  let res;
  if (id) {
    res = await sf('/rest/v1/fornecedores?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(payload) });
  } else {
    res = await sf('/rest/v1/fornecedores', { method: 'POST', body: JSON.stringify(payload), headers: { 'Prefer': 'return=minimal' } });
  }

  if (!res.ok) { alert('Erro ao salvar fornecedor: ' + JSON.stringify(res.data)); return; }
  fecharModal('modal-fornecedor');
  carregarFornecedores();
}

async function excluirFornecedor(id) {
  if (!confirm('Excluir este fornecedor?')) return;
  const res = await sf('/rest/v1/fornecedores?id=eq.' + id, { method: 'DELETE' });
  if (!res.ok) { alert('Erro ao excluir: ' + JSON.stringify(res.data)); return; }
  carregarFornecedores();
}

/* ═══════════════════════════════════════════════════════
   ENTRADAS
═══════════════════════════════════════════════════════ */

async function carregarEntradas() {
  const wrap = document.querySelector('#view-entradas .table-wrap');
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';
  const { data, ok } = await sf('/rest/v1/entradas_estoque?select=*,pecas(descricao,codigo),fornecedores(nome)&order=created_at.desc&limit=100');
  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar entradas.</div>'; return; }
  if (!data.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhuma entrada registrada.</div>'; return; }

  const rows = data.map(function (e) {
    const peca = e.pecas ? _esc(e.pecas.descricao) + (e.pecas.codigo ? ' <small style="color:#9CA3AF">(' + _esc(e.pecas.codigo) + ')</small>' : '') : '—';
    const forn = e.fornecedores ? _esc(e.fornecedores.nome) : '—';
    const custo = e.custo_unitario ? 'R$ ' + Number(e.custo_unitario).toFixed(2) : '—';
    const total = e.custo_unitario && e.quantidade ? 'R$ ' + (e.custo_unitario * e.quantidade).toFixed(2) : '—';
    const dt = e.data_compra ? new Date(e.data_compra + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    return '<tr>' +
      '<td>' + peca + '</td>' +
      '<td>' + forn + '</td>' +
      '<td><strong>' + e.quantidade + '</strong></td>' +
      '<td>' + custo + '</td>' +
      '<td>' + total + '</td>' +
      '<td>' + _esc(e.nota_fiscal || '—') + '</td>' +
      '<td>' + dt + '</td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table">' +
    '<thead><tr><th>Peça</th><th>Fornecedor</th><th>Qtd</th><th>Custo Unit.</th><th>Total</th><th>NF</th><th>Data</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

async function abrirModalEntrada() {
  await Promise.all([
    _carregarPecasSelect('me-peca'),
    _carregarFornecedoresSelect('me-fornecedor')
  ]);
  document.getElementById('me-quantidade').value = 1;
  document.getElementById('me-custo-unit').value = '';
  document.getElementById('me-nota-fiscal').value = '';
  document.getElementById('me-data-compra').value = '';
  document.getElementById('me-data-entrega').value = '';
  document.getElementById('me-rastreio').value = '';
  document.getElementById('me-observacao').value = '';
  document.getElementById('modal-entrada').classList.add('open');
}

async function salvarEntrada() {
  const pecaId = document.getElementById('me-peca').value;
  const fornId = document.getElementById('me-fornecedor').value;
  const qtd = parseInt(document.getElementById('me-quantidade').value);
  const custo = parseFloat(document.getElementById('me-custo-unit').value);

  if (!pecaId) { alert('Selecione a peça.'); return; }
  if (!fornId) { alert('Selecione o fornecedor.'); return; }
  if (!qtd || qtd < 1) { alert('Informe a quantidade (mínimo 1).'); return; }
  if (!custo || custo < 0) { alert('Informe o custo unitário.'); return; }

  const payload = {
    peca_id: pecaId,
    fornecedor_id: fornId,
    quantidade: qtd,
    custo_unitario: custo,
    nota_fiscal: document.getElementById('me-nota-fiscal').value.trim() || null,
    data_compra: document.getElementById('me-data-compra').value || null,
    data_entrega_prevista: document.getElementById('me-data-entrega').value || null,
    codigo_rastreio: document.getElementById('me-rastreio').value.trim() || null,
    observacao: document.getElementById('me-observacao').value.trim() || null
  };

  const entRes = await sf('/rest/v1/entradas_estoque', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Prefer': 'return=minimal' }
  });
  if (!entRes.ok) { alert('Erro ao registrar entrada: ' + JSON.stringify(entRes.data)); return; }

  const pecaRes = await sf('/rest/v1/pecas?id=eq.' + pecaId + '&select=estoque_atual');
  const estoqueAtual = pecaRes.data && pecaRes.data[0] ? (pecaRes.data[0].estoque_atual || 0) : 0;
  const novoEstoque = estoqueAtual + qtd;

  const updateRes = await sf('/rest/v1/pecas?id=eq.' + pecaId, {
    method: 'PATCH',
    body: JSON.stringify({ estoque_atual: novoEstoque, custo: custo })
  });
  if (!updateRes.ok) {
    alert('Entrada registrada mas houve erro ao atualizar estoque. Verifique manualmente.');
  }

  fecharModal('modal-entrada');
  carregarEntradas();
}

/* ═══════════════════════════════════════════════════════
   ALERTAS
═══════════════════════════════════════════════════════ */

let _alertasPecas = [];

async function carregarAlertas() {
  const content = document.getElementById('alertas-content');
  content.innerHTML = '<div class="tbl-loading">Carregando...</div>';

  const { data, ok } = await sf('/rest/v1/pecas?select=*,fornecedores(nome,email,telefone)&ativo=eq.true&order=descricao.asc');
  if (!ok || !data) { content.innerHTML = '<div class="tbl-empty">Erro ao carregar peças.</div>'; return; }

  _alertasPecas = data.filter(function (p) {
    const est = p.estoque_atual != null ? p.estoque_atual : 0;
    const min = p.estoque_minimo || 0;
    return est <= min;
  });

  const btn = document.getElementById('btn-alertas-email');
  btn.disabled = _alertasPecas.length === 0;

  if (!_alertasPecas.length) {
    content.innerHTML = '<div class="alert-ok"><i class="ti ti-circle-check"></i>Todos os estoques estão acima do nível mínimo!</div>';
    return;
  }

  content.innerHTML = _alertasPecas.map(function (p) {
    const est = p.estoque_atual != null ? p.estoque_atual : 0;
    const min = p.estoque_minimo || 0;
    const forn = p.fornecedores ? p.fornecedores.nome : '—';
    const isCritical = est === 0;
    return '<div class="alert-card">' +
      '<i class="ti ' + (isCritical ? 'ti-alert-octagon' : 'ti-alert-triangle') + '"></i>' +
      '<div class="alert-info">' +
      '<strong>' + _esc(p.descricao) + (p.codigo ? ' <span style="font-weight:400;color:#9CA3AF;font-size:12px">(' + _esc(p.codigo) + ')</span>' : '') + '</strong>' +
      '<span>Fornecedor: ' + _esc(forn) + (p.modelo_equipamento ? ' &nbsp;|&nbsp; Modelo: ' + _esc(p.modelo_equipamento) : '') + '</span>' +
      '</div>' +
      '<div class="alert-stock">' +
      '<div class="num">' + est + '</div>' +
      '<div class="lbl">atual / mín ' + min + '</div>' +
      '</div>' +
      '</div>';
  }).join('');
}

async function enviarAlertaEmail() {
  if (!_alertasPecas.length) return;
  const btn = document.getElementById('btn-alertas-email');
  btn.textContent = 'Enviando...';
  btn.disabled = true;

  try {
    const linhas = _alertasPecas.map(function (p) {
      const est = p.estoque_atual != null ? p.estoque_atual : 0;
      const min = p.estoque_minimo || 0;
      const forn = p.fornecedores ? p.fornecedores.nome : '—';
      return '<tr>' +
        '<td style="padding:8px 12px;border-bottom:1px solid #EEF1F7">' + _esc(p.descricao) + (p.codigo ? ' (' + _esc(p.codigo) + ')' : '') + '</td>' +
        '<td style="padding:8px 12px;border-bottom:1px solid #EEF1F7;text-align:center;color:#DC2626;font-weight:700">' + est + '</td>' +
        '<td style="padding:8px 12px;border-bottom:1px solid #EEF1F7;text-align:center">' + min + '</td>' +
        '<td style="padding:8px 12px;border-bottom:1px solid #EEF1F7">' + _esc(forn) + '</td>' +
        '</tr>';
    }).join('');

    const html = '<div style="font-family:Arial,sans-serif;color:#222;max-width:640px">' +
      '<p style="font-size:16px;font-weight:700;color:#DC2626;margin-bottom:8px">⚠️ Alerta de Estoque Baixo — Teffe ERP</p>' +
      '<p style="font-size:13.5px;color:#555;margin-bottom:18px">As seguintes peças estão com estoque igual ou abaixo do mínimo:</p>' +
      '<table style="border-collapse:collapse;width:100%;border:1px solid #EEF1F7;border-radius:8px;overflow:hidden">' +
      '<thead><tr style="background:#F0F4FA">' +
      '<th style="padding:10px 12px;text-align:left;font-size:11.5px;color:#1A3F80">Peça</th>' +
      '<th style="padding:10px 12px;text-align:center;font-size:11.5px;color:#1A3F80">Estoque Atual</th>' +
      '<th style="padding:10px 12px;text-align:center;font-size:11.5px;color:#1A3F80">Mínimo</th>' +
      '<th style="padding:10px 12px;text-align:left;font-size:11.5px;color:#1A3F80">Fornecedor</th>' +
      '</tr></thead><tbody>' + linhas + '</tbody></table>' +
      '<p style="font-size:12px;color:#9CA3AF;margin-top:18px">Enviado automaticamente pelo ERP Teffe — ' + new Date().toLocaleString('pt-BR') + '</p>' +
      '</div>';

    await erpEnviarEmail('contato@teffe.com.br', 'Alerta de Estoque Baixo — ' + _alertasPecas.length + ' peça(s)', html);
    alert('E-mail de alerta enviado com sucesso!');
  } catch (e) {
    alert('Erro ao enviar e-mail: ' + e.message);
  }

  btn.innerHTML = '<i class="ti ti-mail"></i> Enviar alerta por e-mail';
  btn.disabled = false;
}

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */

function _esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function _carregarFornecedoresSelect(selId) {
  const { data } = await sf('/rest/v1/fornecedores?select=id,nome&order=nome.asc');
  const sel = document.getElementById(selId);
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">Selecione...</option>';
  (data || []).forEach(function (f) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.nome;
    sel.appendChild(opt);
  });
  if (currentVal) sel.value = currentVal;
}

async function _carregarPecasSelect(selId) {
  const { data } = await sf('/rest/v1/pecas?select=id,descricao,codigo&ativo=eq.true&order=descricao.asc');
  const sel = document.getElementById(selId);
  sel.innerHTML = '<option value="">Selecione a peça...</option>';
  (data || []).forEach(function (p) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.descricao + (p.codigo ? ' (' + p.codigo + ')' : '');
    sel.appendChild(opt);
  });
}
