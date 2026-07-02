/* ═══════════════════════════════════════════════════════
   SOLICITAÇÕES DE SUPRIMENTO — visão administrativa
   Cada pedido pode ter vários itens (mesmo "numero", uma linha por insumo —
   ver enviarSuprimento() em teffe-site); agrupamos por numero na exibição.
   Fluxo de status (Bloco F): aberto -> faturado -> enviado.
═══════════════════════════════════════════════════════ */

var _SUP_STATUS_LABEL = { aberto: 'Aberto', faturado: 'Faturado', enviado: 'Enviado', despachado: 'Despachado', entregue: 'Entregue', encerrado: 'Encerrado', cancelado: 'Cancelado' };
var _SUP_STATUS_COR = { aberto: '#FEF3C7;color:#92400E', faturado: '#DBEAFE;color:#1E40AF', enviado: '#DCFCE7;color:#166534', despachado: '#E0E7FF;color:#3730A3', entregue: '#DCFCE7;color:#166534', encerrado: '#F3F4F6;color:#6B7280', cancelado: '#FEE2E2;color:#991B1B' };

// Guarda os grupos da última renderização (por numero) pra achar os IDs das
// linhas ao clicar em Faturar/Marcar como Enviado — um pedido com N itens
// tem N linhas com o mesmo numero, e todas precisam mudar de status juntas.
var _supGruposAtuais = {};

