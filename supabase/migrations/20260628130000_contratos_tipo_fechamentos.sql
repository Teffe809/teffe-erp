-- Tipo e campos de precificação nos contratos
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS tipo_contrato text DEFAULT 'manutencao'
  CHECK (tipo_contrato IN ('manutencao','locacao','avulso'));
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS valor_fixo numeric(10,2);
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS valor_pagina_pb numeric(10,4);
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS valor_pagina_color numeric(10,4);
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS franquia_paginas integer;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS valor_franquia numeric(10,2);
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS valor_excedente_pb numeric(10,4);
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS valor_excedente_color numeric(10,4);
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS rollover_ativo boolean DEFAULT false;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS contador_inicial_pb integer DEFAULT 0;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS contador_inicial_color integer DEFAULT 0;

-- Valor de serviço avulso em chamados
ALTER TABLE chamados ADD COLUMN IF NOT EXISTS valor_servico numeric(10,2);

-- Fechamentos mensais
CREATE TABLE IF NOT EXISTS fechamentos_mensais (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  contrato_id uuid REFERENCES contratos(id),
  equipamento_id uuid REFERENCES equipamentos(id),
  mes_referencia date NOT NULL,
  contador_pb_anterior integer DEFAULT 0,
  contador_pb_atual integer DEFAULT 0,
  contador_color_anterior integer DEFAULT 0,
  contador_color_atual integer DEFAULT 0,
  paginas_pb integer GENERATED ALWAYS AS (contador_pb_atual - contador_pb_anterior) STORED,
  paginas_color integer GENERATED ALWAYS AS (contador_color_atual - contador_color_anterior) STORED,
  franquia_usada integer DEFAULT 0,
  franquia_excedente integer DEFAULT 0,
  rollover_credito_usado integer DEFAULT 0,
  valor_fixo numeric(10,2) DEFAULT 0,
  valor_paginas numeric(10,2) DEFAULT 0,
  valor_excedente numeric(10,2) DEFAULT 0,
  valor_total numeric(10,2) DEFAULT 0,
  observacao text,
  boleto_gerado boolean DEFAULT false
);

-- Rollover de créditos de páginas
CREATE TABLE IF NOT EXISTS rollover_creditos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  contrato_id uuid REFERENCES contratos(id),
  mes_origem date NOT NULL,
  paginas_credito integer NOT NULL,
  paginas_usadas integer DEFAULT 0,
  validade date NOT NULL,
  expirado boolean DEFAULT false
);

ALTER TABLE fechamentos_mensais DISABLE ROW LEVEL SECURITY;
ALTER TABLE rollover_creditos DISABLE ROW LEVEL SECURITY;
