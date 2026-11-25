--
-- PostgreSQL database dump
--




--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: prevent_modification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_modification() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION 'Registros de auditoria e histórico não podem ser alterados ou removidos.'
        USING ERRCODE = '55000';
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: visit_slot(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.visit_slot(ts timestamp with time zone) RETURNS tstzrange
    LANGUAGE sql IMMUTABLE
    AS $$ SELECT tstzrange(ts, ts + INTERVAL '1 hour') $$;




--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    user_id uuid,
    action character varying(60) NOT NULL,
    resource_type character varying(40),
    resource_id text,
    result character varying(10) DEFAULT 'success'::character varying NOT NULL,
    ip character varying(64),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_logs_result_check CHECK (((result)::text = ANY ((ARRAY['success'::character varying, 'failure'::character varying])::text[])))
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: families; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.families (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(20) NOT NULL,
    contact_name character varying(120) NOT NULL,
    phone character varying(30),
    email character varying(254),
    street character varying(180),
    neighborhood character varying(100),
    city character varying(100),
    postal_code character varying(12),
    occupation character varying(100),
    income_range character varying(40),
    status character varying(30) DEFAULT 'cadastro_recente'::character varying NOT NULL,
    consent_given boolean DEFAULT false NOT NULL,
    consent_recorded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    consent_recorded_by uuid,
    consent_version character varying(20),
    CONSTRAINT families_check CHECK ((consent_given = (consent_recorded_at IS NOT NULL))),
    CONSTRAINT families_status_check CHECK (((status)::text = ANY ((ARRAY['em_acompanhamento'::character varying, 'cadastro_recente'::character varying, 'aguardando_visita'::character varying])::text[])))
);


--
-- Name: family_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.family_history (
    id bigint NOT NULL,
    family_id uuid NOT NULL,
    user_id uuid,
    action character varying(30) NOT NULL,
    field character varying(60),
    old_value text,
    new_value text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: family_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.family_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: family_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.family_history_id_seq OWNED BY public.family_history.id;


--
-- Name: family_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.family_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    full_name character varying(120) NOT NULL,
    relationship character varying(40) NOT NULL,
    birth_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_attempts (
    id bigint NOT NULL,
    email_key character varying(254) NOT NULL,
    ip character varying(64) NOT NULL,
    succeeded boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: login_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.login_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: login_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.login_attempts_id_seq OWNED BY public.login_attempts.id;


--
-- Name: needs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.needs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    visit_id uuid,
    created_by uuid,
    category character varying(60) NOT NULL,
    description text NOT NULL,
    priority character varying(10) NOT NULL,
    status character varying(20) DEFAULT 'pendente'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT needs_priority_check CHECK (((priority)::text = ANY ((ARRAY['alta'::character varying, 'media'::character varying, 'baixa'::character varying])::text[]))),
    CONSTRAINT needs_status_check CHECK (((status)::text = ANY ((ARRAY['pendente'::character varying, 'em_andamento'::character varying, 'resolvida'::character varying])::text[])))
);


--
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    need_id uuid NOT NULL,
    responsible_user_id uuid,
    type character varying(20) NOT NULL,
    description text,
    status character varying(20) DEFAULT 'aberto'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT referrals_status_check CHECK (((status)::text = ANY ((ARRAY['aberto'::character varying, 'em_andamento'::character varying, 'concluido'::character varying, 'cancelado'::character varying])::text[]))),
    CONSTRAINT referrals_type_check CHECK (((type)::text = ANY ((ARRAY['encaminhamento'::character varying, 'pendencia'::character varying])::text[])))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    name text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.status_history (
    id bigint NOT NULL,
    entity_type character varying(20) NOT NULL,
    entity_id uuid NOT NULL,
    from_status character varying(20),
    to_status character varying(20) NOT NULL,
    user_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT status_history_entity_type_check CHECK (((entity_type)::text = ANY ((ARRAY['need'::character varying, 'referral'::character varying])::text[])))
);


--
-- Name: status_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.status_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: status_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.status_history_id_seq OWNED BY public.status_history.id;


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character(64) NOT NULL,
    csrf_token character(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name character varying(120) NOT NULL,
    email character varying(254) NOT NULL,
    password_hash text NOT NULL,
    role character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'ativo'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['gestor'::character varying, 'voluntario'::character varying])::text[]))),
    CONSTRAINT users_status_check CHECK (((status)::text = ANY ((ARRAY['ativo'::character varying, 'inativo'::character varying])::text[])))
);


