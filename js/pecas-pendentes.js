/* ═══════════════════════════════════════════════════════
   PEÇAS PENDENTES — fluxo Faturar/Comprar vinculado ao estoque
   (Tarefa 2: chamado_pecas_pendentes, pedidos_compra, estoque_saidas)
═══════════════════════════════════════════════════════ */

var _erpPPCache = [];       // chamado_pecas_pendentes enriquecidos (não-entregues)
var _erpPedidosCache = [];  // pedidos_compra pendentes

var _PP_STATUS_LABEL = { solicitado: 'Solicitado', faturado: 'Faturado', nf_emitida: 'NF Emitida', enviada: 'Enviada', entregue: 'Entregue' };
var _PP_STATUS_COR   = { solicitado: '#DC2626', faturado: '#D97706', nf_emitida: '#7C3AED', enviada: '#2563EB', entregue: '#16A34A' };

function _atualizarBadgePecasPendentes() {
  var badge = document.getElementById('nav-pecas-pendentes-badge');
  if (!badge) return;
  var n = _erpPPCache.length;
  if (n > 0) { badge.textContent = n; badge.style.display = 'inline-flex'; }
  else { badge.style.display = 'none'; }
}

async function carregarPecasPendentes() {
  var wrap = document.getElementById('pp-table-wrap');
  if (wrap) wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';

  var r = await sf('/rest/v1/chamado_pecas_pendentes?status=neq.entregue&select=*,pecas(codigo,descricao,estoque_atual),chamados(numero,cliente_id)&order=criado_em.asc');
  var rows = _arrOuVazio(r);
  _erpPPCache = rows;
  _atualizarBadgePecasPendentes();

  if (!rows.length) { if (wrap) wrap.innerHTML = '<div class="tbl-empty">Nenhuma peça pendente.</div>'; carregarPedidosCompraPendentes(); return; }

  var clienteIds = [...new Set(rows.map(function(r) { return r.chamados && r.chamados.cliente_id; }).filter(Boolean))];
  var clienteMap = {};
  if (clienteIds.length) {
    var cr = await sf('/rest/v1/clientes?id=in.(' + clienteIds.join(',') + ')&select=id,razao_social,fantasia');
    _arrOuVazio(cr).forEach(function(c) { clienteMap[c.id] = c; });
  }

  // Pedidos de compra ainda não recebidos, pra não deixar clicar em "Comprar"
  // de novo enquanto já existe um pedido em aberto pra essa mesma linha.
  var pendIds = rows.map(function(r) { return r.id; });
  var pr = await sf('/rest/v1/pedidos_compra?status=eq.pendente&chamado_peca_pendente_id=in.(' + pendIds.join(',') + ')&select=chamado_peca_pendente_id,criado_em');
  var pedidoAbertoPor = {};
  _arrOuVazio(pr).forEach(function(p) { pedidoAbertoPor[p.chamado_peca_pendente_id] = p; });

  wrap.innerHTML = '<table class="erp-table"><thead><tr><th>Chamado</th><th>Cliente</th><th>Peça</th><th>Qtd</th><th>Estoque</th><th>Status</th><th>Ação</th></tr></thead><tbody>' +
    rows.map(function(p) {
      var cli = p.chamados && clienteMap[p.chamados.cliente_id];
      var cliNome = cli ? (cli.razao_social || cli.fantasia || '–') : '–';
      var num = p.chamados ? (p.chamados.numero != null ? p.chamados.numero : '–') : '–';
      var pecaNome = p.pecas ? ((p.pecas.codigo ? '[' + p.pecas.codigo + '] ' : '') + p.pecas.descricao) : '–';
      var estoque = p.pecas ? (p.pecas.estoque_atual != null ? p.pecas.estoque_atual : 0) : 0;
      var cor = _PP_STATUS_COR[p.status] || '#9CA3AF';
      var badge = '<span style="font-size:11px;padding:2px 7px;border-radius:3px;background:' + cor + '22;color:' + cor + ';font-weight:600">' + (_PP_STATUS_LABEL[p.status] || p.status) + '</span>';

      var acao = '';
      if (p.status === 'solicitado') {
        var pedido = pedidoAbertoPor[p.id];
        if (pedido) {
          acao = '<span style="font-size:11px;color:#9CA3AF">Pedido de compra em aberto (' + new Date(pedido.criado_em).toLocaleDateString('pt-BR') + ')</span>';
        } else if (estoque > 0) {
          acao = '<button class="btn-secondary" style="font-size:11px;padding:3px 10px" onclick="erpPecaFaturar(\'' + p.id + '\')">Faturar</button>';
        } else {
          acao = '<button class="btn-secondary" style="font-size:11px;padding:3px 10px" onclick="erpPecaAbrirComprar(\'' + p.id + '\')">Comprar</button>';
        }
      } else if (p.status === 'faturado') {
        acao = '<button class="btn-secondary" style="font-size:11px;padding:3px 10px" onclick="erpPecaMarcarNF(\'' + p.id + '\')">Marcar NF Emitida</button>';
      } else if (p.status === 'nf_emitida') {
        acao = '<button class="btn-secondary" style="font-size:11px;padding:3px 10px" onclick="erpPecaMarcarEnviada(\'' + p.id + '\')">Marcar como Enviada</button>';
      } else if (p.status === 'enviada') {
        acao = '<button class="btn-secondary" style="font-size:11px;padding:3px 10px" onclick="erpPecaMarcarEntregue(\'' + p.id + '\')">Marcar como Entregue</button>';
      }

      return '<tr>' +
        '<td>O.S. ' + num + '</td>' +
        '<td>' + _esc(cliNome) + '</td>' +
        '<td>' + _esc(pecaNome) + '</td>' +
        '<td>' + (p.quantidade || 1) + '</td>' +
        '<td' + (estoque <= 0 ? ' style="color:#DC2626;font-weight:700"' : '') + '>' + estoque + '</td>' +
        '<td>' + badge + '</td>' +
        '<td>' + acao + '</td>' +
        '</tr>';
    }).join('') + '</tbody></table>';

  carregarPedidosCompraPendentes();
}

