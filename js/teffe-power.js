/* ═══════════════════════════════════════════════════════
   TEFFE POWER — Monitoramento de Impressoras
═══════════════════════════════════════════════════════ */
var _tpDadosClientes = [];

async function teffePowerCarregar() {
  var listaWrap = document.getElementById('tp-lista-clientes');
  if (!listaWrap) return;
  listaWrap.innerHTML = '<div class="tbl-loading">Carregando...</div>';

  var { data, ok } = await sf('/rest/v1/poder_equipamentos?select=*&ativo=eq.true&order=created_at.desc');
  if (!ok || !data) { listaWrap.innerHTML = '<div class="tbl-empty">Erro ao carregar equipamentos.</div>'; return; }
  if (!data.length) { listaWrap.innerHTML = '<div class="tbl-empty">Nenhum equipamento monitorado ainda.</div>'; return; }

  var clienteIds = [...new Set(data.map(function (e) { return e.cliente_id; }).filter(Boolean))];
  var clientesMap = {};
  if (clienteIds.length) {
    var respC = await sf('/rest/v1/clientes?id=in.(' + clienteIds.join(',') + ')&select=id,razao_social,codigo');
    if (respC.data) respC.data.forEach(function (c) { clientesMap[c.id] = c; });
  }

  var equipamentoIds = [...new Set(data.map(function (e) { return e.equipamento_id; }).filter(Boolean))];
  var equipamentosMap = {};
  if (equipamentoIds.length) {
    var respE = await sf('/rest/v1/equipamentos?id=in.(' + equipamentoIds.join(',') + ')&select=id,codigo_teffe,marca,modelo,serial,tipo_impressao');
    if (respE.data) respE.data.forEach(function (eq) { equipamentosMap[eq.id] = eq; });
  }

  var poderIds = data.map(function (e) { return e.id; });
  var leiturasMap = {};
  if (poderIds.length) {
    var respL = await sf('/rest/v1/poder_leituras?equipamento_id=in.(' + poderIds.join(',') + ')&select=*&order=data_hora.desc');
    if (respL.data) respL.data.forEach(function (l) { if (!leiturasMap[l.equipamento_id]) leiturasMap[l.equipamento_id] = l; });
  }

  _tpDadosClientes = data.map(function (e) {
    var eq = equipamentosMap[e.equipamento_id] || {};
    var cli = clientesMap[e.cliente_id] || {};
    return {
      poder_id: e.id,
      equipamento_id: e.equipamento_id,
      cliente_id: e.cliente_id,
      cliente_nome: cli.razao_social || '(cliente não encontrado)',
      cliente_codigo: cli.codigo || '',
      codigo_teffe: eq.codigo_teffe || '-',
      marca: eq.marca || '',
      modelo: eq.modelo || '',
      serial: eq.serial || '',
      tipo_impressao: eq.tipo_impressao || 'monocromatico',
      capacidade_toner: e.capacidade_toner || {},
      ultimaLeitura: leiturasMap[e.id] || null
    };
  });

  tpRenderListaClientes('');
}

function tpFiltrarClientes() {
  var termo = (document.getElementById('tp-busca-lista').value || '').trim().toUpperCase();
  tpRenderListaClientes(termo);
}

