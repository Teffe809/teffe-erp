/* ═══════════════════════════════════════════════════════
   TÉCNICOS
═══════════════════════════════════════════════════════ */

var _erpTecs = [];

async function erpTecCarregar() {
  const wrap = document.getElementById('tec-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';

  const { data, ok } = await sf('/rest/v1/tecnicos?select=*&order=nome.asc');
  _erpTecs = Array.isArray(data) ? data : [];
  erpTecAtualizarFiltro();

  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar técnicos.</div>'; return; }
  if (!data.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhum técnico cadastrado.</div>'; return; }

  // Carregar clientes para o dropdown de vínculo
  var clientes = [];
  try {
    var cliRes = await sf('/rest/v1/clientes?select=id,razao_social,fantasia,tecnico_responsavel_id&order=razao_social.asc');
    clientes = Array.isArray(cliRes.data) ? cliRes.data : [];
  } catch(e) { /* silencioso */ }

  // Mapa de clientes por técnico
  var tecCliMap = {};
  clientes.forEach(function(c) {
    if (c.tecnico_responsavel_id) {
      if (!tecCliMap[c.tecnico_responsavel_id]) tecCliMap[c.tecnico_responsavel_id] = [];
      tecCliMap[c.tecnico_responsavel_id].push(c);
    }
  });

  const rows = _erpTecs.map(function(t) {
    const cliCount = (tecCliMap[t.id] || []).length;
    const cliOpts = clientes.map(function(c) {
      return '<option value="' + c.id + '">' + _esc(c.razao_social || c.fantasia || c.id) + '</option>';
    }).join('');

    return '<tr>' +
      '<td><strong>' + _esc(t.nome) + '</strong>' + (t.matricula ? '<br><small style="color:#9CA3AF">Mat: ' + _esc(t.matricula) + '</small>' : '') + '</td>' +
      '<td>' + _esc(t.email) + '</td>' +
      '<td>' + _esc(t.telefone || '—') + '</td>' +
      '<td>' + cliCount + ' cliente(s)' +
        '<div id="tec-vinculos-' + t.id + '" style="font-size:11px;color:#6B7280;margin-top:2px">' +
          (tecCliMap[t.id] || []).slice(0, 2).map(function(c) { return _esc(c.razao_social || c.fantasia); }).join(', ') +
          (cliCount > 2 ? ' +' + (cliCount - 2) + ' mais' : '') +
        '</div>' +
      '</td>' +
      '<td onclick="event.stopPropagation()">' +
        '<div style="display:flex;align-items:center;gap:4px">' +
          '<select id="sel-tec-cli-' + t.id + '" style="font-size:12px;padding:3px 6px;max-width:180px" onchange="erpTecVincularCliente(\'' + t.id + '\',this)">' +
            '<option value="">Atribuir a cliente...</option>' + cliOpts +
          '</select>' +
        '</div>' +
      '</td>' +
      '<td>' +
        '<button class="btn-icon" style="color:#DC2626" title="Remover" onclick="erpTecDeletar(\'' + t.id + '\')"><i class="ti ti-trash"></i></button>' +
      '</td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table">' +
    '<thead><tr><th>Nome</th><th>E-mail</th><th>Telefone</th><th>Clientes Vinculados</th><th>Vincular Cliente</th><th></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

async function erpTecVincularCliente(tecId, selEl) {
  const clienteId = selEl.value;
  if (!clienteId) return;
  const { ok } = await sf('/rest/v1/clientes?id=eq.' + clienteId, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ tecnico_responsavel_id: tecId })
  });
  if (!ok) { alert('Erro ao vincular cliente.'); selEl.value = ''; return; }
  selEl.value = '';
  erpTecCarregar();
}

async function erpTecCriar() {
  const nome  = document.getElementById('tec-nome').value.trim();
  const email = document.getElementById('tec-email').value.trim();
  const tel   = document.getElementById('tec-tel').value.trim();
  const mat   = document.getElementById('tec-mat').value.trim();
  const senha = document.getElementById('tec-senha').value.trim();
  const erroEl = document.getElementById('tec-form-erro');
  const btn    = document.getElementById('tec-btn-criar');

  if (!nome || !email) { erroEl.style.display = 'block'; erroEl.textContent = 'Nome e e-mail são obrigatórios.'; return; }
  if (!senha) { erroEl.style.display = 'block'; erroEl.textContent = 'Defina uma senha temporária.'; return; }
  btn.disabled = true; btn.textContent = 'Criando...'; erroEl.style.display = 'none';

  // 1. Criar usuário no Auth (anon key — signUp público)
  var userId = null;
  try {
    const r = await fetch(SURL + '/auth/v1/signup', {
      method: 'POST',
      headers: { 'apikey': SKEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha, data: { nome, role: 'tecnico' } })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.msg || d.message || 'Erro no signUp');
    userId = d.user ? d.user.id : null;
  } catch(e) {
    erroEl.style.display = 'block'; erroEl.textContent = 'Erro ao criar login: ' + e.message;
    btn.disabled = false; btn.textContent = 'Criar Técnico'; return;
  }

  // 2. Inserir na tabela tecnicos com JWT do admin
  const { ok, data: errD } = await sf('/rest/v1/tecnicos', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ nome, email, telefone: tel || null, matricula: mat || null, user_id: userId })
  });
  btn.disabled = false; btn.textContent = 'Criar Técnico';
  if (!ok) {
    erroEl.style.display = 'block';
    erroEl.textContent = errD && errD.message ? errD.message : 'Erro ao cadastrar técnico.';
    return;
  }

  // 3. Inserir/atualizar profiles com role='tecnico'
  if (userId) {
    await sf('/rest/v1/profiles', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates', 'on_conflict': 'id' },
      body: JSON.stringify({ id: userId, nome, role: 'tecnico' })
    });
  }

  ['tec-nome','tec-email','tec-tel','tec-mat','tec-senha'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  registrarLog('tecnico_criado', { nome, email });
  erpTecCarregar();
}

async function erpTecDeletar(id) {
  if (!confirm('Remover técnico? Os chamados vinculados perderão o técnico atribuído.')) return;
  const { ok } = await sf('/rest/v1/tecnicos?id=eq.' + id, { method: 'DELETE' });
  if (!ok) { alert('Erro ao remover técnico.'); return; }
  registrarLog('tecnico_removido', { id });
  erpTecCarregar();
}

function erpTecAtualizarFiltro() {
  const sel = document.getElementById('cham-filtro-tec');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos os técnicos</option><option value="is_null">Sem técnico</option>' +
    _erpTecs.map(function(t) {
      return '<option value="' + t.id + '">' + _esc(t.nome) + '</option>';
    }).join('');
  if (cur) sel.value = cur;
}
