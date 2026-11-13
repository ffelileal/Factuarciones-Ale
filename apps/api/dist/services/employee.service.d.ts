import type pg from 'pg';
import { type CreateEmployeeRequestDto, type InlineUpdateEmployeeRequestDto, type BulkEmployeeActionRequestDto, type EmployeeGridRowDto } from '@ar-payroll/contracts';
import { type ActivatedSessionContext } from '../db/pool.js';
export declare class EmployeeService {
    listVacations(client: pg.PoolClient, filters: {
        companyId?: string;
        year?: number;
    }): Promise<any[]>;
    /**
     * Lista los empleados de una empresa en formato optimizado para la Grilla estilo Excel.
     */
    listCompanyEmployees(client: pg.PoolClient, companyId: string): Promise<EmployeeGridRowDto[]>;
    /**
     * Obtiene el catálogo de categorías disponibles para la grilla desplegable (edición tipo Excel).
     */
    listAvailableCategories(client: pg.PoolClient): Promise<{
        id: string;
        code: string;
        name: string;
        remuneration_modality: string;
        remuneration_unit: string;
        default_payment_frequency: string;
        agreement_id: string;
        cct_number: string;
        agreement_name: string;
        branch_id: string;
        branch_name: string;
        hourly_rate: string | null;
        monthly_basic: string | null;
    }[]>;
    /**
     * Crea un nuevo empleado en la empresa seleccionada verificando pertenencia al tenant,
     * unicidad de CUIL y legajo, y creando la versión 1 e historial laboral.
     */
    createEmployee(client: pg.PoolClient, ctx: ActivatedSessionContext, companyId: string, body: CreateEmployeeRequestDto, ipAddress?: string): Promise<{
        firstName: string;
        lastName: string;
        id: string;
        updatedAt: string;
        companyId: string;
        legajo: string;
        cuil: string;
        dni: string;
        hireDate: string;
        terminationDate: string | null;
        recognizedPriorYears: number;
        jobPosition: string;
        categoryId: string;
        categoryCode: string;
        categoryName: string;
        agreementId: string;
        agreementCode: string;
        agreementName: string;
        agreementBranchId: string;
        agreementBranchName: string;
        branchId: string;
        branchName: string;
        contractType: string;
        remunerationModality: "JORNALIZADO" | "MENSUALIZADO";
        remunerationUnit: "HORA" | "DIA" | "MES";
        paymentFrequency: "SEMANAL" | "QUINCENAL" | "MENSUAL";
        employmentStatus: "ACTIVE" | "ON_LEAVE" | "SUSPENDED" | "TERMINATED";
        obraSocialCode: string;
        obraSocialName: string;
        isUnionMember: boolean;
    }>;
    /**
     * Actualiza un empleado desde una celda en línea (tipo Excel) o desde su Ficha Individual,
     * generando una nueva versión trazable en employee_versions y registrando el cambio en employee_employment_history.
     */
    updateEmployee(client: pg.PoolClient, ctx: ActivatedSessionContext, companyId: string, employeeId: string, body: InlineUpdateEmployeeRequestDto, ipAddress?: string): Promise<{
        firstName: string;
        lastName: string;
        id: string;
        updatedAt: string;
        companyId: string;
        legajo: string;
        cuil: string;
        dni: string;
        hireDate: string;
        terminationDate: string | null;
        recognizedPriorYears: number;
        jobPosition: string;
        categoryId: string;
        categoryCode: string;
        categoryName: string;
        agreementId: string;
        agreementCode: string;
        agreementName: string;
        agreementBranchId: string;
        agreementBranchName: string;
        branchId: string;
        branchName: string;
        contractType: string;
        remunerationModality: "JORNALIZADO" | "MENSUALIZADO";
        remunerationUnit: "HORA" | "DIA" | "MES";
        paymentFrequency: "SEMANAL" | "QUINCENAL" | "MENSUAL";
        employmentStatus: "ACTIVE" | "ON_LEAVE" | "SUSPENDED" | "TERMINATED";
        obraSocialCode: string;
        obraSocialName: string;
        isUnionMember: boolean;
    }>;
    /**
     * Ejecuta acciones masivas seguras sobre múltiples empleados seleccionados en la grilla.
     */
    bulkUpdateEmployees(client: pg.PoolClient, ctx: ActivatedSessionContext, companyId: string, body: BulkEmployeeActionRequestDto, ipAddress?: string): Promise<{
        firstName: string;
        lastName: string;
        id: string;
        updatedAt: string;
        companyId: string;
        legajo: string;
        cuil: string;
        dni: string;
        hireDate: string;
        terminationDate: string | null;
        recognizedPriorYears: number;
        jobPosition: string;
        categoryId: string;
        categoryCode: string;
        categoryName: string;
        agreementId: string;
        agreementCode: string;
        agreementName: string;
        agreementBranchId: string;
        agreementBranchName: string;
        branchId: string;
        branchName: string;
        contractType: string;
        remunerationModality: "JORNALIZADO" | "MENSUALIZADO";
        remunerationUnit: "HORA" | "DIA" | "MES";
        paymentFrequency: "SEMANAL" | "QUINCENAL" | "MENSUAL";
        employmentStatus: "ACTIVE" | "ON_LEAVE" | "SUSPENDED" | "TERMINATED";
        obraSocialCode: string;
        obraSocialName: string;
        isUnionMember: boolean;
    }[]>;
    /**
     * Obtiene la Ficha Individual Completa del Empleado con sus 10 secciones.
     */
    getEmployeeFullProfile(client: pg.PoolClient, companyId: string, employeeId: string): Promise<{
        profile: any;
        modificationHistory: any[];
        versions: any[];
        salaryScales: any[];
        customParameters: any[];
        familyMembers: any[];
        leaves: any[];
        documents: any[];
        payslips: any[];
    } | null>;
    addFamilyMember(client: pg.PoolClient, ctx: ActivatedSessionContext, companyId: string, employeeId: string, body: {
        relationship: 'CONYUGE' | 'CONVIVIENTE' | 'HIJO' | 'OTRO';
        lastName: string;
        firstName: string;
        dni: string;
        cuil?: string | null;
        birthDate: string;
        isDependentCharge?: boolean;
        appliesObraSocialAdherent?: boolean;
    }): Promise<any>;
    addEmployeeLeave(client: pg.PoolClient, ctx: ActivatedSessionContext, companyId: string, employeeId: string, body: {
        situationType: string;
        startDate: string;
        endDate: string;
        daysCount: number;
        isPaid?: boolean;
        observations?: string | null;
    }): Promise<any>;
    addVacation(client: pg.PoolClient, ctx: ActivatedSessionContext, companyId: string, employeeId: string, body: {
        startDate: string;
        endDate: string;
        observations?: string | null;
    }): Promise<any>;
}
export declare const employeeService: EmployeeService;