function tpRenderListaClientes(termo) {
  var wrap = document.getElementById('tp-lista-clientes');

  var porCliente = {};
  _tpDadosClientes.forEach(function (item) {
    if (!porCliente[item.cliente_id]) {
      porCliente[item.cliente_id] = { cliente_id: item.cliente_id, cliente_nome: item.cliente_nome, cliente_codigo: item.cliente_codigo, itens: [] };
    }
    porCliente[item.cliente_id].itens.push(item);
  });

  var clientesArr = Object.values(porCliente);

  if (termo) {
    clientesArr = clientesArr.filter(function (c) {
      var bateNome = c.cliente_nome.toUpperCase().indexOf(termo) !== -1;
      var bateCodigo = c.cliente_codigo && c.cliente_codigo.toUpperCase().indexOf(termo) !== -1;
      var bateEquip = termo.length >= 3 && c.itens.some(function (i) {
        return (i.codigo_teffe && i.codigo_teffe.toUpperCase().indexOf(termo) !== -1) ||
               (i.serial && i.serial.toUpperCase().indexOf(termo) !== -1);
      });
      return bateNome || bateCodigo || bateEquip;
    });
  }

  if (!clientesArr.length) { wrap.innerHTML = '<div class="tbl-empty">Nenhum cliente encontrado.</div>'; return; }

  wrap.innerHTML = clientesArr.map(function (c) {
    var okCount = 0, alertaCount = 0, erroCount = 0, semLeituraCount = 0;
    c.itens.forEach(function (i) {
      if (!i.ultimaLeitura) { semLeituraCount++; }
      else if (i.ultimaLeitura.status === 'ok') okCount++;
      else if (i.ultimaLeitura.status === 'alerta_toner') alertaCount++;
      else if (i.ultimaLeitura.status === 'erro') erroCount++;
    });

    var badges = '';
    if (okCount) badges += '<span class="badge" style="background:#DCFCE7;color:#15803D;margin-left:4px">' + okCount + ' ok</span>';
    if (alertaCount) badges += '<span class="badge" style="background:#FEF3C7;color:#B45309;margin-left:4px">' + alertaCount + ' alerta</span>';
    if (erroCount) badges += '<span class="badge" style="background:#FEE2E2;color:#B91C1C;margin-left:4px">' + erroCount + ' erro</span>';
    if (semLeituraCount) badges += '<span class="badge" style="background:#F3F4F6;color:#6B7280;margin-left:4px">' + semLeituraCount + ' sem leitura</span>';

    return '<div onclick="tpAbrirDashboardCliente(\'' + c.cliente_id + '\')" style="border:0.5px solid var(--border,#E5E7EB);border-radius:8px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;margin-bottom:8px">' +
      '<div><p style="font-weight:500;margin:0;font-size:14px">' + _esc(c.cliente_nome) + '</p>' +
      '<p style="color:#6B7280;margin:2px 0 0;font-size:12px">' + c.itens.length + ' equipamento(s) monitorado(s)</p></div>' +
      '<div>' + badges + '</div></div>';
  }).join('');
}

function tpVoltarListaClientes() {
  document.getElementById('tp-tela-dashboard').style.display = 'none';
  document.getElementById('tp-tela-lista').style.display = 'block';
}

