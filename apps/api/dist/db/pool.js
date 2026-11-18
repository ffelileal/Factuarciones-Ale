import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
const { Pool } = pg;
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL (app_tenant_user) no está configurada en .env');
}
if (!process.env.DATABASE_ADMIN_URL) {
    throw new Error('DATABASE_ADMIN_URL no está configurada en .env');
}
export const tenantPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30000,
});
export const adminPool = new Pool({
    connectionString: process.env.DATABASE_ADMIN_URL,
    max: 1,
    idleTimeoutMillis: 30000,
});
export class AuthenticationError extends Error {
    statusCode;
    constructor(message, statusCode = 401) {
        super(message);
        this.name = 'AuthenticationError';
        this.statusCode = statusCode;
    }
}
export class TenantContextRequiredError extends Error {
    statusCode = 403;
    constructor(message = 'La operación requiere un espacio de trabajo (tenant) activo seleccionado en la sesión.') {
        super(message);
        this.name = 'TenantContextRequiredError';
    }
}
export function hashSessionToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}
export async function withAuthenticatedTransaction(rawToken, requireActiveTenant, fn) {
    if (!rawToken || rawToken.trim().length < 16) {
        throw new AuthenticationError('Token de sesión ausente o con formato inválido.');
    }
    const tokenHash = hashSessionToken(rawToken.trim());
    const client = await tenantPool.connect();
    try {
        await client.query('BEGIN');
        const res = await client.query('SELECT * FROM auth_internal.activate_session_context($1)', [tokenHash]);
        if (res.rowCount === 0) {
            throw new AuthenticationError('Sesión inválida, expirada o revocada.');
        }
        const row = res.rows[0];
        const ctx = {
            sessionId: row.session_id,
            userId: row.user_id,
            userEmail: row.user_email,
            userFullName: row.user_full_name,
            activeTenantId: row.tenant_id,
            tenantName: row.tenant_name,
            tenantSlug: row.tenant_slug,
            membershipId: row.membership_id,
            roleCode: row.role_code,
        };
        if (requireActiveTenant && !ctx.activeTenantId) {
            throw new TenantContextRequiredError();
        }
        const result = await fn(client, ctx);
        await client.query('COMMIT');
        return result;
    }
    catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (err instanceof pg.DatabaseError && err.message.includes('INVALID_OR_EXPIRED_SESSION')) {
            throw new AuthenticationError('Sesión inválida, expirada o revocada.');
        }
        throw err;
    }
    finally {
        client.release();
    }
}
