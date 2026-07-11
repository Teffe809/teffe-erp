/* ═══════════════════════════════════════════════════════
   SINO DE NOTIFICAÇÕES — feed de eventos (erp_eventos)
═══════════════════════════════════════════════════════ */

var _erpEventosCache = [];       // últimos eventos carregados (mais recente primeiro)
var _erpEventosVistosIds = {};   // { evento_id: true } já vistos pelo usuário atual, entre os carregados
var _erpEventosCanal = null;
var _erpEventosCarregados = false;

var _EVENTOS_ICONE = {
  chamado_novo:        { icone: 'ti-alert-circle',   cor: '#DC2626' },
  suprimento_novo:     { icone: 'ti-package',        cor: '#7C3AED' },
  tecnico_deslocamento:{ icone: 'ti-car',            cor: '#F59E0B' },
  tecnico_atendimento: { icone: 'ti-tool',           cor: '#2563EB' },
  peca_solicitada:     { icone: 'ti-package-import', cor: '#DC2626' },
  peca_entregue:       { icone: 'ti-truck-delivery', cor: '#059669' },
  chamado_encerrado:   { icone: 'ti-circle-check',   cor: '#16A34A' }
};

function _erpEventosTempoRelativo(iso) {
  var diffMs = Date.now() - new Date(iso).getTime();
  var min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return min + 'min';
  var h = Math.floor(min / 60);
  if (h < 24) return h + 'h';
  var d = Math.floor(h / 24);
  return d + 'd';
}