async function erpPecaFaturar(id) {
  var p = _erpPPCache.find(function(x) { return x.id === id; });
  if (!p) return;
  var qtd = p.quantidade || 1;

  var pecaRes = await sf('/rest/v1/pecas?id=eq.' + p.peca_id + '&select=estoque_atual');
  var estoqueAtual = pecaRes.data && pecaRes.data[0] ? (pecaRes.data[0].estoque_atual || 0) : 0;
  if (estoqueAtual < qtd) { alert('Estoque insuficiente (disponível: ' + estoqueAtual + ', necessário: ' + qtd + ').'); carregarPecasPendentes(); return; }

  var novoEstoque = estoqueAtual - qtd;
  var upd = await sf('/rest/v1/pecas?id=eq.' + p.peca_id, { method: 'PATCH', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ estoque_atual: novoEstoque }) });
  if (!upd.ok) { alert('Erro ao atualizar estoque.'); return; }

  await sf('/rest/v1/estoque_saidas', { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ peca_id: p.peca_id, quantidade: qtd, chamado_id: p.chamado_id, criado_por: _erpNome || null }) }).catch(function() {});

  var r = await sf('/rest/v1/chamado_pecas_pendentes?id=eq.' + id, { method: 'PATCH', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ status: 'faturado', atualizado_em: new Date().toISOString() }) });
  if (!r.ok) { alert('Erro ao atualizar status da peça.'); return; }
  carregarPecasPendentes();
}

