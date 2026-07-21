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