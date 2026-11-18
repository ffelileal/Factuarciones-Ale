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

export interface ActivatedSessionContext {
  sessionId: string;
  userId: string;
  userEmail: string;
  userFullName: string;
  activeTenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  membershipId: string | null;
  roleCode: string | null;
}

export class AuthenticationError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = statusCode;
  }
}

export class TenantContextRequiredError extends Error {
  public readonly statusCode = 403;
  constructor(message = 'La operación requiere un espacio de trabajo (tenant) activo seleccionado en la sesión.') {
    super(message);
    this.name = 'TenantContextRequiredError';
  }
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export async function withAuthenticatedTransaction<T>(
  rawToken: string,
  requireActiveTenant: boolean,
  fn: (client: pg.PoolClient, ctx: ActivatedSessionContext) => Promise<T>,
): Promise<T> {
  if (!rawToken || rawToken.trim().length < 16) {
    throw new AuthenticationError('Token de sesión ausente o con formato inválido.');
  }

  const tokenHash = hashSessionToken(rawToken.trim());
  const client = await tenantPool.connect();

  try {
    await client.query('BEGIN');

    const res = await client.query<{
      session_id: string;
      user_id: string;
      user_email: string;
      user_full_name: string;
      tenant_id: string | null;
      tenant_name: string | null;
      tenant_slug: string | null;
      membership_id: string | null;
      role_code: string | null;
      expires_at: Date;
    }>('SELECT * FROM auth_internal.activate_session_context($1)', [tokenHash]);

    if (res.rowCount === 0) {
      throw new AuthenticationError('Sesión inválida, expirada o revocada.');
    }

    const row = res.rows[0];
    const ctx: ActivatedSessionContext = {
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
  } catch (err: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (err instanceof pg.DatabaseError && err.message.includes('INVALID_OR_EXPIRED_SESSION')) {
      throw new AuthenticationError('Sesión inválida, expirada o revocada.');
    }
    throw err;
  } finally {
    client.release();
  }
}
