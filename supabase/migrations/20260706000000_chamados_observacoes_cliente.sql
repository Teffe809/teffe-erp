-- Texto livre preenchido pelo cliente ao abrir o chamado (ex.: "portão dos
-- fundos", "perguntar por fulano na recepção") — visível ao técnico junto
-- com os demais dados do chamado, mas não é a descrição do defeito.
ALTER TABLE chamados ADD COLUMN IF NOT EXISTS observacoes_cliente text;

COMMENT ON COLUMN chamados.observacoes_cliente IS
  'Observações de acesso/local preenchidas pelo cliente ao abrir o chamado (ex.: portão dos fundos, perguntar por fulano na recepção). Diferente de descricao (o defeito relatado).';
