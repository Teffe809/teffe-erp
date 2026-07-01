-- Suporte ao fluxo estendido de status de chamados (dashboard analítico de chamados).
-- status continua sendo texto livre (sem CHECK constraint) para não quebrar nenhum
-- sistema externo (ex.: portal do técnico) que já escreva nessa coluna. Os valores
-- esperados a partir de agora: aberto, em_deslocamento, em_atendimento, andamento
-- (legado), encerrado, concluido, resolvido.
COMMENT ON COLUMN chamados.status IS
  'Valores esperados: aberto, em_deslocamento, em_atendimento, andamento (legado), encerrado, concluido, resolvido.';

-- Corrige referência a coluna inexistente já usada em js/chamados-admin.js
-- (c.data_atendimento) e necessária para o novo fluxo em_atendimento.
ALTER TABLE chamados ADD COLUMN IF NOT EXISTS data_atendimento timestamptz;
