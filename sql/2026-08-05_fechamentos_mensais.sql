-- Rode este script manualmente no SQL Editor do Supabase antes de publicar o código
-- que passa a ler/escrever na tabela fechamentos_mensais.
--
-- Trava de fechamento de mês por dentista. Cada linha representa o fechamento
-- (ou reabertura) de um dentista em um mês/ano específico, com o snapshot dos
-- valores calculados no momento do fechamento.

create table if not exists fechamentos_mensais (
  id uuid primary key default gen_random_uuid(),
  dentista_id uuid not null references dentistas(id),
  ano int not null,
  mes int not null, -- 0-11 (Janeiro = 0), mesma convenção usada no app
  status text not null default 'fechado' check (status in ('fechado', 'reaberto')),

  comissao_pagar numeric(12,2) not null default 0,
  rateio_despesas_gerais numeric(12,2) not null default 0,
  despesas_atribuidas numeric(12,2) not null default 0,
  comissao_a_receber numeric(12,2) not null default 0,
  participacao_cirurgia numeric(12,2) not null default 0,
  total_a_pagar_clinica numeric(12,2) not null default 0,
  valor_pf numeric(12,2) not null default 0,
  valor_pj numeric(12,2) not null default 0,

  fechado_em timestamptz not null default now(),
  fechado_por text,
  reaberto_em timestamptz,
  reaberto_por text,
  updated_at timestamptz not null default now(),

  unique (dentista_id, ano, mes)
);

-- RLS: ajuste para espelhar o que já está configurado nas outras tabelas do
-- projeto (ex. configuracoes_dentistas). Se as outras tabelas estão com RLS
-- desabilitado, descomente a linha abaixo; se usam policy permissiva, replique-a.
-- alter table fechamentos_mensais disable row level security;
