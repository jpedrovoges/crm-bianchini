-- Permite admin/gestor sobrescrever manualmente o mês em que um lançamento
-- "cai" pra fins financeiros (comissão/rateio/fechamento), mesmo quando a
-- regra automática por forma de pagamento (ex.: +30 dias no cartão de
-- crédito) não se aplica a um dentista específico. Quando null, continua
-- usando a regra automática de sempre (ver dataEfetiva() em
-- lib/fechamentoMensal.ts e financeiro/[dentistaId]/page.tsx).
alter table lancamentos add column data_efetiva date;
