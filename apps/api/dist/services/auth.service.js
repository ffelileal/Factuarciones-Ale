import crypto from 'node:crypto';
import pg from 'pg';
import { tenantPool, withAuthenticatedTransaction, hashSessionToken, AuthenticationError, } from '../db/pool.js';
const SCRYPT_KEYLEN = 64;
export function hashPassword(plainPassword) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(plainPassword, salt, SCRYPT_KEYLEN).toString('hex');
    return `scrypt$${salt}$${derived}`;
}
export function verifyPassword(plainPassword, storedHash) {
    const parts = storedHash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
        return false;
    }
    const [, salt, expectedHex] = parts;
    const derived = crypto.scryptSync(plainPassword, salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) {
        return false;
    }
    return crypto.timingSafeEqual(derived, expected);
}
const ROLE_NAMES = {
    OWNER: 'Titular del Espacio de Trabajo',
    ADMIN: 'Administrador',
    LIQUIDATOR: 'Liquidador',
    VIEWER: 'Consulta',
};
export class AuthService {
    async login(params) {
        const client = await tenantPool.connect();
        try {
            await client.query('BEGIN');
            const lookup = await client.query('SELECT * FROM auth_internal.lookup_user_for_login($1)', [params.email]);
            if (lookup.rowCount === 0) {
                throw new AuthenticationError('Credenciales inválidas.');
            }
            const user = lookup.rows[0];
            if (user.status !== 'ACTIVE') {
                throw new AuthenticationError('La cuenta de usuario se encuentra suspendida o inactiva.', 403);
            }
            const validPassword = verifyPassword(params.password, user.password_hash);
            if (!validPassword) {
                await client.query('SELECT auth_internal.record_failed_login($1)', [user.user_id]);
                await client.query('COMMIT');
                throw new AuthenticationError('Credenciales inválidas.');
            }
            const rawToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = hashSessionToken(rawToken);
            const sessionRes = await client.query('SELECT * FROM auth_internal.create_authenticated_session($1, $2, $3, $4, 12)', [
                user.user_id,
                tokenHash,
                params.ipAddress ?? '127.0.0.1',
                params.deviceName ?? 'Tauri Desktop Client',
            ]);
            const sessionRow = sessionRes.rows[0];
            const membershipsRes = await client.query('SELECT * FROM auth_internal.list_user_memberships($1)', [user.user_id]);
            const memberships = membershipsRes.rows.map((r) => ({
                membershipId: r.membership_id,
                tenantId: r.tenant_id,
                tenantSlug: r.tenant_slug,
                tenantDisplayName: r.tenant_name,
                roleCode: r.role_code,
                roleName: ROLE_NAMES[r.role_code] ?? r.role_code,
            }));
            await client.query('COMMIT');
            return {
                sessionToken: rawToken,
                expiresAt: new Date(sessionRow.expires_at).toISOString(),
                user: {
                    id: user.user_id,
                    email: user.email,
                    fullName: user.full_name,
                },
                activeTenantId: sessionRow.active_tenant_id,
                requiresTenantSelection: sessionRow.active_tenant_id === null,
                memberships,
            };
        }
        catch (err) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw err;
        }
        finally {
            client.release();
        }
    }
    async selectWorkspace(rawToken, targetTenantId) {
        const tokenHash = hashSessionToken(rawToken);
        const client = await tenantPool.connect();
        try {
            await client.query('BEGIN');
            const res = await client.query('SELECT * FROM auth_internal.switch_session_tenant($1, $2)', [
                tokenHash,
                targetTenantId,
            ]);
            const row = res.rows[0];
            await client.query('COMMIT');
            return {
                activeTenantId: row.tenant_id,
                roleCode: row.role_code,
            };
        }
        catch (err) {
            await client.query('ROLLBACK').catch(() => undefined);
            if (err instanceof pg.DatabaseError) {
                if (err.message.includes('FORBIDDEN_TENANT_MEMBERSHIP')) {
                    throw new AuthenticationError('Acceso denegado: el usuario autenticado no posee membresía activa en el espacio de trabajo solicitado.', 403);
                }
                if (err.message.includes('INVALID_OR_EXPIRED_SESSION')) {
                    throw new AuthenticationError('Sesión inválida, expirada o revocada.', 401);
                }
            }
            throw err;
        }
        finally {
            client.release();
        }
    }
    async getMe(rawToken) {
        return withAuthenticatedTransaction(rawToken, false, async (client, ctx) => {
            const membershipsRes = await client.query('SELECT * FROM auth_internal.list_user_memberships($1)', [ctx.userId]);
            const rlsVerification = await client.query(`SELECT current_user AS current_db_user,
                auth_internal.verified_tenant_id()::text AS verified_tenant_id,
                auth_internal.verified_user_id()::text AS verified_user_id`);
            return {
                user: {
                    id: ctx.userId,
                    email: ctx.userEmail,
                    fullName: ctx.userFullName,
                },
                activeTenantId: ctx.activeTenantId,
                roleCode: ctx.roleCode,
                requiresTenantSelection: ctx.activeTenantId === null,
                memberships: membershipsRes.rows.map((r) => ({
                    membershipId: r.membership_id,
                    tenantId: r.tenant_id,
                    tenantSlug: r.tenant_slug,
                    tenantDisplayName: r.tenant_name,
                    roleCode: r.role_code,
                    roleName: ROLE_NAMES[r.role_code] ?? r.role_code,
                })),
                rlsContext: rlsVerification.rows[0],
            };
        });
    }
    async logout(rawToken) {
        if (!rawToken)
            return;
        const tokenHash = hashSessionToken(rawToken);
        const client = await tenantPool.connect();
        try {
            await client.query('BEGIN');
            await client.query("SELECT auth_internal.revoke_session($1, false, 'USER_LOGOUT')", [
                tokenHash,
            ]);
            await client.query('COMMIT');
        }
        catch {
            await client.query('ROLLBACK').catch(() => undefined);
        }
        finally {
            client.release();
        }
    }
}
export const authService = new AuthService();
