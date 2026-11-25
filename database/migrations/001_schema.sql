BEGIN;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('gestor', 'voluntario')),
  status VARCHAR(20) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX users_email_lower_unique ON users (LOWER(email));

CREATE TABLE families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  contact_name VARCHAR(120) NOT NULL,
  phone VARCHAR(30),
  email VARCHAR(254),
  street VARCHAR(180),
  neighborhood VARCHAR(100),
  city VARCHAR(100),
  postal_code VARCHAR(12),
  occupation VARCHAR(100),
  income_range VARCHAR(40),
  status VARCHAR(30) NOT NULL DEFAULT 'cadastro_recente'
    CHECK (status IN ('em_acompanhamento', 'cadastro_recente', 'aguardando_visita')),
  consent_given BOOLEAN NOT NULL DEFAULT FALSE,
  consent_recorded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (consent_given = (consent_recorded_at IS NOT NULL))
);

CREATE TABLE family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  full_name VARCHAR(120) NOT NULL,
  relationship VARCHAR(40) NOT NULL,
  birth_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (family_id, full_name, relationship)
);

CREATE TABLE visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  priority VARCHAR(10) NOT NULL CHECK (priority IN ('alta', 'media', 'baixa')),
  status VARCHAR(24) NOT NULL DEFAULT 'agendada'
    CHECK (status IN ('agendada', 'sem_responsavel', 'reagendada', 'concluida', 'cancelada')),
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX visits_family_id_idx ON visits (family_id);
CREATE INDEX visits_assigned_to_idx ON visits (assigned_to);
CREATE INDEX visits_scheduled_at_idx ON visits (scheduled_at);

CREATE TABLE visit_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL UNIQUE REFERENCES visits(id) ON DELETE CASCADE,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  conditions TEXT,
  observations TEXT,
  checklist_answers JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(checklist_answers) = 'array'),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE needs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  category VARCHAR(60) NOT NULL,
  description TEXT NOT NULL,
  priority VARCHAR(10) NOT NULL CHECK (priority IN ('alta', 'media', 'baixa')),
  status VARCHAR(20) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'em_andamento', 'resolvida')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX needs_family_id_idx ON needs (family_id);
CREATE INDEX needs_status_idx ON needs (status);

CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id UUID NOT NULL REFERENCES needs(id) ON DELETE CASCADE,
  responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('encaminhamento', 'pendencia')),
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto', 'em_andamento', 'concluido', 'cancelado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
