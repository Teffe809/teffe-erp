-- Causa raiz real da Tarefa 2 ("Erro ao atualizar status" ao solicitar
-- peça, persistindo mesmo com RLS desabilitado 2x em erp_eventos):
-- NÃO era RLS. Confirmado ao vivo via sondagem REST (mesma anon key do
-- app): um PATCH puro `{"status_tecnico":"em_deslocamento"}` funciona
-- (204); o mesmo tipo de PATCH com `"aguardando_peca"` falha com
--   {"code":"22P02","message":"invalid input syntax for type json",
--    "details":"Expected JSON value, but found \":\"."}
-- mesmo sem tocar em pecas_solicitadas no corpo do PATCH.
--
-- chamados.pecas_solicitadas é `jsonb`, não `text` (confirmado: chamados
-- novos trazem `[]`, chamados do fluxo antigo trazem uma string JSON como
-- "Unidade de fusão" — ambos jsonb, um array vazio, outro escalar string).
-- O trigger erp_registrar_evento_chamado (migration 20260711000000) fazia
-- `': ' || NEW.pecas_solicitadas` — concatenação text || jsonb. O Postgres
-- tenta resolver o operador tratando o literal ': ' como jsonb e falha ao
-- parsear (não é JSON válido) — daí o erro "Expected JSON value, but
-- found ':'". Isso quebra TODA transição pra status_tecnico='aguardando_peca'
-- (é o único branch do trigger que toca essa coluna), ou seja, quebra o
-- fluxo de "Solicitar Peça" inteiro desde que a migration foi aplicada —
-- exatamente o sintoma relatado, e nada a ver com RLS.
--
-- Fix: extrai o conteúdo de pecas_solicitadas corretamente conforme o tipo
-- jsonb real (array -> junta os itens com ", "; string escalar -> extrai
-- sem aspas; outro/vazio -> ignora), só then concatena como texto.
CREATE OR REPLACE FUNCTION erp_registrar_evento_chamado() RETURNS trigger AS $$
DECLARE
  cli_nome text;
  num text;
  tipo_label text;
  pecas_txt text;
BEGIN
  SELECT COALESCE(razao_social, fantasia, 'Cliente') INTO cli_nome FROM clientes WHERE id = NEW.cliente_id;
  cli_nome := COALESCE(cli_nome, 'Cliente');
  num := COALESCE(NEW.numero::text, left(NEW.id::text, 6));
  tipo_label := CASE NEW.tipo_chamado
    WHEN 'assistencia' THEN 'Assistência'
    WHEN 'instalacao' THEN 'Instalação'
    WHEN 'preventiva' THEN 'Preventiva'
    WHEN 'suprimento' THEN 'Suprimento'
    ELSE 'Chamado'
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO erp_eventos (tipo_evento, descricao, chamado_id)
    VALUES ('chamado_novo', 'Novo chamado aberto: O.S. ' || num || ' — ' || tipo_label || ' — ' || cli_nome, NEW.id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status_tecnico IS DISTINCT FROM OLD.status_tecnico THEN
    IF NEW.status_tecnico = 'em_deslocamento' THEN
      INSERT INTO erp_eventos (tipo_evento, descricao, chamado_id)
      VALUES ('tecnico_deslocamento', 'Técnico em deslocamento — O.S. ' || num || ' — ' || cli_nome, NEW.id);
    ELSIF NEW.status_tecnico = 'em_atendimento' THEN
      INSERT INTO erp_eventos (tipo_evento, descricao, chamado_id)
      VALUES ('tecnico_atendimento', 'Técnico iniciou atendimento — O.S. ' || num || ' — ' || cli_nome, NEW.id);
    ELSIF NEW.status_tecnico = 'aguardando_peca' THEN
      pecas_txt := NULL;
      IF NEW.pecas_solicitadas IS NOT NULL THEN
        IF jsonb_typeof(NEW.pecas_solicitadas) = 'array' THEN
          SELECT string_agg(elem, ', ') INTO pecas_txt FROM jsonb_array_elements_text(NEW.pecas_solicitadas) AS elem;
        ELSIF jsonb_typeof(NEW.pecas_solicitadas) = 'string' THEN
          pecas_txt := NEW.pecas_solicitadas #>> '{}';
        END IF;
      END IF;
      INSERT INTO erp_eventos (tipo_evento, descricao, chamado_id)
      VALUES ('peca_solicitada', 'Peça solicitada — O.S. ' || num || ' — ' || cli_nome || COALESCE(': ' || NULLIF(pecas_txt, ''), ''), NEW.id);
    ELSIF NEW.status_tecnico = 'encerrado' THEN
      INSERT INTO erp_eventos (tipo_evento, descricao, chamado_id)
      VALUES ('chamado_encerrado', 'Chamado encerrado — O.S. ' || num || ' — ' || cli_nome, NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Confirmar RLS também em chamado_pecas_pendentes/pedidos_compra/
-- estoque_saidas, como pedido: TAMBÉM estava habilitado nas três, sem
-- policy (sondagem real via REST: INSERT em cada uma retornou 42501 "new
-- row violates row-level security policy"). Isso não causa o "Erro ao
-- atualizar status" em si (esse erro vem só do PATCH em chamados, que
-- acontece antes no fluxo), mas fazia as peças vinculadas nunca serem
-- gravadas de verdade — silenciosamente, porque tecConfirmarPeca não
-- confere o resultado desses INSERTs. Mesmo fix de sempre: sem RLS, igual
-- a toda outra tabela do projeto.
ALTER TABLE chamado_pecas_pendentes DISABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_compra DISABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_saidas DISABLE ROW LEVEL SECURITY;
