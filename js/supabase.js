const SURL = 'https://hlfjcpgrxiktgctozilk.supabase.co';
const SKEY = 'sb_publishable_-Iu8PbqhLeZAXSBcczr2mQ_lzlGr4_g';
const EDGE_EMAIL = SURL + '/functions/v1/enviar-email';

function capitalizarNome(nome) {
  if (!nome) return '';
  return nome.toLowerCase().split(' ').map(function(p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(' ');
}

function paraMaiusculo(texto) { return texto ? texto.toUpperCase() : texto; }

let _erpTok = null;
let _erpRefresh = null;
let _erpNome = '';
let _refreshando = false;
let _erpPerfil = null; // { id, nome, email, acesso_total, permissoes }
let _erpMsgAcesso = null;

var _ERP_VIEW_MODULO = {
  pecas: 'estoque', insumos: 'estoque', fornecedores: 'estoque', entradas: 'estoque', alertas: 'estoque', equipamentos: 'estoque',
  contratos: 'comercial',
  fechamentos: 'operacional',
  'fin-dashboard': 'financeiro', receber: 'financeiro', pagar: 'financeiro', boletos: 'financeiro', fluxo: 'financeiro',
  prospectos: 'crm',
  clientes: 'clientes',
  tecnicos: 'admin', 'chamados-admin': 'admin', logs: 'admin'
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

function _mostrarApp() {
  document.getElementById('erp-login').style.display = 'none';
  document.getElementById('erp-app').style.display = 'flex';
  document.getElementById('erp-user-nome').textContent = _erpNome;
  _erpAplicarPermissoes();
  erpShowView('dashboard');
  verificarAlertasAutomatico();
}

function erpShowView(view) {
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
  if (view === 'dashboard') carregarDashboard();
  else if (view === 'pecas') carregarPecas();
  else if (view === 'insumos') carregarInsumos();
  else if (view === 'tecnicos') erpTecCarregar();
  else if (view === 'chamados-admin') { erpTecAtualizarFiltro(); erpChamCarregar(); }
  else if (view === 'fornecedores') carregarFornecedores();
  else if (view === 'entradas') carregarEntradas();
  else if (view === 'alertas') carregarAlertas();
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
    _mostrarApp();
  }

  document.getElementById('l-senha').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') erpLogin();
  });
});
