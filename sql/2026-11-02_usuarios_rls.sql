-- Segurança: a tabela `usuarios` guarda os hashes de senha e só é acessada
-- pelas rotas de API (app/api/**) com a service_role key, que ignora RLS.
-- Antes, com RLS desligado, qualquer um com a anon key (pública, vai pro
-- navegador) conseguia LER os hashes e ALTERAR senha/role de qualquer
-- usuário via REST do Supabase. RLS ligado sem nenhuma policy + revoke
-- bloqueia anon/authenticated por completo.
alter table usuarios enable row level security;
alter table usuarios force row level security;
revoke all on table usuarios from anon, authenticated;
