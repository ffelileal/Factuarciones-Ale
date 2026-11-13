CREATE OR REPLACE FUNCTION auth_internal.remove_managed_user(p_user_id UUID)
RETURNS TABLE (removed_user_id UUID, user_status VARCHAR)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth_internal
AS $$
DECLARE
    v_tenant_id UUID := auth_internal.verified_tenant_id();
    v_role_code VARCHAR;
    v_membership_count INT;
BEGIN
    IF auth_internal.verified_role_code() <> 'OWNER' THEN
        RAISE EXCEPTION 'FORBIDDEN_USER_MANAGEMENT' USING ERRCODE = '42501';
    END IF;
    IF p_user_id = auth_internal.verified_user_id() THEN
        RAISE EXCEPTION 'CANNOT_REMOVE_SELF' USING ERRCODE = '42501';
    END IF;

    SELECT r.code INTO v_role_code
      FROM public.tenant_memberships tm
      JOIN public.roles r ON r.id = tm.role_id
     WHERE tm.user_id = p_user_id
       AND tm.tenant_id = v_tenant_id
       AND tm.status = 'ACTIVE';
    IF v_role_code IS NULL THEN
        RAISE EXCEPTION 'USER_NOT_FOUND_IN_WORKSPACE' USING ERRCODE = '22023';
    END IF;
    IF v_role_code = 'OWNER' THEN
        RAISE EXCEPTION 'CANNOT_REMOVE_OWNER' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.sessions WHERE user_id = p_user_id;
    DELETE FROM public.tenant_memberships
     WHERE user_id = p_user_id AND tenant_id = v_tenant_id;

    SELECT COUNT(*)::int INTO v_membership_count
      FROM public.tenant_memberships
     WHERE user_id = p_user_id AND status = 'ACTIVE';
    IF v_membership_count = 0 THEN
        UPDATE public.users SET status = 'SUSPENDED', updated_at = now()
         WHERE id = p_user_id;
    END IF;

    RETURN QUERY
    SELECT p_user_id, u.status
      FROM public.users u
     WHERE u.id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION auth_internal.remove_managed_user(UUID) TO app_tenant_user;
