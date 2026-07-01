-- Controle de acesso por usuário no ERP (permissões por módulo + acesso master)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS permissoes jsonb DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS acesso_total boolean DEFAULT false;

-- email necessário para a listagem em Admin > Usuários ERP (demais usuários são
-- autopreenchidos no primeiro login após esta migração, ver js/supabase.js)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;

UPDATE profiles
SET acesso_total = true, email = 'master@teffe.com.br'
WHERE id = '2de00a69-4860-4abb-a980-085ff81d8b99';
