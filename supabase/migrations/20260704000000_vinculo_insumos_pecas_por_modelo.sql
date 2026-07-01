-- Vínculo de insumos/peças por MODELO de equipamento (texto), não mais por
-- equipamento_id individual — uma única associação passa a cobrir todas as
-- unidades daquele modelo. equipamento_insumos está vazia em produção
-- (confirmado antes desta migração), então a mudança é segura.
ALTER TABLE equipamento_insumos ALTER COLUMN equipamento_id DROP NOT NULL;
ALTER TABLE equipamento_insumos ADD COLUMN IF NOT EXISTS modelo text;

COMMENT ON COLUMN equipamento_insumos.modelo IS
  'Modelo do equipamento (texto, ex.: "BIZHUB C454E") — vínculo passou a ser por modelo, cobrindo todas as unidades. equipamento_id mantido só por compatibilidade retroativa, não é mais usado pela aplicação.';

-- Tabela de vínculo peça↔modelo, espelhando equipamento_insumos.
CREATE TABLE IF NOT EXISTS equipamento_pecas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo text NOT NULL,
  peca_id uuid NOT NULL REFERENCES pecas(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE equipamento_pecas IS
  'Peças de catálogo compatíveis com um modelo de equipamento (usado para filtrar a lista de peças no fluxo "Solicitar Peças" do portal do técnico).';
