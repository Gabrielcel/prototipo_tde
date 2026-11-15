BEGIN;

INSERT INTO families (
  code, contact_name, street, neighborhood, city, occupation, income_range, status
)
VALUES
  ('DEMO-0001', 'Pessoa Exemplo 1', 'Rua de Demonstração, 10', 'Bairro Fictício', 'Cidade Exemplo', 'Autônomo(a)', 'ate_1_minimo', 'em_acompanhamento'),
  ('DEMO-0002', 'Pessoa Exemplo 2', 'Avenida de Demonstração, 20', 'Centro Fictício', 'Cidade Exemplo', 'Comerciante', '1_a_2_minimos', 'aguardando_visita'),
  ('DEMO-0003', 'Pessoa Exemplo 3', 'Rua de Teste, 30', 'Vila Fictícia', 'Cidade Exemplo', 'Não informado', 'nao_informado', 'cadastro_recente')
ON CONFLICT (code) DO NOTHING;

INSERT INTO family_members (family_id, full_name, relationship)
SELECT f.id, demo.full_name, demo.relationship
FROM (VALUES
  ('DEMO-0001', 'Pessoa Exemplo 1', 'Responsável'),
  ('DEMO-0001', 'Integrante Fictício 1', 'Filho(a)'),
  ('DEMO-0002', 'Pessoa Exemplo 2', 'Responsável'),
  ('DEMO-0003', 'Pessoa Exemplo 3', 'Responsável')
) AS demo(code, full_name, relationship)
JOIN families f ON f.code = demo.code
ON CONFLICT (family_id, full_name, relationship) DO NOTHING;

INSERT INTO visits (family_id, scheduled_at, priority, status, change_reason)
SELECT f.id, demo.scheduled_at::TIMESTAMPTZ, demo.priority, demo.status, demo.change_reason
FROM (VALUES
  ('DEMO-0001', '2026-12-01 09:00:00-03', 'alta', 'sem_responsavel', NULL),
  ('DEMO-0002', '2026-12-02 14:00:00-03', 'media', 'sem_responsavel', NULL),
  ('DEMO-0003', '2026-11-10 10:30:00-03', 'baixa', 'concluida', NULL)
) AS demo(code, scheduled_at, priority, status, change_reason)
JOIN families f ON f.code = demo.code
WHERE NOT EXISTS (
  SELECT 1 FROM visits existing
  WHERE existing.family_id = f.id
    AND existing.scheduled_at = demo.scheduled_at::TIMESTAMPTZ
);

INSERT INTO visit_records (visit_id, conditions, observations, checklist_answers)
SELECT v.id,
       'Registro fictício para demonstração.',
       'Não contém informações de atendimento real.',
       '[{"item":"Acesso à água","answer":"sim"},{"item":"Alimentos disponíveis","answer":"não"}]'::JSONB
FROM visits v
JOIN families f ON f.id = v.family_id
WHERE f.code = 'DEMO-0003'
  AND v.scheduled_at = '2026-11-10 10:30:00-03'::TIMESTAMPTZ
ON CONFLICT (visit_id) DO NOTHING;

INSERT INTO needs (family_id, visit_id, category, description, priority, status)
SELECT f.id, v.id, demo.category, demo.description, demo.priority, demo.status
FROM (VALUES
  ('DEMO-0001', 'Alimentação', 'Necessidade fictícia de demonstração', 'alta', 'pendente'),
  ('DEMO-0003', 'Documentação', 'Exemplo de necessidade já em acompanhamento', 'media', 'em_andamento')
) AS demo(code, category, description, priority, status)
JOIN families f ON f.code = demo.code
LEFT JOIN visits v ON v.family_id = f.id AND v.scheduled_at = '2026-11-10 10:30:00-03'::TIMESTAMPTZ
WHERE NOT EXISTS (
  SELECT 1 FROM needs existing
  WHERE existing.family_id = f.id
    AND existing.category = demo.category
    AND existing.description = demo.description
);

INSERT INTO referrals (need_id, type, description, status)
SELECT n.id, 'pendencia', 'Encaminhamento fictício para teste.', 'aberto'
FROM needs n
JOIN families f ON f.id = n.family_id
WHERE f.code = 'DEMO-0001'
  AND n.description = 'Necessidade fictícia de demonstração'
  AND NOT EXISTS (
    SELECT 1 FROM referrals existing WHERE existing.need_id = n.id
  );

COMMIT;
