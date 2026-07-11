const SURL = 'https://hlfjcpgrxiktgctozilk.supabase.co';
const SKEY = 'sb_publishable_-Iu8PbqhLeZAXSBcczr2mQ_lzlGr4_g';
const EDGE_EMAIL = SURL + '/functions/v1/enviar-email';

// Client oficial só para Realtime (alerta de novo chamado) — todo o resto do
// app continua no fetch cru via sf()/_sfRaw(), não migrar CRUD para cá.
// persistSession:false porque a sessão já é gerenciada manualmente (_erpTok
// + localStorage), evita o SDK criar sua própria sessão paralela.
const _erpSb = supabase.createClient(SURL, SKEY, { auth: { persistSession: false } });

function capitalizarNome(nome) {
  if (!nome) return '';
  return nome.toLowerCase().split(' ').map(function(p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(' ');
}

function paraMaiusculo(texto) { return texto ? texto.toUpperCase() : texto; }

// Extrai o array de uma resposta de sf(); se a query falhar (coluna/tabela
// inexistente, RLS etc.) o PostgREST devolve um objeto de erro (truthy) em vez
// de array — "res.data || []" não protege contra isso, e um .map()/.forEach()
// nesse objeto quebra silenciosamente. Usar em qualquer lugar que hoje faça
// "(res.data || [])" antes de iterar o resultado.
function _arrOuVazio(res) {
  return (res && res.ok && Array.isArray(res.data)) ? res.data : [];
}

// Histórico auditável de mudança de status (chamado_status_historico) —
// fire-and-forget: nunca bloqueia nem trava a ação principal se a gravação
// do histórico falhar. Use exatamente um de chamadoId/solicitacaoId.
function registrarHistoricoStatus(opts) {
  var body = {
    status_anterior: opts.statusAnterior || null,
    status_novo: opts.statusNovo,
    usuario: opts.usuario || _erpNome || null,
    chamado_id: opts.chamadoId || null,
    solicitacao_id: opts.solicitacaoId || null
  };
  sf('/rest/v1/chamado_status_historico', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify(body)
  }).catch(function() {});
}

// Busca e formata o histórico de um chamado ou solicitação como uma lista
// de linhas prontas pra exibir (mais antigo primeiro). Ex.: "Aberto em
// 01/07 09:00", "Faturado em 01/07 14:30 por master@teffe.com.br".
async function _erpBuscarHistoricoStatus(chamadoId, solicitacaoId) {
  var statusLabels = { aberto: 'Aberto', andamento: 'Em andamento', encerrado: 'Encerrado', concluido: 'Concluído', resolvido: 'Resolvido',
    despachado: 'Despachado', em_deslocamento: 'Em deslocamento', em_atendimento: 'Em atendimento', aguardando_peca: 'Aguardando peça', pendente: 'Pendente',
    faturado: 'Faturado', enviado: 'Enviado', cancelado: 'Cancelado' };
  var filtro = chamadoId ? 'chamado_id=eq.' + chamadoId : 'solicitacao_id=eq.' + solicitacaoId;
  var r = await sf('/rest/v1/chamado_status_historico?' + filtro + '&order=criado_em.asc&select=*');
  var linhas = _arrOuVazio(r);
  return linhas.map(function(h) {
    var label = statusLabels[h.status_novo] || h.status_novo;
    var dt = h.criado_em ? new Date(h.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    return label + ' em ' + dt + (h.usuario ? ' por ' + h.usuario : '');
  });
}

let _erpTok = null;
let _erpRefresh = null;
let _erpNome = '';
let _refreshando = false;
let _erpPerfil = null; // { id, nome, email, acesso_total, permissoes }
let _erpMsgAcesso = null;

// Status terminais de chamados (chamado encerrado, nesta ou naquela forma)
var ERP_STATUS_ENCERRADOS = ['encerrado', 'concluido', 'resolvido'];
// Status terminais de uma solicitação de suprimento (já resolvida de algum
// jeito) — fluxo real (Bloco F): aberto -> faturado -> enviado. "faturado"
// NÃO é terminal (ainda precisa ser despachado fisicamente); só "enviado"
// encerra o pedido. despachado/entregue nunca chegaram a ser usados em
// produção (sondagem confirmou 0 registros) — removidos daqui.
var ERP_STATUS_SUPRIMENTO_TERMINAL = ['enviado', 'encerrado', 'cancelado'];

var _ERP_VIEW_MODULO = {
  pecas: 'estoque', insumos: 'estoque', fornecedores: 'estoque', entradas: 'estoque', alertas: 'estoque', equipamentos: 'estoque', 'vinculo-modelo': 'estoque',
  contratos: 'comercial',
  fechamentos: 'operacional',
  'fin-dashboard': 'financeiro', receber: 'financeiro', pagar: 'financeiro', boletos: 'financeiro', fluxo: 'financeiro',
  prospectos: 'crm',
  clientes: 'clientes',
  tecnicos: 'admin', logs: 'admin',
  // Chamados agora é um módulo de permissão próprio (Bloco K), separado de
  // Admin — antes ficava junto com Técnicos/Logs, sem como conceder acesso
  // a um sem conceder o outro. Solicitações de Suprimento entrou junto por
  // ser operacionalmente a mesma coisa (chamado de suprimento).
  'chamados-admin': 'chamados', 'solicitacoes-suprimento': 'chamados'
  // 'usuarios-erp' não entra aqui de propósito: é restrita a acesso_total (master),
  // não à permissão genérica 'admin' — ver checagem dedicada em erpShowView().
};

function _erpTemPermissao(modulo) {
  if (!_erpPerfil) return false;
  if (_erpPerfil.acesso_total) return true;
  return !!(_erpPerfil.permissoes && _erpPerfil.permissoes[modulo]);
}

function _erpAplicarPermissoes() {
  var master = _erpPerfil && _erpPerfil.acesso_total;
  document.querySelectorAll('.sidebar-group').forEach(function (g) {
    var modulo = g.getAttribute('data-modulo');
    if (!modulo) return; // grupo sempre visível (Início)
    g.style.display = (master || _erpTemPermissao(modulo)) ? '' : 'none';
  });
  document.querySelectorAll('[data-master-only]').forEach(function (el) {
    el.style.display = master ? '' : 'none';
  });
}

async function sf(path, opts) {
  const res = await _sfRaw(path, opts);

  // JWT expirado: tenta refresh uma vez
  if (res.status === 401 || (res.data && res.data.message === 'JWT expired')) {
    const renovado = await _tentarRefresh();
    if (!renovado) { erpLogoutExpired(); return { data: null, ok: false, status: 401 }; }
    return _sfRaw(path, opts);
  }

  return res;
}

async function _sfRaw(path, opts) {
  const h = { 'apikey': SKEY, 'Content-Type': 'application/json' };
  if (_erpTok) h['Authorization'] = 'Bearer ' + _erpTok;
  const r = await fetch(SURL + path, { ...opts, headers: { ...h, ...(opts && opts.headers || {}) } });
  let data = null;
  try { data = await r.json(); } catch (e) {}
  return { data, ok: r.ok, status: r.status };
}

async function _tentarRefresh() {
  if (_refreshando) return false;
  if (!_erpRefresh) return false;
  _refreshando = true;
  try {
    const r = await fetch(SURL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'apikey': SKEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: _erpRefresh })
    });
    const d = await r.json();
    if (!r.ok || !d.access_token) return false;
    _erpTok = d.access_token;
    _erpRefresh = d.refresh_token || _erpRefresh;
    localStorage.setItem('erp_tok', _erpTok);
    localStorage.setItem('erp_refresh', _erpRefresh);
    return true;
  } catch (e) {
    return false;
  } finally {
    _refreshando = false;
  }
}