async function erpPecaAbrirComprar(id) {
  var p = _erpPPCache.find(function(x) { return x.id === id; });
  if (!p) return;
  document.getElementById('ppc-pendente-id').value = id;
  document.getElementById('ppc-peca-nome').value = p.pecas ? ((p.pecas.codigo ? '[' + p.pecas.codigo + '] ' : '') + p.pecas.descricao) : '';
  document.getElementById('ppc-quantidade').value = p.quantidade || 1;
  await _carregarFornecedoresSelect('ppc-fornecedor');
  document.getElementById('modal-pp-comprar').classList.add('open');
}

async function erpPedidoCompraSalvar() {
  var pendId = document.getElementById('ppc-pendente-id').value;
  var p = _erpPPCache.find(function(x) { return x.id === pendId; });
  if (!p) return;
  var fornecedorId = document.getElementById('ppc-fornecedor').value;
  var qtd = parseInt(document.getElementById('ppc-quantidade').value);
  if (!fornecedorId) { alert('Selecione o fornecedor.'); return; }
  if (!qtd || qtd < 1) { alert('Informe a quantidade (mínimo 1).'); return; }

  var r = await sf('/rest/v1/pedidos_compra', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      peca_id: p.peca_id, fornecedor_id: fornecedorId, quantidade: qtd,
      chamado_id: p.chamado_id, chamado_peca_pendente_id: p.id, criado_por: _erpNome || null
    })
  });
  if (!r.ok) { alert('Erro ao criar pedido de compra: ' + JSON.stringify(r.data)); return; }
  fecharModal('modal-pp-comprar');
  carregarPecasPendentes();
}

async function erpPecaMarcarNF(id) {
  var r = await sf('/rest/v1/chamado_pecas_pendentes?id=eq.' + id, { method: 'PATCH', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ status: 'nf_emitida', atualizado_em: new Date().toISOString() }) });
  if (!r.ok) { alert('Erro ao atualizar.'); return; }
  carregarPecasPendentes();
}

async function erpPecaMarcarEnviada(id) {
  var r = await sf('/rest/v1/chamado_pecas_pendentes?id=eq.' + id, { method: 'PATCH', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ status: 'enviada', atualizado_em: new Date().toISOString() }) });
  if (!r.ok) { alert('Erro ao atualizar.'); return; }
  carregarPecasPendentes();
}

// Marcar como Entregue: além de fechar a peça, retoma a CONTAGEM do SLA do
// chamado de origem (continua de onde parou, não reinicia) — mesma
// matemática de pausa/retomada de tecReceberPecas() no portal do técnico,
// só que disparada do lado do ERP. NÃO usa mais 'despachado' como destino
// (isso reiniciava o SLA do zero, comportamento legado errado) — usa
// 'peca_entregue', um estado intermediário próprio: o único lugar em que o
// chamado deve poder ir daqui é Encerrar ou Solicitar Peça de novo (isso é
// responsabilidade do botoeira do portal do técnico — tecRenderAcoes() em
// teffe-site — repo que não é tocado por este código; ver relatório).
// 'peca_entregue' no singular pra bater com o padrão de 'aguardando_peca' e
// com o tipo_evento 'peca_entregue' já usado no feed do sino (Tarefa 1).
// Só mexe no chamado se ele ainda estiver em aguardando_peca — se o técnico
// já tiver retomado por conta própria (self-service, botão "Já recebi" já
// existente no portal), não sobrescreve de novo.
async function erpPecaMarcarEntregue(id) {
  var p = _erpPPCache.find(function(x) { return x.id === id; });
  if (!p) return;

  var r = await sf('/rest/v1/chamado_pecas_pendentes?id=eq.' + id, { method: 'PATCH', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ status: 'entregue', atualizado_em: new Date().toISOString() }) });
  if (!r.ok) { alert('Erro ao atualizar.'); return; }

  var cr = await sf('/rest/v1/chamados?id=eq.' + p.chamado_id + '&select=id,numero,status_tecnico,sla_tempo_pausado,sla_pausa_inicio,created_at');
  var c = _arrOuVazio(cr)[0];
  if (c && c.status_tecnico === 'aguardando_peca') {
    var totalPausado = c.sla_tempo_pausado || 0;
    if (c.sla_pausa_inicio) totalPausado += Math.floor((Date.now() - new Date(c.sla_pausa_inicio).getTime()) / 60000);
    var upd = await sf('/rest/v1/chamados?id=eq.' + c.id, {
      method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ status_tecnico: 'peca_entregue', pecas_status: null, sla_pausado: false, sla_pausa_inicio: null, sla_tempo_pausado: totalPausado })
    });
    if (upd.ok) {
      registrarHistoricoStatus({ chamadoId: c.id, statusAnterior: 'aguardando_peca', statusNovo: 'peca_entregue', usuario: 'sistema' });
    }
  }

  // Evento pro feed do sino (Tarefa 1) — via código de app, não trigger de
  // banco: essa transição só acontece pela ação do próprio ERP (diferente
  // dos outros tipos de erp_eventos, que vêm de PATCH feito pelo teffe-site
  // e por isso dependem de trigger — ver migration 20260711000000).
  var pecaNome = p.pecas ? ((p.pecas.codigo ? '[' + p.pecas.codigo + '] ' : '') + p.pecas.descricao) : 'Peça';
  var numOs = (c && c.numero != null) ? c.numero : (p.chamado_id ? p.chamado_id.slice(0, 6) : '–');
  sf('/rest/v1/erp_eventos', {
    method: 'POST', headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ tipo_evento: 'peca_entregue', descricao: 'Peça entregue — O.S. ' + numOs + ' — ' + pecaNome, chamado_id: p.chamado_id })
  }).catch(function() {});

  carregarPecasPendentes();
}

