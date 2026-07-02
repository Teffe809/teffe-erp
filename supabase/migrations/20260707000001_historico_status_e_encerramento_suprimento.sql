-- C1: solicitacoes_suprimento não tem coluna de data de encerramento (só
-- chamados.data_encerramento existe) — confirmado via sondagem read-only
-- (HTTP 400 "coluna não existe" para data_encerramento/data_fechamento/
-- data_conclusao/concluido_em/encerrado_em). Adiciona a coluna.
ALTER TABLE solicitacoes_suprimento ADD COLUMN IF NOT EXISTS data_encerramento timestamptz;

-- C2: histórico auditável de mudança de status — tanto de chamados quanto
-- de solicitacoes_suprimento. Uma linha por transição, com quem mudou
-- (e-mail/nome do usuário do ERP, ou "cliente" quando a ação parte da área
-- do cliente) e quando.
CREATE TABLE IF NOT EXISTS chamado_status_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chamado_id uuid REFERENCES chamados(id) ON DELETE CASCADE,
  solicitacao_id uuid REFERENCES solicitacoes_suprimento(id) ON DELETE CASCADE,
  status_anterior text,
  status_novo text NOT NULL,
  usuario text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chamado_status_historico_um_dono CHECK (
    (chamado_id IS NOT NULL AND solicitacao_id IS NULL) OR
    (chamado_id IS NULL AND solicitacao_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_chamado_status_historico_chamado ON chamado_status_historico(chamado_id);
CREATE INDEX IF NOT EXISTS idx_chamado_status_historico_solicitacao ON chamado_status_historico(solicitacao_id);

-- Não habilitei RLS aqui de propósito: não tenho acesso de introspecção pra
-- confirmar se chamados/solicitacoes_suprimento usam RLS com policy aberta
-- ou simplesmente não têm RLS habilitado (ambos os cenários fariam a app,
-- que usa só a anon key, funcionar como já funciona hoje). Deixar esta
-- tabela sem RLS reproduz o comportamento "aberto" que a aplicação já
-- espera. Se este projeto usa RLS com policies restritas em outras
-- tabelas, ajuste aqui pra manter consistência.
