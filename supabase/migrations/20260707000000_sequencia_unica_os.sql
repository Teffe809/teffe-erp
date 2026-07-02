-- Numeração ÚNICA compartilhada entre chamados (assistência, instalação,
-- desinstalação etc.) e solicitacoes_suprimento — hoje cada tabela tem sua
-- própria sequência independente (chamados no #28, suprimento no #7).
-- Reinicia em 100; números já existentes (antigos) NÃO são alterados.
CREATE SEQUENCE IF NOT EXISTS chamados_os_seq START WITH 100;

COMMENT ON SEQUENCE chamados_os_seq IS
  'Sequência única de O.S. compartilhada entre chamados e solicitacoes_suprimento, iniciada em 100 (registros anteriores mantêm o numero antigo).';

-- Troca o valor padrão da coluna numero em ambas as tabelas para a sequência
-- compartilhada. Isso substitui qualquer default anterior (ex.: sequência
-- própria de cada tabela) sem precisar saber o nome dela.
ALTER TABLE chamados ALTER COLUMN numero SET DEFAULT nextval('chamados_os_seq');
ALTER TABLE solicitacoes_suprimento ALTER COLUMN numero SET DEFAULT nextval('chamados_os_seq');

-- ATENÇÃO (verificar após rodar): se em algum dos dois lugares "numero" for
-- gerado por um TRIGGER (ex.: uma função que calcula MAX(numero)+1) em vez de
-- um DEFAULT de coluna, o ALTER acima não terá efeito sozinho — o trigger
-- continuaria sobrescrevendo o valor. Nesse caso, é preciso localizar a
-- função do trigger (algo como SELECT * FROM information_schema.triggers
-- WHERE event_object_table IN ('chamados','solicitacoes_suprimento') no SQL
-- Editor) e trocar seu cálculo interno para usar
-- nextval('chamados_os_seq') em vez de calcular por conta própria.
-- Teste criando um chamado ou solicitação de teste após rodar esta migration
-- e confirme que o numero saiu 100 (ou o próximo esperado).
