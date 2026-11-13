import type pg from 'pg';
import { type CreateCompanyRequestDto, type UpdateCompanyRequestDto } from '@ar-payroll/contracts';
import { type ActivatedSessionContext } from '../db/pool.js';
export declare class CompanyService {
    /**
     * Lista todas las empresas del tenant activo con conteo de empleados, domicilio y fecha de última modificación.
     * Protegido automáticamente por PostgreSQL FORCE ROW LEVEL SECURITY.
     */
    listCompanies(client: pg.PoolClient): Promise<{
        id: string;
        tenantId: string;
        cuit: string;
        legalName: string;
        tradeName: string | null;
        primaryActivity: string | null;
        fiscalAddress: string | null;
        locality: string | null;
        province: string | null;
        postalCode: string | null;
        arcaDomicilioExplotacion: string | null;
        email: string | null;
        phone: string | null;
        vatCondition: string | null;
        artName: string | null;
        artAliquotPct: number;
        artFixedAmount: number;
        defaultCbaId: null;
        employeesCount: number;
        activeEmployeesCount: number;
        currentPeriodLabel: string;
        updatedAt: string;
        isActive: boolean;
    }[]>;
    /**
     * Obtiene el detalle integral de una empresa seleccionada para las 7 pestañas internas:
     * 1. General | 2. Empleados | 3. Convenios y escalas | 4. Novedades | 5. Liquidaciones | 6. Recibos | 7. Libro de Sueldos Digital
     */
    getCompanyDetail(client: pg.PoolClient, companyId: string): Promise<{
        company: {
            id: string;
            tenantId: string;
            cuit: string;
            legalName: string;
            tradeName: string | null;
            primaryActivity: string | null;
            fiscalAddress: string | null;
            locality: string | null;
            province: string | null;
            postalCode: string | null;
            arcaDomicilioExplotacion: string | null;
            email: string | null;
            phone: string | null;
            vatCondition: string | null;
            artName: string | null;
            artAliquotPct: number;
            artFixedAmount: number;
            defaultCbaId: null;
            employeesCount: number;
            activeEmployeesCount: number;
            currentPeriodLabel: string;
            updatedAt: string;
            isActive: boolean;
        };
        branches: any[];
        agreements: any[];
        periods: any[];
        payrolls: any[];
        payslips: any[];
        novelties: any[];
        arcaExports: any[];
    } | null>;
    /**
     * Crea una nueva empresa en el tenant activo con su versión inicial, sucursal CENTRAL y convenio UOM por defecto.
     */
    createCompany(client: pg.PoolClient, ctx: ActivatedSessionContext, body: CreateCompanyRequestDto, ipAddress?: string): Promise<{
        id: string;
        tenantId: string;
        cuit: string;
        legalName: string;
        tradeName: string | null;
        primaryActivity: string;
        fiscalAddress: string;
        locality: string;
        province: string;
        arcaDomicilioExplotacion: string;
        defaultCbaId: string;
        employeesCount: number;
        activeEmployeesCount: number;
        currentPeriodLabel: string;
        updatedAt: string;
        isActive: boolean;
    }>;
    /**
     * Actualiza los datos de una empresa generando una nueva versión histórica en company_versions
     * o archivando/activando su estado operativo.
     */
    updateCompany(client: pg.PoolClient, ctx: ActivatedSessionContext, companyId: string, body: UpdateCompanyRequestDto, ipAddress?: string): Promise<{
        id: string;
        tenantId: string;
        cuit: string;
        legalName: string;
        tradeName: string | null;
        primaryActivity: string | null;
        fiscalAddress: string | null;
        locality: string | null;
        province: string | null;
        postalCode: string | null;
        arcaDomicilioExplotacion: string | null;
        email: string | null;
        phone: string | null;
        vatCondition: string | null;
        artName: string | null;
        artAliquotPct: number;
        artFixedAmount: number;
        defaultCbaId: null;
        employeesCount: number;
        activeEmployeesCount: number;
        currentPeriodLabel: string;
        updatedAt: string;
        isActive: boolean;
    } | null>;
}
export declare const companyService: CompanyService;
