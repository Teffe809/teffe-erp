/* ═══════════════════════════════════════════════════════
   USUÁRIOS ERP — controle de acesso por usuário
═══════════════════════════════════════════════════════ */

var _ERP_PERM_MODULOS = ['estoque', 'comercial', 'financeiro', 'operacional', 'crm', 'clientes', 'chamados', 'admin'];
var _ERP_PERM_LABELS = { estoque: 'Estoque', comercial: 'Comercial', financeiro: 'Financeiro', operacional: 'Operacional', crm: 'CRM', clientes: 'Clientes', chamados: 'Chamados', admin: 'Admin' };
var _erpUsuarios = [];

async function erpUsuariosCarregar() {
  var wrap = document.getElementById('usu-erp-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';

  var { data, ok } = await sf('/rest/v1/profiles?role=eq.admin&select=id,nome,email,acesso_total,permissoes&order=nome.asc');
  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar usuários.</div>'; return; }
  _erpUsuarios = data;
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
      '<td><button class="btn-icon" title="Editar" onclick=\'erpUsuarioAbrirEdicao(' + JSON.stringify(u) + ')\'><i class="ti ti-pencil"></i></button></td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table"><thead><tr><th>Nome</th><th>E-mail</th><th>Acesso Total</th><th>Permissões</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function mueToggleAcessoTotal() {
  var checked = document.getElementById('mue-acesso-total').checked;
  document.getElementById('mue-permissoes-wrap').style.display = checked ? 'none' : 'block';
}

function abrirModalUsuarioErp() {
  document.getElementById('mue-id').value = '';
  document.getElementById('mue-titulo').textContent = 'Novo Usuário ERP';
  document.getElementById('mue-senha-label').textContent = 'Senha Temporária *';
  document.getElementById('mue-senha').placeholder = 'Mínimo 6 caracteres';
  document.getElementById('mue-btn-salvar').textContent = 'Salvar';
  ['mue-nome', 'mue-email', 'mue-senha'].forEach(function (id) { document.getElementById(id).value = ''; });
  document.getElementById('mue-acesso-total').checked = false;
  _ERP_PERM_MODULOS.forEach(function (m) { var el = document.getElementById('mue-perm-' + m); if (el) el.checked = false; });
  mueToggleAcessoTotal();
  document.getElementById('mue-erro').style.display = 'none';
  document.getElementById('modal-usuario-erp').classList.add('open');
}

function erpUsuarioAbrirEdicao(u) {
  document.getElementById('mue-id').value = u.id;
  document.getElementById('mue-titulo').textContent = 'Editar Usuário ERP';
  document.getElementById('mue-senha-label').textContent = 'Nova Senha Temporária (opcional)';
  document.getElementById('mue-senha').placeholder = 'Deixe em branco para não alterar';
  document.getElementById('mue-btn-salvar').textContent = 'Salvar';
  document.getElementById('mue-nome').value = u.nome || '';
  document.getElementById('mue-email').value = u.email || '';
  document.getElementById('mue-senha').value = '';
  document.getElementById('mue-acesso-total').checked = !!u.acesso_total;
  _ERP_PERM_MODULOS.forEach(function (m) {
    var el = document.getElementById('mue-perm-' + m);
    if (el) el.checked = !!(u.permissoes && u.permissoes[m]);
  });
  mueToggleAcessoTotal();
  document.getElementById('mue-erro').style.display = 'none';
  document.getElementById('modal-usuario-erp').classList.add('open');
}

function salvarUsuarioErp() {
  var id = document.getElementById('mue-id').value;
  return id ? _atualizarUsuarioErp(id) : _criarUsuarioErp();
}

async function _criarUsuarioErp() {
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

async function _atualizarUsuarioErp(id) {
  var nome = document.getElementById('mue-nome').value.trim();
  var email = document.getElementById('mue-email').value.trim();
  var novaSenha = document.getElementById('mue-senha').value.trim();
  var acessoTotal = document.getElementById('mue-acesso-total').checked;
  var erroEl = document.getElementById('mue-erro');
  var btn = document.getElementById('mue-btn-salvar');

  if (!nome || !email) { erroEl.style.display = 'block'; erroEl.textContent = 'Nome e e-mail são obrigatórios.'; return; }
  if (novaSenha && novaSenha.length < 6) { erroEl.style.display = 'block'; erroEl.textContent = 'A nova senha deve ter ao menos 6 caracteres.'; return; }

  // Trava: impede remover o próprio acesso_total sem confirmação explícita
  var editandoAPropriaConta = _erpPerfil && _erpPerfil.id === id;
  if (editandoAPropriaConta && _erpPerfil.acesso_total && !acessoTotal) {
    var confirmou = confirm('Você está prestes a REMOVER o seu próprio Acesso Total (Master).\n\nSe não houver outro usuário master, ninguém mais poderá gerenciar usuários depois. Deseja continuar mesmo assim?');
    if (!confirmou) return;
  }

  var permissoes = {};
  if (!acessoTotal) {
    _ERP_PERM_MODULOS.forEach(function (m) {
      var el = document.getElementById('mue-perm-' + m);
      if (el && el.checked) permissoes[m] = true;
    });
  }

  btn.disabled = true; btn.textContent = 'Salvando...'; erroEl.style.display = 'none';

  var payload = { nome: paraMaiusculo(nome), email: email, acesso_total: acessoTotal, permissoes: permissoes };
  var { ok, data: errD } = await sf('/rest/v1/profiles?id=eq.' + id, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify(payload)
  });

  if (!ok) {
    btn.disabled = false; btn.textContent = 'Salvar';
    erroEl.style.display = 'block';
    erroEl.textContent = errD && errD.message ? errD.message : 'Erro ao atualizar usuário.';
    return;
  }

  registrarLog('usuario_erp_editado', { id: id, nome: nome, email: email, acesso_total: acessoTotal });

  // Se o usuário editou o próprio perfil, reflete no cabeçalho/estado local sem exigir novo login
  if (editandoAPropriaConta) {
    _erpPerfil.nome = payload.nome;
    _erpPerfil.email = payload.email;
    _erpPerfil.acesso_total = acessoTotal;
    _erpPerfil.permissoes = permissoes;
    _erpNome = _erpPerfil.nome || _erpPerfil.email;
    localStorage.setItem('erp_nome', _erpNome);
    localStorage.setItem('erp_perfil', JSON.stringify(_erpPerfil));
    document.getElementById('erp-user-nome').textContent = _erpNome;
    _erpAplicarPermissoes();
  }

  btn.disabled = false; btn.textContent = 'Salvar';
  fecharModal('modal-usuario-erp');
  erpUsuariosCarregar();

  if (novaSenha) {
    // Resetar a senha de outro usuário exige a Admin API do Supabase (service_role),
    // que nunca deve rodar no navegador — faríamos a chave secreta vazar no cliente.
    alert('Usuário atualizado com sucesso.\n\nATENÇÃO: não é possível alterar a senha de outro usuário pelo navegador — isso exige a chave secreta (service_role) do Supabase, que não pode ficar no front-end. Peça para o usuário usar "Esqueci minha senha" na tela de login, ou troque a senha manualmente em Supabase → Authentication → Users.');
  }
}
