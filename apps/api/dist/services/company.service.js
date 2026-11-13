import { SEED_IDS, isValidArgentineCuitOrCuil, } from '@ar-payroll/contracts';
import { AuthenticationError } from '../db/pool.js';
export class CompanyService {
    /**
     * Lista todas las empresas del tenant activo con conteo de empleados, domicilio y fecha de última modificación.
     * Protegido automáticamente por PostgreSQL FORCE ROW LEVEL SECURITY.
     */
    async listCompanies(client) {
        const res = await client.query(`
      SELECT
        c.id,
        c.tenant_id,
        c.cuit,
        c.is_active,
        c.updated_at,
        cv.legal_name,
        cv.trade_name,
        cv.main_activity,
        cv.fiscal_address,
        cv.locality,
        cv.province,
        cv.postal_code,
        cv.email,
        cv.phone,
        cv.vat_condition,
        cv.art_name,
        cv.art_aliquot_pct::text,
        cv.art_fixed_amount::text,
        (SELECT count(*)::text FROM public.employees e WHERE e.tenant_id = c.tenant_id AND e.company_id = c.id) AS employees_count,
        (SELECT count(*)::text FROM public.employees e WHERE e.tenant_id = c.tenant_id AND e.company_id = c.id AND e.employment_status = 'ACTIVE') AS active_employees_count,
        (SELECT pp.period_code FROM public.payroll_periods pp WHERE pp.tenant_id = c.tenant_id AND pp.company_id = c.id ORDER BY pp.year DESC, pp.month DESC LIMIT 1) AS current_period_code
      FROM public.companies c
      JOIN public.company_versions cv
        ON cv.tenant_id = c.tenant_id
       AND cv.company_id = c.id
       AND cv.version = c.current_version
      ORDER BY cv.legal_name ASC
    `);
        return res.rows.map((r) => ({
            id: r.id,
            tenantId: r.tenant_id,
            cuit: r.cuit,
            legalName: r.legal_name,
            tradeName: r.trade_name,
            primaryActivity: r.main_activity,
            fiscalAddress: r.fiscal_address,
            locality: r.locality,
            province: r.province,
            postalCode: r.postal_code,
            arcaDomicilioExplotacion: r.fiscal_address && r.locality && r.province
                ? `${r.fiscal_address} — ${r.locality}, ${r.province}`
                : r.locality && r.province
                    ? `${r.locality}, ${r.province}`
                    : r.fiscal_address,
            email: r.email,
            phone: r.phone,
            vatCondition: r.vat_condition,
            artName: r.art_name,
            artAliquotPct: Number(r.art_aliquot_pct ?? 0),
            artFixedAmount: Number(r.art_fixed_amount ?? 0),
            defaultCbaId: null,
            employeesCount: Number(r.employees_count ?? 0),
            activeEmployeesCount: Number(r.active_employees_count ?? 0),
            currentPeriodLabel: r.current_period_code ?? '2026-10',
            updatedAt: new Date(r.updated_at).toISOString(),
            isActive: r.is_active,
        }));
    }
    /**
     * Obtiene el detalle integral de una empresa seleccionada para las 7 pestañas internas:
     * 1. General | 2. Empleados | 3. Convenios y escalas | 4. Novedades | 5. Liquidaciones | 6. Recibos | 7. Libro de Sueldos Digital
     */
    async getCompanyDetail(client, companyId) {
        const companies = await this.listCompanies(client);
        const company = companies.find((c) => c.id === companyId);
        if (!company) {
            return null;
        }
        const branchesRes = await client.query(`SELECT id, code, name, address, locality, province, postal_code, is_active
       FROM public.company_branches
       WHERE company_id = $1
       ORDER BY code ASC`, [companyId]);
        const agreementsRes = await client.query(`SELECT ca_link.id, ca_link.agreement_id, ca_link.branch_id, ca_link.is_active,
              ca.cct_number, ca.name AS agreement_name, ca.union_name,
              ab.code AS branch_code, ab.name AS branch_name
       FROM public.company_agreements ca_link
       JOIN public.collective_agreements ca ON ca.id = ca_link.agreement_id
       LEFT JOIN public.agreement_branches ab ON ab.id = ca_link.branch_id
       WHERE ca_link.company_id = $1`, [companyId]);
        const periodsRes = await client.query(`SELECT id, year, month, period_code, liquidation_modality, payment_frequency,
              accrual_start_date::text, accrual_end_date::text, period_status, scheduled_payment_date::text
       FROM public.payroll_periods
       WHERE company_id = $1
       ORDER BY year DESC, month DESC, arca_sequence_number DESC`, [companyId]);
        const payrollsRes = await client.query(`SELECT p.id, p.period_id, pp.period_code, p.version, p.liquidation_modality, p.status,
              p.employees_count, p.total_remunerative::text, p.total_non_remunerative::text,
              p.total_deductions::text, p.total_net_pay::text, p.total_employer_cost::text,
              p.is_immutable, p.calculated_at
       FROM public.payrolls p
       JOIN public.payroll_periods pp ON pp.tenant_id = p.tenant_id AND pp.company_id = p.company_id AND pp.id = p.period_id
       WHERE p.company_id = $1
       ORDER BY p.calculated_at DESC`, [companyId]);
        const payslipsRes = await client.query(`SELECT ps.id, ps.receipt_code, ps.status, ps.current_version_number,
              e.legajo, e.cuil, ev.last_name, ev.first_name,
              pv.total_remunerative::text, pv.total_deductions::text, pv.net_pay::text, pv.is_immutable
       FROM public.payslips ps
       JOIN public.employees e ON e.tenant_id = ps.tenant_id AND e.company_id = ps.company_id AND e.id = ps.employee_id
       JOIN public.employee_versions ev ON ev.tenant_id = e.tenant_id AND ev.employee_id = e.id AND ev.version = e.current_version
       LEFT JOIN public.payslip_versions pv ON pv.tenant_id = ps.tenant_id AND pv.payslip_id = ps.id AND pv.version_number = ps.current_version_number
       WHERE ps.company_id = $1
       ORDER BY ps.created_at DESC`, [companyId]);
        const noveltiesRes = await client.query(`SELECT pn.id, pn.period_id, pp.period_code, pn.employee_id, e.legajo,
              ev.last_name, ev.first_name, pnt.code AS novelty_code, pnt.name AS novelty_name,
              pn.quantity::text, pn.unit, pn.status, pn.novelty_date::text
       FROM public.payroll_novelties pn
       JOIN public.payroll_periods pp ON pp.tenant_id = pn.tenant_id AND pp.company_id = pn.company_id AND pp.id = pn.period_id
       JOIN public.employees e ON e.tenant_id = pn.tenant_id AND e.company_id = pn.company_id AND e.id = pn.employee_id
       JOIN public.employee_versions ev ON ev.tenant_id = e.tenant_id AND ev.employee_id = e.id AND ev.version = e.current_version
       JOIN public.payroll_novelty_types pnt ON pnt.id = pn.novelty_type_id
       WHERE pn.company_id = $1
       ORDER BY pn.created_at DESC`, [companyId]);
        const arcaRes = await client.query(`SELECT id, period_yyyymm, submission_type, liquidation_type, liquidation_number,
              employees_count, validation_status, official_spec_version, created_at
       FROM public.arca_exports
       WHERE company_id = $1
       ORDER BY created_at DESC`, [companyId]);
        return {
            company,
            branches: branchesRes.rows,
            agreements: agreementsRes.rows,
            periods: periodsRes.rows,
            payrolls: payrollsRes.rows,
            payslips: payslipsRes.rows,
            novelties: noveltiesRes.rows,
            arcaExports: arcaRes.rows,
        };
    }
    /**
     * Crea una nueva empresa en el tenant activo con su versión inicial, sucursal CENTRAL y convenio UOM por defecto.
     */
    async createCompany(client, ctx, body, ipAddress) {
        if (ctx.roleCode === 'VIEWER') {
            throw new AuthenticationError('El rol VIEWER no tiene permisos para crear empresas.', 403);
        }
        const cleanCuit = body.cuit.replace(/\D/g, '');
        if (!isValidArgentineCuitOrCuil(cleanCuit)) {
            throw new Error(`El CUIT ${body.cuit} es inválido (falló dígito verificador Módulo 11).`);
        }
        const dupCheck = await client.query(`SELECT id FROM public.companies WHERE cuit = $1`, [cleanCuit]);
        if ((dupCheck.rowCount ?? 0) > 0) {
            throw new Error(`Ya existe una empresa registrada con el CUIT ${cleanCuit} en este espacio de trabajo.`);
        }
        const compRes = await client.query(`INSERT INTO public.companies (tenant_id, cuit, current_version, is_active, created_by)
       VALUES ($1, $2, 1, true, $3)
       RETURNING id, tenant_id, cuit, is_active, updated_at`, [ctx.activeTenantId, cleanCuit, ctx.userId]);
        const comp = compRes.rows[0];
        const locality = body.locality ?? 'Córdoba';
        const province = body.province ?? 'Córdoba';
        const fiscalAddress = body.fiscalAddress ?? body.arcaDomicilioExplotacion ?? 'Av. Principal 100';
        await client.query(`INSERT INTO public.company_versions (
         tenant_id, company_id, version, valid_from, legal_name, trade_name,
         person_type, company_type, activity_start_date, main_activity, arca_activity_code,
         vat_condition, fiscal_address, legal_address, province, locality, postal_code,
         phone, email, art_name, art_aliquot_pct, art_fixed_amount, created_by
       ) VALUES (
         $1, $2, 1, CURRENT_DATE, $3, $4,
         $5, $6, CURRENT_DATE, $7, $8,
         $9, $10, $10, $11, $12, $13,
         $14, $15, $16, $17, $18, $19
       )`, [
            ctx.activeTenantId,
            comp.id,
            body.legalName,
            body.tradeName ?? null,
            body.personType ?? 'JURIDICA',
            body.companyType ?? 'Sociedad Comercial',
            body.primaryActivity ?? 'Industria Metalúrgica',
            body.arcaActivityCode ?? '293011',
            body.vatCondition ?? 'Responsable Inscripto',
            fiscalAddress,
            province,
            locality,
            body.postalCode ?? '5000',
            body.phone ?? null,
            body.email ?? 'administracion@empresa.com.ar',
            body.artName ?? 'Prevención ART',
            body.artAliquotPct ?? 3.5,
            body.artFixedAmount ?? 1100,
            ctx.userId,
        ]);
        // Crear sucursal CENTRAL por defecto para permitir carga inmediata de empleados
        await client.query(`INSERT INTO public.company_branches (tenant_id, company_id, code, name, address, locality, province, postal_code)
       VALUES ($1, $2, 'CENTRAL', 'Sede Central', $3, $4, $5, $6)`, [ctx.activeTenantId, comp.id, fiscalAddress, locality, province, body.postalCode ?? '5000']);
        // Vincular convenio CCT 260/75 UOM por defecto
        const cbaId = body.defaultCbaId ?? SEED_IDS.CBA_UOM;
        await client.query(`INSERT INTO public.company_agreements (tenant_id, company_id, agreement_id, branch_id, confirmed_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`, [
            ctx.activeTenantId,
            comp.id,
            cbaId,
            cbaId === SEED_IDS.CBA_UOM ? SEED_IDS.CBA_UOM_BRANCH_R4 : null,
            ctx.userId,
        ]);
        await client.query(`INSERT INTO public.audit_logs (tenant_id, user_id, action, module, target_table, target_id, outcome, new_values, ip_address)
       VALUES ($1, $2, 'COMPANY_CREATED', 'COMPANIES', 'companies', $3, 'SUCCESS', $4::jsonb, $5)`, [
            ctx.activeTenantId,
            ctx.userId,
            comp.id,
            JSON.stringify({ cuit: comp.cuit, legalName: body.legalName }),
            ipAddress ?? '127.0.0.1',
        ]);
        return {
            id: comp.id,
            tenantId: comp.tenant_id,
            cuit: comp.cuit,
            legalName: body.legalName,
            tradeName: body.tradeName ?? null,
            primaryActivity: body.primaryActivity ?? 'Industria Metalúrgica',
            fiscalAddress,
            locality,
            province,
            arcaDomicilioExplotacion: `${fiscalAddress} — ${locality}, ${province}`,
            defaultCbaId: cbaId,
            employeesCount: 0,
            activeEmployeesCount: 0,
            currentPeriodLabel: '2026-10',
            updatedAt: new Date(comp.updated_at).toISOString(),
            isActive: comp.is_active,
        };
    }
    /**
     * Actualiza los datos de una empresa generando una nueva versión histórica en company_versions
     * o archivando/activando su estado operativo.
     */
    async updateCompany(client, ctx, companyId, body, ipAddress) {
        if (ctx.roleCode === 'VIEWER') {
            throw new AuthenticationError('El rol VIEWER no tiene permisos para modificar empresas.', 403);
        }
        const currentRes = await client.query(`SELECT c.id, c.cuit, c.current_version, c.is_active,
              cv.legal_name, cv.trade_name, cv.person_type, cv.company_type,
              cv.main_activity, cv.arca_activity_code, cv.vat_condition,
              cv.fiscal_address, cv.locality, cv.province, cv.postal_code,
              cv.phone, cv.email, cv.art_name, cv.art_aliquot_pct::text, cv.art_fixed_amount::text
       FROM public.companies c
       JOIN public.company_versions cv
         ON cv.tenant_id = c.tenant_id AND cv.company_id = c.id AND cv.version = c.current_version
       WHERE c.id = $1`, [companyId]);
        if (currentRes.rowCount === 0) {
            return null;
        }
        const cur = currentRes.rows[0];
        const nextVersion = cur.current_version + 1;
        const nextIsActive = body.isActive !== undefined ? body.isActive : cur.is_active;
        await client.query(`UPDATE public.company_versions
          SET valid_to = CURRENT_DATE
        WHERE company_id = $1 AND version = $2`, [companyId, cur.current_version]);
        await client.query(`INSERT INTO public.company_versions (
         tenant_id, company_id, version, valid_from, legal_name, trade_name,
         person_type, company_type, activity_start_date, main_activity, arca_activity_code,
         vat_condition, fiscal_address, legal_address, province, locality, postal_code,
         phone, email, art_name, art_aliquot_pct, art_fixed_amount, created_by
       ) VALUES (
         $1, $2, $3, CURRENT_DATE, $4, $5,
         $6, $7, CURRENT_DATE, $8, $9,
         $10, $11, $11, $12, $13, $14,
         $15, $16, $17, $18, $19, $20
       )`, [
            ctx.activeTenantId,
            companyId,
            nextVersion,
            body.legalName ?? cur.legal_name,
            body.tradeName !== undefined ? body.tradeName : cur.trade_name,
            body.personType ?? cur.person_type,
            body.companyType ?? cur.company_type,
            body.primaryActivity ?? cur.main_activity,
            body.arcaActivityCode ?? cur.arca_activity_code,
            body.vatCondition ?? cur.vat_condition,
            body.fiscalAddress ?? body.arcaDomicilioExplotacion ?? cur.fiscal_address,
            body.province ?? cur.province,
            body.locality ?? cur.locality,
            body.postalCode ?? cur.postal_code,
            body.phone !== undefined ? body.phone : cur.phone,
            body.email ?? cur.email,
            body.artName ?? cur.art_name,
            body.artAliquotPct ?? Number(cur.art_aliquot_pct),
            body.artFixedAmount ?? Number(cur.art_fixed_amount),
            ctx.userId,
        ]);
        await client.query(`UPDATE public.companies
          SET current_version = $1,
              is_active = $2,
              updated_at = now(),
              deleted_at = CASE WHEN $2 = false THEN now() ELSE NULL END
        WHERE id = $3`, [nextVersion, nextIsActive, companyId]);
        await client.query(`INSERT INTO public.audit_logs (tenant_id, user_id, action, module, target_table, target_id, outcome, previous_values, new_values, ip_address)
       VALUES ($1, $2, 'COMPANY_UPDATED', 'COMPANIES', 'companies', $3, 'SUCCESS', $4::jsonb, $5::jsonb, $6)`, [
            ctx.activeTenantId,
            ctx.userId,
            companyId,
            JSON.stringify({ version: cur.current_version, legalName: cur.legal_name, isActive: cur.is_active }),
            JSON.stringify({ version: nextVersion, legalName: body.legalName ?? cur.legal_name, isActive: nextIsActive }),
            ipAddress ?? '127.0.0.1',
        ]);
        const list = await this.listCompanies(client);
        return list.find((c) => c.id === companyId) ?? null;
    }
}
export const companyService = new CompanyService();
