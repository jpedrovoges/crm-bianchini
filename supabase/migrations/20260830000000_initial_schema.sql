-- Schema reconstruído a partir do uso real no código do app (não existe dump
-- oficial do projeto Supabase de produção neste repositório). Serve para
-- rodar localmente via `supabase start` e testar sem tocar no banco real.
-- Se algo divergir do banco de produção, ajuste esta migration.

create extension if not exists pgcrypto;

create table dentistas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  participa_despesas_comuns boolean not null default false
);

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'gestor', 'recepcao', 'dentista')),
  dentista_id uuid references dentistas(id),
  force_password_change boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table pacientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  email text,
  cpf text,
  data_nascimento date,
  observacoes text,
  cep text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado text
);

create table destinatarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('dentista', 'empresa')),
  ativo boolean not null default true
);

create table categorias_despesa_comum (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ordem int not null default 0
);

create table despesas_comuns (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  valor numeric(12, 2),
  dia_vencimento int check (dia_vencimento between 1 and 31),
  categoria_id uuid references categorias_despesa_comum(id),
  ativo boolean not null default true
);

create table lancamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  tipo text not null check (tipo in ('receita', 'despesa')),
  descricao text not null,
  valor numeric(12, 2) not null,
  forma text not null,
  paciente_id uuid references pacientes(id),
  destinatario_id uuid references destinatarios(id),
  dentista_id uuid references dentistas(id),
  dentista_responsavel_id uuid references dentistas(id),
  despesa_comum_id uuid references despesas_comuns(id),
  nota_fiscal boolean not null default false,
  numero_nf text,
  categoria text check (categoria in ('venda', 'procedimento')),
  observacao text,
  created_at timestamptz not null default now()
);

create table pagamentos_dentistas (
  id uuid primary key default gen_random_uuid(),
  dentista_id uuid not null references dentistas(id),
  valor numeric(12, 2) not null,
  data date not null,
  forma text not null,
  descricao text,
  created_at timestamptz not null default now()
);

create table repasses (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references lancamentos(id) on delete cascade,
  dentista_origem_id uuid not null references dentistas(id),
  dentista_destino_id uuid not null references dentistas(id),
  percentual numeric(5, 2) not null check (percentual > 0 and percentual <= 100),
  valor numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

create index lancamentos_data_idx on lancamentos (data);
create index lancamentos_tipo_idx on lancamentos (tipo);
create index lancamentos_paciente_idx on lancamentos (paciente_id);
create index lancamentos_dentista_idx on lancamentos (dentista_id);
create index lancamentos_dentista_resp_idx on lancamentos (dentista_responsavel_id);
create index repasses_lancamento_idx on repasses (lancamento_id);
create index repasses_destino_idx on repasses (dentista_destino_id);

-- O app faz todas as leituras/escritas do client direto nas tabelas com a
-- anon key (não usa o Auth do Supabase — login é custom via cookie/JWT), e
-- as rotas de servidor usam a service_role key. Por isso RLS fica desabilitado
-- aqui, replicando o que o comentário em sql/2026-08-05_fechamentos_mensais.sql
-- descreve como padrão do projeto. Ajuste se o banco real usa policies.
alter table dentistas disable row level security;
alter table usuarios disable row level security;
alter table pacientes disable row level security;
alter table destinatarios disable row level security;
alter table categorias_despesa_comum disable row level security;
alter table despesas_comuns disable row level security;
alter table lancamentos disable row level security;
alter table pagamentos_dentistas disable row level security;
alter table repasses disable row level security;
