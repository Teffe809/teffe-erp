/* ═══════════════════════════════════════════════════════
   TEFFE POWER — Monitoramento de Impressoras
═══════════════════════════════════════════════════════ */
var _tpEquipamentos = [];

async function teffePowerCarregar() {
  var wrap = document.getElementById('tp-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';

  var { data, ok } = await sf('/rest/v1/poder_equipamentos?select=*&ativo=eq.true&order=created_at.desc');
  if (!ok || !data) { wrap.innerHTML = '<div class="tbl-empty">Erro ao carregar equipamentos.</div>'; return; }
  _tpEquipamentos = data;
  if (!data.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhum equipamento monitorado ainda. Cadastre um equipamento associado a um contrato para começar o monitoramento.</div>'; return; }

  var clienteIds = data.map(function (e) { return e.cliente_id; }).filter(Boolean);
  var clientesMap = {};
  if (clienteIds.length) {
    var idsUnicos = clienteIds.filter(function (v, i, a) { return a.indexOf(v) === i; });
    var resp = await sf('/rest/v1/clientes?id=in.(' + idsUnicos.join(',') + ')&select=id,nome');
    if (resp.data) resp.data.forEach(function (c) { clientesMap[c.id] = c.nome; });
  }

  var equipIds = data.map(function (e) { return e.id; });
  var leiturasMap = {};
  if (equipIds.length) {
    var respL = await sf('/rest/v1/poder_leituras?equipamento_id=in.(' + equipIds.join(',') + ')&select=*&order=data_hora.desc');
    if (respL.data) {
      respL.data.forEach(function (l) {
        if (!leiturasMap[l.equipamento_id]) leiturasMap[l.equipamento_id] = l;
      });
    }
  }

  var rows = data.map(function (e) {
    var ultimaLeitura = leiturasMap[e.id];
    var statusBadge = '<span class="badge" style="background:#F3F4F6;color:#6B7280">Sem leitura</span>';
    var contador = '—';
    var tonerInfo = '—';
    var ultimaData = '—';

    if (ultimaLeitura) {
      if (ultimaLeitura.status === 'ok') {
        statusBadge = '<span class="badge" style="background:#DCFCE7;color:#15803D">Funcionando normalmente</span>';
      } else if (ultimaLeitura.status === 'alerta_toner') {
        statusBadge = '<span class="badge" style="background:#FEF3C7;color:#B45309">Nível de toner baixo</span>';
      } else if (ultimaLeitura.status === 'erro') {
        statusBadge = '<span class="badge" style="background:#FEE2E2;color:#B91C1C">' + _esc(ultimaLeitura.mensagem_status || 'Erro detectado') + '</span>';
      }
      contador = ultimaLeitura.contador_total != null ? ultimaLeitura.contador_total.toLocaleString('pt-BR') : '—';
      if (ultimaLeitura.niveis_toner) {
        var t = ultimaLeitura.niveis_toner;
        if (e.tipo_impressao === 'colorida') {
          tonerInfo = 'C ' + (t.cyan != null ? t.cyan : '—') + '% M ' + (t.magenta != null ? t.magenta : '—') + '% Y ' + (t.yellow != null ? t.yellow : '—') + '% K ' + (t.black != null ? t.black : '—') + '%';
        } else {
          tonerInfo = 'PB ' + (t.black != null ? t.black : '—') + '%';
        }
      }
      ultimaData = new Date(ultimaLeitura.data_hora).toLocaleString('pt-BR');
    }

    return '<tr>' +
      '<td>' + _esc(clientesMap[e.cliente_id] || '(cliente não encontrado)') + '</td>' +
      '<td><strong>' + _esc(e.modelo) + '</strong><br><small style="color:#6B7280">S/N ' + _esc(e.numero_serie) + '</small></td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + contador + '</td>' +
      '<td>' + tonerInfo + '</td>' +
      '<td style="font-size:12px;color:#6B7280">' + ultimaData + '</td>' +
      '</tr>';
  }).join('');

  wrap.innerHTML = '<table class="erp-table"><thead><tr><th>Cliente</th><th>Equipamento</th><th>Status</th><th>Contador Total</th><th>Toner</th><th>Última Leitura</th></tr></thead><tbody>' + rows + '</tbody></table>';
}
var _tpClienteSelecionado = null;
var _tpEquipamentoSelecionado = null;

function tpAbrirModalVincular() {
  _tpClienteSelecionado = null;
  _tpEquipamentoSelecionado = null;
  document.getElementById('tp-busca-cliente').value = '';
  document.getElementById('tp-resultado-cliente').innerHTML = '';
  document.getElementById('tp-busca-equipamento').value = '';
  document.getElementById('tp-resultado-equipamento').innerHTML = '';
  document.getElementById('tp-wrap-contrato').style.display = 'none';
  document.getElementById('tp-wrap-equipamento').style.display = 'none';
  document.getElementById('tp-wrap-detalhes').style.display = 'none';
  document.getElementById('tp-ip-local').value = '';
  document.getElementById('tp-snmp-community').value = 'public';
  document.getElementById('modal-tp-vincular').classList.add('open');
}

async function tpBuscarCliente() {
  var termo = document.getElementById('tp-busca-cliente').value.trim();
  var wrap = document.getElementById('tp-resultado-cliente');
  if (termo.length < 3) { wrap.innerHTML = ''; return; }
  var enc = encodeURIComponent(termo);
  var { data, ok } = await sf('/rest/v1/clientes?or=(razao_social.ilike.*' + enc + '*,codigo.ilike.*' + enc + '*)&select=id,razao_social,codigo&limit=8');
  if (!ok || !data || !data.length) { wrap.innerHTML = '<div style="color:var(--text-secondary);font-size:13px">Nenhum cliente encontrado.</div>'; return; }
  wrap.innerHTML = data.map(function (c) {
    return '<div class="tp-resultado-item" style="padding:8px;border:0.5px solid var(--border);border-radius:6px;margin-bottom:4px;cursor:pointer" onclick=\'tpSelecionarCliente(' + JSON.stringify(c) + ')\'>' + _esc(c.razao_social) + (c.codigo ? ' <small style="color:var(--text-secondary)">(' + _esc(c.codigo) + ')</small>' : '') + '</div>';
  }).join('');
}

async function tpSelecionarCliente(c) {
  _tpClienteSelecionado = c;
  document.getElementById('tp-busca-cliente').value = c.razao_social;
  document.getElementById('tp-resultado-cliente').innerHTML = '';
  document.getElementById('tp-wrap-contrato').style.display = 'block';
  document.getElementById('tp-wrap-equipamento').style.display = 'block';

  var { data, ok } = await sf('/rest/v1/contratos?cliente_id=eq.' + c.id + '&select=id,numero,descricao&order=created_at.desc');
  var sel = document.getElementById('tp-select-contrato');
  if (!ok || !data || !data.length) {
    sel.innerHTML = '<option value="">Nenhum contrato encontrado</option>';
    return;
  }
  sel.innerHTML = data.map(function (ct) {
    return '<option value="' + ct.id + '">' + _esc(ct.numero || ct.id) + (ct.descricao ? ' - ' + _esc(ct.descricao) : '') + '</option>';
  }).join('');
}

async function tpBuscarEquipamento() {
  var termo = document.getElementById('tp-busca-equipamento').value.trim();
  var wrap = document.getElementById('tp-resultado-equipamento');
  if (termo.length < 3) { wrap.innerHTML = ''; return; }
  var enc = encodeURIComponent(termo);
  var { data, ok } = await sf('/rest/v1/equipamentos?status=eq.instalado&or=(codigo_teffe.ilike.*' + enc + '*,serial.ilike.*' + enc + '*,modelo.ilike.*' + enc + '*,marca.ilike.*' + enc + '*)&select=id,codigo_teffe,marca,modelo,serial,tipo_impressao&limit=8');
  if (!ok || !data || !data.length) { wrap.innerHTML = '<div style="color:var(--text-secondary);font-size:13px">Nenhum equipamento instalado encontrado.</div>'; return; }
  wrap.innerHTML = data.map(function (e) {
    return '<div class="tp-resultado-item" style="padding:8px;border:0.5px solid var(--border);border-radius:6px;margin-bottom:4px;cursor:pointer" onclick=\'tpSelecionarEquipamento(' + JSON.stringify(e) + ')\'><strong>' + _esc(e.codigo_teffe) + '</strong> - ' + _esc(e.marca) + ' ' + _esc(e.modelo) + ' <small style="color:var(--text-secondary)">S/N ' + _esc(e.serial || '-') + '</small></div>';
  }).join('');
}

function tpSelecionarEquipamento(e) {
  _tpEquipamentoSelecionado = e;
  document.getElementById('tp-busca-equipamento').value = e.codigo_teffe + ' - ' + e.marca + ' ' + e.modelo;
  document.getElementById('tp-resultado-equipamento').innerHTML = '';
  document.getElementById('tp-wrap-detalhes').style.display = 'block';

  var tonerWrap = document.getElementById('tp-wrap-toner');
  if (e.tipo_impressao === 'colorida' || e.tipo_impressao === 'colorido') {
    tonerWrap.innerHTML = '<label>Capacidade dos Toners (paginas)</label>' +
      '<div class="modal-grid-2">' +
      '<div class="fg"><label style="font-size:12px">Ciano</label><input type="number" id="tp-cap-cyan" placeholder="12000"/></div>' +
      '<div class="fg"><label style="font-size:12px">Magenta</label><input type="number" id="tp-cap-magenta" placeholder="12000"/></div>' +
      '<div class="fg"><label style="font-size:12px">Amarelo</label><input type="number" id="tp-cap-yellow" placeholder="12000"/></div>' +
      '<div class="fg"><label style="font-size:12px">Preto</label><input type="number" id="tp-cap-black" placeholder="26000"/></div>' +
      '</div>';
  } else {
    tonerWrap.innerHTML = '<label>Capacidade do Toner (paginas)</label>' +
      '<div class="fg"><input type="number" id="tp-cap-black" placeholder="26000"/></div>';
  }
}

async function tpSalvarVinculo() {
  if (!_tpClienteSelecionado) { alert('Selecione um cliente.'); return; }
  if (!_tpEquipamentoSelecionado) { alert('Selecione um equipamento.'); return; }
  var contratoId = document.getElementById('tp-select-contrato').value || null;
  var ip = document.getElementById('tp-ip-local').value.trim();
  var community = document.getElementById('tp-snmp-community').value.trim() || 'public';

  var capacidade = {};
  var capCyan = document.getElementById('tp-cap-cyan');
  if (capCyan) {
    capacidade = {
      cyan: parseInt(capCyan.value) || null,
      magenta: parseInt(document.getElementById('tp-cap-magenta').value) || null,
      yellow: parseInt(document.getElementById('tp-cap-yellow').value) || null,
      black: parseInt(document.getElementById('tp-cap-black').value) || null
    };
  } else {
    capacidade = { black: parseInt(document.getElementById('tp-cap-black').value) || null };
  }

  var payload = {
    equipamento_id: _tpEquipamentoSelecionado.id,
    cliente_id: _tpClienteSelecionado.id,
    contrato_id: contratoId,
    ip_local: ip || null,
    snmp_community: community,
    capacidade_toner: capacidade,
    status_pareamento: 'pendente',
    ativo: true
  };

  var { ok, data } = await sf('/rest/v1/poder_equipamentos', { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify(payload) });
  if (!ok) { alert('Erro ao vincular equipamento: ' + JSON.stringify(data)); return; }

  fecharModal('modal-tp-vincular');
  teffePowerCarregar();
}