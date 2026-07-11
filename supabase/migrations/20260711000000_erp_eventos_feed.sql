-- Tarefa (sino de notificações): feed de eventos estilo Facebook, com
-- persistência em banco — não pode depender de o navegador estar aberto no
-- momento do evento. A maioria dos eventos-alvo (técnico em deslocamento,
-- iniciou atendimento, solicitou peça) é gerada por PATCH em `chamados`
-- feito pelo portal do técnico (repo teffe-site, não tocado aqui) — não há
-- hook de código nesse repo pra chamar. A única forma confiável de capturar
-- esses eventos independente de qual app fez o PATCH é trigger de banco.
-- "Chamado novo"/"Peça entregue" também usam o mesmo mecanismo por
-- consistência (mesmo padrão vale pra qualquer INSERT/UPDATE futuro).
CREATE TABLE IF NOT EXISTS erp_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_evento text NOT NULL,
  descricao text NOT NULL,
  chamado_id uuid REFERENCES chamados(id) ON DELETE CASCADE,
  solicitacao_id uuid REFERENCES solicitacoes_suprimento(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_eventos_criado_em ON erp_eventos(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_erp_eventos_chamado ON erp_eventos(chamado_id);
CREATE INDEX IF NOT EXISTS idx_erp_eventos_solicitacao ON erp_eventos(solicitacao_id);

-- "Visto" é por usuário (não global): dois admins abrindo o sino em momentos
-- diferentes cada um zera a própria contagem, sem interferir na do outro.
-- Tabela de junção em vez de jsonb em erp_eventos pra permitir INSERT em
-- lote (1 request pro POST /erp_eventos_vistos ao abrir o painel) sem
-- read-modify-write concorrente num array jsonb.
CREATE TABLE IF NOT EXISTS erp_eventos_vistos (
  evento_id uuid NOT NULL REFERENCES erp_eventos(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  visto_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evento_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_erp_eventos_vistos_usuario ON erp_eventos_vistos(usuario_id);

-- ── TRIGGER: chamados (novo chamado + transições de status_tecnico) ──
CREATE OR REPLACE FUNCTION erp_registrar_evento_chamado() RETURNS trigger AS $$
DECLARE
  cli_nome text;
  num text;
  tipo_label text;
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
      INSERT INTO erp_eventos (tipo_evento, descricao, chamado_id)
      VALUES ('peca_solicitada', 'Peça solicitada — O.S. ' || num || ' — ' || cli_nome || COALESCE(': ' || NEW.pecas_solicitadas, ''), NEW.id);
    ELSIF NEW.status_tecnico = 'encerrado' THEN
      INSERT INTO erp_eventos (tipo_evento, descricao, chamado_id)
      VALUES ('chamado_encerrado', 'Chamado encerrado — O.S. ' || num || ' — ' || cli_nome, NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_erp_eventos_chamados ON chamados;
CREATE TRIGGER trg_erp_eventos_chamados
  AFTER INSERT OR UPDATE ON chamados
  FOR EACH ROW EXECUTE FUNCTION erp_registrar_evento_chamado();

-- ── TRIGGER: solicitacoes_suprimento (novo pedido) ──
-- Um pedido de suprimento pode gerar várias linhas com o mesmo `numero`
-- (carrinho com vários itens — ver comentário em suprimentos-admin.js e no
-- Bloco F original). Sem o guard abaixo, um carrinho de 5 itens viraria 5
-- eventos idênticos no feed.
CREATE OR REPLACE FUNCTION erp_registrar_evento_suprimento() RETURNS trigger AS $$
DECLARE
  cli_nome text;
  num text;
  ja_existe boolean;
BEGIN
  IF NEW.numero IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM erp_eventos e
      JOIN solicitacoes_suprimento s2 ON s2.id = e.solicitacao_id
      WHERE e.tipo_evento = 'suprimento_novo' AND s2.numero = NEW.numero
    ) INTO ja_existe;
    IF ja_existe THEN RETURN NEW; END IF;
  END IF;

  SELECT COALESCE(razao_social, fantasia, 'Cliente') INTO cli_nome FROM clientes WHERE id = NEW.cliente_id;
  cli_nome := COALESCE(cli_nome, 'Cliente');
  num := COALESCE(NEW.numero::text, left(NEW.id::text, 6));

  INSERT INTO erp_eventos (tipo_evento, descricao, solicitacao_id)
  VALUES ('suprimento_novo', 'Nova solicitação de suprimento: O.S. ' || num || ' — ' || cli_nome, NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_erp_eventos_suprimento ON solicitacoes_suprimento;
CREATE TRIGGER trg_erp_eventos_suprimento
  AFTER INSERT ON solicitacoes_suprimento
  FOR EACH ROW EXECUTE FUNCTION erp_registrar_evento_suprimento();

-- Publica erp_eventos no Realtime (mesma infra do Bloco E) pra badge/toast
-- atualizarem ao vivo com o app aberto. Guard evita erro se já tiver sido
-- adicionada manualmente antes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'erp_eventos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.erp_eventos;
  END IF;
END $$;

-- Sem RLS/GRANT explícitos de propósito, mesmo padrão do resto do projeto
-- (ver comentário em chamado_status_historico, migration 20260707000001):
-- não há como confirmar por sondagem se RLS está ativo, e os privilégios
-- default do projeto já liberam acesso às tabelas novas pro app funcionar
-- (mesma anon/auth key usada em tudo mais).
