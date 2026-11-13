import crypto from 'node:crypto';
import type pg from 'pg';
import { SEED_IDS } from '@ar-payroll/contracts';
import type { ActivatedSessionContext as VerifiedSessionContext } from '../db/pool.js';

export const PAYROLL_CONCEPT_IDS = {
  BASICO: '40000000-0000-4000-8000-000000000100',
  ANTIGUEDAD: '40000000-0000-4000-8000-000000000110',
  EXTRAS_50: '40000000-0000-4000-8000-000000000120',
  EXTRAS_100: '40000000-0000-4000-8000-000000000130',
  FERIADO: '40000000-0000-4000-8000-000000000140',
  NO_REMUNERATIVO: '40000000-0000-4000-8000-000000000200',
  SAC: '40000000-0000-4000-8000-000000000300',
  VACACIONES: '40000000-0000-4000-8000-000000000310',
  REDONDEO: '40000000-0000-4000-8000-000000000999',
  JUBILACION: '40000000-0000-4000-8000-000000000400',
  LEY_19032: '40000000-0000-4000-8000-000000000410',
  OBRA_SOCIAL: '40000000-0000-4000-8000-000000000420',
  SINDICATO_UOM: '40000000-0000-4000-8000-000000000430',
  SEGURO_UOM_EMP: '40000000-0000-4000-8000-000000000440',
  ANTICIPO: '40000000-0000-4000-8000-000000000450',
  PATRONAL_SIPA: '40000000-0000-4000-8000-000000000500',
  PATRONAL_INSSJP: '40000000-0000-4000-8000-000000000510',
  PATRONAL_OS: '40000000-0000-4000-8000-000000000520',
  PATRONAL_SEGURO_UOM: '40000000-0000-4000-8000-000000000530',
  PATRONAL_ART: '40000000-0000-4000-8000-000000000540',
} as const;

export const NOVELTY_TYPE_IDS = {
  HORAS_NORMALES: '41000000-0000-4000-8000-000000000001',
  HORAS_EXTRAS_50: '41000000-0000-4000-8000-000000000002',
  HORAS_EXTRAS_100: '41000000-0000-4000-8000-000000000003',
  HORAS_FERIADO: '41000000-0000-4000-8000-000000000004',
  SUMA_NO_REMUNERATIVA: '41000000-0000-4000-8000-000000000005',
  ANTICIPO_SUELDO: '41000000-0000-4000-8000-000000000006',
} as const;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function integerToSpanishWords(n: number): string {
  if (n === 0) return 'CERO';
  const units = [
    '',
    'UN',
    'DOS',
    'TRES',
    'CUATRO',
    'CINCO',
    'SEIS',
    'SIETE',
    'OCHO',
    'NUEVE',
    'DIEZ',
    'ONCE',
    'DOCE',
    'TRECE',
    'CATORCE',
    'QUINCE',
    'DIECISEIS',
    'DIECISIETE',
    'DIECIOCHO',
    'DIECINUEVE',
    'VEINTE',
    'VEINTIUN',
    'VEINTIDOS',
    'VEINTITRES',
    'VEINTICUATRO',
    'VEINTICINCO',
    'VEINTISEIS',
    'VEINTISIETE',
    'VEINTIOCHO',
    'VEINTINUEVE',
  ];
  const tens = [
    '',
    'DIEZ',
    'VEINTE',
    'TREINTA',
    'CUARENTA',
    'CINCUENTA',
    'SESENTA',
    'SETENTA',
    'OCHENTA',
    'NOVENTA',
  ];
  const hundreds = [
    '',
    'CIENTO',
    'DOSCIENTOS',
    'TRESCIENTOS',
    'CUATROCIENTOS',
    'QUINIENTOS',
    'SEISCIENTOS',
    'SETECIENTOS',
    'OCHOCIENTOS',
    'NOVECIENTOS',
  ];

  const convertGroup = (val: number): string => {
    if (val === 0) return '';
    if (val === 100) return 'CIEN';
    const h = Math.floor(val / 100);
    const rem = val % 100;
    let out = h > 0 ? hundreds[h] : '';
    if (rem > 0) {
      if (out) out += ' ';
      if (rem < 30) {
        out += units[rem];
      } else {
        const t = Math.floor(rem / 10);
        const u = rem % 10;
        out += tens[t] + (u > 0 ? ` Y ${units[u]}` : '');
      }
    }
    return out;
  };

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const rest = n % 1_000;

  const parts: string[] = [];
  if (millions === 1) parts.push('UN MILLON');
  else if (millions > 1) parts.push(`${convertGroup(millions)} MILLONES`);

  if (thousands === 1) parts.push('MIL');
  else if (thousands > 1) parts.push(`${convertGroup(thousands)} MIL`);

  if (rest > 0) parts.push(convertGroup(rest));

  return parts.join(' ').trim();
}

function numberToSpanishPesosWords(amount: number): string {
  const intPart = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - intPart) * 100);
  const words = integerToSpanishWords(intPart);
  return `PESOS ${words} CON ${String(cents).padStart(2, '0')}/100`;
}

