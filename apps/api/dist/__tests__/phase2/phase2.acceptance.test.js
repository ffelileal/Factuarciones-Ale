import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tenantPool, adminPool } from '../../db/pool.js';
import { buildServer } from '../../server.js';
import { SEED_IDS } from '@ar-payroll/contracts';
import { createEncryptedFullBackup, restoreAndVerifyBackup, } from '../../services/backup.service.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
describe('FASE 2 — Suite Integral de Verificación Arquitectónica (Subfases 2A, 2B, 2C y 2D)', () => {
    const app = buildServer();
    beforeAll(async () => {
        await app.ready();
    });
    afterAll(async () => {
        await app.close();
    });
    // =========================================================================
    // SUBFASE 2A: CONCILIACIÓN DEL MODELO (41 TABLAS), FK COMPUESTAS E INMUTABILIDAD
    // =========================================================================
    describe('Subfase 2A: Modelo de Datos (41 Tablas Físicas), FK Compuestas Intra-Tenant e Inmutabilidad', () => {
        it('Verifica el conteo exacto de 41 tablas físicas (40 entidades + 1 tabla puente explícita role_permissions)', async () => {
            const res = await adminPool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name <> '_schema_migrations'
        ORDER BY table_name ASC
      `);
            expect(res.rowCount).toBe(41);
            const tableNames = res.rows.map((r) => r.table_name);
            expect(tableNames).toContain('role_permissions');
            expect(tableNames).toContain('tenants');
            expect(tableNames).toContain('users');
            expect(tableNames).toContain('tenant_memberships');
            expect(tableNames).toContain('sessions');
            expect(tableNames).toContain('companies');
            expect(tableNames).toContain('company_versions');
            expect(tableNames).toContain('employees');
            expect(tableNames).toContain('employee_versions');
            expect(tableNames).toContain('payroll_periods');
            expect(tableNames).toContain('payroll_novelties');
            expect(tableNames).toContain('payrolls');
            expect(tableNames).toContain('payslips');
            expect(tableNames).toContain('payslip_versions');
            expect(tableNames).toContain('payroll_items');
            expect(tableNames).toContain('payroll_deductions');
            expect(tableNames).toContain('employer_contributions');
            expect(tableNames).toContain('documents');
            expect(tableNames).toContain('audit_logs');
            expect(tableNames).toContain('arca_exports');
        });
        it('Rechaza mediante FK compuestas intra-tenant vincular un empleado de la Empresa A1 en una novedad de la Empresa A2 dentro del mismo tenant', async () => {
            const client = await adminPool.connect();
            try {
                await client.query('BEGIN');
                // Crear una segunda empresa dentro del MISMO Tenant A
                const compA2Id = 'a2000000-0000-4000-8000-000000000002';
                await client.query(`INSERT INTO public.companies (id, tenant_id, cuit, current_version, is_active, created_by)
           VALUES ($1, $2, '30998877665', 1, true, $3)`, [compA2Id, SEED_IDS.TENANT_A, SEED_IDS.USER_A]);
                // Crear un empleado perteneciente a la Empresa A1 (Combina SH)
                const empA1Id = 'e1000000-0000-4000-8000-000000000001';
                await client.query(`INSERT INTO public.employees (id, tenant_id, company_id, cuil, dni, legajo, hire_date, created_by)
           VALUES ($1, $2, $3, '20991112223', '99111222', '901', '1999-05-01', $4)`, [empA1Id, SEED_IDS.TENANT_A, SEED_IDS.COMPANY_A_COMBINA, SEED_IDS.USER_A]);
                // Crear un período en la Empresa A2
                const periodA2Id = 'f2000000-0000-4000-8000-000000000002';
                await client.query(`INSERT INTO public.payroll_periods (
             id, tenant_id, company_id, year, month, period_code, liquidation_modality,
             payment_frequency, arca_sequence_number, accrual_start_date, accrual_end_date,
             closing_date, legal_due_date, scheduled_payment_date, created_by
           ) VALUES (
             $1, $2, $3, 2026, 10, '2026-10', 'MENSUAL',
             'MENSUAL', 1, '2026-10-01', '2026-10-31',
             '2026-10-31', '2026-11-05', '2026-11-04', $4
           )`, [periodA2Id, SEED_IDS.TENANT_A, compA2Id, SEED_IDS.USER_A]);
                // Crear un tipo de novedad en el Tenant A
                const novTypeId = 'd1000000-0000-4000-8000-000000000001';
                await client.query(`INSERT INTO public.payroll_novelty_types (id, tenant_id, code, name, group_category, default_unit)
           VALUES ($1, $2, 'HORAS_NORMALES', 'Horas Normales Quincena', 'ASISTENCIA', 'HORA')`, [novTypeId, SEED_IDS.TENANT_A]);
                // Intentar insertar una novedad asociando el período de Empresa A2 con el empleado de Empresa A1:
                // Debe fallar por la FK compuesta fk_pn_employee_same_company(tenant_id, company_id, employee_id)
                await expect(client.query(`INSERT INTO public.payroll_novelties (
               tenant_id, company_id, period_id, employee_id, novelty_type_id,
               quantity, unit, unit_or_fixed_amount, created_by, updated_by
             ) VALUES ($1, $2, $3, $4, $5, 96, 'HORA', 0, $6, $6)`, [SEED_IDS.TENANT_A, compA2Id, periodA2Id, empA1Id, novTypeId, SEED_IDS.USER_A])).rejects.toThrow(/fk_pn_employee_same_company/);
            }
            finally {
                await client.query('ROLLBACK');
                client.release();
            }
        });
        it('Impide mediante triggers de catálogo híbrido vincular una empresa del Tenant A a un convenio privado del Tenant B', async () => {
            const client = await adminPool.connect();
            try {
                await client.query('BEGIN');
                const privateCbaB = '3b000000-0000-4000-8000-000000000099';
                await client.query(`INSERT INTO public.collective_agreements (
             id, tenant_id, cct_number, name, union_name, activity, territorial_scope,
             default_remuneration_modality, default_payment_frequency
           ) VALUES (
             $1, $2, '999/26', 'Convenio Privado del Socio B', 'Sindicato B', 'Actividad B', 'Santa Fe',
             'MENSUALIZADO', 'MENSUAL'
           )`, [privateCbaB, SEED_IDS.TENANT_B]);
                await expect(client.query(`INSERT INTO public.company_agreements (tenant_id, company_id, agreement_id, confirmed_by)
             VALUES ($1, $2, $3, $4)`, [SEED_IDS.TENANT_A, SEED_IDS.COMPANY_A_COMBINA, privateCbaB, SEED_IDS.USER_A])).rejects.toThrow(/HYBRID_CATALOG_TENANT_MISMATCH/);
            }
            finally {
                await client.query('ROLLBACK');
                client.release();
            }
        });
        it('Bloquea mediante los 4 triggers de inmutabilidad cualquier UPDATE o DELETE sobre liquidaciones/recibos aprobados, sus renglones, documentos inmutables y audit_logs', async () => {
            const client = await adminPool.connect();
            const expectImmutableError = async (sql, params) => {
                await client.query('SAVEPOINT sp_imm');
                try {
                    await expect(client.query(sql, params)).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
                }
                finally {
                    await client.query('ROLLBACK TO SAVEPOINT sp_imm');
                }
            };
            try {
                await client.query('BEGIN');
                // 1. Trigger 4: Insertar registro de auditoría y verificar que no se puede modificar ni borrar
                const auditRes = await client.query(`INSERT INTO public.audit_logs (tenant_id, user_id, action, module, target_table, outcome)
           VALUES ($1, $2, 'TEST_IMMUTABLE', 'SECURITY', 'companies', 'SUCCESS') RETURNING id`, [SEED_IDS.TENANT_A, SEED_IDS.USER_A]);
                const auditId = auditRes.rows[0].id;
                await expectImmutableError(`UPDATE public.audit_logs SET action = 'TAMPERED' WHERE id = $1`, [auditId]);
                await expectImmutableError(`DELETE FROM public.audit_logs WHERE id = $1`, [auditId]);
                // 2. Trigger 3: Insertar documento marcado como inmutable y verificar que no se puede modificar ni borrar
                const docRes = await client.query(`INSERT INTO public.documents (
             tenant_id, company_id, document_type, title, original_filename,
             storage_key, mime_type, size_bytes, sha256_hash, is_immutable, uploaded_by
           ) VALUES (
             $1, $2, 'RECIBO_SUELDO_PDF', 'Recibo Octubre 2026', 'recibo.pdf',
             'tenants/a/recibo.pdf', 'application/pdf', 4096,
             'a3f5c8e90123456789abcdef0123456789abcdef0123456789abcdef01234567', true, $3
           ) RETURNING id`, [SEED_IDS.TENANT_A, SEED_IDS.COMPANY_A_COMBINA, SEED_IDS.USER_A]);
                const docId = docRes.rows[0].id;
                await expectImmutableError(`UPDATE public.documents SET title = 'Alterado' WHERE id = $1`, [
                    docId,
                ]);
                await expectImmutableError(`DELETE FROM public.documents WHERE id = $1`, [docId]);
                // 3. Triggers 1 y 2: Crear período, liquidación, recibo, versión de recibo y renglón de liquidación,
                // marcar como aprobado/inmutable y verificar bloqueo de mutación
                const branchId = 'c1000000-0000-4000-8000-000000000001';
                await client.query(`INSERT INTO public.company_branches (id, tenant_id, company_id, code, name, address, locality, province, postal_code)
           VALUES ($1, $2, $3, 'PLANTA_SUR', 'Planta Córdoba', 'Av. Sabattini 3200', 'Córdoba', 'Córdoba', '5000')`, [branchId, SEED_IDS.TENANT_A, SEED_IDS.COMPANY_A_COMBINA]);
                const empId = 'e9000000-0000-4000-8000-000000000001';
                await client.query(`INSERT INTO public.employees (id, tenant_id, company_id, cuil, dni, legajo, hire_date, created_by)
           VALUES ($1, $2, $3, '20993334445', '99333444', '902', '2019-09-02', $4)`, [empId, SEED_IDS.TENANT_A, SEED_IDS.COMPANY_A_COMBINA, SEED_IDS.USER_A]);
                const empVerId = 'e9100000-0000-4000-8000-000000000001';
                await client.query(`INSERT INTO public.employee_versions (
             id, tenant_id, company_id, employee_id, branch_id, agreement_id, agreement_branch_id, category_id,
             version, valid_from, last_name, first_name, birth_date, registered_sex, marital_status,
             address, locality, province, postal_code, contract_type, job_position, schedule_type,
             habitual_schedule, remuneration_modality, remuneration_unit, payment_frequency,
             workplace_location, obra_social_code, obra_social_name, change_reason, updated_by
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8,
             1, '2019-09-02', 'TEJEDOR', 'GONZALO MATIAS', '1999-04-10', 'M', 'SOLTERO',
             'Av. Colón 1500', 'Córdoba', 'Córdoba', '5000', 'TIEMPO_INDETERMINADO', 'Operario', 'COMPLETA',
             'Lunes a Viernes 08 a 17', 'JORNALIZADO', 'HORA', 'QUINCENAL',
             'Planta Córdoba', '112103', 'OSUOMRA', 'Alta inicial', $9
           )`, [
                    empVerId,
                    SEED_IDS.TENANT_A,
                    SEED_IDS.COMPANY_A_COMBINA,
                    empId,
                    branchId,
                    SEED_IDS.CBA_UOM,
                    SEED_IDS.CBA_UOM_BRANCH_R4,
                    SEED_IDS.CBA_UOM_CAT_OFICIAL_MULTIPLE,
                    SEED_IDS.USER_A,
                ]);
                const scaleId = '33000000-0000-4000-8000-000000000001';
                await client.query(`INSERT INTO public.salary_scales (
             id, tenant_id, agreement_id, branch_id, version, agreement_number, period_code,
             valid_from, valid_to, status
           ) VALUES (
             $1, NULL, $2, $3, 99, 'Acuerdo UOM Octubre 2026 Test', '2026-10',
             '2026-10-01', '2026-10-31', 'VALIDATED'
           ) ON CONFLICT (id) DO NOTHING`, [scaleId, SEED_IDS.CBA_UOM, SEED_IDS.CBA_UOM_BRANCH_R4]);
                const periodId = 'f9000000-0000-4000-8000-000000000001';
                await client.query(`INSERT INTO public.payroll_periods (
             id, tenant_id, company_id, year, month, period_code, liquidation_modality,
             payment_frequency, arca_sequence_number, accrual_start_date, accrual_end_date,
             closing_date, legal_due_date, scheduled_payment_date, created_by
           ) VALUES (
             $1, $2, $3, 2026, 10, '2026-10', 'SEGUNDA_QUINCENA',
             'QUINCENAL', 2, '2026-10-16', '2026-10-31',
             '2026-10-31', '2026-11-05', '2026-11-04', $4
           )`, [periodId, SEED_IDS.TENANT_A, SEED_IDS.COMPANY_A_COMBINA, SEED_IDS.USER_A]);
                const payrollId = 'c9000000-0000-4000-8000-000000000001';
                await client.query(`INSERT INTO public.payrolls (
             id, tenant_id, company_id, period_id, version, liquidation_modality, status,
             total_remunerative, total_deductions, total_net_pay, engine_version, is_immutable, calculated_by
           ) VALUES (
             $1, $2, $3, $4, 1, 'SEGUNDA_QUINCENA', 'DRAFT',
             886821.12, 189872.02, 696949.10, '1.0.0', false, $5
           )`, [payrollId, SEED_IDS.TENANT_A, SEED_IDS.COMPANY_A_COMBINA, periodId, SEED_IDS.USER_A]);
                const payslipId = 'd9000000-0000-4000-8000-000000000001';
                await client.query(`INSERT INTO public.payslips (id, tenant_id, company_id, payroll_id, employee_id, receipt_code, status)
           VALUES ($1, $2, $3, $4, $5, 'REC-2026-10-2Q-0002', 'DRAFT')`, [payslipId, SEED_IDS.TENANT_A, SEED_IDS.COMPANY_A_COMBINA, payrollId, empId]);
                const pvId = 'd9100000-0000-4000-8000-000000000001';
                await client.query(`INSERT INTO public.payslip_versions (
             id, tenant_id, company_id, employee_id, payslip_id, company_version_id, employee_version_id,
             salary_scale_id, category_id, version_number, remuneration_modality, remuneration_unit,
             payment_frequency, total_remunerative, total_non_remunerative, total_deductions, net_pay,
             net_pay_in_words, total_employer_contributions, total_employer_cost, calculation_snapshot,
             sha256_hash, is_immutable
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, 1, 'JORNALIZADO', 'HORA',
             'QUINCENAL', 886821.12, 0, 189872.02, 696949.10,
             'PESOS SEISCIENTOS NOVENTA Y SEIS MIL NOVECIENTOS CUARENTA Y NUEVE CON 10/100',
             0, 886821.12, '{"scaleVersion": 1}'::jsonb,
             'b3f5c8e90123456789abcdef0123456789abcdef0123456789abcdef01234567', false
           )`, [
                    pvId,
                    SEED_IDS.TENANT_A,
                    SEED_IDS.COMPANY_A_COMBINA,
                    empId,
                    payslipId,
                    SEED_IDS.COMPANY_A_VERSION_1,
                    empVerId,
                    scaleId,
                    SEED_IDS.CBA_UOM_CAT_OFICIAL_MULTIPLE,
                ]);
                const conceptId = '34000000-0000-4000-8000-000000000001';
                await client.query(`INSERT INTO public.payroll_concepts (id, tenant_id, agreement_id, code, name, nature, default_unit, accrual_scope)
           VALUES ($1, NULL, $2, 'BASICO_HORAS', 'Horas Normales Quincena', 'REMUNERATIVE', 'HORA', 'PER_PAY_PERIOD')`, [conceptId, SEED_IDS.CBA_UOM]);
                const itemId = 'b9000000-0000-4000-8000-000000000001';
                await client.query(`INSERT INTO public.payroll_items (
             id, tenant_id, payslip_version_id, concept_id, concept_code, concept_name,
             item_nature, unit, quantity, calculation_base, exact_amount, rounded_amount, formula_applied
           ) VALUES (
             $1, $2, $3, $4, 'BASICO_HORAS', 'Horas Normales Quincena',
             'REMUNERATIVE', 'HORA', 96, 7684.00, 737664.00, 737664.00, 'quantity * hourly_rate'
           )`, [itemId, SEED_IDS.TENANT_A, pvId, conceptId]);
                // Aprobar liquidación y sellar versión de recibo como inmutable
                await client.query(`UPDATE public.payrolls SET status = 'APPROVED', is_immutable = true WHERE id = $1`, [payrollId]);
                await client.query(`UPDATE public.payslip_versions SET is_immutable = true WHERE id = $1`, [pvId]);
                // Intentar alterar la liquidación aprobada, la versión del recibo o sus renglones debe fallar
                await expectImmutableError(`UPDATE public.payrolls SET total_net_pay = 100.00 WHERE id = $1`, [payrollId]);
                await expectImmutableError(`UPDATE public.payslip_versions SET net_pay = 100.00 WHERE id = $1`, [pvId]);
                await expectImmutableError(`UPDATE public.payroll_items SET rounded_amount = 100.00 WHERE id = $1`, [itemId]);
                await expectImmutableError(`DELETE FROM public.payroll_items WHERE id = $1`, [itemId]);
            }
            finally {
                await client.query('ROLLBACK');
                client.release();
            }
        });
    });
    // =========================================================================
    // SUBFASE 2B: AISLAMIENTO MULTI-TENANT, FORCE RLS Y FIRMA HMAC TRANSACCIONAL
    // =========================================================================
    describe('Subfase 2B: Seguridad PostgreSQL FORCE RLS, Protección Anti-Spoofing HMAC y Aislamiento Usuario A vs. Usuario B', () => {
        it('Verifica que app_tenant_user tiene rolbypassrls = false y las 41 tablas tienen FORCE ROW LEVEL SECURITY activo', async () => {
            const res = await tenantPool.query(`
        SELECT
          current_user,
          (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS rolsuper,
          (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS rolbypassrls,
          (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_schema_migrations' AND c.relforcerowsecurity = true) AS forced_tables
      `);
            expect(res.rows[0].current_user).toBe('app_tenant_user');
            expect(res.rows[0].rolsuper).toBe(false);
            expect(res.rows[0].rolbypassrls).toBe(false);
            expect(Number(res.rows[0].forced_tables)).toBe(41);
        });
        it('Impide la suplantación manual de variables de sesión (SET LOCAL app.ctx_tenant_id) sin firma HMAC válida', async () => {
            const client = await tenantPool.connect();
            try {
                await client.query('BEGIN');
                // Intento malicioso de fijar manualmente las variables de sesión sin pasar por activate_session_context
                await client.query(`SET LOCAL app.ctx_user_id = '${SEED_IDS.USER_A}'`);
                await client.query(`SET LOCAL app.ctx_tenant_id = '${SEED_IDS.TENANT_A}'`);
                await client.query(`SET LOCAL app.ctx_role = 'OWNER'`);
                await client.query(`SET LOCAL app.ctx_sig = 'firma_falsa_inventada'`);
                const check = await client.query(`SELECT auth_internal.verified_tenant_id()::text AS verified_tenant`);
                expect(check.rows[0].verified_tenant).toBeNull();
                // La consulta a companies debe devolver exactamente 0 filas
                const companiesRes = await client.query(`SELECT * FROM public.companies`);
                expect(companiesRes.rowCount).toBe(0);
                // El rol app_tenant_user no puede leer la tabla privada de secretos HMAC
                await expect(client.query(`SELECT * FROM auth_internal.instance_secrets`)).rejects.toThrow(/permiso denegado|permission denied/i);
            }
            finally {
                await client.query('ROLLBACK');
                client.release();
            }
        });
        it('Garantiza aislamiento total entre Usuario A (Papá) y Usuario B (Socio) en API y Base de Datos', async () => {
            // 1. Login Usuario A (Papá)
            const loginARes = await app.inject({
                method: 'POST',
                url: '/api/v1/auth/login',
                payload: {
                    email: 'papa@estudiocontable.ar',
                    password: 'Papa_Sueldos_2026!',
                },
            });
            expect(loginARes.statusCode).toBe(200);
            const authA = loginARes.json();
            expect(authA.activeTenantId).toBe(SEED_IDS.TENANT_A);
            // 2. Login Usuario B (Socio)
            const loginBRes = await app.inject({
                method: 'POST',
                url: '/api/v1/auth/login',
                payload: {
                    email: 'socio@estudiocontable.ar',
                    password: 'Socio_Sueldos_2026!',
                },
            });
            expect(loginBRes.statusCode).toBe(200);
            const authB = loginBRes.json();
            expect(authB.activeTenantId).toBe(SEED_IDS.TENANT_B);
            // 3. Usuario A lista sus empresas -> solo ve ARRIETA JORGE Y COMBINA ALDO JAVIER S.H.
            const compARes = await app.inject({
                method: 'GET',
                url: '/api/v1/companies',
                headers: { Authorization: `Bearer ${authA.sessionToken}` },
            });
            expect(compARes.statusCode).toBe(200);
            const companiesA = compARes.json().companies;
            expect(companiesA).toHaveLength(1);
            expect(companiesA[0].id).toBe(SEED_IDS.COMPANY_A_COMBINA);
            expect(companiesA[0].cuit).toBe('30698448411');
            // 4. Usuario B lista sus empresas -> solo ve METALÚRGICA DEL SUR S.R.L.
            const compBRes = await app.inject({
                method: 'GET',
                url: '/api/v1/companies',
                headers: { Authorization: `Bearer ${authB.sessionToken}` },
            });
            expect(compBRes.statusCode).toBe(200);
            const companiesB = compBRes.json().companies;
            expect(companiesB).toHaveLength(1);
            expect(companiesB[0].id).toBe(SEED_IDS.COMPANY_B_SOCIO);
            // 5. Intento de lectura cruzada por UUID: Usuario A intenta leer la empresa de Usuario B
            const crossReadRes = await app.inject({
                method: 'GET',
                url: `/api/v1/companies/${SEED_IDS.COMPANY_B_SOCIO}`,
                headers: { Authorization: `Bearer ${authA.sessionToken}` },
            });
            expect(crossReadRes.statusCode).toBe(404);
            // 6. Intento de cambio manual de espacio de trabajo al tenant del Socio B por parte de Usuario A
            const crossSwitchRes = await app.inject({
                method: 'POST',
                url: '/api/v1/auth/select-workspace',
                headers: { Authorization: `Bearer ${authA.sessionToken}` },
                payload: { tenantId: SEED_IDS.TENANT_B },
            });
            expect(crossSwitchRes.statusCode).toBe(403);
        });
        it('Soporta usuarios con múltiples membresías (selección explícita de espacio) y revocación inmediata de sesión', async () => {
            // Login con usuario que tiene membresía en Tenant A y Tenant B (ambas con is_default = false)
            const loginMulti = await app.inject({
                method: 'POST',
                url: '/api/v1/auth/login',
                payload: {
                    email: 'auditor.multitenant@estudiocontable.ar',
                    password: 'Multi_Sueldos_2026!',
                },
            });
            expect(loginMulti.statusCode).toBe(200);
            const multiData = loginMulti.json();
            expect(multiData.activeTenantId).toBeNull();
            expect(multiData.requiresTenantSelection).toBe(true);
            expect(multiData.memberships).toHaveLength(2);
            // Intentar consultar empresas sin haber elegido espacio de trabajo debe devolver 403
            const beforeSelect = await app.inject({
                method: 'GET',
                url: '/api/v1/companies',
                headers: { Authorization: `Bearer ${multiData.sessionToken}` },
            });
            expect(beforeSelect.statusCode).toBe(403);
            // Seleccionar Espacio A
            const selectA = await app.inject({
                method: 'POST',
                url: '/api/v1/auth/select-workspace',
                headers: { Authorization: `Bearer ${multiData.sessionToken}` },
                payload: { tenantId: SEED_IDS.TENANT_A },
            });
            expect(selectA.statusCode).toBe(200);
            const listInA = await app.inject({
                method: 'GET',
                url: '/api/v1/companies',
                headers: { Authorization: `Bearer ${multiData.sessionToken}` },
            });
            expect(listInA.statusCode).toBe(200);
            expect(listInA.json().companies[0].id).toBe(SEED_IDS.COMPANY_A_COMBINA);
            // Cambiar a Espacio B
            const selectB = await app.inject({
                method: 'POST',
                url: '/api/v1/auth/select-workspace',
                headers: { Authorization: `Bearer ${multiData.sessionToken}` },
                payload: { tenantId: SEED_IDS.TENANT_B },
            });
            expect(selectB.statusCode).toBe(200);
            const listInB = await app.inject({
                method: 'GET',
                url: '/api/v1/companies',
                headers: { Authorization: `Bearer ${multiData.sessionToken}` },
            });
            expect(listInB.statusCode).toBe(200);
            expect(listInB.json().companies[0].id).toBe(SEED_IDS.COMPANY_B_SOCIO);
            // Cerrar sesión (revocación inmediata)
            const logoutRes = await app.inject({
                method: 'POST',
                url: '/api/v1/auth/logout',
                headers: { Authorization: `Bearer ${multiData.sessionToken}` },
            });
            expect(logoutRes.statusCode).toBe(200);
            // Intentar reutilizar el token revocado debe devolver 401
            const afterLogout = await app.inject({
                method: 'GET',
                url: '/api/v1/companies',
                headers: { Authorization: `Bearer ${multiData.sessionToken}` },
            });
            expect(afterLogout.statusCode).toBe(401);
        });
    });
    // =========================================================================
    // SUBFASE 2C: CLIENTE DE ESCRITORIO TAURI 2 Y WINDOWS CREDENTIAL MANAGER
    // =========================================================================
    describe('Subfase 2C: Cliente Tauri 2 + React 19 y Almacenamiento Seguro de Credenciales', () => {
        it('Verifica que el cliente de escritorio utiliza comandos Tauri keyring y no persiste tokens en localStorage ni sessionStorage', () => {
            const credStorePath = path.resolve(__dirname, '../../../../../apps/desktop/src/lib/credentialStore.ts');
            const rustMainPath = path.resolve(__dirname, '../../../../../apps/desktop/src-tauri/src/main.rs');
            const tsSource = fs.readFileSync(credStorePath, 'utf8');
            const rustSource = fs.readFileSync(rustMainPath, 'utf8');
            expect(tsSource).toContain("invoke('save_session_token'");
            expect(tsSource).toContain("invoke<string | null>('get_session_token')");
            expect(tsSource).toContain("invoke('clear_session_token')");
            expect(tsSource).not.toMatch(/localStorage\.(setItem|getItem)/);
            expect(tsSource).not.toMatch(/sessionStorage\.(setItem|getItem)/);
            expect(rustSource).toContain('keyring::Entry');
            expect(rustSource).toContain('fn save_session_token');
            expect(rustSource).toContain('fn get_session_token');
            expect(rustSource).toContain('fn clear_session_token');
        });
    });
    // =========================================================================
    // SUBFASE 2D: BACKUPS COMPLETOS CIFRADOS (AES-256-GCM) Y RESTAURACIÓN VERIFICADA
    // =========================================================================
    describe('Subfase 2D: Backups Completos Cifrados AES-256-GCM y Restauración Comprobada', () => {
        it('Genera un backup cifrado AES-256-GCM, detecta adulteración de 1 byte y restaura con paridad completa en ar_payroll_restore_test', async () => {
            const testBackupsDir = path.resolve(__dirname, '../../../../../backups/test-run');
            const manifest = createEncryptedFullBackup(testBackupsDir);
            expect(fs.existsSync(manifest.encryptedFilePath)).toBe(true);
            expect(manifest.algorithm).toBe('AES-256-GCM');
            expect(manifest.plaintextBytes).toBeGreaterThan(1000);
            // 1. Prueba de detección de adulteración (Tamper Test): alterar 1 byte del ciphertext
            const tamperedPath = `${manifest.encryptedFilePath}.tampered`;
            const originalCiphertext = fs.readFileSync(manifest.encryptedFilePath);
            const tamperedBuffer = Buffer.from(originalCiphertext);
            tamperedBuffer[Math.floor(tamperedBuffer.length / 2)] ^= 0xff;
            fs.writeFileSync(tamperedPath, tamperedBuffer);
            await expect(restoreAndVerifyBackup({
                ...manifest,
                encryptedFilePath: tamperedPath,
            })).rejects.toThrow(/Fallo de integridad criptográfica AES-256-GCM/);
            fs.unlinkSync(tamperedPath);
            // 2. Prueba de restauración real y verificación de paridad de las 41 tablas en ar_payroll_restore_test
            const verification = await restoreAndVerifyBackup(manifest);
            expect(verification.plaintextSha256Verified).toBe(true);
            expect(verification.restoredPhysicalTables).toBe(41);
            expect(verification.restoredTenantsCount).toBe(verification.sourceTenantsCount);
            expect(verification.restoredUsersCount).toBe(verification.sourceUsersCount);
            expect(verification.restoredCompaniesCount).toBe(verification.sourceCompaniesCount);
        }, 30000);
    });
});
