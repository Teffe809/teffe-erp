-- Tarefa 2: fluxo de peça vinculado ao estoque (Faturar vs Comprar).
--
-- CONTEXTO (sondagem antes de implementar): o portal do técnico (teffe-site,
-- não alterado aqui) só grava, ao solicitar peça, um campo de TEXTO LIVRE
-- (chamados.pecas_solicitadas) + chamados.pecas_status/status_tecnico —
-- nunca um peca_id estruturado. `chamado_pecas` já existe mas é outra
-- coisa: registra peças EFETIVAMENTE USADAS, gravada só no encerramento do
-- chamado (tecConfirmarEncerramento em teffe-site), sem coluna de status.
-- `estoque_saidas` mencionada na tarefa NÃO existe hoje (sondagem: nenhuma
-- referência em nenhum dos dois repos) — criada aqui do zero, simétrica a
-- entradas_estoque que já existe.
--
-- Por isso o fluxo pedido (peça vinculada a peca_id de catálogo, com status
-- granular solicitado→faturado→nf_emitida→enviada→entregue) precisa de uma
-- tabela nova: o ERP cria essas linhas manualmente (tela "Peças Pendentes" /
-- botão "Vincular Peça" no detalhe do chamado), lendo o pedido em texto
-- livre que o técnico escreveu. chamados.pecas_status/pecas_solicitadas são
-- mantidos intactos como estão (só o teffe-site escreve neles).
CREATE TABLE IF NOT EXISTS chamado_pecas_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chamado_id uuid NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
  peca_id uuid NOT NULL REFERENCES pecas(id),
  quantidade integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'solicitado', -- solicitado -> faturado -> nf_emitida -> enviada -> entregue
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  criado_por text
);

CREATE INDEX IF NOT EXISTS idx_cham_pecas_pend_chamado ON chamado_pecas_pendentes(chamado_id);
CREATE INDEX IF NOT EXISTS idx_cham_pecas_pend_status ON chamado_pecas_pendentes(status);

CREATE TABLE IF NOT EXISTS pedidos_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  peca_id uuid NOT NULL REFERENCES pecas(id),
  fornecedor_id uuid REFERENCES fornecedores(id),
  quantidade integer NOT NULL,
  status text NOT NULL DEFAULT 'pendente', -- pendente -> recebido
  chamado_id uuid REFERENCES chamados(id) ON DELETE SET NULL,
  chamado_peca_pendente_id uuid REFERENCES chamado_pecas_pendentes(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por text
);

CREATE INDEX IF NOT EXISTS idx_pedidos_compra_status ON pedidos_compra(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_peca ON pedidos_compra(peca_id);

COMMENT ON COLUMN pedidos_compra.status IS
  'pendente|recebido. Recebimento é TODO simples por enquanto (só incrementa estoque_atual da peça) — sem fluxo completo de conferência/NF de entrada.';

-- Saída de estoque, simétrica a entradas_estoque — registrada quando uma
-- peça é "Faturada" pra um chamado (decrementa pecas.estoque_atual).
CREATE TABLE IF NOT EXISTS estoque_saidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  peca_id uuid NOT NULL REFERENCES pecas(id),
  quantidade integer NOT NULL,
  chamado_id uuid REFERENCES chamados(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por text
);

CREATE INDEX IF NOT EXISTS idx_estoque_saidas_peca ON estoque_saidas(peca_id);

-- Sem RLS/GRANT explícitos — mesmo padrão do resto do projeto (ver
-- migration 20260707000001 e 20260711000000_erp_eventos_feed).
