-- Rode este script manualmente no SQL Editor do Supabase (produção) antes de
-- publicar o código que fecha/reabre o mês (botão "Fechar Mês" na tela de
-- Fechamento de Mês, aviso "Mês Fechado" na tela do próprio dentista).
--
-- Este arquivo era um rascunho anterior que nunca chegou a ser aplicado;
-- foi substituído pelo schema real, criado e testado como migration local em
-- supabase/migrations/20260919000000_fechamentos_mensais.sql. O conteúdo
-- abaixo é uma cópia exata dessa migration — mantido aqui só porque esse é o
-- lugar de onde scripts manuais de produção são copiados neste projeto.

create table if not exists fechamentos_mensais (
  id uuid primary key default gen_random_uuid(),
  dentista_id uuid not null references dentistas(id),
  ano int not null,
  mes int not null, -- 0-11 (Janeiro = 0), mesma convenção usada no app
  status text not null default 'fechado' check (status in ('fechado', 'reaberto')),

  -- Snapshot em JSON do resultado calculado em lib/fechamentoMensal.ts no
  -- momento do fechamento (o formato varia por tipo de dentista —
  -- branchA/marco/diagrama2/diagrama3 — por isso jsonb em vez de colunas fixas).
  resultado jsonb not null,

  fechado_em timestamptz not null default now(),
  fechado_por text,
  reaberto_em timestamptz,
  reaberto_por text,
  updated_at timestamptz not null default now(),

  unique (dentista_id, ano, mes)
);

create index if not exists fechamentos_mensais_dentista_idx on fechamentos_mensais (dentista_id, ano, mes);

-- RLS desabilitado pra espelhar as demais tabelas do projeto (o app não usa
-- o Auth do Supabase — login é custom via cookie/JWT — e acessa direto com
-- a anon/service key).
alter table fechamentos_mensais disable row level security;
