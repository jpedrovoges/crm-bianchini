-- Rode manualmente no SQL Editor do Supabase (produção).
-- Cópia exata de supabase/migrations/20260924000000_data_efetiva_override.sql.
--
-- Permite admin/gestor sobrescrever manualmente o mês em que um lançamento
-- "cai" pra fins financeiros (comissão/rateio/fechamento), mesmo quando a
-- regra automática por forma de pagamento (ex.: +30 dias no cartão de
-- crédito) não se aplica a um dentista específico. Quando null, continua
-- usando a regra automática de sempre.
alter table lancamentos add column if not exists data_efetiva date;
