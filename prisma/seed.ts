import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';
import { SEED_IDS } from '@ar-payroll/contracts';
import { hashPassword } from '../apps/api/src/services/auth.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Client } = pg;

export { SEED_IDS };

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    // 1. Roles del sistema (#03 roles)
    const roles = [
      { id: SEED_IDS.ROLE_OWNER, code: 'OWNER', name: 'Titular del Espacio de Trabajo', description: 'Control total del espacio de trabajo y sus empresas.' },
      { id: SEED_IDS.ROLE_ADMIN, code: 'ADMIN', name: 'Administrador', description: 'Administración integral de empresas, convenios y liquidaciones.' },
      { id: SEED_IDS.ROLE_LIQUIDATOR, code: 'LIQUIDATOR', name: 'Liquidador', description: 'Carga de novedades, cálculo de liquidaciones y emisión de recibos.' },
      { id: SEED_IDS.ROLE_VIEWER, code: 'VIEWER', name: 'Consulta', description: 'Acceso de solo lectura a empresas, legajos y liquidaciones.' },
    ];

    for (const r of roles) {
      await client.query(
        `INSERT INTO public.roles (id, code, name, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`,
        [r.id, r.code, r.name, r.description],
      );
    }

    // 2. Permisos granulares (#04 permissions) y tabla puente explícita (#05 role_permissions)
    const permissions = [
      { id: '20000000-0000-4000-8000-000000000001', code: 'companies:read', module: 'COMPANIES', description: 'Ver empresas del tenant' },
      { id: '20000000-0000-4000-8000-000000000002', code: 'companies:write', module: 'COMPANIES', description: 'Crear y editar empresas del tenant' },
      { id: '20000000-0000-4000-8000-000000000003', code: 'employees:read', module: 'EMPLOYEES', description: 'Ver legajos de empleados' },
      { id: '20000000-0000-4000-8000-000000000004', code: 'employees:write', module: 'EMPLOYEES', description: 'Crear y editar legajos de empleados' },
      { id: '20000000-0000-4000-8000-000000000005', code: 'payrolls:calculate', module: 'PAYROLLS', description: 'Ejecutar motor de liquidaciones' },
      { id: '20000000-0000-4000-8000-000000000006', code: 'payrolls:approve', module: 'PAYROLLS', description: 'Aprobar y cerrar liquidaciones' },
      { id: '20000000-0000-4000-8000-000000000007', code: 'arca:export', module: 'ARCA', description: 'Exportar Libro de Sueldos Digital ARCA' },
    ];

    for (const p of permissions) {
      await client.query(
        `INSERT INTO public.permissions (id, code, module, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description`,
        [p.id, p.code, p.module, p.description],
      );

      await client.query(
        `INSERT INTO public.role_permissions (role_id, permission_id)
         VALUES ($1, $2), ($3, $2)
         ON CONFLICT DO NOTHING`,
        [SEED_IDS.ROLE_OWNER, p.id, SEED_IDS.ROLE_ADMIN],
      );
    }

    // 3. Dos Espacios de Trabajo (Tenants) estrictamente aislados (#01 tenants)
    await client.query(
      `INSERT INTO public.tenants (id, name, slug, status)
       VALUES
         ($1, 'Estudio Contable — Espacio Titular A (Papá)', 'estudio-papa', 'ACTIVE'),
         ($2, 'Estudio Contable — Espacio Titular B (Socio)', 'estudio-socio', 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [SEED_IDS.TENANT_A, SEED_IDS.TENANT_B],
    );

    // 4. Usuarios iniciales (#02 users)
    const passPapa = hashPassword('Papa_Sueldos_2026!');
    const passSocio = hashPassword('Socio_Sueldos_2026!');
    const passMulti = hashPassword('Multi_Sueldos_2026!');

    await client.query(
      `INSERT INTO public.users (id, email, full_name, password_hash, status)
       VALUES
         ($1, 'papa@estudiocontable.ar', 'Titular A (Papá)', $4, 'ACTIVE'),
         ($2, 'socio@estudiocontable.ar', 'Titular B (Socio)', $5, 'ACTIVE'),
         ($3, 'auditor.multitenant@estudiocontable.ar', 'Auditor Multi-Espacio (Prueba Switch)', $6, 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [SEED_IDS.USER_A, SEED_IDS.USER_B, SEED_IDS.USER_MULTI, passPapa, passSocio, passMulti],
    );

    // 5. Membresías (#06 tenant_memberships)
    await client.query(
      `INSERT INTO public.tenant_memberships (tenant_id, user_id, role_id, status, is_default)
       VALUES
         ($1, $3, $6, 'ACTIVE', true),
         ($2, $4, $6, 'ACTIVE', true),
         ($1, $5, $7, 'ACTIVE', false),
         ($2, $5, $7, 'ACTIVE', false)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id, status = 'ACTIVE', is_default = EXCLUDED.is_default`,
      [
        SEED_IDS.TENANT_A,
        SEED_IDS.TENANT_B,
        SEED_IDS.USER_A,
        SEED_IDS.USER_B,
        SEED_IDS.USER_MULTI,
        SEED_IDS.ROLE_OWNER,
        SEED_IDS.ROLE_ADMIN,
      ],
    );

    // 6. Catálogo Global Compartido: CCT 260/75 UOMRA Rama 4 Automotor (Laudo 29) + Categorías + Escala Octubre 2026
    await client.query(
      `INSERT INTO public.collective_agreements (
         id, tenant_id, cct_number, name, union_name, activity, territorial_scope,
         default_remuneration_modality, default_payment_frequency, standard_monthly_hours, standard_quincenal_hours, is_active
       ) VALUES (
         $1, NULL, '260/75', 'Unión Obrera Metalúrgica (UOMRA) — CCT 260/75', 'UOMRA',
         'Industria Metalúrgica', 'Nacional (excepto Tierra del Fuego)', 'MIXTO', 'QUINCENAL', 192.00, 96.00, true
       ) ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.CBA_UOM],
    );

    await client.query(
      `INSERT INTO public.agreement_branches (
         id, tenant_id, agreement_id, code, name, reference_monthly_hours, reference_quincenal_hours, is_active
       ) VALUES (
         $1, NULL, $2, 'RAMA_4', 'Rama 4 Automotor (Laudo 29)', 192.00, 96.00, true
       ) ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.CBA_UOM_BRANCH_R4, SEED_IDS.CBA_UOM],
    );

    await client.query(
      `INSERT INTO public.agreement_categories (
         id, tenant_id, agreement_id, branch_id, code, name, remuneration_modality, remuneration_unit, default_payment_frequency, hierarchy_order
       ) VALUES
         ($1, NULL, $4, $5, 'OFICIAL_MULTIPLE', 'Oficial Múltiple', 'JORNALIZADO', 'HORA', 'QUINCENAL', 10),
         ($2, NULL, $4, $5, 'OPERARIO_ESP', 'Operario Especializado', 'JORNALIZADO', 'HORA', 'QUINCENAL', 20),
         ($3, NULL, $4, $5, 'ADMIN_4TA', 'Administrativo 4ta Categoría', 'MENSUALIZADO', 'MES', 'MENSUAL', 30)
       ON CONFLICT (id) DO NOTHING`,
      [
        SEED_IDS.CBA_UOM_CAT_OFICIAL_MULTIPLE,
        SEED_IDS.CBA_UOM_CAT_OPERARIO_ESP,
        SEED_IDS.CBA_UOM_CAT_ADMIN_4TA,
        SEED_IDS.CBA_UOM,
        SEED_IDS.CBA_UOM_BRANCH_R4,
      ],
    );

    const scaleOct2026Id = '33000000-0000-4000-8000-000000002026';
    await client.query(
      `INSERT INTO public.salary_scales (
         id, tenant_id, agreement_id, branch_id, version, agreement_number, period_code,
         valid_from, valid_to, status, notes
       ) VALUES (
         $1, NULL, $2, $3, 1, 'Acuerdo Paritario UOMRA Rama 4 — Octubre 2026', '2026-10',
         '2026-10-01', '2026-10-31', 'VALIDATED', 'Escala oficial Octubre 2026 + Seguro de Vida UOM $16.734,96'
       ) ON CONFLICT (id) DO NOTHING`,
      [scaleOct2026Id, SEED_IDS.CBA_UOM, SEED_IDS.CBA_UOM_BRANCH_R4],
    );

    await client.query(
      `INSERT INTO public.salary_scale_items (
         id, tenant_id, salary_scale_id, agreement_id, branch_id, category_id, hourly_rate, monthly_basic
       ) VALUES
         ('33100000-0000-4000-8000-000000000001', NULL, $1, $2, $3, $4, 7684.000000, NULL),
         ('33100000-0000-4000-8000-000000000002', NULL, $1, $2, $3, $5, 6973.000000, NULL),
         ('33100000-0000-4000-8000-000000000003', NULL, $1, $2, $3, $6, NULL, 1106590.00)
       ON CONFLICT (salary_scale_id, category_id) DO NOTHING`,
      [
        scaleOct2026Id,
        SEED_IDS.CBA_UOM,
        SEED_IDS.CBA_UOM_BRANCH_R4,
        SEED_IDS.CBA_UOM_CAT_OFICIAL_MULTIPLE,
        SEED_IDS.CBA_UOM_CAT_OPERARIO_ESP,
        SEED_IDS.CBA_UOM_CAT_ADMIN_4TA,
      ],
    );

    // 6.2 Conceptos Globales de Liquidación (#13 payroll_concepts) y Tipos de Novedades (#17 payroll_novelty_types)
    const globalConcepts = [
      { id: '40000000-0000-4000-8000-000000000100', code: '0100', name: 'Sueldo / Jornal Básico', nature: 'REMUNERATIVE', unit: 'HORA', scope: 'PER_PAY_PERIOD', order: 10 },
      { id: '40000000-0000-4000-8000-000000000110', code: '0110', name: 'Adicional Antigüedad UOM (1% por año)', nature: 'REMUNERATIVE', unit: 'PORCENTAJE', scope: 'PER_PAY_PERIOD', order: 20 },
      { id: '40000000-0000-4000-8000-000000000120', code: '0120', name: 'Horas Extras al 50%', nature: 'REMUNERATIVE', unit: 'HORA', scope: 'PER_PAY_PERIOD', order: 30 },
      { id: '40000000-0000-4000-8000-000000000130', code: '0130', name: 'Horas Extras al 100%', nature: 'REMUNERATIVE', unit: 'HORA', scope: 'PER_PAY_PERIOD', order: 40 },
      { id: '40000000-0000-4000-8000-000000000140', code: '0140', name: 'Feriado Nacional / Día del Metalúrgico', nature: 'REMUNERATIVE', unit: 'HORA', scope: 'PER_PAY_PERIOD', order: 50 },
      { id: '40000000-0000-4000-8000-000000000200', code: '0200', name: 'Asignación No Remunerativa Acuerdo UOM', nature: 'NON_REMUNERATIVE', unit: 'PESOS', scope: 'PER_PAY_PERIOD', order: 60 },
      { id: '40000000-0000-4000-8000-000000000300', code: '0300', name: 'Sueldo Anual Complementario (SAC)', nature: 'REMUNERATIVE', unit: 'PESOS', scope: 'SEMESTRAL', order: 70 },
      { id: '40000000-0000-4000-8000-000000000310', code: '0310', name: 'Vacaciones Anuales Gozadas', nature: 'REMUNERATIVE', unit: 'DIA', scope: 'ANNUAL', order: 80 },
      { id: '40000000-0000-4000-8000-000000000999', code: '0999', name: 'Redondeo Explícito de Recibo', nature: 'NON_REMUNERATIVE', unit: 'PESOS', scope: 'PER_PAY_PERIOD', order: 999 },
      { id: '40000000-0000-4000-8000-000000000400', code: '0400', name: 'Jubilación SIPA (Ley 24.241 — 11%)', nature: 'EMPLOYEE_DEDUCTION', unit: 'PORCENTAJE', scope: 'PER_PAY_PERIOD', order: 100 },
      { id: '40000000-0000-4000-8000-000000000410', code: '0410', name: 'Ley 19.032 INSSJP / PAMI (3%)', nature: 'EMPLOYEE_DEDUCTION', unit: 'PORCENTAJE', scope: 'PER_PAY_PERIOD', order: 110 },
      { id: '40000000-0000-4000-8000-000000000420', code: '0420', name: 'Obra Social OSUOMRA (Ley 23.660 — 3%)', nature: 'EMPLOYEE_DEDUCTION', unit: 'PORCENTAJE', scope: 'PER_PAY_PERIOD', order: 120 },
      { id: '40000000-0000-4000-8000-000000000430', code: '0430', name: 'Cuota Sindical UOMRA (2,5%)', nature: 'EMPLOYEE_DEDUCTION', unit: 'PORCENTAJE', scope: 'PER_PAY_PERIOD', order: 130 },
      { id: '40000000-0000-4000-8000-000000000440', code: '0440', name: 'Seguro de Vida y Sepelio UOM (Art. 55 CCT 260/75)', nature: 'EMPLOYEE_DEDUCTION', unit: 'PESOS', scope: 'MONTHLY_CLOSE_ONLY', order: 140 },
      { id: '40000000-0000-4000-8000-000000000450', code: '0450', name: 'Anticipo de Haberes / Descuento', nature: 'EMPLOYEE_DEDUCTION', unit: 'PESOS', scope: 'PER_PAY_PERIOD', order: 150 },
      { id: '40000000-0000-4000-8000-000000000500', code: '0500', name: 'Contribución Patronal SIPA / Seg. Social (18%)', nature: 'EMPLOYER_CONTRIBUTION', unit: 'PORCENTAJE', scope: 'PER_PAY_PERIOD', order: 200 },
      { id: '40000000-0000-4000-8000-000000000510', code: '0510', name: 'Contribución Patronal INSSJP / PAMI (1,58%)', nature: 'EMPLOYER_CONTRIBUTION', unit: 'PORCENTAJE', scope: 'PER_PAY_PERIOD', order: 210 },
      { id: '40000000-0000-4000-8000-000000000520', code: '0520', name: 'Contribución Patronal Obra Social OSUOMRA (6%)', nature: 'EMPLOYER_CONTRIBUTION', unit: 'PORCENTAJE', scope: 'PER_PAY_PERIOD', order: 220 },
      { id: '40000000-0000-4000-8000-000000000530', code: '0530', name: 'Seguro de Vida y Sepelio Patronal UOM', nature: 'EMPLOYER_CONTRIBUTION', unit: 'PESOS', scope: 'MONTHLY_CLOSE_ONLY', order: 230 },
      { id: '40000000-0000-4000-8000-000000000540', code: '0540', name: 'ART Prevención Riesgos del Trabajo (3,5%)', nature: 'EMPLOYER_CONTRIBUTION', unit: 'PORCENTAJE', scope: 'PER_PAY_PERIOD', order: 240 },
    ];

    for (const c of globalConcepts) {
      await client.query(
        `INSERT INTO public.payroll_concepts (id, tenant_id, agreement_id, code, name, nature, default_unit, accrual_scope, print_order, is_active)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, true)
         ON CONFLICT (id) DO NOTHING`,
        [c.id, SEED_IDS.CBA_UOM, c.code, c.name, c.nature, c.unit, c.scope, c.order],
      );
    }

    const globalNoveltyTypes = [
      { id: '41000000-0000-4000-8000-000000000001', conceptId: '40000000-0000-4000-8000-000000000100', code: 'HORAS_NORMALES', name: 'Horas Normales Trabajadas', group: 'ASISTENCIA', unit: 'HORA' },
      { id: '41000000-0000-4000-8000-000000000002', conceptId: '40000000-0000-4000-8000-000000000120', code: 'HORAS_EXTRAS_50', name: 'Horas Extras al 50%', group: 'ECONOMICA_HABER', unit: 'HORA' },
      { id: '41000000-0000-4000-8000-000000000003', conceptId: '40000000-0000-4000-8000-000000000130', code: 'HORAS_EXTRAS_100', name: 'Horas Extras al 100%', group: 'ECONOMICA_HABER', unit: 'HORA' },
      { id: '41000000-0000-4000-8000-000000000004', conceptId: '40000000-0000-4000-8000-000000000140', code: 'HORAS_FERIADO', name: 'Horas Feriado / Día Gremio', group: 'ASISTENCIA', unit: 'HORA' },
      { id: '41000000-0000-4000-8000-000000000005', conceptId: '40000000-0000-4000-8000-000000000200', code: 'SUMA_NO_REMUNERATIVA', name: 'Adicional No Remunerativo ($)', group: 'ECONOMICA_HABER', unit: 'PESOS' },
      { id: '41000000-0000-4000-8000-000000000006', conceptId: '40000000-0000-4000-8000-000000000450', code: 'ANTICIPO_SUELDO', name: 'Anticipo de Sueldo ($)', group: 'ECONOMICA_DESCUENTO', unit: 'PESOS' },
    ];

    for (const nt of globalNoveltyTypes) {
      await client.query(
        `INSERT INTO public.payroll_novelty_types (id, tenant_id, linked_concept_id, code, name, group_category, default_unit, is_active)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, true)
         ON CONFLICT (id) DO NOTHING`,
        [nt.id, nt.conceptId, nt.code, nt.name, nt.group, nt.unit],
      );
    }

    // 7. Empresas iniciales aisladas por Tenant
    // 7.1 Tenant A (Papá): ARRIETA JORGE Y COMBINA ALDO JAVIER S.H. (CUIT 30698448411)
    await client.query(
      `INSERT INTO public.companies (id, tenant_id, cuit, current_version, is_active, created_by)
       VALUES ($1, $2, '30698448411', 1, true, $3)
       ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.COMPANY_A_COMBINA, SEED_IDS.TENANT_A, SEED_IDS.USER_A],
    );

    await client.query(
      `INSERT INTO public.company_versions (
         id, tenant_id, company_id, version, valid_from, legal_name, trade_name,
         person_type, company_type, activity_start_date, main_activity, arca_activity_code,
         vat_condition, fiscal_address, legal_address, province, locality, postal_code,
         email, art_name, created_by
       ) VALUES (
         $1, $2, $3, 1, '1999-01-01', 'ARRIETA JORGE Y COMBINA ALDO JAVIER S.H.', 'Taller Metalúrgico Combina SH',
         'JURIDICA', 'Sociedad de Hecho', '1999-01-01', 'Industria Metalúrgica Automotor', '293011',
         'Responsable Inscripto', 'Av. Sabattini 3200', 'Av. Sabattini 3200', 'Córdoba', 'Córdoba Capital', '5000',
         'administracion@combinash.com.ar', 'Prevención ART', $4
       ) ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.COMPANY_A_VERSION_1, SEED_IDS.TENANT_A, SEED_IDS.COMPANY_A_COMBINA, SEED_IDS.USER_A],
    );

    await client.query(
      `INSERT INTO public.company_branches (id, tenant_id, company_id, code, name, address, locality, province, postal_code)
       VALUES ($1, $2, $3, 'CENTRAL', 'Planta Industrial Córdoba', 'Av. Sabattini 3200', 'Córdoba Capital', 'Córdoba', '5000')
       ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.COMPANY_A_BRANCH_CENTRAL, SEED_IDS.TENANT_A, SEED_IDS.COMPANY_A_COMBINA],
    );

    await client.query(
      `INSERT INTO public.company_agreements (tenant_id, company_id, agreement_id, branch_id, confirmed_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [SEED_IDS.TENANT_A, SEED_IDS.COMPANY_A_COMBINA, SEED_IDS.CBA_UOM, SEED_IDS.CBA_UOM_BRANCH_R4, SEED_IDS.USER_A],
    );

    // 7.1.1 Los 3 Empleados Reales Verificados de Combina SH (Hoja 2 del Excel de referencia)
    const combinaEmployees = [
      {
        id: 'e0000001-0000-4000-8000-000000000001',
        verId: 'e0100001-0000-4000-8000-000000000001',
        histId: 'e0200001-0000-4000-8000-000000000001',
        legajo: '1',
        cuil: '23288533369',
        dni: '28853336',
        lastName: 'TEJEDOR',
        firstName: 'Antonio Martín',
        birthDate: '1976-08-14',
        sex: 'M',
        hireDate: '1999-05-01',
        priorYears: 27,
        jobPosition: 'Oficial Múltiple Metalúrgico',
        categoryId: SEED_IDS.CBA_UOM_CAT_OFICIAL_MULTIPLE,
        remModality: 'JORNALIZADO',
        remUnit: 'HORA',
        payFreq: 'QUINCENAL',
      },
      {
        id: 'e0000002-0000-4000-8000-000000000002',
        verId: 'e0100002-0000-4000-8000-000000000002',
        histId: 'e0200002-0000-4000-8000-000000000002',
        legajo: '2',
        cuil: '20417358545',
        dni: '41735854',
        lastName: 'TEJEDOR',
        firstName: 'Gonzalo Matías',
        birthDate: '1999-03-22',
        sex: 'M',
        hireDate: '2019-09-02',
        priorYears: 7,
        jobPosition: 'Operario Especializado',
        categoryId: SEED_IDS.CBA_UOM_CAT_OPERARIO_ESP,
        remModality: 'JORNALIZADO',
        remUnit: 'HORA',
        payFreq: 'QUINCENAL',
      },
      {
        id: 'e0000003-0000-4000-8000-000000000003',
        verId: 'e0100003-0000-4000-8000-000000000003',
        histId: 'e0200003-0000-4000-8000-000000000003',
        legajo: '3',
        cuil: '27248415741',
        dni: '24841574',
        lastName: 'GARRE',
        firstName: 'Mariela Fernanda',
        birthDate: '1975-11-05',
        sex: 'F',
        hireDate: '2006-04-01',
        priorYears: 20,
        jobPosition: 'Administrativa Contable',
        categoryId: SEED_IDS.CBA_UOM_CAT_ADMIN_4TA,
        remModality: 'MENSUALIZADO',
        remUnit: 'MES',
        payFreq: 'MENSUAL',
      },
    ];

    for (const emp of combinaEmployees) {
      await client.query(
        `INSERT INTO public.employees (
           id, tenant_id, company_id, cuil, dni, legajo, current_version,
           employment_status, hire_date, recognized_prior_years, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, 1, 'ACTIVE', $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          emp.id,
          SEED_IDS.TENANT_A,
          SEED_IDS.COMPANY_A_COMBINA,
          emp.cuil,
          emp.dni,
          emp.legajo,
          emp.hireDate,
          emp.priorYears,
          SEED_IDS.USER_A,
        ],
      );

      await client.query(
        `INSERT INTO public.employee_versions (
           id, tenant_id, company_id, employee_id, branch_id, agreement_id, agreement_branch_id, category_id,
           version, valid_from, last_name, first_name, birth_date, registered_sex, marital_status,
           address, locality, province, postal_code, contract_type, job_position,
           schedule_type, habitual_schedule, remuneration_modality, remuneration_unit, payment_frequency,
           workplace_location, obra_social_code, obra_social_name, is_union_member, change_reason, updated_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           1, $9, $10, $11, $12, $13, 'CASADO',
           'Av. Sabattini 3200', 'Córdoba Capital', 'Córdoba', '5000', 'TIEMPO_INDETERMINADO', $14,
           'COMPLETA', 'Lunes a Viernes 08:00 a 17:00', $15, $16, $17,
           'Planta Industrial Córdoba', '112103', 'OSUOMRA', true, 'Carga inicial verificada Combina SH', $18
         ) ON CONFLICT (id) DO NOTHING`,
        [
          emp.verId,
          SEED_IDS.TENANT_A,
          SEED_IDS.COMPANY_A_COMBINA,
          emp.id,
          SEED_IDS.COMPANY_A_BRANCH_CENTRAL,
          SEED_IDS.CBA_UOM,
          SEED_IDS.CBA_UOM_BRANCH_R4,
          emp.categoryId,
          emp.hireDate,
          emp.lastName,
          emp.firstName,
          emp.birthDate,
          emp.sex,
          emp.jobPosition,
          emp.remModality,
          emp.remUnit,
          emp.payFreq,
          SEED_IDS.USER_A,
        ],
      );

      await client.query(
        `INSERT INTO public.employee_employment_history (
           id, tenant_id, company_id, employee_id, event_type, effective_date,
           previous_snapshot, new_snapshot, reason, recorded_by
         ) VALUES ($1, $2, $3, $4, 'ALTA_EMPLEADO', $5, NULL, $6::jsonb, 'Alta inicial verificada contra planilla Combina SH', $7)
         ON CONFLICT (id) DO NOTHING`,
        [
          emp.histId,
          SEED_IDS.TENANT_A,
          SEED_IDS.COMPANY_A_COMBINA,
          emp.id,
          emp.hireDate,
          JSON.stringify({
            legajo: emp.legajo,
            cuil: emp.cuil,
            lastName: emp.lastName,
            firstName: emp.firstName,
            jobPosition: emp.jobPosition,
          }),
          SEED_IDS.USER_A,
        ],
      );
    }

    // 7.1.2 Períodos Iniciales Octubre 2026 (1ra y 2da Quincena) + Novedades base para Combina SH
    const period1QId = 'f0000001-0000-4000-8000-000000000001';
    const period2QId = 'f0000002-0000-4000-8000-000000000002';

    await client.query(
      `INSERT INTO public.payroll_periods (
         id, tenant_id, company_id, year, month, period_code, liquidation_modality,
         payment_frequency, arca_sequence_number, accrual_start_date, accrual_end_date,
         closing_date, legal_due_date, scheduled_payment_date, compliance_status, period_status, created_by
       ) VALUES
         ($1, $3, $4, 2026, 10, '2026-10', 'PRIMERA_QUINCENA', 'QUINCENAL', 1, '2026-10-01', '2026-10-15', '2026-10-15', '2026-10-20', '2026-10-20', 'ON_TIME', 'OPEN', $5),
         ($2, $3, $4, 2026, 10, '2026-10', 'SEGUNDA_QUINCENA', 'QUINCENAL', 2, '2026-10-16', '2026-10-31', '2026-10-31', '2026-11-05', '2026-11-05', 'ON_TIME', 'OPEN', $5)
       ON CONFLICT (id) DO NOTHING`,
      [period1QId, period2QId, SEED_IDS.TENANT_A, SEED_IDS.COMPANY_A_COMBINA, SEED_IDS.USER_A],
    );

    const seedNovelties = [
      { id: 'f1000001-0000-4000-8000-000000000001', periodId: period1QId, empId: 'e0000001-0000-4000-8000-000000000001', hours: 88 },
      { id: 'f1000002-0000-4000-8000-000000000002', periodId: period1QId, empId: 'e0000002-0000-4000-8000-000000000002', hours: 88 },
      { id: 'f1000003-0000-4000-8000-000000000003', periodId: period1QId, empId: 'e0000003-0000-4000-8000-000000000003', hours: 96 },
      { id: 'f1000004-0000-4000-8000-000000000004', periodId: period2QId, empId: 'e0000001-0000-4000-8000-000000000001', hours: 96 },
      { id: 'f1000005-0000-4000-8000-000000000005', periodId: period2QId, empId: 'e0000002-0000-4000-8000-000000000002', hours: 96 },
      { id: 'f1000006-0000-4000-8000-000000000006', periodId: period2QId, empId: 'e0000003-0000-4000-8000-000000000003', hours: 96 },
    ];

    for (const sn of seedNovelties) {
      await client.query(
        `INSERT INTO public.payroll_novelties (
           id, tenant_id, company_id, period_id, employee_id, novelty_type_id,
           quantity, unit, unit_or_fixed_amount, observation, status, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, '41000000-0000-4000-8000-000000000001', $6, 'HORA', 0, 'Horas normales verificadas Combina SH', 'CONFIRMED', $7, $7)
         ON CONFLICT (id) DO NOTHING`,
        [sn.id, SEED_IDS.TENANT_A, SEED_IDS.COMPANY_A_COMBINA, sn.periodId, sn.empId, sn.hours, SEED_IDS.USER_A],
      );
    }

    // 7.2 Tenant B (Socio): METALÚRGICA DEL SUR S.R.L. (CUIT 30712345679)
    await client.query(
      `INSERT INTO public.companies (id, tenant_id, cuit, current_version, is_active, created_by)
       VALUES ($1, $2, '30712345679', 1, true, $3)
       ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.COMPANY_B_SOCIO, SEED_IDS.TENANT_B, SEED_IDS.USER_B],
    );

    await client.query(
      `INSERT INTO public.company_versions (
         id, tenant_id, company_id, version, valid_from, legal_name, trade_name,
         person_type, company_type, activity_start_date, main_activity, arca_activity_code,
         vat_condition, fiscal_address, legal_address, province, locality, postal_code,
         email, art_name, created_by
       ) VALUES (
         $1, $2, $3, 1, '2015-03-01', 'METALÚRGICA DEL SUR S.R.L.', 'Metalúrgica del Sur',
         'JURIDICA', 'S.R.L.', '2015-03-01', 'Fabricación de Autopartes', '293011',
         'Responsable Inscripto', 'Bv. Oroño 4100', 'Bv. Oroño 4100', 'Santa Fe', 'Rosario', '2000',
         'rrhh@metalurgicadelsur.com.ar', 'Asociart ART', $4
       ) ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.COMPANY_B_VERSION_1, SEED_IDS.TENANT_B, SEED_IDS.COMPANY_B_SOCIO, SEED_IDS.USER_B],
    );

    await client.query(
      `INSERT INTO public.company_branches (id, tenant_id, company_id, code, name, address, locality, province, postal_code)
       VALUES ($1, $2, $3, 'CENTRAL', 'Planta Rosario', 'Bv. Oroño 4100', 'Rosario', 'Santa Fe', '2000')
       ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.COMPANY_B_BRANCH_CENTRAL, SEED_IDS.TENANT_B, SEED_IDS.COMPANY_B_SOCIO],
    );

    await client.query('COMMIT');
    console.log('[Seed] Datos iniciales Multi-Tenant (Espacio A: Papá con 3 empleados Combina SH, Espacio B: Socio y CCT 260/75) cargados correctamente.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  main().catch((err) => {
    console.error('[Error Seed]', err);
    process.exit(1);
  });
}
