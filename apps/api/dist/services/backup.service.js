import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
const { Client } = pg;
function resolvePgBin(binaryName) {
    const localPgBin = path.resolve(__dirname, '../../../../../pgsql16/pgsql/bin', process.platform === 'win32' ? `${binaryName}.exe` : binaryName);
    if (fs.existsSync(localPgBin)) {
        return localPgBin;
    }
    return binaryName;
}
export function createEncryptedFullBackup(outputDir) {
    const keyHex = process.env.BACKUP_ENCRYPTION_KEY;
    if (!keyHex || keyHex.length !== 64) {
        throw new Error('BACKUP_ENCRYPTION_KEY debe ser una clave hexadecimal de 64 caracteres (32 bytes).');
    }
    const key = Buffer.from(keyHex, 'hex');
    const backupsDir = outputDir ?? path.resolve(__dirname, '../../../../backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `ar_payroll_full_${timestamp}`;
    const rawDumpPath = path.join(backupsDir, `${backupId}.dump.tmp`);
    const encryptedFilePath = path.join(backupsDir, `${backupId}.dump.enc`);
    const manifestPath = path.join(backupsDir, `${backupId}.manifest.json`);
    const pgDumpBin = resolvePgBin('pg_dump');
    execFileSync(pgDumpBin, [
        '-h',
        '127.0.0.1',
        '-p',
        '5432',
        '-U',
        'postgres',
        '-Fc',
        '--no-owner',
        '--no-acl',
        '-f',
        rawDumpPath,
        'ar_payroll',
    ], { stdio: 'pipe' });
    const plaintextBuffer = fs.readFileSync(rawDumpPath);
    fs.unlinkSync(rawDumpPath);
    const plaintextSha256 = crypto.createHash('sha256').update(plaintextBuffer).digest('hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertextBuffer = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();
    fs.writeFileSync(encryptedFilePath, ciphertextBuffer);
    const ciphertextSha256 = crypto.createHash('sha256').update(ciphertextBuffer).digest('hex');
    const manifest = {
        backupId,
        createdAt: new Date().toISOString(),
        database: 'ar_payroll',
        algorithm: 'AES-256-GCM',
        ivHex: iv.toString('hex'),
        authTagHex: authTag.toString('hex'),
        plaintextSha256,
        ciphertextSha256,
        plaintextBytes: plaintextBuffer.length,
        ciphertextBytes: ciphertextBuffer.length,
        encryptedFilePath,
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    return manifest;
}
export async function restoreAndVerifyBackup(manifest) {
    const keyHex = process.env.BACKUP_ENCRYPTION_KEY;
    if (!keyHex || keyHex.length !== 64) {
        throw new Error('BACKUP_ENCRYPTION_KEY inválida o ausente.');
    }
    const key = Buffer.from(keyHex, 'hex');
    const ciphertextBuffer = fs.readFileSync(manifest.encryptedFilePath);
    const iv = Buffer.from(manifest.ivHex, 'hex');
    const authTag = Buffer.from(manifest.authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decryptedBuffer;
    try {
        decryptedBuffer = Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()]);
    }
    catch (err) {
        throw new Error(`Fallo de integridad criptográfica AES-256-GCM: el archivo de backup fue alterado o la clave/tag es inválida (${err instanceof Error ? err.message : String(err)}).`);
    }
    const actualPlaintextSha256 = crypto.createHash('sha256').update(decryptedBuffer).digest('hex');
    if (actualPlaintextSha256 !== manifest.plaintextSha256) {
        throw new Error('Discrepancia en el hash SHA-256 del dump descifrado.');
    }
    const tempRestoreDumpPath = `${manifest.encryptedFilePath}.restoring.tmp`;
    fs.writeFileSync(tempRestoreDumpPath, decryptedBuffer);
    try {
        const restoreClient = new Client({
            connectionString: process.env.DATABASE_RESTORE_TEST_URL ??
                'postgresql://postgres@127.0.0.1:5432/ar_payroll_restore_test?schema=public',
        });
        await restoreClient.connect();
        try {
            await restoreClient.query(`
        DROP SCHEMA IF EXISTS public CASCADE;
        DROP SCHEMA IF EXISTS auth_internal CASCADE;
        CREATE SCHEMA public;
      `);
        }
        finally {
            await restoreClient.end();
        }
        const pgRestoreBin = resolvePgBin('pg_restore');
        execFileSync(pgRestoreBin, [
            '-h',
            '127.0.0.1',
            '-p',
            '5432',
            '-U',
            'postgres',
            '-d',
            'ar_payroll_restore_test',
            '--no-owner',
            '--no-acl',
            tempRestoreDumpPath,
        ], { stdio: 'pipe' });
    }
    finally {
        if (fs.existsSync(tempRestoreDumpPath)) {
            fs.unlinkSync(tempRestoreDumpPath);
        }
    }
    const sourceClient = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
    const targetClient = new Client({
        connectionString: process.env.DATABASE_RESTORE_TEST_URL ??
            'postgresql://postgres@127.0.0.1:5432/ar_payroll_restore_test?schema=public',
    });
    await sourceClient.connect();
    await targetClient.connect();
    try {
        const queryStats = async (c) => {
            const res = await c.query(`
        SELECT
          (SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_schema_migrations') AS tables_count,
          (SELECT count(*)::text FROM public.tenants) AS tenants_count,
          (SELECT count(*)::text FROM public.users) AS users_count,
          (SELECT count(*)::text FROM public.companies) AS companies_count
      `);
            return res.rows[0];
        };
        const src = await queryStats(sourceClient);
        const dst = await queryStats(targetClient);
        return {
            restoredDatabase: 'ar_payroll_restore_test',
            plaintextSha256Verified: true,
            restoredPhysicalTables: Number(dst.tables_count),
            sourceTenantsCount: Number(src.tenants_count),
            restoredTenantsCount: Number(dst.tenants_count),
            sourceUsersCount: Number(src.users_count),
            restoredUsersCount: Number(dst.users_count),
            sourceCompaniesCount: Number(src.companies_count),
            restoredCompaniesCount: Number(dst.companies_count),
        };
    }
    finally {
        await sourceClient.end();
        await targetClient.end();
    }
}