--
-- Name: visit_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visit_history (
    id bigint NOT NULL,
    visit_id uuid NOT NULL,
    user_id uuid,
    action character varying(30) NOT NULL,
    old_scheduled_at timestamp with time zone,
    new_scheduled_at timestamp with time zone,
    old_assigned_to uuid,
    new_assigned_to uuid,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT visit_history_action_check CHECK (((action)::text = ANY ((ARRAY['criada'::character varying, 'reagendada'::character varying, 'atribuida'::character varying, 'desatribuida'::character varying, 'cancelada'::character varying, 'concluida'::character varying])::text[])))
);


--
-- Name: visit_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visit_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visit_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visit_history_id_seq OWNED BY public.visit_history.id;


--
-- Name: visit_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visit_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visit_id uuid NOT NULL,
    completed_by uuid,
    conditions text,
    observations text,
    checklist_answers jsonb DEFAULT '[]'::jsonb NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT visit_records_checklist_answers_check CHECK ((jsonb_typeof(checklist_answers) = 'array'::text))
);


--
-- Name: visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    assigned_to uuid,
    created_by uuid,
    scheduled_at timestamp with time zone NOT NULL,
    priority character varying(10) NOT NULL,
    status character varying(24) DEFAULT 'agendada'::character varying NOT NULL,
    change_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT visits_priority_check CHECK (((priority)::text = ANY ((ARRAY['alta'::character varying, 'media'::character varying, 'baixa'::character varying])::text[]))),
    CONSTRAINT visits_status_check CHECK (((status)::text = ANY ((ARRAY['agendada'::character varying, 'sem_responsavel'::character varying, 'reagendada'::character varying, 'concluida'::character varying, 'cancelada'::character varying])::text[])))
);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: family_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_history ALTER COLUMN id SET DEFAULT nextval('public.family_history_id_seq'::regclass);


--
-- Name: login_attempts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts ALTER COLUMN id SET DEFAULT nextval('public.login_attempts_id_seq'::regclass);


--
-- Name: status_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_history ALTER COLUMN id SET DEFAULT nextval('public.status_history_id_seq'::regclass);


--
-- Name: visit_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_history ALTER COLUMN id SET DEFAULT nextval('public.visit_history_id_seq'::regclass);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: families families_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.families
    ADD CONSTRAINT families_code_key UNIQUE (code);


--
-- Name: families families_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.families
    ADD CONSTRAINT families_pkey PRIMARY KEY (id);


--
-- Name: family_history family_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_history
    ADD CONSTRAINT family_history_pkey PRIMARY KEY (id);


--
-- Name: family_members family_members_family_id_full_name_relationship_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_members
    ADD CONSTRAINT family_members_family_id_full_name_relationship_key UNIQUE (family_id, full_name, relationship);


--
-- Name: family_members family_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_members
    ADD CONSTRAINT family_members_pkey PRIMARY KEY (id);


--
-- Name: login_attempts login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (id);


--
-- Name: needs needs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.needs
    ADD CONSTRAINT needs_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (name);


