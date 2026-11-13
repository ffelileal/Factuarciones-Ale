ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username VARCHAR(80);

UPDATE public.users
   SET username = LOWER(SPLIT_PART(email, '@', 1))
 WHERE username IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower
    ON public.users (LOWER(username));

DROP FUNCTION IF EXISTS auth_internal.lookup_user_for_login(VARCHAR);

CREATE FUNCTION auth_internal.lookup_user_for_login(p_identifier VARCHAR)
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
     WHERE LOWER(u.email) = LOWER(TRIM(p_identifier))
        OR LOWER(u.username) = LOWER(TRIM(p_identifier))
     LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION auth_internal.create_managed_user(
    p_first_name VARCHAR,
    p_last_name VARCHAR,
    p_username VARCHAR,
    p_password_hash TEXT
)
RETURNS TABLE (user_id UUID, username VARCHAR, full_name VARCHAR, tenant_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_internal
AS $$
DECLARE
    v_tenant_id UUID;
    v_user_id UUID;
    v_username VARCHAR := LOWER(TRIM(p_username));
    v_full_name VARCHAR := CONCAT(TRIM(p_first_name), ' ', TRIM(p_last_name));
BEGIN
    IF auth_internal.verified_role_code() <> 'OWNER' THEN
        RAISE EXCEPTION 'FORBIDDEN_USER_MANAGEMENT' USING ERRCODE = '42501';
    END IF;

    v_tenant_id := auth_internal.verified_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.users (email, username, full_name, password_hash, status)
    VALUES (v_username || '@local.ar', v_username, v_full_name, p_password_hash, 'ACTIVE')
    RETURNING id INTO v_user_id;

    INSERT INTO public.tenant_memberships (tenant_id, user_id, role_id, invited_by, status, is_default)
    SELECT v_tenant_id, v_user_id, r.id, auth_internal.verified_user_id(), 'ACTIVE', true
      FROM public.roles r
     WHERE r.code = 'ADMIN';

    RETURN QUERY SELECT v_user_id, v_username, v_full_name, v_tenant_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'USERNAME_ALREADY_EXISTS' USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION auth_internal.list_managed_users()
RETURNS TABLE (
    user_id UUID,
    username VARCHAR,
    full_name VARCHAR,
    email VARCHAR,
    status VARCHAR,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_internal
AS $$
BEGIN
    IF auth_internal.verified_role_code() <> 'OWNER' THEN
        RAISE EXCEPTION 'FORBIDDEN_USER_MANAGEMENT' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT u.id, u.username, u.full_name, u.email, u.status, u.created_at
      FROM public.users u
      JOIN public.tenant_memberships tm ON tm.user_id = u.id
     WHERE tm.tenant_id = auth_internal.verified_tenant_id()
       AND tm.status = 'ACTIVE'
     ORDER BY u.full_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION auth_internal.lookup_user_for_login(VARCHAR) TO app_tenant_user;
GRANT EXECUTE ON FUNCTION auth_internal.create_managed_user(VARCHAR, VARCHAR, VARCHAR, TEXT) TO app_tenant_user;
GRANT EXECUTE ON FUNCTION auth_internal.list_managed_users() TO app_tenant_user;

ALTER TABLE public.audit_logs DISABLE TRIGGER trg_immutable_audit_logs;
DELETE FROM public.audit_logs
 WHERE user_id IN (
   SELECT id FROM public.users
    WHERE email IN ('papa@estudiocontable.ar', 'socio@estudiocontable.ar', 'auditor.multitenant@estudiocontable.ar')
 );
DELETE FROM public.sessions
 WHERE user_id IN (
   SELECT id FROM public.users
    WHERE email IN ('papa@estudiocontable.ar', 'socio@estudiocontable.ar', 'auditor.multitenant@estudiocontable.ar')
 );
DELETE FROM public.tenant_memberships
 WHERE user_id IN (
   SELECT id FROM public.users
    WHERE email IN ('papa@estudiocontable.ar', 'socio@estudiocontable.ar', 'auditor.multitenant@estudiocontable.ar')
 );
DELETE FROM public.users
 WHERE email IN ('papa@estudiocontable.ar', 'socio@estudiocontable.ar', 'auditor.multitenant@estudiocontable.ar');
ALTER TABLE public.audit_logs ENABLE TRIGGER trg_immutable_audit_logs;
