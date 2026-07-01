/* ═══════════════════════════════════════════════════════
   USUÁRIOS ERP — controle de acesso por usuário
═══════════════════════════════════════════════════════ */

var _ERP_PERM_MODULOS = ['estoque', 'comercial', 'financeiro', 'operacional', 'crm', 'clientes', 'admin'];
var _ERP_PERM_LABELS = { estoque: 'Estoque', comercial: 'Comercial', financeiro: 'Financeiro', operacional: 'Operacional', crm: 'CRM', clientes: 'Clientes', admin: 'Admin' };

async function erpUsuariosCarregar() {
  var wrap = document.getElementById('usu-erp-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';

  var { data, ok } = await sf('/rest/v1/profiles?role=eq.admin&select=id,nome,email,acesso_total,permissoes&order=nome.asc');
  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar usuários.</div>'; return; }
  if (!data.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhum usuário ERP cadastrado.</div>'; return; }

  var rows = data.map(function (u) {
    var permChips = u.acesso_total
      ? '<span class="badge badge-master">Master</span>'
      : (_ERP_PERM_MODULOS.filter(function (m) { return u.permissoes && u.permissoes[m]; })
          .map(function (m) { return '<span class="badge" style="background:#EBF4FF;color:#0A4B8D;margin:2px 3px 2px 0">' + _ERP_PERM_LABELS[m] + '</span>'; })
          .join('') || '<span style="color:#9CA3AF">Nenhuma</span>');

    return '<tr>' +
      '<td><strong>' + _esc(u.nome || '(sem nome)') + '</strong></td>' +
      '<td>' + _esc(u.email || '—') + '</td>' +
      '<td>' + (u.acesso_total ? '<span class="badge badge-master">Sim</span>' : '<span class="badge badge-inactive">Não</span>') + '</td>' +
      '<td>' + permChips + '</td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table"><thead><tr><th>Nome</th><th>E-mail</th><th>Acesso Total</th><th>Permissões</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function mueToggleAcessoTotal() {
  var checked = document.getElementById('mue-acesso-total').checked;
  document.getElementById('mue-permissoes-wrap').style.display = checked ? 'none' : 'block';
}

function abrirModalUsuarioErp() {
  ['mue-nome', 'mue-email', 'mue-senha'].forEach(function (id) { document.getElementById(id).value = ''; });
  document.getElementById('mue-acesso-total').checked = false;
  _ERP_PERM_MODULOS.forEach(function (m) { var el = document.getElementById('mue-perm-' + m); if (el) el.checked = false; });
  mueToggleAcessoTotal();
  document.getElementById('mue-erro').style.display = 'none';
  document.getElementById('modal-usuario-erp').classList.add('open');
}

async function salvarUsuarioErp() {
  var nome = document.getElementById('mue-nome').value.trim();
  var email = document.getElementById('mue-email').value.trim();
  var senha = document.getElementById('mue-senha').value.trim();
  var acessoTotal = document.getElementById('mue-acesso-total').checked;
  var erroEl = document.getElementById('mue-erro');
  var btn = document.getElementById('mue-btn-salvar');

  if (!nome || !email) { erroEl.style.display = 'block'; erroEl.textContent = 'Nome e e-mail são obrigatórios.'; return; }
  if (!senha || senha.length < 6) { erroEl.style.display = 'block'; erroEl.textContent = 'Senha temporária deve ter ao menos 6 caracteres.'; return; }

  var permissoes = {};
  if (!acessoTotal) {
    _ERP_PERM_MODULOS.forEach(function (m) {
      var el = document.getElementById('mue-perm-' + m);
      if (el && el.checked) permissoes[m] = true;
    });
  }

  btn.disabled = true; btn.textContent = 'Criando...'; erroEl.style.display = 'none';

  // 1. Criar usuário no Auth (anon key — signUp público)
  var userId = null;
  try {
    var r = await fetch(SURL + '/auth/v1/signup', {
      method: 'POST',
      headers: { 'apikey': SKEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: senha, data: { nome: nome, role: 'admin' } })
    });
    var d = await r.json();
    if (!r.ok) throw new Error(d.msg || d.message || 'Erro no signUp');
    userId = d.user ? d.user.id : null;
  } catch (e) {
    erroEl.style.display = 'block'; erroEl.textContent = 'Erro ao criar login: ' + e.message;
    btn.disabled = false; btn.textContent = 'Salvar'; return;
  }

  if (!userId) {
    erroEl.style.display = 'block'; erroEl.textContent = 'Não foi possível obter o ID do novo usuário.';
    btn.disabled = false; btn.textContent = 'Salvar'; return;
  }

  // 2. Inserir/atualizar profiles com role='admin' + permissões (JWT do admin logado)
  var { ok, data: errD } = await sf('/rest/v1/profiles', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates', 'on_conflict': 'id' },
    body: JSON.stringify({ id: userId, nome: paraMaiusculo(nome), email: email, role: 'admin', acesso_total: acessoTotal, permissoes: permissoes })
  });

  btn.disabled = false; btn.textContent = 'Salvar';
  if (!ok) {
    erroEl.style.display = 'block';
    erroEl.textContent = errD && errD.message ? errD.message : 'Erro ao cadastrar usuário.';
    return;
  }

  registrarLog('usuario_erp_criado', { nome: nome, email: email, acesso_total: acessoTotal });
  fecharModal('modal-usuario-erp');
  erpUsuariosCarregar();
}