function tpAbrirDashboardCliente(clienteId) {
  var itens = _tpDadosClientes.filter(function (i) { return i.cliente_id === clienteId; });
  if (!itens.length) return;

  document.getElementById('tp-tela-lista').style.display = 'none';
  document.getElementById('tp-tela-dashboard').style.display = 'block';
  document.getElementById('tp-dash-cliente-nome').textContent = itens[0].cliente_nome;

  var alertas = itens.filter(function (i) { return i.ultimaLeitura && i.ultimaLeitura.status !== 'ok'; }).length;
  var contadorTotalFrota = itens.reduce(function (acc, i) { return acc + (i.ultimaLeitura && i.ultimaLeitura.contador_total ? i.ultimaLeitura.contador_total : 0); }, 0);

  var tonerValores = [];
  itens.forEach(function (i) {
    if (i.ultimaLeitura && i.ultimaLeitura.niveis_toner) {
      Object.values(i.ultimaLeitura.niveis_toner).forEach(function (v) { if (v != null) tonerValores.push(v); });
    }
  });
  var tonerMedio = tonerValores.length ? Math.round(tonerValores.reduce(function (a, b) { return a + b; }, 0) / tonerValores.length) : null;

  document.getElementById('tp-dash-kpis').innerHTML =
    '<div style="background:#F9FAFB;border-radius:8px;padding:14px"><p style="font-size:12px;color:#6B7280;margin:0 0 6px">Equipamentos</p><p style="font-size:22px;font-weight:500;margin:0">' + itens.length + '</p></div>' +
    '<div style="background:#F9FAFB;border-radius:8px;padding:14px"><p style="font-size:12px;color:#6B7280;margin:0 0 6px">Alertas Ativos</p><p style="font-size:22px;font-weight:500;margin:0;color:' + (alertas ? '#B45309' : '#111827') + '">' + alertas + '</p></div>' +
    '<div style="background:#F9FAFB;border-radius:8px;padding:14px"><p style="font-size:12px;color:#6B7280;margin:0 0 6px">Contador Total da Frota</p><p style="font-size:22px;font-weight:500;margin:0">' + contadorTotalFrota.toLocaleString('pt-BR') + '</p></div>' +
    '<div style="background:#F9FAFB;border-radius:8px;padding:14px"><p style="font-size:12px;color:#6B7280;margin:0 0 6px">Toner Médio</p><p style="font-size:22px;font-weight:500;margin:0">' + (tonerMedio != null ? tonerMedio + '%' : '—') + '</p></div>';

  var rows = itens.map(function (i) {
    var l = i.ultimaLeitura;
    var statusBadge = '<span class="badge" style="background:#F3F4F6;color:#6B7280">Sem leitura</span>';
    var contadorHtml = '—';
    var tonerHtml = '—';
    var ultimaData = '—';

    if (l) {
      if (l.status === 'ok') {
        statusBadge = '<span class="badge" style="background:#DCFCE7;color:#15803D">Funcionando normalmente</span>';
      } else if (l.status === 'alerta_toner') {
        statusBadge = '<span onclick="tpAbrirLogErro(\'' + i.poder_id + '\')" class="badge" style="background:#FEF3C7;color:#B45309;cursor:pointer">' + _esc(l.mensagem_status || 'Nível de toner baixo') + '</span>';
      } else if (l.status === 'erro') {
        statusBadge = '<span onclick="tpAbrirLogErro(\'' + i.poder_id + '\')" class="badge" style="background:#FEE2E2;color:#B91C1C;cursor:pointer">' + _esc(l.mensagem_status || 'Erro detectado') + '</span>';
      }

      if (i.tipo_impressao === 'colorida' || i.tipo_impressao === 'colorido') {
        contadorHtml = 'Cor ' + (l.contador_cor != null ? l.contador_cor.toLocaleString('pt-BR') : '—') + '<br>PB ' + (l.contador_pb != null ? l.contador_pb.toLocaleString('pt-BR') : '—');
      } else {
        contadorHtml = l.contador_total != null ? l.contador_total.toLocaleString('pt-BR') : '—';
      }

      if (l.niveis_toner) {
        var t = l.niveis_toner;
        if (i.tipo_impressao === 'colorida' || i.tipo_impressao === 'colorido') {
          tonerHtml = 'C ' + (t.cyan != null ? t.cyan + '%' : '—') + ' M ' + (t.magenta != null ? t.magenta + '%' : '—') + '<br>Y ' + (t.yellow != null ? t.yellow + '%' : '—') + ' K ' + (t.black != null ? t.black + '%' : '—');
        } else {
          tonerHtml = 'PB ' + (t.black != null ? t.black + '%' : '—');
        }
      }
      ultimaData = new Date(l.data_hora).toLocaleString('pt-BR');
    }

    return '<tr>' +
      '<td><strong>' + _esc(i.codigo_teffe) + '</strong> ' + _esc(i.marca) + ' ' + _esc(i.modelo) + '<br><small style="color:#6B7280">S/N ' + _esc(i.serial || '-') + '</small></td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + contadorHtml + '</td>' +
      '<td>' + tonerHtml + '</td>' +
      '<td style="font-size:12px;color:#6B7280">' + ultimaData + '</td>' +
      '</tr>';
  }).join('');

  document.getElementById('tp-dash-tabela').innerHTML = '<table class="erp-table"><thead><tr><th>Equipamento</th><th>Status</th><th>Contador</th><th>Toner</th><th>Última Leitura</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

async function tpAbrirLogErro(poderId) {
  var body = document.getElementById('tp-log-erro-body');
  body.innerHTML = '<div class="tbl-loading">Carregando...</div>';
  document.getElementById('modal-tp-log-erro').classList.add('open');

  var { data, ok } = await sf('/rest/v1/poder_leituras?equipamento_id=eq.' + poderId + '&select=*&order=data_hora.desc&limit=20');
  if (!ok || !data || !data.length) { body.innerHTML = '<div class="tbl-empty">Nenhum histórico encontrado.</div>'; return; }

  body.innerHTML = data.map(function (l) {
    var cor = '#6B7280', bg = '#F3F4F6', icone = 'ti-info-circle', texto = 'Sem status';
    if (l.status === 'ok') { cor = '#15803D'; bg = '#DCFCE7'; icone = 'ti-check'; texto = 'Funcionando normalmente'; }
    else if (l.status === 'alerta_toner') { cor = '#B45309'; bg = '#FEF3C7'; icone = 'ti-droplet-half-2'; texto = l.mensagem_status || 'Nível de toner baixo'; }
    else if (l.status === 'erro') { cor = '#B91C1C'; bg = '#FEE2E2'; icone = 'ti-alert-triangle'; texto = l.mensagem_status || 'Erro detectado'; }

    return '<div style="display:flex;gap:10px;align-items:flex-start;background:' + bg + ';border-radius:8px;padding:10px 12px;margin-bottom:8px">' +
      '<i class="ti ' + icone + '" style="font-size:16px;color:' + cor + '"></i>' +
      '<div><p style="margin:0;font-size:13px;font-weight:500;color:' + cor + '">' + _esc(texto) + '</p>' +
      '<p style="margin:2px 0 0;font-size:12px;color:#6B7280">' + new Date(l.data_hora).toLocaleString('pt-BR') + '</p></div></div>';
  }).join('');
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
  if (!ok || !data || !data.length) { wrap.innerHTML = '<div style="color:#6B7280;font-size:13px">Nenhum cliente encontrado.</div>'; return; }
  wrap.innerHTML = data.map(function (c) {
    return '<div class="tp-resultado-item" style="padding:8px;border:0.5px solid #E5E7EB;border-radius:6px;margin-bottom:4px;cursor:pointer" onclick=\'tpSelecionarCliente(' + JSON.stringify(c) + ')\'>' + _esc(c.razao_social) + (c.codigo ? ' <small style="color:#6B7280">(' + _esc(c.codigo) + ')</small>' : '') + '</div>';
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
  if (!ok || !data || !data.length) { wrap.innerHTML = '<div style="color:#6B7280;font-size:13px">Nenhum equipamento instalado encontrado.</div>'; return; }
  wrap.innerHTML = data.map(function (e) {
    return '<div class="tp-resultado-item" style="padding:8px;border:0.5px solid #E5E7EB;border-radius:6px;margin-bottom:4px;cursor:pointer" onclick=\'tpSelecionarEquipamento(' + JSON.stringify(e) + ')\'><strong>' + _esc(e.codigo_teffe) + '</strong> - ' + _esc(e.marca) + ' ' + _esc(e.modelo) + ' <small style="color:#6B7280">S/N ' + _esc(e.serial || '-') + '</small></div>';
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

  var chkDup = await sf('/rest/v1/poder_equipamentos?equipamento_id=eq.' + _tpEquipamentoSelecionado.id + '&ativo=eq.true&select=id');
  if (chkDup.ok && chkDup.data && chkDup.data.length) {
    alert('Este equipamento ja esta vinculado ao Teffe Power. Nao e possivel vincular duas vezes.');
    return;
  }

  var btnSalvar = document.querySelector('#modal-tp-vincular .btn-primary[onclick="tpSalvarVinculo()"]');
  if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.textContent = 'Salvando...'; }

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
  if (!ok) {
    alert('Erro ao vincular equipamento: ' + JSON.stringify(data));
    if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.textContent = 'Salvar Vinculo'; }
    return;
  }

  alert('Equipamento vinculado com sucesso!');
  fecharModal('modal-tp-vincular');
  teffePowerCarregar();
}