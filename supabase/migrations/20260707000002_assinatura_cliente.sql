-- Bloco D: assinatura digital do cliente no encerramento do chamado (coletada
-- no modal de encerramento do técnico via signature_pad, exportada como PNG
-- em base64). "text" (não varchar) porque um PNG em base64 de uma assinatura
-- simples costuma passar de alguns KB.
ALTER TABLE chamados ADD COLUMN IF NOT EXISTS nome_assinatura text;
ALTER TABLE chamados ADD COLUMN IF NOT EXISTS assinatura_cliente text;
