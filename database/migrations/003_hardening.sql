-- 003_hardening.sql
-- Endurece a estrutura original sem apagar dados existentes.
-- Inclui: auditoria e históricos protegidos contra alteração, política de exclusão
-- segura (RESTRICT), atualização automática de updated_at, tentativas de login,
-- índices ligados às consultas reais e proteção contra agendamentos simultâneos.

BEGIN;

-- ---------------------------------------------------------------------------
-- Funções utilitárias
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Registros de auditoria e histórico não podem ser alterados ou removidos.'
        USING ERRCODE = '55000';
END;
$$;

-- ---------------------------------------------------------------------------
-- Novas colunas (todas com valor padrão ou opcionais)
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE families ADD COLUMN IF NOT EXISTS consent_recorded_by UUID REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE families ADD COLUMN IF NOT EXISTS consent_version VARCHAR(20);

ALTER TABLE family_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE referrals ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Política de exclusão: dados históricos não são apagados em cascata.
-- Exclusão acidental de famílias, visitas ou necessidades passa a ser bloqueada.
-- Usuários nunca são removidos pela aplicação; são desativados (status = 'inativo').
-- ---------------------------------------------------------------------------
ALTER TABLE family_members DROP CONSTRAINT IF EXISTS family_members_family_id_fkey;
ALTER TABLE family_members
    ADD CONSTRAINT family_members_family_id_fkey
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE RESTRICT;

ALTER TABLE visit_records DROP CONSTRAINT IF EXISTS visit_records_visit_id_fkey;
ALTER TABLE visit_records
    ADD CONSTRAINT visit_records_visit_id_fkey
    FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE RESTRICT;

ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_need_id_fkey;
ALTER TABLE referrals
    ADD CONSTRAINT referrals_need_id_fkey
    FOREIGN KEY (need_id) REFERENCES needs(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- Restrições adicionais (NOT VALID: valem para novos registros e não quebram
-- dados antigos; use VALIDATE CONSTRAINT depois de revisar os dados existentes)
-- ---------------------------------------------------------------------------
ALTER TABLE users
    ADD CONSTRAINT users_email_format_check
    CHECK (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$') NOT VALID;

ALTER TABLE visits
    ADD CONSTRAINT visits_assignment_consistency_check
    CHECK (
        status IN ('concluida', 'cancelada')
        OR ((status = 'sem_responsavel') = (assigned_to IS NULL))
    ) NOT VALID;

ALTER TABLE visits
    ADD CONSTRAINT visits_change_reason_length_check
    CHECK (change_reason IS NULL OR char_length(change_reason) <= 1000) NOT VALID;

-- ---------------------------------------------------------------------------
-- Atualização automática de updated_at
-- ---------------------------------------------------------------------------
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER families_set_updated_at BEFORE UPDATE ON families
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER family_members_set_updated_at BEFORE UPDATE ON family_members
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER visits_set_updated_at BEFORE UPDATE ON visits
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER needs_set_updated_at BEFORE UPDATE ON needs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER referrals_set_updated_at BEFORE UPDATE ON referrals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Tentativas de login (limitação por conta e por IP)
-- ---------------------------------------------------------------------------
CREATE TABLE login_attempts (
    id BIGSERIAL PRIMARY KEY,
    email_key VARCHAR(254) NOT NULL,
    ip VARCHAR(64) NOT NULL,
    succeeded BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX login_attempts_email_idx ON login_attempts (email_key, created_at DESC);
CREATE INDEX login_attempts_ip_idx ON login_attempts (ip, created_at DESC);

-- ---------------------------------------------------------------------------
-- Auditoria e históricos (somente inserção)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(60) NOT NULL,
    resource_type VARCHAR(40),
    resource_id TEXT,
    result VARCHAR(10) NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'failure')),
    ip VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_user_idx ON audit_logs (user_id, created_at DESC);
CREATE INDEX audit_logs_resource_idx ON audit_logs (resource_type, resource_id);

CREATE TABLE family_history (
    id BIGSERIAL PRIMARY KEY,
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(30) NOT NULL,
    field VARCHAR(60),
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX family_history_family_idx ON family_history (family_id, created_at DESC);

CREATE TABLE visit_history (
    id BIGSERIAL PRIMARY KEY,
    visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(30) NOT NULL
        CHECK (action IN ('criada', 'reagendada', 'atribuida', 'desatribuida', 'cancelada', 'concluida')),
    old_scheduled_at TIMESTAMPTZ,
    new_scheduled_at TIMESTAMPTZ,
    old_assigned_to UUID REFERENCES users(id) ON DELETE RESTRICT,
    new_assigned_to UUID REFERENCES users(id) ON DELETE RESTRICT,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX visit_history_visit_idx ON visit_history (visit_id, created_at DESC);

CREATE TABLE status_history (
    id BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('need', 'referral')),
    entity_id UUID NOT NULL,
    from_status VARCHAR(20),
    to_status VARCHAR(20) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX status_history_entity_idx ON status_history (entity_type, entity_id, created_at DESC);

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['audit_logs', 'family_history', 'visit_history', 'status_history']
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_modification()',
            t || '_append_only', t
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION prevent_modification()',
            t || '_no_truncate', t
        );
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Índices ligados às consultas reais da aplicação
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS family_members_family_idx ON family_members (family_id);
CREATE INDEX IF NOT EXISTS families_name_lower_idx ON families (LOWER(contact_name));
CREATE INDEX IF NOT EXISTS families_phone_digits_idx
    ON families ((REGEXP_REPLACE(COALESCE(phone, ''), '\D', '', 'g')));
CREATE INDEX IF NOT EXISTS visits_status_scheduled_idx ON visits (status, scheduled_at);
CREATE INDEX IF NOT EXISTS needs_visit_idx ON needs (visit_id);
CREATE INDEX IF NOT EXISTS needs_priority_idx ON needs (priority);
CREATE INDEX IF NOT EXISTS referrals_need_idx ON referrals (need_id);
CREATE INDEX IF NOT EXISTS referrals_responsible_idx ON referrals (responsible_user_id, status);

COMMIT;

-- ---------------------------------------------------------------------------
-- Defesa em profundidade contra conflitos de horário (agendamentos simultâneos).
-- Fica fora da transação principal: se a extensão btree_gist não puder ser criada
-- (permissão) ou se já existirem conflitos nos dados atuais, a migração continua e
-- a aplicação segue protegida por bloqueios transacionais (advisory locks).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS btree_gist;

    CREATE OR REPLACE FUNCTION visit_slot(ts TIMESTAMPTZ) RETURNS tstzrange
    LANGUAGE sql IMMUTABLE AS $f$ SELECT tstzrange(ts, ts + INTERVAL '1 hour') $f$;

    ALTER TABLE visits
        ADD CONSTRAINT visits_volunteer_no_overlap
        EXCLUDE USING gist (assigned_to WITH =, visit_slot(scheduled_at) WITH &&)
        WHERE (assigned_to IS NOT NULL AND status IN ('agendada', 'reagendada'));

    ALTER TABLE visits
        ADD CONSTRAINT visits_family_no_overlap
        EXCLUDE USING gist (family_id WITH =, visit_slot(scheduled_at) WITH &&)
        WHERE (status IN ('agendada', 'reagendada', 'sem_responsavel'));
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Restrições de sobreposição de visitas não criadas (%). Proteção feita pela aplicação.', SQLERRM;
END;
$$;