async function carregarPedidosCompraPendentes() {
  var wrap = document.getElementById('pp-pedidos-wrap');
  if (!wrap) return;
  var r = await sf('/rest/v1/pedidos_compra?status=eq.pendente&select=*,pecas(codigo,descricao),fornecedores(nome)&order=criado_em.asc');
  var rows = _arrOuVazio(r);
  _erpPedidosCache = rows;
  if (!rows.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhum pedido de compra pendente.</div>'; return; }

  wrap.innerHTML = '<table class="erp-table"><thead><tr><th>Peça</th><th>Fornecedor</th><th>Qtd</th><th>Criado em</th><th>Ação</th></tr></thead><tbody>' +
    rows.map(function(p) {
      var pecaNome = p.pecas ? ((p.pecas.codigo ? '[' + p.pecas.codigo + '] ' : '') + p.pecas.descricao) : '–';
      var forn = p.fornecedores ? p.fornecedores.nome : '–';
      return '<tr>' +
        '<td>' + _esc(pecaNome) + '</td>' +
        '<td>' + _esc(forn) + '</td>' +
        '<td>' + p.quantidade + '</td>' +
        '<td>' + new Date(p.criado_em).toLocaleDateString('pt-BR') + '</td>' +
        '<td><button class="btn-secondary" style="font-size:11px;padding:3px 10px" onclick="erpPedidoMarcarRecebido(\'' + p.id + '\')">Marcar como Recebido</button></td>' +
        '</tr>';
    }).join('') + '</tbody></table>';
}

// Recebimento é TODO simples de propósito (ver comentário na migration):
// só marca o pedido como recebido e incrementa o estoque da peça — sem
// conferência, sem NF de entrada, sem encadear automaticamente pro Faturar
// da linha de origem. Uma vez o estoque de volta, a própria tela de Peças
// Pendentes volta a oferecer "Faturar" pra essa linha (a decisão Faturar/
// Comprar é sempre recalculada a partir do estoque_atual atual da peça).
async function erpPedidoMarcarRecebido(id) {
  var p = _erpPedidosCache.find(function(x) { return x.id === id; });
  if (!p) return;

  var pecaRes = await sf('/rest/v1/pecas?id=eq.' + p.peca_id + '&select=estoque_atual');
  var estoqueAtual = pecaRes.data && pecaRes.data[0] ? (pecaRes.data[0].estoque_atual || 0) : 0;
  var upd = await sf('/rest/v1/pecas?id=eq.' + p.peca_id, { method: 'PATCH', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ estoque_atual: estoqueAtual + p.quantidade }) });
  if (!upd.ok) { alert('Erro ao atualizar estoque.'); return; }

  var r = await sf('/rest/v1/pedidos_compra?id=eq.' + id, { method: 'PATCH', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ status: 'recebido' }) });
  if (!r.ok) { alert('Erro ao marcar pedido como recebido.'); return; }

  carregarPecasPendentes();
}