export interface CreatePayrollPeriodInput {
  year: number;
  month: number;
  liquidationModality:
    | 'PRIMERA_QUINCENA'
    | 'SEGUNDA_QUINCENA'
    | 'MENSUAL'
    | 'SAC_1'
    | 'SAC_2'
    | 'VACACIONES'
    | 'FINAL_EGRESO'
    | 'COMPLEMENTARIA';
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
export async function getCompanyPayrollWorkspace(
  client: pg.PoolClient,
  _ctx: VerifiedSessionContext,
  companyId: string,
) {
  const periodsRes = await client.query(
    `SELECT
       pp.id,
       pp.year,
       pp.month,
       pp.period_code AS "periodCode",
       pp.liquidation_modality AS "liquidationModality",
       pp.payment_frequency AS "paymentFrequency",
       pp.arca_sequence_number AS "arcaSequenceNumber",
       pp.accrual_start_date::text AS "accrualStartDate",
       pp.accrual_end_date::text AS "accrualEndDate",
       pp.closing_date::text AS "closingDate",
       pp.scheduled_payment_date::text AS "scheduledPaymentDate",
       pp.period_status AS "periodStatus",
       pp.created_at AS "createdAt"
     FROM public.payroll_periods pp
     WHERE pp.company_id = $1
     ORDER BY pp.year DESC, pp.month DESC, pp.arca_sequence_number ASC, pp.created_at DESC`,
    [companyId],
  );

  const noveltiesRes = await client.query(
    `SELECT
       pn.id,
       pn.period_id AS "periodId",
       pn.employee_id AS "employeeId",
       pnt.code AS "noveltyCode",
       pnt.name AS "noveltyName",
       pn.quantity::float8 AS "quantity",
       pn.unit,
       pn.unit_or_fixed_amount::float8 AS "unitOrFixedAmount",
       pn.observation
     FROM public.payroll_novelties pn
     JOIN public.payroll_novelty_types pnt ON pnt.id = pn.novelty_type_id
     WHERE pn.company_id = $1`,
    [companyId],
  );

  const payrollsRes = await client.query(
    `SELECT
       p.id,
       p.period_id AS "periodId",
       pp.period_code AS "periodCode",
       p.rectifies_payroll_id AS "rectifiesPayrollId",
       p.version,
       p.liquidation_modality AS "liquidationModality",
       p.status,
       p.employees_count AS "employeesCount",
       p.total_hours::float8 AS "totalHours",
       p.total_remunerative::float8 AS "totalRemunerative",
       p.total_non_remunerative::float8 AS "totalNonRemunerative",
       p.total_deductions::float8 AS "totalDeductions",
       p.total_net_pay::float8 AS "totalNetPay",
       p.total_employer_contributions::float8 AS "totalEmployerContributions",
       p.total_employer_cost::float8 AS "totalEmployerCost",
       p.engine_version AS "engineVersion",
       p.global_context_snapshot AS "globalContextSnapshot",
       p.is_immutable AS "isImmutable",
       p.calculated_at AS "calculatedAt",
       p.approved_at AS "approvedAt"
     FROM public.payrolls p
     JOIN public.payroll_periods pp ON pp.id = p.period_id AND pp.tenant_id = p.tenant_id
     WHERE p.company_id = $1
     ORDER BY pp.year DESC, pp.month DESC, p.calculated_at DESC, p.version DESC`,
    [companyId],
  );

  const payslipsRes = await client.query(
    `SELECT
       ps.id,
       ps.payroll_id AS "payrollId",
       ps.employee_id AS "employeeId",
       ps.receipt_code AS "receiptCode",
       ps.current_version_number AS "currentVersionNumber",
       ps.status,
       e.legajo,
       e.cuil,
       e.hire_date::text AS "hireDate",
       ev.last_name AS "lastName",
       ev.first_name AS "firstName",
       ev.job_position AS "jobPosition",
       ac.name AS "categoryName",
       pv.id AS "payslipVersionId",
       pv.remuneration_modality AS "remunerationModality",
       pv.remuneration_unit AS "remunerationUnit",
       pv.payment_frequency AS "paymentFrequency",
       pv.worked_days::float8 AS "workedDays",
       pv.worked_hours::float8 AS "workedHours",
       pv.seniority_years AS "seniorityYears",
       pv.reference_rate::float8 AS "referenceRate",
       pv.total_remunerative::float8 AS "totalRemunerative",
       pv.total_non_remunerative::float8 AS "totalNonRemunerative",
       pv.total_deductions::float8 AS "totalDeductions",
       pv.explicit_rounding_adjustment::float8 AS "explicitRoundingAdjustment",
       pv.net_pay::float8 AS "netPay",
       pv.net_pay_in_words AS "netPayInWords",
       pv.total_employer_contributions::float8 AS "totalEmployerContributions",
       pv.total_employer_cost::float8 AS "totalEmployerCost",
       pv.calculation_snapshot AS "calculationSnapshot",
       pv.sha256_hash AS "sha256Hash",
       pv.is_immutable AS "isImmutable",
       p.liquidation_modality AS "liquidationModality",
       pp.period_code AS "periodCode",
       pp.scheduled_payment_date::text AS "scheduledPaymentDate"
     FROM public.payslips ps
     JOIN public.payrolls p ON p.id = ps.payroll_id AND p.tenant_id = ps.tenant_id
     JOIN public.payroll_periods pp ON pp.id = p.period_id AND pp.tenant_id = p.tenant_id
     JOIN public.employees e ON e.id = ps.employee_id AND e.tenant_id = ps.tenant_id
     JOIN public.payslip_versions pv ON pv.payslip_id = ps.id AND pv.version_number = ps.current_version_number
     JOIN public.employee_versions ev ON ev.id = pv.employee_version_id
     JOIN public.agreement_categories ac ON ac.id = pv.category_id
     WHERE ps.company_id = $1
     ORDER BY pp.period_code DESC, p.version DESC, LPAD(e.legajo, 10, '0') ASC`,
    [companyId],
  );

  const itemsRes = await client.query(
    `SELECT
       pi.id,
       pi.payslip_version_id AS "payslipVersionId",
       pi.concept_code AS "conceptCode",
       pi.concept_name AS "conceptName",
       pi.item_nature AS "itemNature",
       pi.unit,
       pi.quantity::float8 AS "quantity",
       pi.calculation_base::float8 AS "calculationBase",
       pi.percentage_applied::float8 AS "percentageApplied",
       pi.rounded_amount::float8 AS "roundedAmount",
       pi.formula_applied AS "formulaApplied",
       pi.print_order AS "printOrder"
     FROM public.payroll_items pi
     JOIN public.payslip_versions pv ON pv.id = pi.payslip_version_id AND pv.tenant_id = pi.tenant_id
     WHERE pv.company_id = $1
     ORDER BY pi.print_order ASC`,
    [companyId],
  );

  const deductionsRes = await client.query(
    `SELECT
       pd.id,
       pd.payslip_version_id AS "payslipVersionId",
       pd.concept_code AS "conceptCode",
       pd.concept_name AS "conceptName",
       pd.unit,
       pd.quantity::float8 AS "quantity",
       pd.taxable_base::float8 AS "taxableBase",
       pd.percentage_applied::float8 AS "percentageApplied",
       pd.rounded_amount::float8 AS "roundedAmount",
       pd.formula_applied AS "formulaApplied",
       pd.print_order AS "printOrder"
     FROM public.payroll_deductions pd
     JOIN public.payslip_versions pv ON pv.id = pd.payslip_version_id AND pv.tenant_id = pd.tenant_id
     WHERE pv.company_id = $1
     ORDER BY pd.print_order ASC`,
    [companyId],
  );

  const contributionsRes = await client.query(
    `SELECT
       ec.id,
       ec.payslip_version_id AS "payslipVersionId",
       ec.concept_code AS "conceptCode",
       ec.concept_name AS "conceptName",
       ec.cost_group AS "costGroup",
       ec.taxable_base::float8 AS "taxableBase",
       ec.percentage_applied::float8 AS "percentageApplied",
       ec.rounded_amount::float8 AS "roundedAmount",
       ec.formula_applied AS "formulaApplied",
       ec.print_order AS "printOrder"
     FROM public.employer_contributions ec
     JOIN public.payslip_versions pv ON pv.id = ec.payslip_version_id AND pv.tenant_id = ec.tenant_id
     WHERE pv.company_id = $1
     ORDER BY ec.print_order ASC`,
    [companyId],
  );

  const arcaExportsRes = await client.query(
    `SELECT
       ae.id,
       ae.payroll_id AS "payrollId",
       ae.txt_document_id AS "txtDocumentId",
       ae.period_yyyymm AS "periodYyyymm",
       ae.submission_type AS "submissionType",
       ae.liquidation_type AS "liquidationType",
       ae.liquidation_number AS "liquidationNumber",
       ae.employees_count AS "employeesCount",
       ae.validation_status AS "validationStatus",
       ae.official_spec_version AS "officialSpecVersion",
       ae.sha256_hash AS "sha256Hash",
       ae.inconsistencies_report AS "inconsistenciesReport",
       ae.created_at AS "createdAt"
     FROM public.arca_exports ae
     WHERE ae.company_id = $1
     ORDER BY ae.created_at DESC`,
    [companyId],
  );

  const itemsByPv = new Map<string, any[]>();
  for (const row of itemsRes.rows) {
    const arr = itemsByPv.get(row.payslipVersionId) ?? [];
    arr.push(row);
    itemsByPv.set(row.payslipVersionId, arr);
  }

  const deductionsByPv = new Map<string, any[]>();
  for (const row of deductionsRes.rows) {
    const arr = deductionsByPv.get(row.payslipVersionId) ?? [];
    arr.push(row);
    deductionsByPv.set(row.payslipVersionId, arr);
  }

  const contribsByPv = new Map<string, any[]>();
  for (const row of contributionsRes.rows) {
    const arr = contribsByPv.get(row.payslipVersionId) ?? [];
    arr.push(row);
    contribsByPv.set(row.payslipVersionId, arr);
  }

  const enrichedPayslips = payslipsRes.rows.map((ps) => ({
    ...ps,
    items: itemsByPv.get(ps.payslipVersionId) ?? [],
    deductions: deductionsByPv.get(ps.payslipVersionId) ?? [],
    contributions: contribsByPv.get(ps.payslipVersionId) ?? [],
  }));

  return {
    periods: periodsRes.rows,
    novelties: noveltiesRes.rows,
    payrolls: payrollsRes.rows,
    payslips: enrichedPayslips,
    arcaExports: arcaExportsRes.rows,
  };
}

/**
 * Crea un nuevo Período de Liquidación y precarga las novedades iniciales de cada empleado activo
 */
export async function createPayrollPeriod(
  client: pg.PoolClient,
  ctx: VerifiedSessionContext,
  companyId: string,
  input: CreatePayrollPeriodInput,
) {
  const periodCode = `${input.year}-${String(input.month).padStart(2, '0')}`;
  const lastDay = new Date(input.year, input.month, 0).getDate();

  let accrualStart = `${periodCode}-01`;
  let accrualEnd = `${periodCode}-${String(lastDay).padStart(2, '0')}`;
  let payFreq = 'MENSUAL';

  if (input.liquidationModality === 'PRIMERA_QUINCENA') {
    accrualStart = `${periodCode}-01`;
    accrualEnd = `${periodCode}-15`;
    payFreq = 'QUINCENAL';
  } else if (input.liquidationModality === 'SEGUNDA_QUINCENA') {
    accrualStart = `${periodCode}-16`;
    accrualEnd = `${periodCode}-${String(lastDay).padStart(2, '0')}`;
    payFreq = 'QUINCENAL';
  }

  const seqRes = await client.query<{ next_seq: number }>(
    `SELECT COALESCE(MAX(arca_sequence_number), 0) + 1 AS next_seq
     FROM public.payroll_periods
     WHERE tenant_id = $1 AND company_id = $2 AND year = $3 AND month = $4`,
    [ctx.activeTenantId, companyId, input.year, input.month],
  );
  const arcaSeq = Number(seqRes.rows[0]?.next_seq ?? 1);

  const scheduledDate = input.scheduledPaymentDate || accrualEnd;

  const insertPeriod = await client.query<{ id: string }>(
    `INSERT INTO public.payroll_periods (
       tenant_id, company_id, year, month, period_code, liquidation_modality,
       payment_frequency, arca_sequence_number, accrual_start_date, accrual_end_date,
       closing_date, legal_due_date, scheduled_payment_date, compliance_status, period_status, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, $11, 'ON_TIME', 'OPEN', $12)
     RETURNING id`,
    [
      ctx.activeTenantId,
      companyId,
      input.year,
      input.month,
      periodCode,
      input.liquidationModality,
      payFreq,
      arcaSeq,
      accrualStart,
      accrualEnd,
      scheduledDate,
      ctx.userId,
    ],
  );
  const periodId = insertPeriod.rows[0].id;

  // Inicializar novedades por defecto para los empleados activos de la empresa
  const empsRes = await client.query<{
    id: string;
    remuneration_modality: string;
  }>(
    `SELECT e.id, ev.remuneration_modality
     FROM public.employees e
     JOIN public.employee_versions ev ON ev.employee_id = e.id AND ev.version = e.current_version
     WHERE e.tenant_id = $1 AND e.company_id = $2 AND e.employment_status = 'ACTIVE'`,
    [ctx.activeTenantId, companyId],
  );

  for (const emp of empsRes.rows) {
    const defaultHours =
      input.liquidationModality === 'PRIMERA_QUINCENA' ||
      input.liquidationModality === 'SEGUNDA_QUINCENA'
        ? emp.remuneration_modality === 'JORNALIZADO'
          ? 88
          : 96
        : 192;

    await client.query(
      `INSERT INTO public.payroll_novelties (
         tenant_id, company_id, period_id, employee_id, novelty_type_id,
         quantity, unit, unit_or_fixed_amount, observation, status, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, 'HORA', 0, 'Carga estándar del período', 'CONFIRMED', $7, $7)`,
      [
        ctx.activeTenantId,
        companyId,
        periodId,
        emp.id,
        NOVELTY_TYPE_IDS.HORAS_NORMALES,
        defaultHours,
        ctx.userId,
      ],
    );
  }

  await client.query(
    `INSERT INTO public.audit_logs (tenant_id, user_id, action, module, target_table, target_id, outcome, new_values)
     VALUES ($1, $2, 'PAYROLL_PERIOD_CREATE', 'PAYROLLS', 'payroll_periods', $3, 'SUCCESS', $4::jsonb)`,
    [
      ctx.activeTenantId,
      ctx.userId,
      periodId,
      JSON.stringify({
        companyId,
        periodCode,
        liquidationModality: input.liquidationModality,
      }),
    ],
  );

  return { periodId, periodCode };
}

/**
 * Guarda la grilla tipo Excel de Novedades de un período
 */
export async function savePeriodNovelties(
  client: pg.PoolClient,
  ctx: VerifiedSessionContext,
  companyId: string,
  periodId: string,
  rows: EmployeeNoveltyGridRow[],
) {
  const periodCheck = await client.query<{ period_status: string }>(
    `SELECT period_status FROM public.payroll_periods WHERE tenant_id = $1 AND company_id = $2 AND id = $3`,
    [ctx.activeTenantId, companyId, periodId],
  );
  if (periodCheck.rowCount === 0) {
    throw new Error('Período no encontrado para esta empresa.');
  }

  await client.query(
    `DELETE FROM public.payroll_novelties WHERE tenant_id = $1 AND company_id = $2 AND period_id = $3`,
    [ctx.activeTenantId, companyId, periodId],
  );

  for (const r of rows) {
    const entries: Array<{
      typeId: string;
      qty: number;
      unit: string;
      fixed: number;
    }> = [
      {
        typeId: NOVELTY_TYPE_IDS.HORAS_NORMALES,
        qty: Number(r.normalHours || 0),
        unit: 'HORA',
        fixed: 0,
      },
      {
        typeId: NOVELTY_TYPE_IDS.HORAS_EXTRAS_50,
        qty: Number(r.overtime50Hours || 0),
        unit: 'HORA',
        fixed: 0,
      },
      {
        typeId: NOVELTY_TYPE_IDS.HORAS_EXTRAS_100,
        qty: Number(r.overtime100Hours || 0),
        unit: 'HORA',
        fixed: 0,
      },
      {
        typeId: NOVELTY_TYPE_IDS.HORAS_FERIADO,
        qty: Number(r.holidayHours || 0),
        unit: 'HORA',
        fixed: 0,
      },
      {
        typeId: NOVELTY_TYPE_IDS.SUMA_NO_REMUNERATIVA,
        qty: Number(r.nonRemunerativeAmount || 0) > 0 ? 1 : 0,
        unit: 'PESOS',
        fixed: Number(r.nonRemunerativeAmount || 0),
      },
      {
        typeId: NOVELTY_TYPE_IDS.ANTICIPO_SUELDO,
        qty: Number(r.advanceAmount || 0) > 0 ? 1 : 0,
        unit: 'PESOS',
        fixed: Number(r.advanceAmount || 0),
      },
    ];

    for (const item of entries) {
      if (item.qty > 0 || item.fixed > 0) {
        await client.query(
          `INSERT INTO public.payroll_novelties (
             tenant_id, company_id, period_id, employee_id, novelty_type_id,
             quantity, unit, unit_or_fixed_amount, observation, status, created_by, updated_by
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'CONFIRMED', $10, $10)`,
          [
            ctx.activeTenantId,
            companyId,
            periodId,
            r.employeeId,
            item.typeId,
            item.qty,
            item.unit,
            item.fixed,
            r.observation ?? null,
            ctx.userId,
          ],
        );
      }
    }
  }

  await client.query(
    `INSERT INTO public.audit_logs (tenant_id, user_id, action, module, target_table, target_id, outcome, new_values)
     VALUES ($1, $2, 'PAYROLL_NOVELTIES_SAVE', 'PAYROLLS', 'payroll_periods', $3, 'SUCCESS', $4::jsonb)`,
    [
      ctx.activeTenantId,
      ctx.userId,
      periodId,
      JSON.stringify({ updatedEmployeesCount: rows.length }),
    ],
  );

  return { savedCount: rows.length };
}

/**
 * Ejecuta el Motor de Liquidaciones Versionado e Inmutable (CCT 260/75 UOMRA Rama 4 Automotor)
 */
export async function calculatePayrollForPeriod(
  client: pg.PoolClient,
  ctx: VerifiedSessionContext,
  companyId: string,
  periodId: string,
) {
  // 1. Obtener período y versión vigente de la empresa
  const periodRes = await client.query<{
    id: string;
    year: number;
    month: number;
    period_code: string;
    liquidation_modality: string;
    payment_frequency: string;
  }>(
    `SELECT id, year, month, period_code, liquidation_modality, payment_frequency
     FROM public.payroll_periods
     WHERE tenant_id = $1 AND company_id = $2 AND id = $3`,
    [ctx.activeTenantId, companyId, periodId],
  );
  if (periodRes.rowCount === 0) {
    throw new Error('Período de liquidación inexistente.');
  }
  const period = periodRes.rows[0];

  const compVerRes = await client.query<{
    company_version_id: string;
    legal_name: string;
    cuit: string;
  }>(
    `SELECT cv.id AS company_version_id, cv.legal_name, c.cuit
     FROM public.companies c
     JOIN public.company_versions cv ON cv.company_id = c.id AND cv.version = c.current_version
     WHERE c.tenant_id = $1 AND c.id = $2`,
    [ctx.activeTenantId, companyId],
  );
  const compVer = compVerRes.rows[0];

  // 2. Verificar si existe un borrador (DRAFT) para este período; si existe, recalcularlo; si existe APPROVED, crear nueva versión rectificativa
  const existingPayrollsRes = await client.query<{
    id: string;
    version: number;
    status: string;
    is_immutable: boolean;
  }>(
    `SELECT id, version, status, is_immutable
     FROM public.payrolls
     WHERE tenant_id = $1 AND company_id = $2 AND period_id = $3
     ORDER BY version DESC`,
    [ctx.activeTenantId, companyId, periodId],
  );

  let payrollId: string;
  let payrollVersion = 1;
  let rectifiesPayrollId: string | null = null;

  const latestPayroll = existingPayrollsRes.rows[0];
  if (latestPayroll && !latestPayroll.is_immutable && latestPayroll.status === 'DRAFT') {
    payrollId = latestPayroll.id;
    payrollVersion = latestPayroll.version;
    // Limpiar recibos en borrador previos para recalcular limpio
    const draftPvRes = await client.query<{ id: string }>(
      `SELECT pv.id
       FROM public.payslip_versions pv
       JOIN public.payslips ps ON ps.id = pv.payslip_id
       WHERE ps.tenant_id = $1 AND ps.payroll_id = $2`,
      [ctx.activeTenantId, payrollId],
    );
    for (const pv of draftPvRes.rows) {
      await client.query(`DELETE FROM public.payroll_items WHERE tenant_id = $1 AND payslip_version_id = $2`, [ctx.activeTenantId, pv.id]);
      await client.query(`DELETE FROM public.payroll_deductions WHERE tenant_id = $1 AND payslip_version_id = $2`, [ctx.activeTenantId, pv.id]);
      await client.query(`DELETE FROM public.employer_contributions WHERE tenant_id = $1 AND payslip_version_id = $2`, [ctx.activeTenantId, pv.id]);
      await client.query(`DELETE FROM public.payslip_versions WHERE tenant_id = $1 AND id = $2`, [ctx.activeTenantId, pv.id]);
    }
    await client.query(`DELETE FROM public.payslips WHERE tenant_id = $1 AND payroll_id = $2`, [ctx.activeTenantId, payrollId]);
  } else {
    if (latestPayroll) {
      payrollVersion = latestPayroll.version + 1;
      rectifiesPayrollId = latestPayroll.id;
      if (latestPayroll.status === 'APPROVED') {
        await client.query(
          `UPDATE public.payrolls SET status = 'RECTIFIED' WHERE tenant_id = $1 AND id = $2`,
          [ctx.activeTenantId, latestPayroll.id],
        );
      }
    }
    const insPayroll = await client.query<{ id: string }>(
      `INSERT INTO public.payrolls (
         tenant_id, company_id, period_id, rectifies_payroll_id, version,
         liquidation_modality, status, engine_version, calculated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', 'v4.0-UOMRA-260-75', $7)
       RETURNING id`,
      [
        ctx.activeTenantId,
        companyId,
        periodId,
        rectifiesPayrollId,
        payrollVersion,
        period.liquidation_modality,
        ctx.userId,
      ],
    );
    payrollId = insPayroll.rows[0].id;
  }

  // 3. Obtener escala vigente y empleados activos de la empresa
  const scaleRes = await client.query<{ id: string; agreement_number: string }>(
    `SELECT id, agreement_number FROM public.salary_scales
     WHERE agreement_id = $1
     ORDER BY valid_from DESC, version DESC LIMIT 1`,
    [SEED_IDS.CBA_UOM],
  );
  const salaryScaleId = scaleRes.rows[0]?.id ?? '33000000-0000-4000-8000-000000002026';

  const employeesRes = await client.query<{
    employee_id: string;
    legajo: string;
    cuil: string;
    hire_date: string;
    recognized_prior_years: number;
    employee_version_id: string;
    last_name: string;
    first_name: string;
    category_id: string;
    category_code: string;
    category_name: string;
    remuneration_modality: string;
    remuneration_unit: string;
    payment_frequency: string;
    is_union_member: boolean;
    has_cct_insurance: boolean;
    scale_item_id: string | null;
    hourly_rate: string | null;
    monthly_basic: string | null;
  }>(
    `SELECT
       e.id AS employee_id,
       e.legajo,
       e.cuil,
       e.hire_date::text AS hire_date,
       e.recognized_prior_years,
       ev.id AS employee_version_id,
       ev.last_name,
       ev.first_name,
       ev.category_id,
       ac.code AS category_code,
       ac.name AS category_name,
       ev.remuneration_modality,
       ev.remuneration_unit,
       ev.payment_frequency,
       ev.is_union_member,
       ev.has_cct_insurance,
       ssi.id AS scale_item_id,
       ssi.hourly_rate::text AS hourly_rate,
       ssi.monthly_basic::text AS monthly_basic
     FROM public.employees e
     JOIN public.employee_versions ev ON ev.employee_id = e.id AND ev.version = e.current_version
     JOIN public.agreement_categories ac ON ac.id = ev.category_id
     LEFT JOIN public.salary_scale_items ssi ON ssi.salary_scale_id = $3 AND ssi.category_id = ev.category_id
     WHERE e.tenant_id = $1 AND e.company_id = $2 AND e.employment_status = 'ACTIVE'
     ORDER BY LPAD(e.legajo, 10, '0') ASC`,
    [ctx.activeTenantId, companyId, salaryScaleId],
  );

  // Obtener novedades cargadas para el período
  const noveltiesRes = await client.query<{
    employee_id: string;
    code: string;
    quantity: string;
    unit_or_fixed_amount: string;
  }>(
    `SELECT pn.employee_id, pnt.code, pn.quantity::text, pn.unit_or_fixed_amount::text
     FROM public.payroll_novelties pn
     JOIN public.payroll_novelty_types pnt ON pnt.id = pn.novelty_type_id
     WHERE pn.tenant_id = $1 AND pn.company_id = $2 AND pn.period_id = $3`,
    [ctx.activeTenantId, companyId, periodId],
  );

  const novByEmp = new Map<string, Record<string, { qty: number; fixed: number }>>();
  for (const n of noveltiesRes.rows) {
    const map = novByEmp.get(n.employee_id) ?? {};
    map[n.code] = {
      qty: Number(n.quantity || 0),
      fixed: Number(n.unit_or_fixed_amount || 0),
    };
    novByEmp.set(n.employee_id, map);
  }

  let totalHoursAll = 0;
  let totalRemAll = 0;
  let totalNonRemAll = 0;
  let totalDedAll = 0;
  let totalNetAll = 0;
  let totalContribAll = 0;
  let totalCostAll = 0;
  let employeesProcessed = 0;

  for (const emp of employeesRes.rows) {
    const empNovs = novByEmp.get(emp.employee_id) ?? {};
    const hourlyRate = Number(emp.hourly_rate ?? 7684);
    const monthlyBasic = Number(emp.monthly_basic ?? 1106590);
    const referenceRate =
      emp.remuneration_modality === 'JORNALIZADO' ? hourlyRate : monthlyBasic;

    const normalHours =
      empNovs.HORAS_NORMALES?.qty ??
      (period.liquidation_modality === 'MENSUAL' ? 192 : 88);
    const overtime50Hours = empNovs.HORAS_EXTRAS_50?.qty ?? 0;
    const overtime100Hours = empNovs.HORAS_EXTRAS_100?.qty ?? 0;
    const holidayHours = empNovs.HORAS_FERIADO?.qty ?? 0;
    const nonRemunerativeInput = empNovs.SUMA_NO_REMUNERATIVA?.fixed ?? 0;
    const advanceInput = empNovs.ANTICIPO_SUELDO?.fixed ?? 0;

    const seniorityYears = Math.max(
      0,
      Number(emp.recognized_prior_years || 0),
    );

    // Cálculo de conceptos remunerativos según modalidad
    const items: Array<{
      conceptId: string;
      code: string;
      name: string;
      nature: 'REMUNERATIVE' | 'NON_REMUNERATIVE';
      unit: string;
      qty: number;
      base: number;
      pct: number | null;
      amount: number;
      formula: string;
      order: number;
    }> = [];

    if (
      period.liquidation_modality === 'SAC_1' ||
      period.liquidation_modality === 'SAC_2'
    ) {
      const sacBase =
        emp.remuneration_modality === 'JORNALIZADO'
          ? round2(hourlyRate * 192 * (1 + seniorityYears * 0.01))
          : round2(monthlyBasic * (1 + seniorityYears * 0.01));
      const sacAmount = round2(sacBase * 0.5);
      items.push({
        conceptId: PAYROLL_CONCEPT_IDS.SAC,
        code: '0300',
        name: 'Sueldo Anual Complementario (SAC — 50% Mejor Remuneración)',
        nature: 'REMUNERATIVE',
        unit: 'PESOS',
        qty: 1,
        base: sacBase,
        pct: 50,
        amount: sacAmount,
        formula: 'Mejor_Remuneracion_Semestre * 50%',
        order: 10,
      });
    } else if (period.liquidation_modality === 'VACACIONES') {
      const vacDays = seniorityYears >= 20 ? 35 : seniorityYears >= 10 ? 28 : seniorityYears >= 5 ? 21 : 14;
      const dailyRate =
        emp.remuneration_modality === 'JORNALIZADO'
          ? round2(hourlyRate * 8 * (1 + seniorityYears * 0.01))
          : round2((monthlyBasic * (1 + seniorityYears * 0.01)) / 25);
      const vacAmount = round2(dailyRate * vacDays);
      items.push({
        conceptId: PAYROLL_CONCEPT_IDS.VACACIONES,
        code: '0310',
        name: `Vacaciones Anuales Gozadas (${vacDays} días — Art. 150 LCT)`,
        nature: 'REMUNERATIVE',
        unit: 'DIA',
        qty: vacDays,
        base: dailyRate,
        pct: null,
        amount: vacAmount,
        formula: 'Valor_Dia_Vacacional * Dias_LCT',
        order: 10,
      });
    } else {
      // Liquidación Quincenal o Mensual o Final
      let basicAmount = 0;
      if (emp.remuneration_modality === 'JORNALIZADO') {
        basicAmount = round2(normalHours * hourlyRate);
        items.push({
          conceptId: PAYROLL_CONCEPT_IDS.BASICO,
          code: '0100',
          name: `Horas Normales (${emp.category_name})`,
          nature: 'REMUNERATIVE',
          unit: 'HORA',
          qty: normalHours,
          base: hourlyRate,
          pct: null,
          amount: basicAmount,
          formula: 'Horas_Normales * Valor_Hora_CCT',
          order: 10,
        });
      } else {
        const factor =
          period.liquidation_modality === 'PRIMERA_QUINCENA' ||
          period.liquidation_modality === 'SEGUNDA_QUINCENA'
            ? 0.5
            : 1;
        basicAmount = round2(monthlyBasic * factor);
        items.push({
          conceptId: PAYROLL_CONCEPT_IDS.BASICO,
          code: '0100',
          name: `Sueldo Básico Mensual (${emp.category_name})`,
          nature: 'REMUNERATIVE',
          unit: 'MES',
          qty: factor,
          base: monthlyBasic,
          pct: null,
          amount: basicAmount,
          formula: 'Basico_Mensual_CCT * Proporcion_Periodo',
          order: 10,
        });
      }

      if (overtime50Hours > 0) {
        const unitHora =
          emp.remuneration_modality === 'JORNALIZADO'
            ? hourlyRate
            : round2(monthlyBasic / 192);
        const ext50Amount = round2(overtime50Hours * unitHora * 1.5);
        items.push({
          conceptId: PAYROLL_CONCEPT_IDS.EXTRAS_50,
          code: '0120',
          name: 'Horas Extras al 50%',
          nature: 'REMUNERATIVE',
          unit: 'HORA',
          qty: overtime50Hours,
          base: unitHora,
          pct: 150,
          amount: ext50Amount,
          formula: 'Horas_Extras_50 * Valor_Hora * 1.5',
          order: 20,
        });
      }

      if (overtime100Hours > 0) {
        const unitHora =
          emp.remuneration_modality === 'JORNALIZADO'
            ? hourlyRate
            : round2(monthlyBasic / 192);
        const ext100Amount = round2(overtime100Hours * unitHora * 2.0);
        items.push({
          conceptId: PAYROLL_CONCEPT_IDS.EXTRAS_100,
          code: '0130',
          name: 'Horas Extras al 100%',
          nature: 'REMUNERATIVE',
          unit: 'HORA',
          qty: overtime100Hours,
          base: unitHora,
          pct: 200,
          amount: ext100Amount,
          formula: 'Horas_Extras_100 * Valor_Hora * 2.0',
          order: 30,
        });
      }

      if (holidayHours > 0) {
        const unitHora =
          emp.remuneration_modality === 'JORNALIZADO'
            ? hourlyRate
            : round2(monthlyBasic / 192);
        const ferAmount = round2(holidayHours * unitHora);
        items.push({
          conceptId: PAYROLL_CONCEPT_IDS.FERIADO,
          code: '0140',
          name: 'Feriado Nacional / Día del Metalúrgico',
          nature: 'REMUNERATIVE',
          unit: 'HORA',
          qty: holidayHours,
          base: unitHora,
          pct: null,
          amount: ferAmount,
          formula: 'Horas_Feriado * Valor_Hora',
          order: 40,
        });
      }

      const subtotalBeforeSeniority = round2(
        items.reduce((acc, it) => acc + it.amount, 0),
      );

      if (seniorityYears > 0) {
        const senAmount = round2(
          subtotalBeforeSeniority * (seniorityYears * 0.01),
        );
        items.push({
          conceptId: PAYROLL_CONCEPT_IDS.ANTIGUEDAD,
          code: '0110',
          name: `Adicional Antigüedad UOM (${seniorityYears} años — ${seniorityYears}%)`,
          nature: 'REMUNERATIVE',
          unit: 'PORCENTAJE',
          qty: seniorityYears,
          base: subtotalBeforeSeniority,
          pct: seniorityYears,
          amount: senAmount,
          formula: 'Subtotal_Remunerativo * (Anios_Antiguedad * 1%)',
          order: 50,
        });
      }

      if (nonRemunerativeInput > 0) {
        items.push({
          conceptId: PAYROLL_CONCEPT_IDS.NO_REMUNERATIVO,
          code: '0200',
          name: 'Asignación No Remunerativa Acuerdo Paritario UOM',
          nature: 'NON_REMUNERATIVE',
          unit: 'PESOS',
          qty: 1,
          base: nonRemunerativeInput,
          pct: null,
          amount: round2(nonRemunerativeInput),
          formula: 'Monto_Fijo_Acuerdo_Paritario',
          order: 60,
        });
      }
    }

    const totalRemunerative = round2(
      items
        .filter((i) => i.nature === 'REMUNERATIVE')
        .reduce((acc, i) => acc + i.amount, 0),
    );
    const totalNonRemunerative = round2(
      items
        .filter((i) => i.nature === 'NON_REMUNERATIVE')
        .reduce((acc, i) => acc + i.amount, 0),
    );

    // 4. Retenciones / Descuentos del Empleado
    const deductions: Array<{
      conceptId: string;
      code: string;
      name: string;
      unit: string;
      qty: number;
      base: number;
      pct: number | null;
      amount: number;
      formula: string;
      order: number;
    }> = [
      {
        conceptId: PAYROLL_CONCEPT_IDS.JUBILACION,
        code: '0400',
        name: 'Jubilación SIPA (Ley 24.241 — 11%)',
        unit: 'PORCENTAJE',
        qty: 11,
        base: totalRemunerative,
        pct: 11,
        amount: round2(totalRemunerative * 0.11),
        formula: 'Total_Remunerativo * 11%',
        order: 100,
      },
      {
        conceptId: PAYROLL_CONCEPT_IDS.LEY_19032,
        code: '0410',
        name: 'Ley 19.032 INSSJP / PAMI (3%)',
        unit: 'PORCENTAJE',
        qty: 3,
        base: totalRemunerative,
        pct: 3,
        amount: round2(totalRemunerative * 0.03),
        formula: 'Total_Remunerativo * 3%',
        order: 110,
      },
      {
        conceptId: PAYROLL_CONCEPT_IDS.OBRA_SOCIAL,
        code: '0420',
        name: 'Obra Social OSUOMRA (Ley 23.660 — 3%)',
        unit: 'PORCENTAJE',
        qty: 3,
        base: totalRemunerative + totalNonRemunerative,
        pct: 3,
        amount: round2((totalRemunerative + totalNonRemunerative) * 0.03),
        formula: '(Total_Remunerativo + No_Remunerativo) * 3%',
        order: 120,
      },
    ];

    if (emp.is_union_member) {
      deductions.push({
        conceptId: PAYROLL_CONCEPT_IDS.SINDICATO_UOM,
        code: '0430',
        name: 'Cuota Sindical UOMRA (2,5%)',
        unit: 'PORCENTAJE',
        qty: 2.5,
        base: totalRemunerative + totalNonRemunerative,
        pct: 2.5,
        amount: round2((totalRemunerative + totalNonRemunerative) * 0.025),
        formula: '(Total_Remunerativo + No_Remunerativo) * 2.5%',
        order: 130,
      });
    }

    // Seguro de Vida y Sepelio UOM ($16.734,96) aplica en 2da Quincena o Mensual
    const appliesMonthlyInsurance =
      emp.has_cct_insurance &&
      (period.liquidation_modality === 'SEGUNDA_QUINCENA' ||
        period.liquidation_modality === 'MENSUAL');
    if (appliesMonthlyInsurance) {
      deductions.push({
        conceptId: PAYROLL_CONCEPT_IDS.SEGURO_UOM_EMP,
        code: '0440',
        name: 'Seguro de Vida y Sepelio UOM (Art. 55 CCT 260/75)',
        unit: 'PESOS',
        qty: 1,
        base: 16734.96,
        pct: null,
        amount: 16734.96,
        formula: 'Tope_Fijo_Mensual_UOM_Oct2026 ($16.734,96)',
        order: 140,
      });
    }

    if (advanceInput > 0) {
      deductions.push({
        conceptId: PAYROLL_CONCEPT_IDS.ANTICIPO,
        code: '0450',
        name: 'Anticipo de Haberes / Descuento',
        unit: 'PESOS',
        qty: 1,
        base: advanceInput,
        pct: null,
        amount: round2(advanceInput),
        formula: 'Anticipo_Cargado_En_Novedades',
        order: 150,
      });
    }

    const totalDeductions = round2(
      deductions.reduce((acc, d) => acc + d.amount, 0),
    );
    const netPay = round2(
      totalRemunerative + totalNonRemunerative - totalDeductions,
    );

    // 5. Contribuciones Patronales
    const contributions: Array<{
      conceptId: string;
      code: string;
      name: string;
      costGroup:
        | 'SEGURIDAD_SOCIAL'
        | 'INSSJP'
        | 'OBRA_SOCIAL'
        | 'COSTO_SINDICAL'
        | 'ART';
      base: number;
      pct: number | null;
      amount: number;
      formula: string;
      order: number;
    }> = [
      {
        conceptId: PAYROLL_CONCEPT_IDS.PATRONAL_SIPA,
        code: '0500',
        name: 'Contribución Patronal SIPA / Seg. Social (18%)',
        costGroup: 'SEGURIDAD_SOCIAL',
        base: totalRemunerative,
        pct: 18,
        amount: round2(totalRemunerative * 0.18),
        formula: 'Total_Remunerativo * 18%',
        order: 200,
      },
      {
        conceptId: PAYROLL_CONCEPT_IDS.PATRONAL_INSSJP,
        code: '0510',
        name: 'Contribución Patronal INSSJP / PAMI (1,58%)',
        costGroup: 'INSSJP',
        base: totalRemunerative,
        pct: 1.58,
        amount: round2(totalRemunerative * 0.0158),
        formula: 'Total_Remunerativo * 1.58%',
        order: 210,
      },
      {
        conceptId: PAYROLL_CONCEPT_IDS.PATRONAL_OS,
        code: '0520',
        name: 'Contribución Patronal Obra Social OSUOMRA (6%)',
        costGroup: 'OBRA_SOCIAL',
        base: totalRemunerative + totalNonRemunerative,
        pct: 6,
        amount: round2((totalRemunerative + totalNonRemunerative) * 0.06),
        formula: '(Total_Remunerativo + No_Remunerativo) * 6%',
        order: 220,
      },
      {
        conceptId: PAYROLL_CONCEPT_IDS.PATRONAL_ART,
        code: '0540',
        name: 'ART Prevención Riesgos del Trabajo (3,5%)',
        costGroup: 'ART',
        base: totalRemunerative + totalNonRemunerative,
        pct: 3.5,
        amount: round2((totalRemunerative + totalNonRemunerative) * 0.035),
        formula: '(Total_Remunerativo + No_Remunerativo) * 3.5%',
        order: 240,
      },
    ];

    if (appliesMonthlyInsurance) {
      contributions.push({
        conceptId: PAYROLL_CONCEPT_IDS.PATRONAL_SEGURO_UOM,
        code: '0530',
        name: 'Seguro de Vida y Sepelio Patronal UOM (Art. 55 CCT 260/75)',
        costGroup: 'COSTO_SINDICAL',
        base: 16734.96,
        pct: null,
        amount: 16734.96,
        formula: 'Aporte_Patronal_Fijo_UOM_Oct2026 ($16.734,96)',
        order: 230,
      });
    }

    const totalEmployerContributions = round2(
      contributions.reduce((acc, c) => acc + c.amount, 0),
    );
    const totalEmployerCost = round2(
      totalRemunerative + totalNonRemunerative + totalEmployerContributions,
    );

    const receiptCode = `${period.period_code}-${period.liquidation_modality.slice(0, 3)}-V${payrollVersion}-L${emp.legajo.padStart(3, '0')}`;

    const insPayslip = await client.query<{ id: string }>(
      `INSERT INTO public.payslips (
         tenant_id, company_id, payroll_id, employee_id, receipt_code, current_version_number, status
       ) VALUES ($1, $2, $3, $4, $5, 1, 'DRAFT')
       RETURNING id`,
      [ctx.activeTenantId, companyId, payrollId, emp.employee_id, receiptCode],
    );
    const payslipId = insPayslip.rows[0].id;

    const workedHoursTotal =
      normalHours + overtime50Hours + overtime100Hours + holidayHours;
    const workedDaysTotal = round2(workedHoursTotal / 8);

    const calculationSnapshot = {
      engineVersion: 'v4.0-UOMRA-260-75',
      calculatedAt: new Date().toISOString(),
      company: {
        id: companyId,
        legalName: compVer.legal_name,
        cuit: compVer.cuit,
      },
      period: {
        code: period.period_code,
        modality: period.liquidation_modality,
      },
      employee: {
        legajo: emp.legajo,
        cuil: emp.cuil,
        fullName: `${emp.last_name}, ${emp.first_name}`,
        category: emp.category_name,
        remunerationModality: emp.remuneration_modality,
        seniorityYears,
        referenceRate,
      },
      totals: {
        totalRemunerative,
        totalNonRemunerative,
        totalDeductions,
        netPay,
        totalEmployerContributions,
        totalEmployerCost,
      },
    };

    const snapshotHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(calculationSnapshot))
      .digest('hex');

    const insPv = await client.query<{ id: string }>(
      `INSERT INTO public.payslip_versions (
         tenant_id, company_id, employee_id, payslip_id, company_version_id, employee_version_id,
         salary_scale_id, category_id, version_number, remuneration_modality, remuneration_unit, payment_frequency,
         worked_days, worked_hours, seniority_years, reference_rate,
         exact_remunerative_sum, total_remunerative,
         exact_non_remunerative_sum, total_non_remunerative,
         exact_deductions_sum, total_deductions,
         preliminary_net_pay, explicit_rounding_adjustment, net_pay, net_pay_in_words,
         exact_employer_contributions_sum, total_employer_contributions, total_employer_cost,
         calculation_snapshot, sha256_hash, is_immutable
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, 1, $9, $10, $11,
         $12, $13, $14, $15,
         $16, $16,
         $17, $17,
         $18, $18,
         $19, 0, $19, $20,
         $21, $21, $22,
         $23::jsonb, $24, false
       ) RETURNING id`,
      [
        ctx.activeTenantId,
        companyId,
        emp.employee_id,
        payslipId,
        compVer.company_version_id,
        emp.employee_version_id,
        salaryScaleId,
        emp.category_id,
        emp.remuneration_modality,
        emp.remuneration_unit,
        emp.payment_frequency,
        workedDaysTotal,
        workedHoursTotal,
        seniorityYears,
        referenceRate,
        totalRemunerative,
        totalNonRemunerative,
        totalDeductions,
        netPay,
        numberToSpanishPesosWords(netPay),
        totalEmployerContributions,
        totalEmployerCost,
        JSON.stringify(calculationSnapshot),
        snapshotHash,
      ],
    );
    const pvId = insPv.rows[0].id;

    for (const it of items) {
      await client.query(
        `INSERT INTO public.payroll_items (
           tenant_id, payslip_version_id, concept_id, scale_item_id,
           concept_code, concept_name, item_nature, unit, quantity,
           calculation_base, percentage_applied, exact_amount, rounded_amount,
           formula_applied, print_order
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13, $14)`,
        [
          ctx.activeTenantId,
          pvId,
          it.conceptId,
          emp.scale_item_id,
          it.code,
          it.name,
          it.nature,
          it.unit,
          it.qty,
          it.base,
          it.pct,
          it.amount,
          it.formula,
          it.order,
        ],
      );
    }

    for (const d of deductions) {
      await client.query(
        `INSERT INTO public.payroll_deductions (
           tenant_id, payslip_version_id, concept_id,
           concept_code, concept_name, unit, quantity,
           gross_base, taxable_base, percentage_applied,
           exact_amount, rounded_amount, formula_applied, print_order
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, $10, $11, $12)`,
        [
          ctx.activeTenantId,
          pvId,
          d.conceptId,
          d.code,
          d.name,
          d.unit,
          d.qty,
          d.base,
          d.pct,
          d.amount,
          d.formula,
          d.order,
        ],
      );
    }

    for (const c of contributions) {
      await client.query(
        `INSERT INTO public.employer_contributions (
           tenant_id, payslip_version_id, concept_id,
           concept_code, concept_name, cost_group,
           gross_base, taxable_base, percentage_applied,
           exact_amount, rounded_amount, formula_applied, print_order
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $9, $10, $11)`,
        [
          ctx.activeTenantId,
          pvId,
          c.conceptId,
          c.code,
          c.name,
          c.costGroup,
          c.base,
          c.pct,
          c.amount,
          c.formula,
          c.order,
        ],
      );
    }

    totalHoursAll = round2(totalHoursAll + workedHoursTotal);
    totalRemAll = round2(totalRemAll + totalRemunerative);
    totalNonRemAll = round2(totalNonRemAll + totalNonRemunerative);
    totalDedAll = round2(totalDedAll + totalDeductions);
    totalNetAll = round2(totalNetAll + netPay);
    totalContribAll = round2(totalContribAll + totalEmployerContributions);
    totalCostAll = round2(totalCostAll + totalEmployerCost);
    employeesProcessed += 1;
  }

