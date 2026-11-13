import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';
import { hashPassword } from '../apps/api/src/services/auth.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const email = process.env.MASTER_EMAIL?.trim().toLowerCase();
const username = email?.split('@')[0];
const fullName = process.env.MASTER_FULL_NAME?.trim();
const password = process.env.MASTER_PASSWORD;
const adminUrl = process.env.DATABASE_ADMIN_URL;
const tenantSlugs = (process.env.MASTER_TENANTS ?? 'estudio-papa,estudio-socio')
  .split(',')
  .map((slug) => slug.trim())
  .filter(Boolean);

if (!email || !username || !fullName || !password || !adminUrl) {
  throw new Error(
    'Se requieren MASTER_EMAIL, MASTER_FULL_NAME, MASTER_PASSWORD y DATABASE_ADMIN_URL en .env.',
  );
}
if (password.length < 12) {
  throw new Error('MASTER_PASSWORD debe tener al menos 12 caracteres.');
}
if (tenantSlugs.length === 0) {
  throw new Error('MASTER_TENANTS debe contener al menos un slug.');
}

const client = new pg.Client({ connectionString: adminUrl });

async function main() {
  await client.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO public.roles (code, name, description)
       VALUES ('OWNER', 'Titular del Espacio de Trabajo', 'Control total del espacio de trabajo y sus empresas.')
       ON CONFLICT (code) DO NOTHING`,
    );
    await client.query(
      `INSERT INTO public.tenants (name, slug, status)
       VALUES
         ('Estudio Contable - Espacio Titular A', 'estudio-papa', 'ACTIVE'),
         ('Estudio Contable - Espacio Titular B', 'estudio-socio', 'ACTIVE')
       ON CONFLICT (slug) DO NOTHING`,
    );

    const userResult = await client.query<{ id: string }>(
      `INSERT INTO public.users (email, username, full_name, password_hash, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       ON CONFLICT (email) DO UPDATE
         SET username = EXCLUDED.username,
             full_name = EXCLUDED.full_name,
             password_hash = EXCLUDED.password_hash,
             status = 'ACTIVE',
             failed_login_attempts = 0,
             locked_until = NULL,
             updated_at = now()
       RETURNING id`,
      [email, username, fullName, hashPassword(password)],
    );

    const roleResult = await client.query<{ id: string }>(
      `SELECT id FROM public.roles WHERE code = 'OWNER'`,
    );
    if (!roleResult.rowCount) throw new Error('No existe el rol OWNER. Aplicá el seed primero.');

    const tenantsResult = await client.query<{ id: string; slug: string }>(
      `SELECT id, slug FROM public.tenants WHERE slug = ANY($1::text[]) AND status = 'ACTIVE'`,
      [tenantSlugs],
    );
    const foundSlugs = new Set(tenantsResult.rows.map((tenant) => tenant.slug));
    const missingSlugs = tenantSlugs.filter((slug) => !foundSlugs.has(slug));
    if (missingSlugs.length > 0) {
      throw new Error(`No existen espacios activos: ${missingSlugs.join(', ')}`);
    }

    for (const tenant of tenantsResult.rows) {
      await client.query(
        `INSERT INTO public.tenant_memberships (tenant_id, user_id, role_id, status, is_default)
         VALUES ($1, $2, $3, 'ACTIVE', $4)
         ON CONFLICT (tenant_id, user_id) DO UPDATE
           SET role_id = EXCLUDED.role_id, status = 'ACTIVE', is_default = EXCLUDED.is_default`,
        [tenant.id, userResult.rows[0].id, roleResult.rows[0].id, tenant.slug === tenantSlugs[0]],
      );
    }

    await client.query('COMMIT');
    console.log(`Usuario OWNER creado/actualizado: ${email}`);
    console.log(`Espacios asignados: ${tenantSlugs.join(', ')}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('[Error Usuario Maestro]', error instanceof Error ? error.message : error);
  process.exit(1);
});