--
-- Name: status_history status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_history
    ADD CONSTRAINT status_history_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: users users_email_format_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.users
    ADD CONSTRAINT users_email_format_check CHECK (((email)::text ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'::text)) NOT VALID;


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: visit_history visit_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_history
    ADD CONSTRAINT visit_history_pkey PRIMARY KEY (id);


--
-- Name: visit_records visit_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_records
    ADD CONSTRAINT visit_records_pkey PRIMARY KEY (id);


--
-- Name: visit_records visit_records_visit_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_records
    ADD CONSTRAINT visit_records_visit_id_key UNIQUE (visit_id);


--
-- Name: visits visits_assignment_consistency_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.visits
    ADD CONSTRAINT visits_assignment_consistency_check CHECK ((((status)::text = ANY ((ARRAY['concluida'::character varying, 'cancelada'::character varying])::text[])) OR (((status)::text = 'sem_responsavel'::text) = (assigned_to IS NULL)))) NOT VALID;


--
-- Name: visits visits_change_reason_length_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.visits
    ADD CONSTRAINT visits_change_reason_length_check CHECK (((change_reason IS NULL) OR (char_length(change_reason) <= 1000))) NOT VALID;


--
-- Name: visits visits_family_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_family_no_overlap EXCLUDE USING gist (family_id WITH =, public.visit_slot(scheduled_at) WITH &&) WHERE (((status)::text = ANY ((ARRAY['agendada'::character varying, 'reagendada'::character varying, 'sem_responsavel'::character varying])::text[])));


--
-- Name: visits visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_pkey PRIMARY KEY (id);


--
-- Name: visits visits_volunteer_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_volunteer_no_overlap EXCLUDE USING gist (assigned_to WITH =, public.visit_slot(scheduled_at) WITH &&) WHERE (((assigned_to IS NOT NULL) AND ((status)::text = ANY ((ARRAY['agendada'::character varying, 'reagendada'::character varying])::text[]))));


--
-- Name: audit_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at DESC);


--
-- Name: audit_logs_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_resource_idx ON public.audit_logs USING btree (resource_type, resource_id);


--
-- Name: audit_logs_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_user_idx ON public.audit_logs USING btree (user_id, created_at DESC);


--
-- Name: families_name_lower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX families_name_lower_idx ON public.families USING btree (lower((contact_name)::text));


--
-- Name: families_phone_digits_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX families_phone_digits_idx ON public.families USING btree (regexp_replace((COALESCE(phone, ''::character varying))::text, '\D'::text, ''::text, 'g'::text));


--
-- Name: family_history_family_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX family_history_family_idx ON public.family_history USING btree (family_id, created_at DESC);


--
-- Name: family_members_family_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX family_members_family_idx ON public.family_members USING btree (family_id);


--
-- Name: login_attempts_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_attempts_email_idx ON public.login_attempts USING btree (email_key, created_at DESC);


--
-- Name: login_attempts_ip_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_attempts_ip_idx ON public.login_attempts USING btree (ip, created_at DESC);


--
-- Name: needs_family_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX needs_family_id_idx ON public.needs USING btree (family_id);


--
-- Name: needs_priority_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX needs_priority_idx ON public.needs USING btree (priority);


--
-- Name: needs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX needs_status_idx ON public.needs USING btree (status);


--
-- Name: needs_visit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX needs_visit_idx ON public.needs USING btree (visit_id);


--
-- Name: referrals_need_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referrals_need_idx ON public.referrals USING btree (need_id);


--
-- Name: referrals_responsible_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referrals_responsible_idx ON public.referrals USING btree (responsible_user_id, status);


--
-- Name: status_history_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX status_history_entity_idx ON public.status_history USING btree (entity_type, entity_id, created_at DESC);


--
-- Name: user_sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_sessions_expires_at_idx ON public.user_sessions USING btree (expires_at);


--
-- Name: user_sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_sessions_user_id_idx ON public.user_sessions USING btree (user_id);


--
-- Name: users_email_lower_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_lower_unique ON public.users USING btree (lower((email)::text));


--
-- Name: visit_history_visit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visit_history_visit_idx ON public.visit_history USING btree (visit_id, created_at DESC);


--
-- Name: visits_assigned_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_assigned_to_idx ON public.visits USING btree (assigned_to);


--
-- Name: visits_family_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_family_id_idx ON public.visits USING btree (family_id);


--
-- Name: visits_scheduled_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_scheduled_at_idx ON public.visits USING btree (scheduled_at);


--
-- Name: visits_status_scheduled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_status_scheduled_idx ON public.visits USING btree (status, scheduled_at);


--
-- Name: audit_logs audit_logs_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_logs_append_only BEFORE DELETE OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.prevent_modification();


--
-- Name: audit_logs audit_logs_no_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON public.audit_logs FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_modification();


--
-- Name: families families_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER families_set_updated_at BEFORE UPDATE ON public.families FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: family_history family_history_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER family_history_append_only BEFORE DELETE OR UPDATE ON public.family_history FOR EACH ROW EXECUTE FUNCTION public.prevent_modification();


--
-- Name: family_history family_history_no_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER family_history_no_truncate BEFORE TRUNCATE ON public.family_history FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_modification();


--
-- Name: family_members family_members_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER family_members_set_updated_at BEFORE UPDATE ON public.family_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: needs needs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER needs_set_updated_at BEFORE UPDATE ON public.needs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: referrals referrals_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER referrals_set_updated_at BEFORE UPDATE ON public.referrals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: status_history status_history_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER status_history_append_only BEFORE DELETE OR UPDATE ON public.status_history FOR EACH ROW EXECUTE FUNCTION public.prevent_modification();


--
-- Name: status_history status_history_no_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER status_history_no_truncate BEFORE TRUNCATE ON public.status_history FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_modification();


--
-- Name: users users_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: visit_history visit_history_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER visit_history_append_only BEFORE DELETE OR UPDATE ON public.visit_history FOR EACH ROW EXECUTE FUNCTION public.prevent_modification();


--
-- Name: visit_history visit_history_no_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER visit_history_no_truncate BEFORE TRUNCATE ON public.visit_history FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_modification();


--
-- Name: visits visits_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER visits_set_updated_at BEFORE UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: families families_consent_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.families
    ADD CONSTRAINT families_consent_recorded_by_fkey FOREIGN KEY (consent_recorded_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: family_history family_history_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_history
    ADD CONSTRAINT family_history_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE RESTRICT;


--
-- Name: family_history family_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_history
    ADD CONSTRAINT family_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: family_members family_members_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_members
    ADD CONSTRAINT family_members_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE RESTRICT;


--
-- Name: needs needs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.needs
    ADD CONSTRAINT needs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: needs needs_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.needs
    ADD CONSTRAINT needs_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE RESTRICT;


--
-- Name: needs needs_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.needs
    ADD CONSTRAINT needs_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE SET NULL;


--
-- Name: referrals referrals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: referrals referrals_need_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_need_id_fkey FOREIGN KEY (need_id) REFERENCES public.needs(id) ON DELETE RESTRICT;


--
-- Name: referrals referrals_responsible_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: status_history status_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_history
    ADD CONSTRAINT status_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: visit_history visit_history_new_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_history
    ADD CONSTRAINT visit_history_new_assigned_to_fkey FOREIGN KEY (new_assigned_to) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: visit_history visit_history_old_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_history
    ADD CONSTRAINT visit_history_old_assigned_to_fkey FOREIGN KEY (old_assigned_to) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: visit_history visit_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_history
    ADD CONSTRAINT visit_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: visit_history visit_history_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_history
    ADD CONSTRAINT visit_history_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE RESTRICT;


--
-- Name: visit_records visit_records_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_records
    ADD CONSTRAINT visit_records_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: visit_records visit_records_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_records
    ADD CONSTRAINT visit_records_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE RESTRICT;


--
-- Name: visits visits_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: visits visits_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: visits visits_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--