async function carregarSolicitacoesSuprimento() {
  var wrap = document.getElementById('sup-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';

  var filtroStatus = (document.getElementById('fil-sup-status') || {}).value || '';
  var q = '/rest/v1/solicitacoes_suprimento?select=*&order=created_at.desc';
  if (filtroStatus) q += '&status=eq.' + encodeURIComponent(filtroStatus);

  try {
    var res = await sf(q);
    var linhas = _supDataOuErro(res, 'solicitacoes_suprimento');
    if (!linhas.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhuma solicitação de suprimento encontrada.</div>'; return; }

    // Agrupa por numero: um pedido com N itens vira N linhas na tabela,
    // todas com o mesmo numero (ver enviarSuprimento() em teffe-site).
    var grupos = [];
    var grupoPorChave = {};
    linhas.forEach(function (r) {
      var chave = r.numero != null ? ('n' + r.numero) : ('r' + r.id);
      if (!grupoPorChave[chave]) {
        var g = Object.assign({}, r, { _itens: [], _ids: [] });
        grupoPorChave[chave] = g;
        grupos.push(g);
      }
      grupoPorChave[chave]._itens.push({ insumo_id: r.insumo_id, quantidade: r.quantidade });
      grupoPorChave[chave]._ids.push(r.id);
    });
    _supGruposAtuais = grupoPorChave;

    var clienteIds = _supUniq(grupos.map(function (g) { return g.cliente_id; }));
    var equipIds = _supUniq(grupos.map(function (g) { return g.equipamento_id; }));
    var insumoIds = _supUniq(grupos.flatMap(function (g) { return g._itens.map(function (it) { return it.insumo_id; }); }));

    var [clientesRes, equipsRes, insumosRes] = await Promise.all([
      clienteIds.length ? sf('/rest/v1/clientes?id=in.(' + clienteIds.join(',') + ')&select=id,razao_social,fantasia,codigo') : Promise.resolve({ ok: true, data: [] }),
      equipIds.length ? sf('/rest/v1/equipamentos?id=in.(' + equipIds.join(',') + ')&select=id,marca,modelo,codigo_teffe') : Promise.resolve({ ok: true, data: [] }),
      insumoIds.length ? sf('/rest/v1/insumos?id=in.(' + insumoIds.join(',') + ')&select=id,nome,codigo') : Promise.resolve({ ok: true, data: [] })
    ]);

    var clienteMap = {}; (_supDataOuErro(clientesRes, 'clientes')).forEach(function (c) { clienteMap[c.id] = c; });
    var equipMap = {}; (_supDataOuErro(equipsRes, 'equipamentos')).forEach(function (e) { equipMap[e.id] = e; });
    var insumoMap = {}; (_supDataOuErro(insumosRes, 'insumos')).forEach(function (i) { insumoMap[i.id] = i; });

    var rows = grupos.map(function (g) {
      var cli = clienteMap[g.cliente_id];
      var cliNome = cli ? (cli.razao_social || cli.fantasia || '—') + (cli.codigo ? ' [' + cli.codigo + ']' : '') : '—';
      var eq = equipMap[g.equipamento_id];
      var eqNome = eq ? [eq.marca, eq.modelo].filter(Boolean).join(' ') + (eq.codigo_teffe ? ' (' + eq.codigo_teffe + ')' : '') : '—';
      var itensHtml = g._itens.map(function (it) {
        var i = insumoMap[it.insumo_id];
        var nome = i ? (i.codigo ? '[' + i.codigo + '] ' + i.nome : i.nome) : '—';
        return _esc(nome) + ' (Qtd: ' + it.quantidade + ')';
      }).join('<br>');
      var statusCor = _SUP_STATUS_COR[g.status] || '#F3F4F6;color:#6B7280';
      var statusLabel = _SUP_STATUS_LABEL[g.status] || g.status || '—';
      var chave = g.numero != null ? ('n' + g.numero) : ('r' + g.id);
      var acaoBtn = g.status === 'aberto'
        ? '<button class="adm-btn adm-btn-sm" onclick="supFaturar(\'' + chave + '\')">Faturar</button>'
        : g.status === 'faturado'
        ? '<button class="adm-btn adm-btn-sm adm-btn-outline" onclick="supMarcarEnviado(\'' + chave + '\')">Marcar como Enviado</button>'
        : '';

      return '<tr>' +
        '<td><strong>O.S. ' + (g.numero != null ? g.numero : g.id.slice(0, 6)) + '</strong>' + (g._itens.length > 1 ? '<br><small style="color:#9CA3AF">' + g._itens.length + ' itens</small>' : '') + '</td>' +
        '<td>' + _esc(cliNome) + '</td>' +
        '<td>' + _esc(eqNome) + '</td>' +
        '<td>' + itensHtml + '</td>' +
        '<td><span class="badge" style="background:' + statusCor + '">' + statusLabel + '</span></td>' +
        '<td>' + new Date(g.created_at).toLocaleDateString('pt-BR') + '</td>' +
        '<td>' + acaoBtn + '</td>' +
        '</tr>';
    }).join('');

    wrap.innerHTML = '<table class="erp-table">' +
      '<thead><tr><th>Nº</th><th>Cliente</th><th>Equipamento</th><th>Itens</th><th>Status</th><th>Data</th><th>Ação</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>';
  } catch (err) {
    console.error('[carregarSolicitacoesSuprimento]', err);
    wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar: ' + _esc(err.message) + '</div>';
  }
}

// Um pedido pode ter N linhas (uma por item) com o mesmo numero — todas
// precisam mudar de status juntas, e cada linha recebe sua própria entrada
// no histórico (mesma granularidade usada na criação, em enviarSuprimento()
// no teffe-site).
async function _supMudarStatus(chave, statusNovo) {
  var g = _supGruposAtuais[chave];
  if (!g) { alert('Solicitação não encontrada — atualize a tela.'); return; }
  var statusAnterior = g.status;
  for (var i = 0; i < g._ids.length; i++) {
    var id = g._ids[i];
    var r = await sf('/rest/v1/solicitacoes_suprimento?id=eq.' + id, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ status: statusNovo })
    });
    if (!r.ok) { alert('Erro ao atualizar solicitação.'); return; }
    registrarHistoricoStatus({ solicitacaoId: id, statusAnterior: statusAnterior, statusNovo: statusNovo });
  }
  carregarSolicitacoesSuprimento();
}

function supFaturar(chave) {
  _supMudarStatus(chave, 'faturado');
}

function supMarcarEnviado(chave) {
  _supMudarStatus(chave, 'enviado');
}

function _supDataOuErro(res, nomeConsulta) {
  if (res && res.ok && Array.isArray(res.data)) return res.data;
  var msg = (res && res.data && res.data.message) ? res.data.message : ('Falha ao consultar ' + nomeConsulta + '.');
  throw new Error(msg);
}

function _supUniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}
