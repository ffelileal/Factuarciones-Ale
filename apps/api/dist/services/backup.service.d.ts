export interface EncryptedBackupManifest {
    backupId: string;
    createdAt: string;
    database: string;
    algorithm: 'AES-256-GCM';
    ivHex: string;
    authTagHex: string;
    plaintextSha256: string;
    ciphertextSha256: string;
    plaintextBytes: number;
    ciphertextBytes: number;
    encryptedFilePath: string;
}
export interface RestoreVerificationResult {
    restoredDatabase: string;
    plaintextSha256Verified: boolean;
    restoredPhysicalTables: number;
    sourceCompaniesCount: number;
    restoredCompaniesCount: number;
    sourceTenantsCount: number;
    restoredTenantsCount: number;
    sourceUsersCount: number;
    restoredUsersCount: number;
}
export declare function createEncryptedFullBackup(outputDir?: string): EncryptedBackupManifest;
export declare function restoreAndVerifyBackup(manifest: EncryptedBackupManifest): Promise<RestoreVerificationResult>;