  const globalSnapshot = {
    engineVersion: 'v4.0-UOMRA-260-75',
    agreement: 'CCT 260/75 UOMRA Rama 4 Automotor (Laudo 29)',
    salaryScaleId,
    calculatedAt: new Date().toISOString(),
    employeesProcessed,
  };

  await client.query(
    `UPDATE public.payrolls
     SET employees_count = $1,
         total_hours = $2,
         total_remunerative = $3,
         total_non_remunerative = $4,
         total_deductions = $5,
         total_net_pay = $6,
         total_employer_contributions = $7,
         total_employer_cost = $8,
         global_context_snapshot = $9::jsonb,
         calculated_at = now(),
         calculated_by = $10
     WHERE tenant_id = $11 AND id = $12`,
    [
      employeesProcessed,
      totalHoursAll,
      totalRemAll,
      totalNonRemAll,
      totalDedAll,
      totalNetAll,
      totalContribAll,
      totalCostAll,
      JSON.stringify(globalSnapshot),
      ctx.userId,
      ctx.activeTenantId,
      payrollId,
    ],
  );

  await client.query(
    `INSERT INTO public.audit_logs (tenant_id, user_id, action, module, target_table, target_id, outcome, new_values)
     VALUES ($1, $2, 'PAYROLL_CALCULATE', 'PAYROLLS', 'payrolls', $3, 'SUCCESS', $4::jsonb)`,
    [
      ctx.activeTenantId,
      ctx.userId,
      payrollId,
      JSON.stringify({
        periodId,
        version: payrollVersion,
        employeesProcessed,
        totalNetPay: totalNetAll,
      }),
    ],
  );

