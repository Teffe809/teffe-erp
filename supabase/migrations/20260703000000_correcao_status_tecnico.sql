-- Correção da migration 20260702000000_chamados_atendimento_deslocamento.sql.
--
-- Investigação encontrou o portal do técnico real (repo teffe-site) já
-- gravando em_deslocamento/em_atendimento na coluna status_tecnico (que já
-- existia, vazia, na tabela chamados) — não na coluna status. O comentário
-- adicionado na migration anterior sugeria erroneamente que "status" também
-- aceitaria esses valores.
COMMENT ON COLUMN chamados.status IS
  'Status geral do chamado: aberto, andamento, encerrado, concluido, resolvido. Para o andamento operacional do técnico (deslocamento/atendimento/aguardando peça/pendente), ver a coluna status_tecnico.';

COMMENT ON COLUMN chamados.status_tecnico IS
  'Status operacional do técnico, já gravado pelo portal (repo teffe-site): null ou despachado (ainda não iniciou deslocamento), em_deslocamento, em_atendimento, aguardando_peca, pendente, encerrado.';

-- data_atendimento foi adicionada por engano: a coluna real usada pelo portal
-- do técnico para esse marco é data_atendimento_inicio, que já existia.
ALTER TABLE chamados DROP COLUMN IF EXISTS data_atendimento;