function erpLogoutExpired() {
  _erpPararAlertaNovoChamado();
  _erpTok = null; _erpRefresh = null; _erpNome = ''; _erpPerfil = null;
  localStorage.removeItem('erp_tok');
  localStorage.removeItem('erp_refresh');
  localStorage.removeItem('erp_nome');
  localStorage.removeItem('erp_perfil');
  document.getElementById('erp-app').style.display = 'none';
  document.getElementById('erp-login').style.display = 'flex';
  document.getElementById('l-email').value = '';
  document.getElementById('l-senha').value = '';
  document.getElementById('l-btn').textContent = 'Entrar →';
  document.getElementById('l-btn').disabled = false;
  _erpErro('Sessão expirada, faça login novamente.');
}

async function erpEnviarEmail(to, subject, html) {
  const r = await fetch(EDGE_EMAIL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _erpTok },
    body: JSON.stringify({ to, subject, html })
  });
  const body = await r.json().catch(function () { return {}; });
  if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + JSON.stringify(body));
}

async function erpLogin() {
  const btn = document.getElementById('l-btn');
  const email = document.getElementById('l-email').value.trim();
  const senha = document.getElementById('l-senha').value;

  document.getElementById('login-erro').style.display = 'none';
  if (!email || !senha) { _erpErro('Preencha e-mail e senha.'); return; }

  btn.textContent = 'Entrando...';
  btn.disabled = true;

  try {
    const authRes = await fetch(SURL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': SKEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha })
    });
    const authData = await authRes.json();
    if (!authRes.ok || !authData.access_token) {
      _erpErro('E-mail ou senha inválidos.');
      btn.textContent = 'Entrar →'; btn.disabled = false;
      return;
    }

    _erpTok = authData.access_token;
    _erpRefresh = authData.refresh_token || null;
    const uid = authData.user && authData.user.id;

    const profileRes = await _sfRaw('/rest/v1/profiles?id=eq.' + uid + '&select=role,nome,email,acesso_total,permissoes');
    const profile = Array.isArray(profileRes.data) ? profileRes.data[0] : null;

    if (!profile || profile.role !== 'admin') {
      _erpTok = null; _erpRefresh = null;
      _erpErro('Acesso negado. Apenas administradores podem acessar o ERP.');
      btn.textContent = 'Entrar →'; btn.disabled = false;
      return;
    }

    const emailReal = (authData.user && authData.user.email) || email;
    _erpNome = profile.nome || emailReal;
    _erpPerfil = {
      id: uid,
      nome: profile.nome || null,
      email: profile.email || emailReal,
      acesso_total: !!profile.acesso_total,
      permissoes: profile.permissoes || {}
    };

    // Autopreenche o e-mail em profiles caso ainda não tenha sido migrado (usuários antigos)
    if (!profile.email) {
      sf('/rest/v1/profiles?id=eq.' + uid, { method: 'PATCH', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ email: emailReal }) });
    }

    localStorage.setItem('erp_tok', _erpTok);
    localStorage.setItem('erp_refresh', _erpRefresh || '');
    localStorage.setItem('erp_nome', _erpNome);
    localStorage.setItem('erp_perfil', JSON.stringify(_erpPerfil));

    _mostrarApp();
  } catch (e) {
    _erpErro('Erro de conexão. Tente novamente.');
    btn.textContent = 'Entrar →'; btn.disabled = false;
  }
}

