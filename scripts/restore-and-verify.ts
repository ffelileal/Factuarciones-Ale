import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  restoreAndVerifyBackup,
  type EncryptedBackupManifest,
} from '../apps/api/src/services/backup.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupsDir = path.resolve(__dirname, '../backups');

if (!fs.existsSync(backupsDir)) {
  console.error('No existe el directorio ./backups. Ejecute primero: npm run backup:create');
  process.exit(1);
}

const manifests = fs
  .readdirSync(backupsDir)
  .filter((f) => f.endsWith('.manifest.json'))
  .sort();

if (manifests.length === 0) {
  console.error('No se encontraron manifiestos de backup en ./backups. Ejecute primero: npm run backup:create');
  process.exit(1);
}

const latestManifestPath = path.join(backupsDir, manifests[manifests.length - 1]);
const manifest = JSON.parse(fs.readFileSync(latestManifestPath, 'utf8')) as EncryptedBackupManifest;

restoreAndVerifyBackup(manifest)
  .then((res) => {
    console.log('[Restauración Verificada]', JSON.stringify(res, null, 2));
  })
  .catch((err) => {
    console.error('[Error en Restauración]', err);
    process.exit(1);
  });
