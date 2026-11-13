import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// 1. Asegurar que PostgreSQL 16 esté en ejecución
execFileSync(process.execPath, ['--import', 'tsx', path.join(__dirname, 'pg-service.ts'), 'ensure'], {
  cwd: rootDir,
  stdio: 'inherit',
});

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

console.log('[AR-Payroll] Iniciando Backend API (http://127.0.0.1:4000) y Cliente Desktop (http://localhost:1420)...');

const apiProc = spawn(npmCmd, ['--workspace=@ar-payroll/api', 'run', 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

const desktopProc = spawn(npmCmd, ['--workspace=@ar-payroll/desktop', 'run', 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

function cleanup() {
  apiProc.kill();
  desktopProc.kill();
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