function erpLogout() {
  _erpPararAlertaNovoChamado();
  _erpTok = null; _erpRefresh = null; _erpNome = ''; _erpPerfil = null;
  localStorage.removeItem('erp_tok');
  localStorage.removeItem('erp_refresh');
  localStorage.removeItem('erp_nome');
  localStorage.removeItem('erp_perfil');
  document.getElementById('erp-app').style.display = 'none';
  document.getElementById('erp-login').style.display = 'flex';
  document.getElementById('l-email').value = '';
  document.getElementById('l-senha').value = '';
  document.getElementById('l-btn').textContent = 'Entrar →';
  document.getElementById('l-btn').disabled = false;
}

function _mostrarApp(viewInicial) {
  document.getElementById('erp-login').style.display = 'none';
  document.getElementById('erp-app').style.display = 'flex';
  document.getElementById('erp-user-nome').textContent = _erpNome;
  _erpAplicarPermissoes();
  erpShowView(viewInicial || 'dashboard');
  verificarAlertasAutomatico();
  _erpIniciarAlertaNovoChamado();
}

// ── ALERTA DE NOVO CHAMADO (Bloco E → Realtime) ──
// Antes era polling (setInterval 45s). Trocado para Supabase Realtime
// (postgres_changes) agora que chamados/solicitacoes_suprimento estão na
// publicação supabase_realtime. Mesma lógica de dedupe/toast — só a fonte
// do evento mudou.
var _erpAlertaVistos = {};
var _erpAlertaCanalChamados = null;
var _erpAlertaCanalSuprimento = null;
var _erpAlertaSuprimentoPendentes = {};
var _erpAlertaTipoLabel = { assistencia: 'Assistência', instalacao: 'Instalação', suprimento: 'Suprimento', preventiva: 'Preventiva', outro: 'Chamado' };