/* ── VINCULAR PEÇA (a partir do detalhe do chamado) ──
   O técnico só grava um pedido em texto livre (chamados.pecas_solicitadas)
   — aqui o ERP escolhe a peça de catálogo correspondente e cria a linha
   estruturada em chamado_pecas_pendentes. Catálogo filtrado por
   equipamento_pecas (mesmo vínculo peça↔modelo que o portal do técnico usa
   pra montar a lista de peças disponíveis). */
var _vpChamadoAtual = null;

async function erpAbrirVincularPeca(chamadoId) {
  var c = _erpChamData.find(function(x) { return x.id === chamadoId; });
  if (!c) return;
  _vpChamadoAtual = c;
  document.getElementById('vp-chamado-id').value = chamadoId;
  document.getElementById('vp-quantidade').value = 1;
  await _vpCarregarPecasSelect(c);
  document.getElementById('modal-vincular-peca').classList.add('open');
}

async function _vpCarregarPecasSelect(c) {
  var sel = document.getElementById('vp-peca');
  sel.innerHTML = '<option value="">Carregando...</option>';

  var modelo = null;
  if (c.equipamento_id) {
    var er = await sf('/rest/v1/equipamentos?id=eq.' + c.equipamento_id + '&select=modelo&limit=1');
    var eq = _arrOuVazio(er)[0];
    modelo = eq ? eq.modelo : null;
  }

  if (!modelo) {
    sel.innerHTML = '<option value="">Chamado sem equipamento/modelo vinculado</option>';
    return;
  }

  var lr = await sf('/rest/v1/equipamento_pecas?modelo=eq.' + encodeURIComponent(modelo) + '&select=peca_id');
  var pecaIds = [...new Set(_arrOuVazio(lr).map(function(l) { return l.peca_id; }).filter(Boolean))];
  if (!pecaIds.length) {
    sel.innerHTML = '<option value="">Nenhuma peça cadastrada para este modelo</option>';
    return;
  }

  var pr = await sf('/rest/v1/pecas?id=in.(' + pecaIds.join(',') + ')&select=id,codigo,descricao&order=descricao.asc');
  var pecas = _arrOuVazio(pr);
  sel.innerHTML = '<option value="">Selecione a peça...</option>' +
    pecas.map(function(p) { return '<option value="' + p.id + '">' + (p.codigo ? '[' + p.codigo + '] ' : '') + _esc(p.descricao) + '</option>'; }).join('');
}

async function erpVincularPecaSalvar() {
  var chamadoId = document.getElementById('vp-chamado-id').value;
  var pecaId = document.getElementById('vp-peca').value;
  var qtd = parseInt(document.getElementById('vp-quantidade').value);
  if (!pecaId) { alert('Selecione a peça.'); return; }
  if (!qtd || qtd < 1) { alert('Informe a quantidade (mínimo 1).'); return; }

  var r = await sf('/rest/v1/chamado_pecas_pendentes', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ chamado_id: chamadoId, peca_id: pecaId, quantidade: qtd, criado_por: _erpNome || null })
  });
  if (!r.ok) { alert('Erro ao vincular peça: ' + JSON.stringify(r.data)); return; }
  fecharModal('modal-vincular-peca');
  erpChamAbrirDetalhe(chamadoId);
  carregarPecasPendentes();
}
