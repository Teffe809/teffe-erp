-- Tarefa 6: cliente_usuarios já suportava múltiplos usuários por cliente_id
-- (sem unique constraint em cliente_id, só em email/user_id) — confirmado via
-- sondagem em teffe-erp/js/clientes.js (abrirModalUsuariosCliente já cadastra
-- N usuários por cliente). Faltava só o controle de permissão por módulo,
-- mesmo padrão já usado em profiles (acesso_total + permissoes jsonb) para
-- os usuários do ERP.
--
-- DEFAULT true em acesso_total: usuários já cadastrados antes desta feature
-- foram criados sem nenhuma noção de permissão restrita — o padrão evita
-- reduzir o acesso deles retroativamente.
ALTER TABLE cliente_usuarios ADD COLUMN IF NOT EXISTS acesso_total boolean NOT NULL DEFAULT true;
ALTER TABLE cliente_usuarios ADD COLUMN IF NOT EXISTS permissoes jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN cliente_usuarios.acesso_total IS
  'Se true, ignora "permissoes" e libera todos os módulos da área do cliente (Chamados, Financeiro, Equipamentos).';
COMMENT ON COLUMN cliente_usuarios.permissoes IS
  'jsonb {chamados: bool, financeiro: bool, equipamentos: bool} — só é consultado quando acesso_total=false.';