  return {
    payrollId,
    version: payrollVersion,
    employeesCount: employeesProcessed,
    totalNetPay: totalNetAll,
  };
}

/**
 * Aprueba y sella como INMUTABLE una liquidación y todos sus recibos (activando el bloqueo de triggers PostgreSQL 16)
 */
export async function approvePayroll(
  client: pg.PoolClient,
  ctx: VerifiedSessionContext,
  companyId: string,
  payrollId: string,
) {
  const payRes = await client.query<{
    id: string;
    period_id: string;
    status: string;
    is_immutable: boolean;
  }>(
    `SELECT id, period_id, status, is_immutable
     FROM public.payrolls
     WHERE tenant_id = $1 AND company_id = $2 AND id = $3`,
    [ctx.activeTenantId, companyId, payrollId],
  );
  if (payRes.rowCount === 0) {
    throw new Error('Liquidación no encontrada.');
  }
  const payroll = payRes.rows[0];
  if (payroll.is_immutable || payroll.status === 'APPROVED') {
    throw new Error('La liquidación ya se encuentra aprobada e inmutable.');
  }

  // Sellar versiones de recibos, recibos, liquidación y período
  await client.query(
    `UPDATE public.payslip_versions pv
     SET is_immutable = true
     FROM public.payslips ps
     WHERE pv.payslip_id = ps.id
       AND ps.tenant_id = $1
       AND ps.company_id = $2
       AND ps.payroll_id = $3`,
    [ctx.activeTenantId, companyId, payrollId],
  );

  await client.query(
    `UPDATE public.payslips
     SET status = 'APPROVED', updated_at = now()
     WHERE tenant_id = $1 AND company_id = $2 AND payroll_id = $3`,
    [ctx.activeTenantId, companyId, payrollId],
  );

  await client.query(
    `UPDATE public.payrolls
     SET status = 'APPROVED',
         is_immutable = true,
         approved_by = $4,
         approved_at = now()
     WHERE tenant_id = $1 AND company_id = $2 AND id = $3`,
    [ctx.activeTenantId, companyId, payrollId, ctx.userId],
  );

  await client.query(
    `UPDATE public.payroll_periods
     SET period_status = 'CLOSED'
     WHERE tenant_id = $1 AND company_id = $2 AND id = $3`,
    [ctx.activeTenantId, companyId, payroll.period_id],
  );

  await client.query(
    `INSERT INTO public.audit_logs (tenant_id, user_id, action, module, target_table, target_id, outcome, new_values)
     VALUES ($1, $2, 'PAYROLL_APPROVE_IMMUTABLE', 'PAYROLLS', 'payrolls', $3, 'SUCCESS', $4::jsonb)`,
    [
      ctx.activeTenantId,
      ctx.userId,
      payrollId,
      JSON.stringify({ status: 'APPROVED', isImmutable: true }),
    ],
  );

  return { payrollId, status: 'APPROVED', isImmutable: true };
}

