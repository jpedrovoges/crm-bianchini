-- Dados de exemplo para o ambiente local. Roda automaticamente após cada
-- `supabase db reset`. Os nomes dos dentistas batem com o matching de
-- app/api/setup/route.ts, então o /api/setup consegue vincular dentista_id
-- corretamente aos usuários de teste.

insert into dentistas (nome, ativo, participa_despesas_comuns) values
  ('Marco Bianchini', true, true),
  ('Raissa Curtarelli', true, true),
  ('Nicole Lucca', true, true),
  ('Guilherme Biezus', true, true),
  ('Jose Moises', true, true),
  ('Bruna Mueller', true, true);

insert into categorias_despesa_comum (nome, ordem) values
  ('Infraestrutura', 1),
  ('Marketing', 2),
  ('Materiais', 3);

insert into destinatarios (nome, tipo) values
  ('Fornecedor Dental Exemplo', 'empresa');

insert into pacientes (nome, telefone, cpf, email, cidade, estado) values
  ('Paciente Teste Um', '(48) 99999-0001', '111.111.111-11', 'teste1@example.com', 'Florianópolis', 'SC'),
  ('Paciente Teste Dois', '(48) 99999-0002', '222.222.222-22', 'teste2@example.com', 'Florianópolis', 'SC'),
  ('Paciente Teste Três', '(48) 99999-0003', '333.333.333-33', 'teste3@example.com', 'São José', 'SC');
