/* ═══════════════════════════════════════════════════════
   CLIENTES
═══════════════════════════════════════════════════════ */

let _clienteAtualId = null;

async function carregarClientes() {
  const wrap = document.querySelector('#view-clientes .table-wrap');
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';
  const { data, ok } = await sf('/rest/v1/clientes?select=*&order=razao_social.asc');
  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar clientes.</div>'; return; }
  if (!data.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhum cliente cadastrado.</div>'; return; }

  // Técnicos para o dropdown — usa estado compartilhado ou carrega fresh
  var tecs = (typeof _erpTecs !== 'undefined' && _erpTecs.length) ? _erpTecs : [];
  if (!tecs.length) {
    try {
      const tr = await sf('/rest/v1/tecnicos?select=id,nome&order=nome.asc');
      tecs = Array.isArray(tr.data) ? tr.data : [];
    } catch(e) {}
  }
  const tecOpts = tecs.map(function(t) {
    return '<option value="' + t.id + '">' + _esc(t.nome) + '</option>';
  }).join('');

  const rows = data.map(function(c) {
    const badge = c.ativo
      ? '<span class="badge badge-ativo">Ativo</span>'
      : '<span class="badge badge-encerrado">Inativo</span>';
    const tecSel = '<select class="adm-sel-inline" onchange="cliAtribuirTecnico(\'' + c.id + '\',this)">' +
      '<option value="">Sem técnico</option>' + tecOpts + '</select>';
    return '<tr>' +
      '<td><strong style="font-family:monospace">' + _esc(c.codigo || '—') + '</strong></td>' +
      '<td><strong>' + _esc(c.razao_social) + '</strong></td>' +
      '<td>' + _esc(c.fantasia || '—') + '</td>' +
      '<td>' + _esc(c.cnpj || '—') + '</td>' +
      '<td>' + _esc(c.telefone || '—') + '</td>' +
      '<td>' + badge + '</td>' +
      '<td onclick="event.stopPropagation()">' +
        '<div style="display:flex;align-items:center;gap:4px">' +
          tecSel +
          '<span id="msg-tec-' + c.id + '" style="display:none;color:#16A34A;font-size:12px;font-weight:600">✓</span>' +
        '</div>' +
      '</td>' +
      '<td>' +
        '<button class="btn-icon" title="Usuários de Acesso" onclick="abrirModalUsuariosCliente(\'' + c.id + '\',\'' + _esc(c.razao_social).replace(/'/g,"&#39;") + '\')"><i class="ti ti-users" style="color:#3730A3"></i></button>' +
        '<button class="btn-icon" title="Editar" onclick=\'abrirModalCliente(' + JSON.stringify(c) + ')\'><i class="ti ti-pencil"></i></button>' +
        '<button class="btn-icon" title="Excluir" onclick="excluirCliente(\'' + c.id + '\')"><i class="ti ti-trash" style="color:#DC2626"></i></button>' +
      '</td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table">' +
    '<thead><tr><th>Código</th><th>Razão Social</th><th>Fantasia</th><th>CNPJ</th><th>Telefone</th><th>Status</th><th>Técnico Responsável</th><th></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';

  // Aplica seleção atual de cada cliente no dropdown
  data.forEach(function(c) {
    if (!c.tecnico_responsavel_id) return;
    var sel = document.querySelector('select[onchange*="' + c.id + '"]');
    if (sel) sel.value = c.tecnico_responsavel_id;
  });
}

async function cliAtribuirTecnico(clienteId, selEl) {
  const tecnicoId = selEl.value;
  const { ok } = await sf('/rest/v1/clientes?id=eq.' + clienteId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ tecnico_responsavel_id: tecnicoId || null })
  });
  if (!ok) { alert('Erro ao atribuir técnico.'); return; }
  const msg = document.getElementById('msg-tec-' + clienteId);
  if (msg) { msg.style.display = 'inline'; setTimeout(function() { msg.style.display = 'none'; }, 2000); }
}

async function abrirModalCliente(c) {
  document.getElementById('mcli-id').value = c ? c.id : '';
  document.getElementById('mcli-titulo').textContent = c ? 'Editar Cliente' : 'Novo Cliente';
  var codigoEl = document.getElementById('mcli-codigo');
  if (codigoEl) {
    codigoEl.value = c ? (c.codigo || '') : '';
    codigoEl.closest('.fg').style.display = c && c.codigo ? 'block' : 'none';
  }
  document.getElementById('mcli-razao').value = c ? (c.razao_social || '') : '';
  document.getElementById('mcli-fantasia').value = c ? (c.fantasia || '') : '';
  document.getElementById('mcli-cnpj').value = c ? (c.cnpj || '') : '';
  document.getElementById('mcli-ie').value = c ? (c.inscricao_estadual || '') : '';
  document.getElementById('mcli-im').value = c ? (c.inscricao_municipal || '') : '';
  document.getElementById('mcli-cep').value = c ? (c.cep || '') : '';
  document.getElementById('mcli-endereco').value = c ? (c.endereco || '') : '';
  document.getElementById('mcli-numero').value = c ? (c.numero || '') : '';
  document.getElementById('mcli-complemento').value = c ? (c.complemento || '') : '';
  document.getElementById('mcli-bairro').value = c ? (c.bairro || '') : '';
  document.getElementById('mcli-cidade').value = c ? (c.cidade || '') : '';
  document.getElementById('mcli-estado').value = c ? (c.estado || '') : '';
  document.getElementById('mcli-telefone').value = c ? (c.telefone || '') : '';
  document.getElementById('mcli-email').value = c ? (c.email || '') : '';
  document.getElementById('mcli-site').value = c ? (c.site || '') : '';
  document.getElementById('mcli-ativo').checked = c ? !!c.ativo : true;
  document.getElementById('modal-cliente').classList.add('open');
}

async function buscarCEP() {
  var cep = document.getElementById('mcli-cep').value.replace(/\D/g, '');
  if (cep.length !== 8) return;
  try {
    const r = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
    const d = await r.json();
    if (d.erro) { alert('CEP não encontrado.'); return; }
    document.getElementById('mcli-endereco').value = d.logradouro || '';
    document.getElementById('mcli-bairro').value = d.bairro || '';
    document.getElementById('mcli-cidade').value = d.localidade || '';
    document.getElementById('mcli-estado').value = d.uf || '';
    document.getElementById('mcli-numero').focus();
  } catch(e) { alert('Erro ao buscar CEP.'); }
}

async function salvarCliente() {
  const id = document.getElementById('mcli-id').value;
  const razao = document.getElementById('mcli-razao').value.trim();
  if (!razao) { alert('Informe a Razão Social.'); return; }

  const payload = {
    razao_social: razao,
    fantasia: document.getElementById('mcli-fantasia').value.trim() || null,
    cnpj: document.getElementById('mcli-cnpj').value.trim() || null,
    inscricao_estadual: document.getElementById('mcli-ie').value.trim() || null,
    inscricao_municipal: document.getElementById('mcli-im').value.trim() || null,
    cep: document.getElementById('mcli-cep').value.trim() || null,
    endereco: document.getElementById('mcli-endereco').value.trim() || null,
    numero: document.getElementById('mcli-numero').value.trim() || null,
    complemento: document.getElementById('mcli-complemento').value.trim() || null,
    bairro: document.getElementById('mcli-bairro').value.trim() || null,
    cidade: document.getElementById('mcli-cidade').value.trim() || null,
    estado: document.getElementById('mcli-estado').value.trim() || null,
    telefone: document.getElementById('mcli-telefone').value.trim() || null,
    email: document.getElementById('mcli-email').value.trim() || null,
    site: document.getElementById('mcli-site').value.trim() || null,
    ativo: document.getElementById('mcli-ativo').checked
  };

  let res;
  if (id) {
    res = await sf('/rest/v1/clientes?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(payload) });
  } else {
    res = await sf('/rest/v1/clientes', { method: 'POST', body: JSON.stringify(payload), headers: { 'Prefer': 'return=representation' } });
  }
  if (!res.ok) { alert('Erro ao salvar: ' + JSON.stringify(res.data)); return; }

  // Exibe código gerado automaticamente para novos clientes
  if (!id && Array.isArray(res.data) && res.data[0] && res.data[0].codigo) {
    const codigoEl = document.getElementById('mcli-codigo');
    if (codigoEl) {
      codigoEl.value = res.data[0].codigo;
      codigoEl.closest('.fg').style.display = 'block';
    }
  }

  registrarLog(id ? 'cliente_editado' : 'cliente_criado', { razao_social: razao, id: id || undefined });
  fecharModal('modal-cliente');
  carregarClientes();
}

async function excluirCliente(id) {
  if (!confirm('Excluir este cliente? Esta ação não pode ser desfeita.')) return;
  const res = await sf('/rest/v1/clientes?id=eq.' + id, { method: 'DELETE' });
  if (!res.ok) { alert('Erro ao excluir: ' + JSON.stringify(res.data)); return; }
  registrarLog('cliente_excluido', { id });
  carregarClientes();
}

/* ─── USUÁRIOS DO CLIENTE ─── */

async function abrirModalUsuariosCliente(clienteId, razaoSocial) {
  _clienteAtualId = clienteId;
  document.getElementById('muc-titulo').textContent = 'Usuários — ' + razaoSocial;
  document.getElementById('muc-nome').value = '';
  document.getElementById('muc-email').value = '';
  document.getElementById('modal-usuarios-cliente').classList.add('open');
  await carregarUsuariosCliente(clienteId);
}

async function carregarUsuariosCliente(clienteId) {
  const wrap = document.getElementById('muc-lista');
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';
  const { data, ok } = await sf('/rest/v1/cliente_usuarios?cliente_id=eq.' + clienteId + '&select=*&order=nome.asc');
  if (!ok || !data || !data.length) {
    wrap.innerHTML = '<div class="tbl-empty">Nenhum usuário cadastrado.</div>';
    return;
  }
  wrap.innerHTML = data.map(function(u) {
    const badge = u.ativo
      ? '<span class="badge badge-ativo">Ativo</span>'
      : '<span class="badge badge-encerrado">Inativo</span>';
    return '<div class="usuario-item">' +
      '<div><strong>' + _esc(u.nome) + '</strong><br><small style="color:#6B7280">' + _esc(u.email) + '</small></div>' +
      '<div style="display:flex;gap:6px;align-items:center">' + badge +
        '<button class="btn-secondary" style="padding:4px 10px;font-size:12px" onclick="resetarSenhaUsuario(\'' + _esc(u.email) + '\')"><i class="ti ti-key"></i> Reset senha</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function adicionarUsuarioCliente() {
  const nome = document.getElementById('muc-nome').value.trim();
  const email = document.getElementById('muc-email').value.trim();
  if (!nome || !email) { alert('Informe nome e e-mail.'); return; }

  // 1. Criar conta no Auth com senha temporária aleatória (anon key suficiente para signup)
  const senhaTemp = crypto.randomUUID();
  const signupRes = await fetch(SURL + '/auth/v1/signup', {
    method: 'POST',
    headers: { 'apikey': SKEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senhaTemp, data: { nome } })
  });
  const signupData = await signupRes.json().catch(function() { return {}; });

  // Aceita sucesso (201/200) ou "already registered" — usuário já existe, tudo bem
  const jaExistia = !signupRes.ok && (
    (signupData.error_description || '').toLowerCase().includes('already') ||
    (signupData.msg || '').toLowerCase().includes('already') ||
    signupRes.status === 422
  );
  if (!signupRes.ok && !jaExistia) {
    const msg = signupData.error_description || signupData.msg || signupData.message || JSON.stringify(signupData);
    alert('Erro ao criar conta do usuário: ' + msg);
    return;
  }

  // 2. Salvar em cliente_usuarios (insert ignora conflito de e-mail duplicado)
  const userId = signupData.user ? signupData.user.id : (signupData.id || null);
  const insertPayload = { cliente_id: _clienteAtualId, nome, email, ativo: true };
  if (userId) insertPayload.user_id = userId;

  const dbRes = await sf('/rest/v1/cliente_usuarios', {
    method: 'POST',
    body: JSON.stringify(insertPayload),
    headers: { 'Prefer': 'return=minimal' }
  });
  if (!dbRes.ok) {
    const dbMsg = dbRes.data && dbRes.data.message ? dbRes.data.message : JSON.stringify(dbRes.data);
    // Código 23505 = unique_violation (usuário já cadastrado para este cliente)
    if (!(dbMsg || '').includes('23505') && !(dbMsg || '').toLowerCase().includes('unique')) {
      alert('Erro ao cadastrar usuário: ' + dbMsg);
      return;
    }
  }

  // 3. Disparar e-mail de redefinição de senha (anon key aceita — o cliente cria a própria senha)
  await _enviarRecoverUsuario(email);

  document.getElementById('muc-nome').value = '';
  document.getElementById('muc-email').value = '';
  registrarLog('usuario_cliente_criado', { email, cliente_id: _clienteAtualId });
  await carregarUsuariosCliente(_clienteAtualId);
  alert('Usuário cadastrado! Um e-mail de definição de senha foi enviado para ' + email + '.');
}

async function _enviarRecoverUsuario(email) {
  try {
    const r = await fetch(SURL + '/auth/v1/recover', {
      method: 'POST',
      headers: { 'apikey': SKEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (!r.ok) console.warn('[recover] status:', r.status, await r.text());
  } catch(e) { console.warn('[recover] erro:', e); }
}

async function resetarSenhaUsuario(email) {
  if (!confirm('Enviar link de redefinição de senha para ' + email + '?')) return;
  try {
    const r = await fetch(SURL + '/auth/v1/recover', {
      method: 'POST',
      headers: { 'apikey': SKEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (r.ok) alert('Link de redefinição enviado para ' + email);
    else alert('Erro ao enviar link de redefinição.');
  } catch(e) { alert('Erro de conexão.'); }
}
