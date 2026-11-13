-- =============================================================================
-- SUBFASE 2A + 2B: ESQUEMA PROTEGIDO auth_internal, POLÍTICAS RLS CON FIRMA HMAC,
-- ROL app_tenant_user (NOBYPASSRLS) Y LOS 4 TRIGGERS DE INMUTABILIDAD E INTEGRIDAD
-- =============================================================================

-- 1. Crear rol de aplicación sin privilegios BYPASSRLS ni SUPERUSER
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant_user') THEN
        CREATE ROLE app_tenant_user LOGIN PASSWORD 'app_tenant_secure_pwd_2026' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    ELSE
        ALTER ROLE app_tenant_user WITH LOGIN PASSWORD 'app_tenant_secure_pwd_2026' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
END
$$;

-- 2. Crear esquema protegido auth_internal (inaccesible directamente para lectura de tablas internas por app_tenant_user)
CREATE SCHEMA IF NOT EXISTS auth_internal;
REVOKE ALL ON SCHEMA auth_internal FROM PUBLIC;
GRANT USAGE ON SCHEMA auth_internal TO app_tenant_user;

CREATE TABLE IF NOT EXISTS auth_internal.instance_secrets (
    id INT PRIMARY KEY DEFAULT 1,
    hmac_secret TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_single_row CHECK (id = 1)
);
REVOKE ALL ON TABLE auth_internal.instance_secrets FROM PUBLIC;
REVOKE ALL ON TABLE auth_internal.instance_secrets FROM app_tenant_user;

