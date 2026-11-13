import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pgBinDir = path.resolve(__dirname, '../../pgsql16/pgsql/bin');
const pgDataDir = path.resolve(__dirname, '../../pgdata16');
const pgCtl = path.join(pgBinDir, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
const logFile = path.join(pgDataDir, 'postgresql.log');

function isRunning(): boolean {
  try {
    execFileSync(pgCtl, ['-D', pgDataDir, 'status'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const action = process.argv[2] ?? 'ensure';

if (!fs.existsSync(pgCtl)) {
  console.error(`[PostgreSQL] No se encontró pg_ctl en: ${pgCtl}`);
  process.exit(1);
}

if (action === 'status') {
  if (isRunning()) {
    console.log('[PostgreSQL 16] El servidor está EN EJECUCIÓN (127.0.0.1:5432).');
  } else {
    console.log('[PostgreSQL 16] El servidor está DETENIDO.');
  }
} else if (action === 'stop') {
  if (isRunning()) {
    execFileSync(pgCtl, ['-D', pgDataDir, 'stop'], { stdio: 'inherit' });
  } else {
    console.log('[PostgreSQL 16] El servidor ya estaba detenido.');
  }
} else {
  // 'start' o 'ensure'
  if (isRunning()) {
    console.log('[PostgreSQL 16] El servidor ya está en ejecución (127.0.0.1:5432).');
  } else {
    console.log('[PostgreSQL 16] Iniciando servidor de base de datos en 127.0.0.1:5432...');
    execFileSync(pgCtl, ['-D', pgDataDir, '-l', logFile, '-w', 'start'], { stdio: 'inherit' });
    console.log('[PostgreSQL 16] Servidor iniciado correctamente.');
  }
}
