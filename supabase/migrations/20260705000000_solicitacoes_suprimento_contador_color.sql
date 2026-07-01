-- Achado ao investigar o formulário de suprimento do cliente (repo teffe-site):
-- o código já enviava contador_pb e contador_color no INSERT, mas essas
-- colunas nunca existiram — só contador_atual (PB). Como o PostgREST rejeita
-- a linha inteira quando qualquer coluna do payload não existe, toda
-- submissão de suprimento para equipamento colorido vinha falhando
-- silenciosamente (e o próprio validarContador() também consultava
-- contador_pb, inexistente). Corrigido no código para usar contador_atual;
-- esta migration cria a coluna que faltava para o contador colorido.
ALTER TABLE solicitacoes_suprimento ADD COLUMN IF NOT EXISTS contador_color_atual integer;

COMMENT ON COLUMN solicitacoes_suprimento.contador_color_atual IS
  'Leitura do contador colorido no momento da solicitação (equipamentos coloridos). contador_atual guarda a leitura PB.';