INSERT INTO auth_internal.instance_secrets (id, hmac_secret)
VALUES (1, encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;

-- Función privada que obtiene el secreto HMAC de la instancia
CREATE OR REPLACE FUNCTION auth_internal.get_instance_secret()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, auth_internal
AS $$
    SELECT hmac_secret FROM auth_internal.instance_secrets WHERE id = 1;
$$;
REVOKE ALL ON FUNCTION auth_internal.get_instance_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_internal.get_instance_secret() FROM app_tenant_user;

-- 3. Funciones verificadoras de contexto firmadas con txid_current() + HMAC-SHA256
-- Impiden que un SET LOCAL app.ctx_tenant_id manual suplante a otro tenant
CREATE OR REPLACE FUNCTION auth_internal.verified_user_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_internal
AS $$
DECLARE
    v_uid TEXT;
    v_tid TEXT;
    v_role TEXT;
    v_sig TEXT;
    v_expected_sig TEXT;
BEGIN
    v_uid  := COALESCE(current_setting('app.ctx_user_id', true), '');
    v_tid  := COALESCE(current_setting('app.ctx_tenant_id', true), '');
    v_role := COALESCE(current_setting('app.ctx_role', true), '');
    v_sig  := COALESCE(current_setting('app.ctx_sig', true), '');

    IF v_uid = '' OR v_sig = '' THEN
        RETURN NULL;
    END IF;

    v_expected_sig := encode(
        public.hmac(
            (txid_current()::text || ':' || v_uid || ':' || CASE WHEN v_tid = '' THEN 'NONE' ELSE v_tid END || ':' || CASE WHEN v_role = '' THEN 'NONE' ELSE v_role END)::bytea,
            auth_internal.get_instance_secret()::bytea,
            'sha256'
        ),
        'hex'
    );

    IF v_sig <> v_expected_sig THEN
        RETURN NULL;
    END IF;

    RETURN v_uid::uuid;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION auth_internal.verified_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_internal
AS $$
DECLARE
    v_uid UUID;
    v_tid TEXT;
BEGIN
    v_uid := auth_internal.verified_user_id();
    IF v_uid IS NULL THEN
        RETURN NULL;
    END IF;
    v_tid := COALESCE(current_setting('app.ctx_tenant_id', true), '');
    IF v_tid = '' THEN
        RETURN NULL;
    END IF;
    RETURN v_tid::uuid;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION auth_internal.verified_role_code()
RETURNS VARCHAR
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_internal
AS $$
DECLARE
    v_uid UUID;
BEGIN
    v_uid := auth_internal.verified_user_id();
    IF v_uid IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN NULLIF(current_setting('app.ctx_role', true), '');
END;
$$;

GRANT EXECUTE ON FUNCTION auth_internal.verified_user_id() TO app_tenant_user;
GRANT EXECUTE ON FUNCTION auth_internal.verified_tenant_id() TO app_tenant_user;
GRANT EXECUTE ON FUNCTION auth_internal.verified_role_code() TO app_tenant_user;

-- 4. Funciones SECURITY DEFINER acotadas para el flujo de autenticación (Sin estado LOGIN permisivo)

-- 4.1 Buscar usuario puntual por email para verificar contraseña en backend
CREATE OR REPLACE FUNCTION auth_internal.lookup_user_for_login(p_email VARCHAR)
RETURNS TABLE (
    user_id UUID,
    email VARCHAR,
    full_name VARCHAR,
    password_hash TEXT,
    status VARCHAR,
    failed_login_attempts INT,
    locked_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_internal
AS $$
BEGIN
    RETURN QUERY
    SELECT u.id, u.email, u.full_name, u.password_hash, u.status, u.failed_login_attempts, u.locked_until
      FROM public.users u
     WHERE LOWER(u.email) = LOWER(TRIM(p_email))
     LIMIT 1;
END;
$$;

-- 4.2 Registrar intento fallido de login (protección fuerza bruta)
CREATE OR REPLACE FUNCTION auth_internal.record_failed_login(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_internal
AS $$
BEGIN
    UPDATE public.users
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END,
           updated_at = now()
     WHERE id = p_user_id;
END;
$$;

-- 4.3 Crear sesión autenticada tras validar credenciales y devolver membresías activas
CREATE OR REPLACE FUNCTION auth_internal.create_authenticated_session(
    p_user_id UUID,
    p_token_hash CHAR(64),
    p_ip_address VARCHAR,
    p_user_agent TEXT,
    p_ttl_hours INT DEFAULT 12
)
RETURNS TABLE (
    session_id UUID,
    expires_at TIMESTAMPTZ,
    active_tenant_id UUID,
    active_membership_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_internal
AS $$
DECLARE
    v_session_id UUID;
    v_expires TIMESTAMPTZ;
    v_default_tenant_id UUID;
    v_default_membership_id UUID;
    v_active_count INT;
BEGIN
    UPDATE public.users
       SET failed_login_attempts = 0,
           locked_until = NULL,
           last_login_at = now(),
           updated_at = now()
     WHERE id = p_user_id AND status = 'ACTIVE';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'USER_INACTIVE_OR_NOT_FOUND' USING ERRCODE = '28000';
    END IF;

    SELECT COUNT(*)::int INTO v_active_count
      FROM public.tenant_memberships tm
      JOIN public.tenants t ON t.id = tm.tenant_id AND t.status = 'ACTIVE'
     WHERE tm.user_id = p_user_id AND tm.status = 'ACTIVE';

    -- Si tiene 1 única membresía activa o una marcada explícitamente con is_default = true, la selecciona inicialmente;
    -- Si tiene múltiples membresías sin predeterminada, inicia con active_tenant_id = NULL (requiere selección explícita).
    IF v_active_count = 1 THEN
        SELECT tm.tenant_id, tm.id
          INTO v_default_tenant_id, v_default_membership_id
          FROM public.tenant_memberships tm
          JOIN public.tenants t ON t.id = tm.tenant_id AND t.status = 'ACTIVE'
         WHERE tm.user_id = p_user_id AND tm.status = 'ACTIVE'
         LIMIT 1;
    ELSE
        SELECT tm.tenant_id, tm.id
          INTO v_default_tenant_id, v_default_membership_id
          FROM public.tenant_memberships tm
          JOIN public.tenants t ON t.id = tm.tenant_id AND t.status = 'ACTIVE'
         WHERE tm.user_id = p_user_id AND tm.status = 'ACTIVE' AND tm.is_default = true
         ORDER BY tm.created_at ASC
         LIMIT 1;
    END IF;

    v_expires := now() + (p_ttl_hours || ' hours')::interval;

    INSERT INTO public.sessions (
        user_id, active_tenant_id, membership_id, token_hash, ip_address, user_agent, expires_at, last_activity_at
    ) VALUES (
        p_user_id, v_default_tenant_id, v_default_membership_id, p_token_hash, p_ip_address, p_user_agent, v_expires, now()
    ) RETURNING id INTO v_session_id;

    IF v_default_tenant_id IS NOT NULL THEN
        INSERT INTO public.audit_logs (tenant_id, user_id, action, module, target_table, target_id, outcome, ip_address, user_agent)
        VALUES (v_default_tenant_id, p_user_id, 'AUTH_LOGIN_SUCCESS', 'AUTH', 'sessions', v_session_id, 'SUCCESS', p_ip_address, p_user_agent);
    END IF;

    RETURN QUERY SELECT v_session_id, v_expires, v_default_tenant_id, v_default_membership_id;
END;
$$;

-- 4.4 Activar contexto RLS por transacción a partir del token_hash de sesión
CREATE OR REPLACE FUNCTION auth_internal.activate_session_context(p_token_hash CHAR(64))
RETURNS TABLE (
    session_id UUID,
    user_id UUID,
    user_email VARCHAR,
    user_full_name VARCHAR,
    tenant_id UUID,
    tenant_name VARCHAR,
    tenant_slug VARCHAR,
    membership_id UUID,
    role_code VARCHAR,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_internal
AS $$
DECLARE
    v_session_id UUID;
    v_user_id UUID;
    v_email VARCHAR;
    v_full_name VARCHAR;
    v_tenant_id UUID;
    v_tenant_name VARCHAR;
    v_tenant_slug VARCHAR;
    v_membership_id UUID;
    v_role_code VARCHAR;
    v_expires TIMESTAMPTZ;
    v_sig TEXT;
BEGIN
    SELECT s.id, s.user_id, u.email, u.full_name, s.active_tenant_id, t.name, t.slug, s.membership_id, r.code, s.expires_at
      INTO v_session_id, v_user_id, v_email, v_full_name, v_tenant_id, v_tenant_name, v_tenant_slug, v_membership_id, v_role_code, v_expires
      FROM public.sessions s
      JOIN public.users u ON u.id = s.user_id AND u.status = 'ACTIVE'
      LEFT JOIN public.tenant_memberships tm ON tm.id = s.membership_id AND tm.user_id = s.user_id AND tm.status = 'ACTIVE'
      LEFT JOIN public.tenants t ON t.id = tm.tenant_id AND t.status = 'ACTIVE'
      LEFT JOIN public.roles r ON r.id = tm.role_id
     WHERE s.token_hash = p_token_hash
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND s.last_activity_at + interval '60 minutes' > now();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_OR_EXPIRED_SESSION' USING ERRCODE = '28000';
    END IF;

    UPDATE public.sessions SET last_activity_at = now() WHERE id = v_session_id;

    v_sig := encode(
        public.hmac(
            (txid_current()::text || ':' || v_user_id::text || ':' || COALESCE(v_tenant_id::text, 'NONE') || ':' || COALESCE(v_role_code, 'NONE'))::bytea,
            auth_internal.get_instance_secret()::bytea,
            'sha256'
        ),
        'hex'
    );

    PERFORM set_config('app.ctx_user_id', v_user_id::text, true);
    PERFORM set_config('app.ctx_tenant_id', COALESCE(v_tenant_id::text, ''), true);
    PERFORM set_config('app.ctx_role', COALESCE(v_role_code, ''), true);
    PERFORM set_config('app.ctx_sig', v_sig, true);

    RETURN QUERY SELECT v_session_id, v_user_id, v_email, v_full_name, v_tenant_id, v_tenant_name, v_tenant_slug, v_membership_id, v_role_code, v_expires;
END;
$$;

-- 4.5 Cambiar el tenant activo de la sesión validando membresía real
CREATE OR REPLACE FUNCTION auth_internal.switch_session_tenant(p_token_hash CHAR(64), p_target_tenant_id UUID)
RETURNS TABLE (
    tenant_id UUID,
    tenant_name VARCHAR,
    tenant_slug VARCHAR,
    membership_id UUID,
    role_code VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_internal
AS $$
DECLARE
    v_session_id UUID;
    v_user_id UUID;
    v_old_tenant_id UUID;
    v_membership_id UUID;
    v_tenant_name VARCHAR;
    v_tenant_slug VARCHAR;
    v_role_code VARCHAR;
BEGIN
    SELECT s.id, s.user_id, s.active_tenant_id
      INTO v_session_id, v_user_id, v_old_tenant_id
      FROM public.sessions s
      JOIN public.users u ON u.id = s.user_id AND u.status = 'ACTIVE'
     WHERE s.token_hash = p_token_hash
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND s.last_activity_at + interval '60 minutes' > now();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_OR_EXPIRED_SESSION' USING ERRCODE = '28000';
    END IF;

    SELECT tm.id, t.name, t.slug, r.code
      INTO v_membership_id, v_tenant_name, v_tenant_slug, v_role_code
      FROM public.tenant_memberships tm
      JOIN public.tenants t ON t.id = tm.tenant_id AND t.status = 'ACTIVE'
      JOIN public.roles r ON r.id = tm.role_id
     WHERE tm.user_id = v_user_id
       AND tm.tenant_id = p_target_tenant_id
       AND tm.status = 'ACTIVE';

    IF v_membership_id IS NULL THEN
        IF v_old_tenant_id IS NOT NULL THEN
            INSERT INTO public.audit_logs (tenant_id, user_id, action, module, target_table, target_id, outcome, new_values)
            VALUES (v_old_tenant_id, v_user_id, 'TENANT_SWITCH_DENIED', 'AUTH', 'tenants', p_target_tenant_id, 'DENIED', jsonb_build_object('attemptedTenantId', p_target_tenant_id));
        END IF;
        RAISE EXCEPTION 'FORBIDDEN_TENANT_MEMBERSHIP' USING ERRCODE = '42501';
    END IF;

    UPDATE public.sessions
       SET active_tenant_id = p_target_tenant_id,
           membership_id = v_membership_id,
           last_activity_at = now()
     WHERE id = v_session_id;

    INSERT INTO public.audit_logs (tenant_id, user_id, action, module, target_table, target_id, outcome)
    VALUES (p_target_tenant_id, v_user_id, 'TENANT_SWITCH_SUCCESS', 'AUTH', 'tenants', p_target_tenant_id, 'SUCCESS');

    RETURN QUERY SELECT p_target_tenant_id, v_tenant_name, v_tenant_slug, v_membership_id, v_role_code;
END;
$$;

-- 4.6 Revocar sesión actual o todas las sesiones del usuario
CREATE OR REPLACE FUNCTION auth_internal.revoke_session(p_token_hash CHAR(64), p_revoke_all BOOLEAN DEFAULT false, p_reason VARCHAR DEFAULT 'USER_LOGOUT')
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_internal
AS $$
DECLARE
    v_user_id UUID;
    v_tenant_id UUID;
    v_session_id UUID;
    v_count INT;
BEGIN
    SELECT id, user_id, active_tenant_id INTO v_session_id, v_user_id, v_tenant_id
      FROM public.sessions
     WHERE token_hash = p_token_hash AND revoked_at IS NULL;

    IF v_user_id IS NULL THEN
        RETURN 0;
    END IF;

    IF p_revoke_all THEN
        UPDATE public.sessions
           SET revoked_at = now(), revoked_reason = p_reason
         WHERE user_id = v_user_id AND revoked_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
    ELSE
        UPDATE public.sessions
           SET revoked_at = now(), revoked_reason = p_reason
         WHERE id = v_session_id AND revoked_at IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
    END IF;

    IF v_tenant_id IS NOT NULL THEN
        INSERT INTO public.audit_logs (tenant_id, user_id, action, module, target_table, target_id, outcome, new_values)
        VALUES (v_tenant_id, v_user_id, CASE WHEN p_revoke_all THEN 'AUTH_REVOKE_ALL_SESSIONS' ELSE 'AUTH_LOGOUT' END, 'AUTH', 'sessions', v_session_id, 'SUCCESS', jsonb_build_object('revokedCount', v_count));
    END IF;

    RETURN v_count;
END;
$$;

-- 4.7 Listar membresías activas del usuario autenticado
CREATE OR REPLACE FUNCTION auth_internal.list_user_memberships(p_user_id UUID)
RETURNS TABLE (
    membership_id UUID,
    tenant_id UUID,
    tenant_name VARCHAR,
    tenant_slug VARCHAR,
    role_code VARCHAR,
    is_default BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_internal
AS $$
BEGIN
    RETURN QUERY
    SELECT tm.id, t.id, t.name, t.slug, r.code, tm.is_default
      FROM public.tenant_memberships tm
      JOIN public.tenants t ON t.id = tm.tenant_id AND t.status = 'ACTIVE'
      JOIN public.roles r ON r.id = tm.role_id
     WHERE tm.user_id = p_user_id AND tm.status = 'ACTIVE'
     ORDER BY tm.is_default DESC, t.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION auth_internal.lookup_user_for_login(VARCHAR) TO app_tenant_user;
GRANT EXECUTE ON FUNCTION auth_internal.record_failed_login(UUID) TO app_tenant_user;
GRANT EXECUTE ON FUNCTION auth_internal.create_authenticated_session(UUID, CHAR(64), VARCHAR, TEXT, INT) TO app_tenant_user;
GRANT EXECUTE ON FUNCTION auth_internal.activate_session_context(CHAR(64)) TO app_tenant_user;
GRANT EXECUTE ON FUNCTION auth_internal.switch_session_tenant(CHAR(64), UUID) TO app_tenant_user;
GRANT EXECUTE ON FUNCTION auth_internal.revoke_session(CHAR(64), BOOLEAN, VARCHAR) TO app_tenant_user;
GRANT EXECUTE ON FUNCTION auth_internal.list_user_memberships(UUID) TO app_tenant_user;

-- =============================================================================
-- 5. HABILITACIÓN DE ROW LEVEL SECURITY (ENABLE + FORCE) EN LAS 41 TABLAS
-- =============================================================================

DO $$
DECLARE
    v_tbl TEXT;
BEGIN
    FOR v_tbl IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_schema_migrations'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', v_tbl);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', v_tbl);
    END LOOP;
END;
$$;

-- 5.1 Políticas RLS Grupo 1: Autenticación y Permisos (#01 a #07)
CREATE POLICY rls_tenants_select ON public.tenants
    FOR SELECT TO app_tenant_user
    USING (
        id = auth_internal.verified_tenant_id()
        OR id IN (
            SELECT tm.tenant_id FROM public.tenant_memberships tm
             WHERE tm.user_id = auth_internal.verified_user_id() AND tm.status = 'ACTIVE'
        )
    );

CREATE POLICY rls_users_self ON public.users
    FOR SELECT TO app_tenant_user
    USING (id = auth_internal.verified_user_id());

CREATE POLICY rls_roles_read ON public.roles
    FOR SELECT TO app_tenant_user USING (auth_internal.verified_user_id() IS NOT NULL);

CREATE POLICY rls_permissions_read ON public.permissions
    FOR SELECT TO app_tenant_user USING (auth_internal.verified_user_id() IS NOT NULL);

CREATE POLICY rls_role_permissions_read ON public.role_permissions
    FOR SELECT TO app_tenant_user USING (auth_internal.verified_user_id() IS NOT NULL);

CREATE POLICY rls_tenant_memberships_select ON public.tenant_memberships
    FOR SELECT TO app_tenant_user
    USING (
        user_id = auth_internal.verified_user_id()
        OR tenant_id = auth_internal.verified_tenant_id()
    );

CREATE POLICY rls_tenant_memberships_manage ON public.tenant_memberships
    FOR ALL TO app_tenant_user
    USING (
        tenant_id = auth_internal.verified_tenant_id()
        AND auth_internal.verified_role_code() IN ('OWNER', 'ADMIN')
    )
    WITH CHECK (
        tenant_id = auth_internal.verified_tenant_id()
        AND auth_internal.verified_role_code() IN ('OWNER', 'ADMIN')
    );

CREATE POLICY rls_sessions_self ON public.sessions
    FOR SELECT TO app_tenant_user
    USING (user_id = auth_internal.verified_user_id());

-- 5.2 Políticas RLS Grupo 2: Catálogos Híbridos (#08 a #17)
-- Lectura permitida si tenant_id IS NULL (Catálogo Global) o si coincide con verified_tenant_id()
-- Escritura permitida ÚNICAMENTE para catálogos privados del propio tenant (tenant_id = verified_tenant_id())
DO $$
DECLARE
    v_cat_tbl TEXT;
BEGIN
    FOREACH v_cat_tbl IN ARRAY ARRAY[
        'collective_agreements',
        'agreement_branches',
        'agreement_categories',
        'salary_scales',
        'salary_scale_items',
        'payroll_concepts',
        'payroll_rules',
        'system_parameters',
        'holiday_calendars',
        'payroll_novelty_types'
    ]
    LOOP
        EXECUTE format(
            'CREATE POLICY rls_%I_select ON public.%I FOR SELECT TO app_tenant_user USING (auth_internal.verified_user_id() IS NOT NULL AND (tenant_id IS NULL OR tenant_id = auth_internal.verified_tenant_id()));',
            v_cat_tbl, v_cat_tbl
        );
        EXECUTE format(
            'CREATE POLICY rls_%I_write ON public.%I FOR ALL TO app_tenant_user USING (tenant_id IS NOT NULL AND tenant_id = auth_internal.verified_tenant_id()) WITH CHECK (tenant_id IS NOT NULL AND tenant_id = auth_internal.verified_tenant_id());',
            v_cat_tbl, v_cat_tbl
        );
    END LOOP;
END;
$$;

-- 5.3 Políticas RLS Grupos 3 y 4: Tablas Operativas y Maestras Privadas (#18 a #41)
DO $$
DECLARE
    v_priv_tbl TEXT;
BEGIN
    FOREACH v_priv_tbl IN ARRAY ARRAY[
        'companies',
        'company_versions',
        'company_branches',
        'company_agreements',
        'employees',
        'employee_versions',
        'employee_family_members',
        'employee_employment_history',
        'employee_leaves',
        'documents',
        'import_staging_batches',
        'import_staging_rows',
        'employee_custom_parameters',
        'payroll_periods',
        'payroll_novelties',
        'payrolls',
        'payslips',
        'payslip_versions',
        'payroll_items',
        'payroll_deductions',
        'employer_contributions',
        'arca_concept_mappings',
        'arca_exports',
        'audit_logs'
    ]
    LOOP
        EXECUTE format(
            'CREATE POLICY rls_%I_tenant_isolation ON public.%I FOR ALL TO app_tenant_user USING (tenant_id = auth_internal.verified_tenant_id()) WITH CHECK (tenant_id = auth_internal.verified_tenant_id());',
            v_priv_tbl, v_priv_tbl
        );
    END LOOP;
END;
$$;

-- =============================================================================
-- 6. TRIGGERS DE INTEGRIDAD PARA CATÁLOGOS HÍBRIDOS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validate_hybrid_catalog_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_ref_tenant UUID;
BEGIN
    -- Verifica que el convenio referenciado sea global (NULL) o pertenezca al mismo tenant del registro
    IF TG_TABLE_NAME IN ('agreement_branches', 'agreement_categories', 'salary_scales', 'company_agreements', 'employee_versions') THEN
        SELECT tenant_id INTO v_ref_tenant FROM public.collective_agreements WHERE id = NEW.agreement_id;
        IF v_ref_tenant IS NOT NULL AND (NEW.tenant_id IS NULL OR v_ref_tenant <> NEW.tenant_id) THEN
            RAISE EXCEPTION 'HYBRID_CATALOG_TENANT_MISMATCH: El convenio (%) pertenece a otro tenant.', NEW.agreement_id
                USING ERRCODE = '23503';
        END IF;
    END IF;

    IF TG_TABLE_NAME IN ('payroll_rules', 'payroll_items', 'payroll_deductions', 'employer_contributions', 'arca_concept_mappings') THEN
        SELECT tenant_id INTO v_ref_tenant FROM public.payroll_concepts WHERE id = NEW.concept_id;
        IF v_ref_tenant IS NOT NULL AND (NEW.tenant_id IS NULL OR v_ref_tenant <> NEW.tenant_id) THEN
            RAISE EXCEPTION 'HYBRID_CATALOG_TENANT_MISMATCH: El concepto (%) pertenece a otro tenant.', NEW.concept_id
                USING ERRCODE = '23503';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hybrid_cat_branches BEFORE INSERT OR UPDATE ON public.agreement_branches FOR EACH ROW EXECUTE FUNCTION public.validate_hybrid_catalog_ownership();
CREATE TRIGGER trg_hybrid_cat_categories BEFORE INSERT OR UPDATE ON public.agreement_categories FOR EACH ROW EXECUTE FUNCTION public.validate_hybrid_catalog_ownership();
CREATE TRIGGER trg_hybrid_cat_scales BEFORE INSERT OR UPDATE ON public.salary_scales FOR EACH ROW EXECUTE FUNCTION public.validate_hybrid_catalog_ownership();
CREATE TRIGGER trg_hybrid_cat_comp_agr BEFORE INSERT OR UPDATE ON public.company_agreements FOR EACH ROW EXECUTE FUNCTION public.validate_hybrid_catalog_ownership();
CREATE TRIGGER trg_hybrid_cat_emp_ver BEFORE INSERT OR UPDATE ON public.employee_versions FOR EACH ROW EXECUTE FUNCTION public.validate_hybrid_catalog_ownership();
CREATE TRIGGER trg_hybrid_cat_rules BEFORE INSERT OR UPDATE ON public.payroll_rules FOR EACH ROW EXECUTE FUNCTION public.validate_hybrid_catalog_ownership();
CREATE TRIGGER trg_hybrid_cat_items BEFORE INSERT OR UPDATE ON public.payroll_items FOR EACH ROW EXECUTE FUNCTION public.validate_hybrid_catalog_ownership();
CREATE TRIGGER trg_hybrid_cat_deductions BEFORE INSERT OR UPDATE ON public.payroll_deductions FOR EACH ROW EXECUTE FUNCTION public.validate_hybrid_catalog_ownership();
CREATE TRIGGER trg_hybrid_cat_contribs BEFORE INSERT OR UPDATE ON public.employer_contributions FOR EACH ROW EXECUTE FUNCTION public.validate_hybrid_catalog_ownership();
CREATE TRIGGER trg_hybrid_cat_arca_map BEFORE INSERT OR UPDATE ON public.arca_concept_mappings FOR EACH ROW EXECUTE FUNCTION public.validate_hybrid_catalog_ownership();

-- =============================================================================
-- 7. LOS 4 TRIGGERS DE INMUTABILIDAD HISTÓRICA
-- =============================================================================

-- Trigger 1A: Bloqueo de UPDATE y DELETE sobre payrolls aprobados/inmutables
CREATE OR REPLACE FUNCTION public.prevent_approved_payroll_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_immutable = true OR OLD.status IN ('APPROVED', 'RECTIFIED') THEN
            RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: No se permite eliminar una liquidación histórica aprobada (id=%).', OLD.id
                USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.is_immutable = true OR OLD.status IN ('APPROVED', 'RECTIFIED') THEN
            -- Única transición permitida: marcar status = 'RECTIFIED' sin tocar importes ni snapshot
            IF NEW.status = 'RECTIFIED'
               AND NEW.total_net_pay = OLD.total_net_pay
               AND NEW.total_remunerative = OLD.total_remunerative
               AND NEW.total_non_remunerative = OLD.total_non_remunerative
               AND NEW.total_deductions = OLD.total_deductions
               AND NEW.global_context_snapshot = OLD.global_context_snapshot
               AND NEW.is_immutable = OLD.is_immutable THEN
                RETURN NEW;
            END IF;
            RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: No se permite alterar una liquidación aprobada (id=%). Emita una liquidación rectificativa.', OLD.id
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger 1B: Bloqueo de UPDATE y DELETE sobre payslips aprobados
CREATE OR REPLACE FUNCTION public.prevent_approved_payslip_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('APPROVED', 'ISSUED', 'RECTIFIED') THEN
            RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: No se permite eliminar un recibo histórico aprobado (id=%).', OLD.id
                USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.status IN ('APPROVED', 'ISSUED', 'RECTIFIED') THEN
            IF NEW.status IN ('ISSUED', 'RECTIFIED')
               AND NEW.receipt_code = OLD.receipt_code
               AND NEW.employee_id = OLD.employee_id
               AND NEW.payroll_id = OLD.payroll_id THEN
                RETURN NEW;
            END IF;
            RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: No se permite alterar un recibo aprobado (id=%).', OLD.id
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger 1C: Bloqueo de UPDATE y DELETE sobre payslip_versions inmutables
CREATE OR REPLACE FUNCTION public.prevent_immutable_payslip_version_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_immutable = true THEN
            RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: No se permite eliminar una versión de recibo aprobada e inmutable (id=%).', OLD.id
                USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.is_immutable = true THEN
            RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: No se permite modificar una versión de recibo aprobada e inmutable (id=%).', OLD.id
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_immutable_payrolls
    BEFORE UPDATE OR DELETE ON public.payrolls
    FOR EACH ROW EXECUTE FUNCTION public.prevent_approved_payroll_mutation();

CREATE TRIGGER trg_immutable_payslips
    BEFORE UPDATE OR DELETE ON public.payslips
    FOR EACH ROW EXECUTE FUNCTION public.prevent_approved_payslip_mutation();

CREATE TRIGGER trg_immutable_payslip_versions
    BEFORE UPDATE OR DELETE ON public.payslip_versions
    FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_payslip_version_mutation();

-- Trigger 2: Bloqueo de INSERT/UPDATE/DELETE en detalles (payroll_items, payroll_deductions, employer_contributions)
CREATE OR REPLACE FUNCTION public.prevent_payslip_detail_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_parent_immutable BOOLEAN;
    v_pv_id UUID;
BEGIN
    v_pv_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.payslip_version_id ELSE NEW.payslip_version_id END;
    SELECT is_immutable INTO v_parent_immutable FROM public.payslip_versions WHERE id = v_pv_id;

    IF v_parent_immutable = true THEN
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: No se permite alterar el detalle (%) de un recibo inmutable (payslip_version_id=%).', TG_TABLE_NAME, v_pv_id
            USING ERRCODE = '23514';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER trg_immutable_payroll_items
    BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_items
    FOR EACH ROW EXECUTE FUNCTION public.prevent_payslip_detail_mutation();

CREATE TRIGGER trg_immutable_payroll_deductions
    BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_deductions
    FOR EACH ROW EXECUTE FUNCTION public.prevent_payslip_detail_mutation();

CREATE TRIGGER trg_immutable_employer_contributions
    BEFORE INSERT OR UPDATE OR DELETE ON public.employer_contributions
    FOR EACH ROW EXECUTE FUNCTION public.prevent_payslip_detail_mutation();

-- Trigger 3: Bloqueo de mutación/eliminación de documentos históricos inmutables
CREATE OR REPLACE FUNCTION public.prevent_immutable_document_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.is_immutable = true THEN
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: El documento id=% (tipo=%) es inmutable y no puede modificarse ni eliminarse.', OLD.id, OLD.document_type
            USING ERRCODE = '23514';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER trg_immutable_documents
    BEFORE UPDATE OR DELETE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_document_mutation();

-- Trigger 4: Bloqueo de alteración o eliminación de registros de auditoría (audit_logs append-only)
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: Los registros de auditoría (audit_logs) son inmutables y de solo adición.'
        USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER trg_immutable_audit_logs
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- Permisos de tablas públicas para app_tenant_user (sujetos siempre a las políticas RLS y triggers)
GRANT USAGE ON SCHEMA public TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_tenant_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_tenant_user;
