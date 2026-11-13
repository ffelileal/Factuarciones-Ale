import type pg from 'pg';
import type { ActivatedSessionContext as VerifiedSessionContext } from '../db/pool.js';
export declare const PAYROLL_CONCEPT_IDS: {
    readonly BASICO: "40000000-0000-4000-8000-000000000100";
    readonly ANTIGUEDAD: "40000000-0000-4000-8000-000000000110";
    readonly EXTRAS_50: "40000000-0000-4000-8000-000000000120";
    readonly EXTRAS_100: "40000000-0000-4000-8000-000000000130";
    readonly FERIADO: "40000000-0000-4000-8000-000000000140";
    readonly NO_REMUNERATIVO: "40000000-0000-4000-8000-000000000200";
    readonly SAC: "40000000-0000-4000-8000-000000000300";
    readonly VACACIONES: "40000000-0000-4000-8000-000000000310";
    readonly REDONDEO: "40000000-0000-4000-8000-000000000999";
    readonly JUBILACION: "40000000-0000-4000-8000-000000000400";
    readonly LEY_19032: "40000000-0000-4000-8000-000000000410";
    readonly OBRA_SOCIAL: "40000000-0000-4000-8000-000000000420";
    readonly SINDICATO_UOM: "40000000-0000-4000-8000-000000000430";
    readonly SEGURO_UOM_EMP: "40000000-0000-4000-8000-000000000440";
    readonly ANTICIPO: "40000000-0000-4000-8000-000000000450";
    readonly PATRONAL_SIPA: "40000000-0000-4000-8000-000000000500";
    readonly PATRONAL_INSSJP: "40000000-0000-4000-8000-000000000510";
    readonly PATRONAL_OS: "40000000-0000-4000-8000-000000000520";
    readonly PATRONAL_SEGURO_UOM: "40000000-0000-4000-8000-000000000530";
    readonly PATRONAL_ART: "40000000-0000-4000-8000-000000000540";
};
export declare const NOVELTY_TYPE_IDS: {
    readonly HORAS_NORMALES: "41000000-0000-4000-8000-000000000001";
    readonly HORAS_EXTRAS_50: "41000000-0000-4000-8000-000000000002";
    readonly HORAS_EXTRAS_100: "41000000-0000-4000-8000-000000000003";
    readonly HORAS_FERIADO: "41000000-0000-4000-8000-000000000004";
    readonly SUMA_NO_REMUNERATIVA: "41000000-0000-4000-8000-000000000005";
    readonly ANTICIPO_SUELDO: "41000000-0000-4000-8000-000000000006";
};
export interface CreatePayrollPeriodInput {
    year: number;
    month: number;
    liquidationModality: 'PRIMERA_QUINCENA' | 'SEGUNDA_QUINCENA' | 'MENSUAL' | 'SAC_1' | 'SAC_2' | 'VACACIONES' | 'FINAL_EGRESO' | 'COMPLEMENTARIA';
    scheduledPaymentDate?: string;
}
export interface EmployeeNoveltyGridRow {
    employeeId: string;
    normalHours: number;
    overtime50Hours: number;
    overtime100Hours: number;
    holidayHours: number;
    nonRemunerativeAmount: number;
    advanceAmount: number;
    observation?: string;
}
/**
 * Lista todos los períodos, novedades por empleado, liquidaciones, recibos detallados y exportaciones ARCA de una empresa
 */
export declare function getCompanyPayrollWorkspace(client: pg.PoolClient, _ctx: VerifiedSessionContext, companyId: string): Promise<{
    periods: any[];
    novelties: any[];
    payrolls: any[];
    payslips: any[];
    arcaExports: any[];
}>;
/**
 * Crea un nuevo Período de Liquidación y precarga las novedades iniciales de cada empleado activo
 */
export declare function createPayrollPeriod(client: pg.PoolClient, ctx: VerifiedSessionContext, companyId: string, input: CreatePayrollPeriodInput): Promise<{
    periodId: string;
    periodCode: string;
}>;
/**
 * Guarda la grilla tipo Excel de Novedades de un período
 */
export declare function savePeriodNovelties(client: pg.PoolClient, ctx: VerifiedSessionContext, companyId: string, periodId: string, rows: EmployeeNoveltyGridRow[]): Promise<{
    savedCount: number;
}>;
/**
 * Ejecuta el Motor de Liquidaciones Versionado e Inmutable (CCT 260/75 UOMRA Rama 4 Automotor)
 */
export declare function calculatePayrollForPeriod(client: pg.PoolClient, ctx: VerifiedSessionContext, companyId: string, periodId: string): Promise<{
    payrollId: string;
    version: number;
    employeesCount: number;
    totalNetPay: number;
}>;
/**
 * Aprueba y sella como INMUTABLE una liquidación y todos sus recibos (activando el bloqueo de triggers PostgreSQL 16)
 */
export declare function approvePayroll(client: pg.PoolClient, ctx: VerifiedSessionContext, companyId: string, payrollId: string): Promise<{
    payrollId: string;
    status: string;
    isImmutable: boolean;
}>;
/**
 * Genera y valida la exportación del Libro de Sueldos Digital (ARCA / ex-AFIP) para una liquidación
 */
export declare function generateArcaLibroSueldosExport(client: pg.PoolClient, ctx: VerifiedSessionContext, companyId: string, payrollId: string): Promise<{
    exportId: string;
    filename: string;
    sha256Hash: string;
    txtContent: string;
    employeesCount: number;
}>;