function _erpEventosAtualizarBadge() {
  var badge = document.getElementById('sino-badge');
  if (!badge) return;
  var naoVistos = _erpEventosCache.filter(function(e) { return !_erpEventosVistosIds[e.id]; }).length;
  if (naoVistos > 0) {
    badge.textContent = naoVistos > 99 ? '99+' : naoVistos;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

function _erpEventosRenderLista() {
  var wrap = document.getElementById('eventos-lista');
  if (!wrap) return;
  if (!_erpEventosCache.length) {
    wrap.innerHTML = '<div class="tbl-empty">Nenhum evento ainda.</div>';
    return;
  }
  wrap.innerHTML = _erpEventosCache.map(function(e) {
    var meta = _EVENTOS_ICONE[e.tipo_evento] || { icone: 'ti-bell', cor: '#9CA3AF' };
    var naoVisto = !_erpEventosVistosIds[e.id];
    var alvo = e.chamado_id ? 'chamado' : (e.solicitacao_id ? 'solicitacao' : '');
    var alvoId = e.chamado_id || e.solicitacao_id || '';
    return '<div class="evento-item' + (naoVisto ? ' evento-nao-visto' : '') + '" onclick="_erpEventosNavegar(\'' + alvo + '\',\'' + alvoId + '\')">' +
      '<span class="evento-icone" style="background:' + meta.cor + '22;color:' + meta.cor + '"><i class="ti ' + meta.icone + '"></i></span>' +
      '<span class="evento-corpo"><span class="evento-desc">' + _esc(e.descricao) + '</span>' +
      '<span class="evento-hora">' + _erpEventosTempoRelativo(e.criado_em) + '</span></span>' +
      '</div>';
  }).join('');
}

async function _erpEventosCarregar() {
  var r = await sf('/rest/v1/erp_eventos?select=*&order=criado_em.desc&limit=60');
  _erpEventosCache = _arrOuVazio(r);
  _erpEventosVistosIds = {};

  if (_erpEventosCache.length && _erpPerfil && _erpPerfil.id) {
    var ids = _erpEventosCache.map(function(e) { return e.id; });
    var vr = await sf('/rest/v1/erp_eventos_vistos?usuario_id=eq.' + _erpPerfil.id + '&evento_id=in.(' + ids.join(',') + ')&select=evento_id');
    _arrOuVazio(vr).forEach(function(v) { _erpEventosVistosIds[v.evento_id] = true; });
  }

  _erpEventosCarregados = true;
  _erpEventosAtualizarBadge();
  _erpEventosRenderLista();
}

// Marca como visto TODOS os eventos atualmente carregados que ainda não
// tinham sido vistos por este usuário — "visto" é por usuário (não global):
// cada admin tem sua própria contagem, não vistos por outro usuário.
async function _erpEventosMarcarTodosVistos() {
  if (!_erpPerfil || !_erpPerfil.id) return;
  var pendentes = _erpEventosCache.filter(function(e) { return !_erpEventosVistosIds[e.id]; });
  if (!pendentes.length) return;

  var body = pendentes.map(function(e) { return { evento_id: e.id, usuario_id: _erpPerfil.id }; });
  await sf('/rest/v1/erp_eventos_vistos', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(body)
  }).catch(function() {});

  pendentes.forEach(function(e) { _erpEventosVistosIds[e.id] = true; });
  _erpEventosAtualizarBadge();
  _erpEventosRenderLista();
}

async function erpEventosAbrir() {
  document.getElementById('erp-eventos-overlay').classList.add('open');
  document.getElementById('erp-eventos-painel').classList.add('open');
  if (!_erpEventosCarregados) await _erpEventosCarregar();
  await _erpEventosMarcarTodosVistos();
}

function erpEventosFechar() {
  document.getElementById('erp-eventos-overlay').classList.remove('open');
  document.getElementById('erp-eventos-painel').classList.remove('open');
}

// Clique num evento do feed leva direto pro chamado/solicitação relacionado.
// Chamado: reaproveita o cache _erpChamData + erpChamAbrirDetalhe (modal já
// existente) — insere o registro buscado direto no cache pra não depender
// da grid de chamados-admin já ter terminado de carregar (evita corrida).
// Solicitação de suprimento: não existe modal de detalhe hoje (a tela é uma
// grid com ações inline, ver suprimentos-admin.js) — só leva pra tela.
async function _erpEventosNavegar(alvo, id) {
  erpEventosFechar();
  if (alvo === 'chamado' && id) {
    erpShowView('chamados-admin');
    var r = await sf('/rest/v1/chamados?id=eq.' + id + '&select=*');
    var c = _arrOuVazio(r)[0];
    if (!c) { alert('Chamado não encontrado (pode ter sido removido).'); return; }
    var idx = _erpChamData.findIndex(function(x) { return x.id === c.id; });
    if (idx === -1) _erpChamData.push(c); else _erpChamData[idx] = c;
    erpChamAbrirDetalhe(c.id);
  } else if (alvo === 'solicitacao' && id) {
    erpShowView('solicitacoes-suprimento');
  }
}

// ── Realtime: novo evento chega enquanto o app está aberto ──
// Reaproveita a mesma infra do Bloco E (canal dedicado, subscribe direto —
// SELECT em erp_eventos é liberado pra role anon, mesmo motivo do comentário
// em _erpIniciarAlertaNovoChamado). Só atualiza badge/lista, sem toast:
// toast já existe pros eventos mais acionáveis (chamado/suprimento novo, via
// _erpTratarNovoChamado/_erpTratarNovaSolicitacaoSuprimento) — duplicar aqui
// pra toda transição de status_tecnico viraria spam.
function _erpEventosIniciarRealtime() {
  if (!_erpTok || _erpEventosCanal) return;
  _erpEventosCanal = _erpSb.channel('erp-realtime-eventos')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'erp_eventos' }, function(payload) {
      if (!payload || !payload.new) return;
      _erpEventosCache.unshift(payload.new);
      if (_erpEventosCache.length > 60) _erpEventosCache.length = 60;
      _erpEventosAtualizarBadge();
      if (document.getElementById('erp-eventos-painel').classList.contains('open')) {
        _erpEventosRenderLista();
      }
    })
    .subscribe();
}

function _erpEventosPararRealtime() {
  if (_erpEventosCanal) { _erpSb.removeChannel(_erpEventosCanal); _erpEventosCanal = null; }
  _erpEventosCache = [];
  _erpEventosVistosIds = {};
  _erpEventosCarregados = false;
}
