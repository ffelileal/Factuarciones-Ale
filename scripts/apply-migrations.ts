import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Client } = pg;

async function main() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) {
    throw new Error('DATABASE_ADMIN_URL no está configurada en .env');
  }

  const client = new Client({ connectionString: adminUrl });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        migration_name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE _schema_migrations NO FORCE ROW LEVEL SECURITY;
      ALTER TABLE _schema_migrations DISABLE ROW LEVEL SECURITY;
    `);

    const migrationsDir = path.resolve(__dirname, '../prisma/migrations');
    const folders = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const folder of folders) {
      const check = await client.query(
        'SELECT 1 FROM _schema_migrations WHERE migration_name = $1',
        [folder],
      );
      if (check.rowCount && check.rowCount > 0) {
        console.log(`[Migración] ${folder} ya aplicada. Omitiendo.`);
        continue;
      }

      const sqlPath = path.join(migrationsDir, folder, 'migration.sql');
      const sql = fs.readFileSync(sqlPath, 'utf8');

      console.log(`[Migración] Aplicando ${folder}...`);
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO _schema_migrations (migration_name) VALUES ($1)',
        [folder],
      );
      await client.query('COMMIT');
      console.log(`[Migración] ${folder} aplicada con éxito.`);
    }

    const stats = await client.query<{
      physical_tables: string;
      rls_forced_tables: string;
    }>(`
      SELECT
        (SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_schema_migrations') AS physical_tables,
        (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_schema_migrations' AND c.relforcerowsecurity = true) AS rls_forced_tables
    `);

    console.log(
      `[Verificación] Tablas físicas del modelo: ${stats.rows[0].physical_tables} | Tablas con FORCE RLS: ${stats.rows[0].rls_forced_tables}`,
    );
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[Error Migración]', err);
  process.exit(1);
});
