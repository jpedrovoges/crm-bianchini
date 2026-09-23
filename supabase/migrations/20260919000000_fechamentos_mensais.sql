-- Trava de fechamento de mês por dentista. Guarda um snapshot em JSON do
-- resultado calculado em lib/fechamentoMensal.ts no momento do fechamento
-- (o formato varia por tipo de dentista — branchA/marco/diagrama2/diagrama3 —
-- por isso jsonb em vez de colunas fixas). Substitui o rascunho manual em
-- sql/2026-08-05_fechamentos_mensais.sql, que nunca chegou a ser aplicado.

create table fechamentos_mensais (
  id uuid primary key default gen_random_uuid(),
  dentista_id uuid not null references dentistas(id),
  ano int not null,
  mes int not null, -- 0-11 (Janeiro = 0), mesma convenção usada no app
  status text not null default 'fechado' check (status in ('fechado', 'reaberto')),

  resultado jsonb not null,

  fechado_em timestamptz not null default now(),
  fechado_por text,
  reaberto_em timestamptz,
  reaberto_por text,
  updated_at timestamptz not null default now(),

  unique (dentista_id, ano, mes)
);

create index fechamentos_mensais_dentista_idx on fechamentos_mensais (dentista_id, ano, mes);

alter table fechamentos_mensais disable row level security;
