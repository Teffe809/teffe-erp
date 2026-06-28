-- Observações internas dos chamados (uso interno técnico/admin, nunca exibir ao cliente)
ALTER TABLE chamados ADD COLUMN IF NOT EXISTS observacoes_internas text;
