const SURL = 'https://hlfjcpgrxiktgctozilk.supabase.co';
const SKEY = 'sb_publishable_-Iu8PbqhLeZAXSBcczr2mQ_lzlGr4_g';
const EDGE_EMAIL = SURL + '/functions/v1/enviar-email';

let _erpTok = null;
let _erpNome = '';

async function sf(path, opts) {
  const h = { 'apikey': SKEY, 'Content-Type': 'application/json' };
  if (_erpTok) h['Authorization'] = 'Bearer ' + _erpTok;
  const r = await fetch(SURL + path, { ...opts, headers: { ...h, ...(opts && opts.headers || {}) } });
  let data = null;
  try { data = await r.json(); } catch (e) {}
  return { data, ok: r.ok, status: r.status };
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
  const erro = document.getElementById('login-erro');
  const email = document.getElementById('l-email').value.trim();
  const senha = document.getElementById('l-senha').value;

  erro.style.display = 'none';
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
    const uid = authData.user && authData.user.id;

    const profileRes = await sf('/rest/v1/profiles?id=eq.' + uid + '&select=role');
    const profile = Array.isArray(profileRes.data) ? profileRes.data[0] : null;

    if (!profile || profile.role !== 'admin') {
      _erpTok = null;
      _erpErro('Acesso negado. Apenas administradores podem acessar o ERP.');
      btn.textContent = 'Entrar →'; btn.disabled = false;
      return;
    }

    _erpNome = (authData.user && authData.user.email) || email;
    localStorage.setItem('erp_tok', _erpTok);
    localStorage.setItem('erp_nome', _erpNome);

    _mostrarApp();
  } catch (e) {
    _erpErro('Erro de conexão. Tente novamente.');
    btn.textContent = 'Entrar →'; btn.disabled = false;
  }
}

function erpLogout() {
  _erpTok = null;
  _erpNome = '';
  localStorage.removeItem('erp_tok');
  localStorage.removeItem('erp_nome');
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
  erpShowView('pecas');
  verificarAlertasAutomatico();
}

function erpShowView(view) {
  document.querySelectorAll('.erp-view').forEach(function (el) { el.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function (el) { el.classList.remove('active'); });
  document.getElementById('view-' + view).classList.add('active');
  document.getElementById('nav-' + view).classList.add('active');
  if (view === 'pecas') carregarPecas();
  else if (view === 'fornecedores') carregarFornecedores();
  else if (view === 'entradas') carregarEntradas();
  else if (view === 'alertas') carregarAlertas();
  else if (view === 'contratos') carregarContratos();
  else if (view === 'fin-dashboard') carregarDashboardFin();
  else if (view === 'receber') carregarReceber();
  else if (view === 'pagar') carregarPagar();
  else if (view === 'fluxo') carregarFluxo();
  else if (view === 'prospectos') carregarProspectos();
}

function fecharModal(id) {
  document.getElementById(id).classList.remove('open');
}

function _erpErro(msg) {
  const el = document.getElementById('login-erro');
  el.textContent = msg;
  el.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', function () {
  const tok = localStorage.getItem('erp_tok');
  const nome = localStorage.getItem('erp_nome');
  if (tok) {
    _erpTok = tok;
    _erpNome = nome || '';
    _mostrarApp();
  }

  document.getElementById('l-senha').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') erpLogin();
  });
});
