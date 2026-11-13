import { createEncryptedFullBackup } from '../apps/api/src/services/backup.service.js';

const manifest = createEncryptedFullBackup();
console.log('[Backup Cifrado Completado]', JSON.stringify(manifest, null, 2));
