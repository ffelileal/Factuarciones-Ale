import type pg from 'pg';
import { type CreateImportStagingRequestDto, type UpdateStagingRowRequestDto, type ConfirmImportBatchRequestDto } from '@ar-payroll/contracts';
import { type ActivatedSessionContext } from '../db/pool.js';
export interface ValidatedStagingRow {
    rowIndex: number;
    sheetName: string;
    targetEntity: 'COMPANY' | 'EMPLOYEE';
    rawData: Record<string, string>;
    proposedData: Record<string, string>;
    correctedData: Record<string, string> | null;
    errors: string[];
    warnings: string[];
    rowStatus: 'VALID' | 'DUPLICATE' | 'NEEDS_REVIEW' | 'ERROR' | 'SKIPPED';
    duplicateInfo?: {
        existingId: string;
        keyField: 'CUIT' | 'CUIL' | 'LEGAJO';
        keyValue: string;
        resolution: 'SKIP' | 'UPDATE' | 'MANUAL_REVIEW';
    };
}
/**
 * Normaliza fechas desde formatos argentinos (DD/MM/YYYY), ISO (YYYY-MM-DD) o números de serie de Excel.
 */
export declare function normalizeDateString(raw: string): string | null;
/**
 * Detecta automáticamente la correspondencia entre los encabezados del archivo y los campos del sistema.
 */
export declare function buildSuggestedColumnMapping(headers: string[], targetEntity: 'COMPANY' | 'EMPLOYEE'): Record<string, string>;
export declare class ImportService {
    /**
     * Valida una fila propuesta de Empresa o Empleado contra las reglas de negocio y la base de datos.
     */
    private validateRowData;
    /**
     * Paso 1 a 4: Analiza un archivo Excel (.xlsx/.xlsm), CSV o PDF, guarda opcionalmente el documento original
     * en `documents` y crea un lote de staging persistente en `import_staging_batches` + `import_staging_rows`.
     */
    createStagingBatch(client: pg.PoolClient, ctx: ActivatedSessionContext, body: CreateImportStagingRequestDto, ipAddress?: string): Promise<{
        batchId: string;
        companyId: string | null;
        sourceDocumentId: string | null;
        importKind: string;
        status: string;
        metadata: Record<string, unknown>;
        summary: {
            totalDetected: number;
            validCount: number;
            errorCount: number;
            duplicateCount: number;
            toCreateCount: number;
            toUpdateCount: number;
            skippedCount: number;
            needsReviewCount: number;
        };
        rows: {
            id: string;
            rowIndex: number;
            sheetName: string;
            targetEntity: "COMPANY" | "EMPLOYEE";
            rawData: Record<string, string>;
            data: Record<string, string>;
            errors: string[];
            warnings: string[];
            rowStatus: string;
            duplicateInfo: {} | null;
        }[];
    } | null>;
    /**
     * Obtiene el detalle completo de un lote de staging y sus filas para la vista previa editable.
     */
    getStagingBatchDetail(client: pg.PoolClient, batchId: string): Promise<{
        batchId: string;
        companyId: string | null;
        sourceDocumentId: string | null;
        importKind: string;
        status: string;
        metadata: Record<string, unknown>;
        summary: {
            totalDetected: number;
            validCount: number;
            errorCount: number;
            duplicateCount: number;
            toCreateCount: number;
            toUpdateCount: number;
            skippedCount: number;
            needsReviewCount: number;
        };
        rows: {
            id: string;
            rowIndex: number;
            sheetName: string;
            targetEntity: "COMPANY" | "EMPLOYEE";
            rawData: Record<string, string>;
            data: Record<string, string>;
            errors: string[];
            warnings: string[];
            rowStatus: string;
            duplicateInfo: {} | null;
        }[];
    } | null>;
    /**
     * Permite corregir manualmente una fila en la vista previa de importación y re-ejecuta las validaciones.
     */
    updateStagingRow(client: pg.PoolClient, ctx: ActivatedSessionContext, batchId: string, rowId: string, body: UpdateStagingRowRequestDto): Promise<{
        batchId: string;
        companyId: string | null;
        sourceDocumentId: string | null;
        importKind: string;
        status: string;
        metadata: Record<string, unknown>;
        summary: {
            totalDetected: number;
            validCount: number;
            errorCount: number;
            duplicateCount: number;
            toCreateCount: number;
            toUpdateCount: number;
            skippedCount: number;
            needsReviewCount: number;
        };
        rows: {
            id: string;
            rowIndex: number;
            sheetName: string;
            targetEntity: "COMPANY" | "EMPLOYEE";
            rawData: Record<string, string>;
            data: Record<string, string>;
            errors: string[];
            warnings: string[];
            rowStatus: string;
            duplicateInfo: {} | null;
        }[];
    } | null>;
    /**
     * Paso 5 y 6: Confirma e importa transaccionalmente los registros validados en PostgreSQL,
     * generando un informe detallado de creados, actualizados, omitidos y rechazados, y registrando auditoría.
     */
    confirmStagingBatch(client: pg.PoolClient, ctx: ActivatedSessionContext, batchId: string, body: ConfirmImportBatchRequestDto, ipAddress?: string): Promise<{
        batchId: string;
        status: string;
        createdCount: number;
        updatedCount: number;
        skippedCount: number;
        rejectedCount: number;
        rejectedRows: {
            rowIndex: number;
            reasons: string[];
        }[];
        completedAt: string;
    }>;
}
export declare const importService: ImportService;
