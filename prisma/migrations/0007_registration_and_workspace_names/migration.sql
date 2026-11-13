INSERT INTO public.roles (code, name, description)
VALUES ('ADMIN', 'Administrador', 'Administración operativa del espacio de trabajo.')
ON CONFLICT (code) DO NOTHING;

UPDATE public.tenants
   SET name = CASE slug
       WHEN 'estudio-papa' THEN 'CR. Alejandro Leal'
       WHEN 'estudio-socio' THEN 'CR. Jorge Lopez'
       ELSE name
   END
 WHERE slug IN ('estudio-papa', 'estudio-socio');

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
    v_role_id UUID;
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
    SELECT id INTO v_role_id FROM public.roles WHERE code = 'ADMIN';
    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'ADMIN_ROLE_NOT_CONFIGURED' USING ERRCODE = '55000';
    END IF;

    INSERT INTO public.users (email, username, full_name, password_hash, status)
    VALUES (v_username || '@local.ar', v_username, v_full_name, p_password_hash, 'ACTIVE')
    RETURNING id INTO v_user_id;
    INSERT INTO public.tenant_memberships (tenant_id, user_id, role_id, invited_by, status, is_default)
    VALUES (v_tenant_id, v_user_id, v_role_id, auth_internal.verified_user_id(), 'ACTIVE', true);
    RETURN QUERY SELECT v_user_id, v_username, v_full_name, v_tenant_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'USERNAME_ALREADY_EXISTS' USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION auth_internal.register_user_for_tenant(
    p_tenant_slug VARCHAR,
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
    v_role_id UUID;
    v_username VARCHAR := LOWER(TRIM(p_username));
    v_full_name VARCHAR := CONCAT(TRIM(p_first_name), ' ', TRIM(p_last_name));
BEGIN
    SELECT id INTO v_tenant_id FROM public.tenants
     WHERE slug = LOWER(TRIM(p_tenant_slug)) AND status = 'ACTIVE';
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'WORKSPACE_NOT_FOUND' USING ERRCODE = '22023';
    END IF;
    SELECT id INTO v_role_id FROM public.roles WHERE code = 'ADMIN';
    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'ADMIN_ROLE_NOT_CONFIGURED' USING ERRCODE = '55000';
    END IF;

    INSERT INTO public.users (email, username, full_name, password_hash, status)
    VALUES (v_username || '@local.ar', v_username, v_full_name, p_password_hash, 'ACTIVE')
    RETURNING id INTO v_user_id;
    INSERT INTO public.tenant_memberships (tenant_id, user_id, role_id, status, is_default)
    VALUES (v_tenant_id, v_user_id, v_role_id, 'ACTIVE', true);
    RETURN QUERY SELECT v_user_id, v_username, v_full_name, v_tenant_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'USERNAME_ALREADY_EXISTS' USING ERRCODE = '23505';
END;
$$;

GRANT EXECUTE ON FUNCTION auth_internal.create_managed_user(VARCHAR, VARCHAR, VARCHAR, TEXT) TO app_tenant_user;
GRANT EXECUTE ON FUNCTION auth_internal.register_user_for_tenant(VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT) TO app_tenant_user;

INSERT INTO public.tenant_memberships (tenant_id, user_id, role_id, invited_by, status, is_default)
SELECT t.id, u.id, r.id, master.id, 'ACTIVE', true
  FROM public.users u
  JOIN public.tenants t ON t.slug = 'estudio-papa' AND t.status = 'ACTIVE'
  JOIN public.roles r ON r.code = 'ADMIN'
  JOIN public.users master ON master.email = LOWER('felileal.dev@gmail.com')
 WHERE u.username = 'aleleal'
   AND NOT EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.user_id = u.id);