// Não chama _erpSb.realtime.setAuth(_erpTok): SELECT em chamados/
// solicitacoes_suprimento já é liberado pra role anon (mesma anon key usada
// em sf()), então o Realtime funciona só com a apikey do client. Testado e
// confirmado: setAuth() com um token inválido/expirado trava o canal num
// loop eterno de rejoin sem se recuperar sozinho — sem integração com o
// refresh de JWT do sf()/_tentarRefresh(), isso quebraria o alerta em
// silêncio numa sessão longa. Preferível não depender do token de sessão
// aqui.
function _erpIniciarAlertaNovoChamado() {
  if (!_erpTok) return;

  _erpAlertaCanalChamados = _erpSb.channel('erp-realtime-chamados')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chamados' }, function(payload) {
      _erpTratarNovoChamado(payload.new);
    })
    .subscribe();

  _erpAlertaCanalSuprimento = _erpSb.channel('erp-realtime-suprimento')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'solicitacoes_suprimento' }, function(payload) {
      _erpTratarNovaSolicitacaoSuprimento(payload.new);
    })
    .subscribe();
}

function _erpPararAlertaNovoChamado() {
  if (_erpAlertaCanalChamados) { _erpSb.removeChannel(_erpAlertaCanalChamados); _erpAlertaCanalChamados = null; }
  if (_erpAlertaCanalSuprimento) { _erpSb.removeChannel(_erpAlertaCanalSuprimento); _erpAlertaCanalSuprimento = null; }
  _erpAlertaVistos = {};
  _erpAlertaSuprimentoPendentes = {};
}

async function _erpNomeClientePorId(clienteId) {
  if (!clienteId) return 'Cliente';
  var cr = await sf('/rest/v1/clientes?id=eq.' + clienteId + '&select=razao_social,fantasia');
  var c = _arrOuVazio(cr)[0];
  return (c && (c.razao_social || c.fantasia)) || 'Cliente';
}

async function _erpTratarNovoChamado(c) {
  if (!c || _erpAlertaVistos[c.id]) return;
  _erpAlertaVistos[c.id] = true;
  var nome = await _erpNomeClientePorId(c.cliente_id);
  var tipo = _erpAlertaTipoLabel[c.tipo_chamado] || 'Chamado';
  _erpMostrarToast('Novo chamado aberto: O.S. ' + (c.numero != null ? c.numero : c.id.slice(0,6)) + ' — ' + tipo + ' — ' + nome, 'chamados-admin');
}

// Um pedido de suprimento pode gerar vários INSERTs com o mesmo numero
// (carrinho com vários itens) — agrupa por numero numa janela curta antes de
// notificar, senão vira um toast por item.
function _erpTratarNovaSolicitacaoSuprimento(s) {
  if (!s || _erpAlertaVistos[s.id]) return;
  _erpAlertaVistos[s.id] = true;

  var chave = s.numero != null ? ('n' + s.numero) : ('r' + s.id);
  if (_erpAlertaSuprimentoPendentes[chave]) return;
  _erpAlertaSuprimentoPendentes[chave] = true;

  setTimeout(async function() {
    delete _erpAlertaSuprimentoPendentes[chave];
    var nome = await _erpNomeClientePorId(s.cliente_id);
    _erpMostrarToast('Nova solicitação de suprimento: O.S. ' + (s.numero != null ? s.numero : s.id.slice(0,6)) + ' — ' + nome, 'solicitacoes-suprimento');
  }, 1500);
}

function _erpMostrarToast(texto, view) {
  var container = document.getElementById('erp-toast-container');
  if (!container) return;
  var el = document.createElement('div');
  el.style.cssText = 'background:#1A3F80;color:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.2);font-size:13px;cursor:pointer;animation:erpToastIn .25s ease-out;';
  el.textContent = texto;
  el.onclick = function() {
    if (view) erpShowView(view);
    el.remove();
  };
  container.appendChild(el);
  setTimeout(function() { if (el.parentNode) el.remove(); }, 9000);
}