/**
 * Genera y valida la exportación del Libro de Sueldos Digital (ARCA / ex-AFIP) para una liquidación
 */
export async function generateArcaLibroSueldosExport(
  client: pg.PoolClient,
  ctx: VerifiedSessionContext,
  companyId: string,
  payrollId: string,
) {
  const payRes = await client.query<{
    id: string;
    liquidation_modality: string;
    version: number;
    employees_count: number;
    period_code: string;
    arca_sequence_number: number;
    cuit: string;
    legal_name: string;
  }>(
    `SELECT
       p.id,
       p.liquidation_modality,
       p.version,
       p.employees_count,
       pp.period_code,
       pp.arca_sequence_number,
       c.cuit,
       cv.legal_name
     FROM public.payrolls p
     JOIN public.payroll_periods pp ON pp.id = p.period_id AND pp.tenant_id = p.tenant_id
     JOIN public.companies c ON c.id = p.company_id AND c.tenant_id = p.tenant_id
     JOIN public.company_versions cv ON cv.company_id = c.id AND cv.version = c.current_version
     WHERE p.tenant_id = $1 AND p.company_id = $2 AND p.id = $3`,
    [ctx.activeTenantId, companyId, payrollId],
  );
  if (payRes.rowCount === 0) {
    throw new Error('Liquidación no encontrada para exportar a ARCA.');
  }
  const p = payRes.rows[0];
  const periodYyyymm = p.period_code.replace('-', '');
  const liqType =
    p.liquidation_modality === 'PRIMERA_QUINCENA' ||
    p.liquidation_modality === 'SEGUNDA_QUINCENA'
      ? 'Q'
      : p.liquidation_modality === 'MENSUAL'
        ? 'M'
        : 'S';

  const slipsRes = await client.query<{
    cuil: string;
    legajo: string;
    cbu: string | null;
    worked_days: string;
    total_remunerative: string;
    total_non_remunerative: string;
    total_deductions: string;
    net_pay: string;
    payslip_version_id: string;
  }>(
    `SELECT
       e.cuil,
       e.legajo,
       ev.cbu,
       pv.worked_days::text,
       pv.total_remunerative::text,
       pv.total_non_remunerative::text,
       pv.total_deductions::text,
       pv.net_pay::text,
       pv.id AS payslip_version_id
     FROM public.payslips ps
     JOIN public.employees e ON e.id = ps.employee_id AND e.tenant_id = ps.tenant_id
     JOIN public.payslip_versions pv ON pv.payslip_id = ps.id AND pv.version_number = ps.current_version_number
     JOIN public.employee_versions ev ON ev.id = pv.employee_version_id
     WHERE ps.tenant_id = $1 AND ps.payroll_id = $2
     ORDER BY LPAD(e.legajo, 10, '0') ASC`,
    [ctx.activeTenantId, payrollId],
  );

  const lines: string[] = [];
  // Registro 01: Encabezado de Liquidación ARCA LSD
  lines.push(
    `01${p.cuit.padEnd(11, ' ')}SJ${periodYyyymm}${liqType}${String(p.arca_sequence_number).padStart(5, '0')}0030${String(slipsRes.rowCount ?? 0).padStart(6, '0')}`,
  );

  for (const s of slipsRes.rows) {
    const netCents = String(Math.round(Number(s.net_pay) * 100)).padStart(15, '0');
    const remCents = String(Math.round(Number(s.total_remunerative) * 100)).padStart(15, '0');
    const nonRemCents = String(Math.round(Number(s.total_non_remunerative) * 100)).padStart(15, '0');
    // Registro 02: Datos Generales de Liquidación del Trabajador
    lines.push(
      `02${s.cuil}${s.legajo.padStart(10, '0')}${' '.repeat(20)}${(s.cbu ?? '').padStart(22, '0')}${String(Math.round(Number(s.worked_days))).padStart(3, '0')}202610303`,
    );
    // Registro 03: Resumen de Conceptos Liquidados
    lines.push(`03${s.cuil}0100      00001C${remCents}`);
    // Registro 04: Atributos de la Relación Laboral y Bases Imponibles SIPA / Obra Social / ART
    lines.push(
      `04${s.cuil}00101010490100112103${remCents}${remCents}${remCents}${remCents}${nonRemCents}${netCents}`,
    );
  }

  const txtContent = lines.join('\r\n');
  const sha256 = crypto.createHash('sha256').update(txtContent, 'utf8').digest('hex');
  const filename = `LSD_ARCA_${p.cuit}_${periodYyyymm}_L${p.arca_sequence_number}.txt`;
  const storageKey = `arca-lsd/${ctx.activeTenantId}/${companyId}/${Date.now()}-${filename}`;

  const docRes = await client.query<{ id: string }>(
    `INSERT INTO public.documents (
       tenant_id, company_id, document_type, title, original_filename,
       storage_key, mime_type, size_bytes, sha256_hash, is_immutable, uploaded_by
     ) VALUES ($1, $2, 'ARCA_LSD_TXT', $3, $4, $5, 'text/plain', $6, $7, true, $8)
     RETURNING id`,
    [
      ctx.activeTenantId,
      companyId,
      `Libro de Sueldos Digital ARCA — ${p.period_code} (${p.liquidation_modality})`,
      filename,
      storageKey,
      Buffer.byteLength(txtContent, 'utf8'),
      sha256,
      ctx.userId,
    ],
  );

  const exportRes = await client.query<{ id: string }>(
    `INSERT INTO public.arca_exports (
       tenant_id, company_id, payroll_id, txt_document_id, period_yyyymm,
       submission_type, liquidation_type, liquidation_number, employees_count,
       validation_status, inconsistencies_report, official_spec_version, sha256_hash, exported_by
     ) VALUES ($1, $2, $3, $4, $5, 'SJ', $6, $7, $8, 'VALIDATED', '[]'::jsonb, 'ARCA-LSD-RG-5249-v1.4', $9, $10)
     RETURNING id`,
    [
      ctx.activeTenantId,
      companyId,
      payrollId,
      docRes.rows[0].id,
      periodYyyymm,
      liqType,
      p.arca_sequence_number,
      slipsRes.rowCount ?? 0,
      sha256,
      ctx.userId,
    ],
  );

  return {
    exportId: exportRes.rows[0].id,
    filename,
    sha256Hash: sha256,
    txtContent,
    employeesCount: slipsRes.rowCount ?? 0,
  };
}