function erpShowView(view) {
  // Hash inválido/adulterado (ex.: URL antiga de uma view removida) — cai pro
  // dashboard em vez de deixar o getElementById('view-' + view) explodir.
  if (!document.getElementById('view-' + view)) view = 'dashboard';

  if (view === 'usuarios-erp' && !(_erpPerfil && _erpPerfil.acesso_total)) {
    _erpMsgAcesso = 'Acesso não autorizado.';
    erpShowView('dashboard');
    return;
  }

  var modulo = _ERP_VIEW_MODULO[view];
  if (modulo && !_erpTemPermissao(modulo)) {
    _erpMsgAcesso = 'Acesso não autorizado.';
    erpShowView('dashboard');
    return;
  }

  document.querySelectorAll('.erp-view').forEach(function (el) { el.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function (el) { el.classList.remove('active'); });
  document.getElementById('view-' + view).classList.add('active');
  var navEl = document.getElementById('nav-' + view);
  if (navEl) navEl.classList.add('active');
  // Reflete a view atual na URL (hash) via replaceState — não usa
  // location.hash direto pra não empilhar uma entrada de histórico por
  // navegação nem disparar 'hashchange' (não há listener registrado hoje).
  // É isso que permite restaurar a view certa num F5 (ver DOMContentLoaded).
  history.replaceState(null, '', '#' + view);
  if (view === 'dashboard') carregarDashboard();
  else if (view === 'pecas') carregarPecas();
  else if (view === 'insumos') carregarInsumos();
  else if (view === 'tecnicos') erpTecCarregar();
  else if (view === 'chamados-admin') { erpTecAtualizarFiltro(); erpChamCarregar(); }
  else if (view === 'fornecedores') carregarFornecedores();
  else if (view === 'entradas') carregarEntradas();
  else if (view === 'alertas') carregarAlertas();
  else if (view === 'vinculo-modelo') carregarVinculoModelo();
  else if (view === 'contratos') carregarContratos();
  else if (view === 'fin-dashboard') carregarDashboardFin();
  else if (view === 'receber') carregarReceber();
  else if (view === 'pagar') carregarPagar();
  else if (view === 'fluxo') carregarFluxo();
  else if (view === 'prospectos') carregarProspectos();
  else if (view === 'clientes') carregarClientes();
  else if (view === 'equipamentos') carregarEquipamentos();
  else if (view === 'boletos') carregarBoletos();
  else if (view === 'logs') carregarLogs();
  else if (view === 'usuarios-erp') erpUsuariosCarregar();
  else if (view === 'fechamentos') carregarFechamentosView();
  else if (view === 'solicitacoes-suprimento') carregarSolicitacoesSuprimento();
}

function fecharModal(id) {
  document.getElementById(id).classList.remove('open');
}

function _erpErro(msg) {
  const el = document.getElementById('login-erro');
  el.textContent = msg;
  el.style.display = 'block';
}

async function registrarLog(acao, detalhes) {
  try {
    await sf('/rest/v1/logs_sistema', {
      method: 'POST',
      body: JSON.stringify({ usuario_email: _erpNome, acao, detalhes: detalhes || null }),
      headers: { 'Prefer': 'return=minimal' }
    });
  } catch(e) {}
}

async function _uploadArquivo(bucket, caminho, file) {
  try {
    const r = await fetch(SURL + '/storage/v1/object/' + bucket + '/' + caminho, {
      method: 'POST',
      headers: { 'apikey': SKEY, 'Authorization': 'Bearer ' + _erpTok, 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
      body: file
    });
    if (!r.ok) { console.error('[upload] falhou:', r.status, await r.text()); return null; }
    return SURL + '/storage/v1/object/public/' + bucket + '/' + caminho;
  } catch(e) { console.error('[upload] erro:', e); return null; }
}

document.addEventListener('DOMContentLoaded', function () {
  const tok = localStorage.getItem('erp_tok');
  const refresh = localStorage.getItem('erp_refresh');
  const nome = localStorage.getItem('erp_nome');
  const perfilRaw = localStorage.getItem('erp_perfil');
  if (tok) {
    _erpTok = tok;
    _erpRefresh = refresh || null;
    _erpNome = nome || '';
    if (perfilRaw) { try { _erpPerfil = JSON.parse(perfilRaw); } catch (e) { _erpPerfil = null; } }
    // F5/reload: restaura a view que estava na URL em vez de sempre cair no
    // Dashboard. Sem hash (acesso direto/primeiro login) mantém o padrão
    // antigo. erpShowView() já cuida do gate de permissão e de hash inválido.
    var viewDoHash = (location.hash || '').replace(/^#/, '');
    _mostrarApp(viewDoHash);
  }

  document.getElementById('l-senha').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') erpLogin();
  });
});
