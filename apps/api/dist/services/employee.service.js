import { isValidArgentineCuitOrCuil, } from '@ar-payroll/contracts';
import { AuthenticationError } from '../db/pool.js';
export class EmployeeService {
    async listVacations(client, filters) {
        const values = [];
        const conditions = [`el.situation_type = 'VACACIONES'`];
        if (filters.companyId) {
            values.push(filters.companyId);
            conditions.push(`el.company_id = $${values.length}`);
        }
        if (filters.year && Number.isInteger(filters.year)) {
            values.push(filters.year);
            conditions.push(`EXTRACT(YEAR FROM el.start_date) = $${values.length}`);
        }
        const res = await client.query(`SELECT el.id, el.company_id, cv.legal_name AS company_name,
              el.employee_id, e.legajo, ev.last_name, ev.first_name,
              el.start_date::text, el.end_date::text, el.days_count,
              el.status, el.observations, e.hire_date::text,
              e.recognized_prior_years
       FROM public.employee_leaves el
       JOIN public.companies c ON c.id = el.company_id
       JOIN public.company_versions cv ON cv.tenant_id = c.tenant_id
          AND cv.company_id = c.id AND cv.version = c.current_version
       JOIN public.employees e ON e.tenant_id = el.tenant_id
          AND e.company_id = el.company_id AND e.id = el.employee_id
       JOIN public.employee_versions ev ON ev.tenant_id = e.tenant_id
          AND ev.company_id = e.company_id AND ev.employee_id = e.id
          AND ev.version = e.current_version
       WHERE ${conditions.join(' AND ')}
       ORDER BY el.start_date DESC, cv.legal_name, ev.last_name, ev.first_name`, values);
        return res.rows.map((row) => ({
            ...row,
            legal_entitlement_days: calculateVacationEntitlement(row.hire_date, Number(row.recognized_prior_years ?? 0), Number(String(row.start_date).slice(0, 4))),
        }));
    }
    /**
     * Lista los empleados de una empresa en formato optimizado para la Grilla estilo Excel.
     */
    async listCompanyEmployees(client, companyId) {
        const res = await client.query(`SELECT
         e.id,
         e.company_id,
         e.legajo,
         e.cuil,
         e.dni,
         e.hire_date::text AS hire_date,
         e.termination_date::text AS termination_date,
         e.recognized_prior_years,
         e.employment_status,
         e.updated_at,
         ev.last_name,
         ev.first_name,
         ev.job_position,
         ev.contract_type,
         ev.remuneration_modality,
         ev.remuneration_unit,
         ev.payment_frequency,
         ev.obra_social_code,
         ev.obra_social_name,
         ev.is_union_member,
         ac.id AS category_id,
         ac.code AS category_code,
         ac.name AS category_name,
         ca.id AS agreement_id,
         ca.cct_number AS agreement_code,
         ca.name AS agreement_name,
         ab.id AS agreement_branch_id,
         ab.name AS agreement_branch_name,
         cb.id AS branch_id,
         cb.name AS branch_name
       FROM public.employees e
       JOIN public.employee_versions ev
         ON ev.tenant_id = e.tenant_id
        AND ev.company_id = e.company_id
        AND ev.employee_id = e.id
        AND ev.version = e.current_version
       JOIN public.agreement_categories ac ON ac.id = ev.category_id
       JOIN public.collective_agreements ca ON ca.id = ev.agreement_id
       JOIN public.agreement_branches ab ON ab.id = ev.agreement_branch_id
       JOIN public.company_branches cb ON cb.tenant_id = e.tenant_id AND cb.company_id = e.company_id AND cb.id = ev.branch_id
       WHERE e.company_id = $1
       ORDER BY
         CASE WHEN e.legajo ~ '^[0-9]+$' THEN e.legajo::int ELSE 999999 END ASC,
         ev.last_name ASC`, [companyId]);
        return res.rows.map((r) => ({
            id: r.id,
            companyId: r.company_id,
            legajo: r.legajo,
            lastName: r.last_name,
            firstName: r.first_name,
            cuil: r.cuil,
            dni: r.dni,
            hireDate: r.hire_date,
            terminationDate: r.termination_date,
            recognizedPriorYears: r.recognized_prior_years,
            jobPosition: r.job_position,
            categoryId: r.category_id,
            categoryCode: r.category_code,
            categoryName: r.category_name,
            agreementId: r.agreement_id,
            agreementCode: r.agreement_code,
            agreementName: r.agreement_name,
            agreementBranchId: r.agreement_branch_id,
            agreementBranchName: r.agreement_branch_name,
            branchId: r.branch_id,
            branchName: r.branch_name,
            contractType: r.contract_type,
            remunerationModality: r.remuneration_modality,
            remunerationUnit: r.remuneration_unit,
            paymentFrequency: r.payment_frequency,
            employmentStatus: r.employment_status,
            obraSocialCode: r.obra_social_code,
            obraSocialName: r.obra_social_name,
            isUnionMember: r.is_union_member,
            updatedAt: new Date(r.updated_at).toISOString(),
        }));
    }
    /**
     * Obtiene el catálogo de categorías disponibles para la grilla desplegable (edición tipo Excel).
     */
    async listAvailableCategories(client) {
        const res = await client.query(`
      SELECT
        ac.id,
        ac.code,
        ac.name,
        ac.remuneration_modality,
        ac.remuneration_unit,
        ac.default_payment_frequency,
        ca.id AS agreement_id,
        ca.cct_number,
        ca.name AS agreement_name,
        ab.id AS branch_id,
        ab.name AS branch_name,
        (SELECT ssi.hourly_rate::text FROM public.salary_scale_items ssi
           JOIN public.salary_scales ss ON ss.id = ssi.salary_scale_id
          WHERE ssi.category_id = ac.id AND ss.status = 'VALIDATED'
          ORDER BY ss.valid_from DESC LIMIT 1) AS hourly_rate,
        (SELECT ssi.monthly_basic::text FROM public.salary_scale_items ssi
           JOIN public.salary_scales ss ON ss.id = ssi.salary_scale_id
          WHERE ssi.category_id = ac.id AND ss.status = 'VALIDATED'
          ORDER BY ss.valid_from DESC LIMIT 1) AS monthly_basic
      FROM public.agreement_categories ac
      JOIN public.collective_agreements ca ON ca.id = ac.agreement_id
      JOIN public.agreement_branches ab ON ab.id = ac.branch_id
      WHERE ac.is_active = true
      ORDER BY ca.cct_number ASC, ac.hierarchy_order ASC
    `);
        return res.rows;
    }
    /**
     * Crea un nuevo empleado en la empresa seleccionada verificando pertenencia al tenant,
     * unicidad de CUIL y legajo, y creando la versión 1 e historial laboral.
     */
    async createEmployee(client, ctx, companyId, body, ipAddress) {
        if (ctx.roleCode === 'VIEWER') {
            throw new AuthenticationError('El rol VIEWER no tiene permisos para crear empleados.', 403);
        }
        const cleanCuil = body.cuil.replace(/\D/g, '');
        if (!isValidArgentineCuitOrCuil(cleanCuil)) {
            throw new Error(`El CUIL ${body.cuil} es inválido (falló verificación Módulo 11).`);
        }
        // Verificar que la empresa pertenezca al tenant activo y obtener o crear su sucursal CENTRAL
        const compCheck = await client.query(`SELECT id FROM public.companies WHERE id = $1`, [companyId]);
        if (compCheck.rowCount === 0) {
            throw new Error('La empresa seleccionada no existe en el espacio de trabajo activo.');
        }
        let branchRes = await client.query(`SELECT id FROM public.company_branches WHERE company_id = $1 ORDER BY created_at ASC LIMIT 1`, [companyId]);
        if (branchRes.rowCount === 0) {
            branchRes = await client.query(`INSERT INTO public.company_branches (tenant_id, company_id, code, name, address, locality, province, postal_code)
         VALUES ($1, $2, 'CENTRAL', 'Sede Central', 'Av. Principal 100', 'Córdoba', 'Córdoba', '5000')
         RETURNING id`, [ctx.activeTenantId, companyId]);
        }
        const branchId = branchRes.rows[0].id;
        // Resolver la categoría y su convenio/rama
        const catRes = await client.query(`SELECT id, agreement_id, branch_id, remuneration_modality, remuneration_unit, default_payment_frequency
       FROM public.agreement_categories
       WHERE id = $1`, [body.categoryId]);
        if (catRes.rowCount === 0) {
            throw new Error('La categoría de convenio seleccionada no existe.');
        }
        const cat = catRes.rows[0];
        const empRes = await client.query(`INSERT INTO public.employees (
         tenant_id, company_id, cuil, dni, legajo, current_version,
         employment_status, hire_date, recognized_prior_years, created_by
       ) VALUES ($1, $2, $3, $4, $5, 1, 'ACTIVE', $6, $7, $8)
       RETURNING id`, [
            ctx.activeTenantId,
            companyId,
            cleanCuil,
            body.dni.replace(/\D/g, '') || cleanCuil.slice(2, 10),
            body.legajo.trim(),
            body.hireDate,
            body.recognizedPriorYears ?? 0,
            ctx.userId,
        ]);
        const employeeId = empRes.rows[0].id;
        await client.query(`INSERT INTO public.employee_versions (
         tenant_id, company_id, employee_id, branch_id, agreement_id, agreement_branch_id, category_id,
         version, valid_from, last_name, first_name, birth_date, registered_sex, marital_status,
         address, locality, province, postal_code, phone, email, contract_type, job_position,
         schedule_type, habitual_schedule, remuneration_modality, remuneration_unit, payment_frequency,
         workplace_location, obra_social_code, obra_social_name, is_union_member, bank_name, cbu,
         change_reason, updated_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         1, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18, $19, $20, $21,
         'COMPLETA', 'Lunes a Viernes 08:00 a 17:00', $22, $23, $24,
         'Planta Principal', $25, $26, $27, $28, $29,
         'Alta inicial de legajo', $30
       )`, [
            ctx.activeTenantId,
            companyId,
            employeeId,
            branchId,
            cat.agreement_id,
            cat.branch_id,
            cat.id,
            body.hireDate,
            body.lastName.trim().toUpperCase(),
            body.firstName.trim(),
            body.birthDate ?? '1990-01-01',
            body.registeredSex ?? 'M',
            body.maritalStatus ?? 'SOLTERO',
            body.address ?? 'Sin especificar',
            body.locality ?? 'Córdoba',
            body.province ?? 'Córdoba',
            body.postalCode ?? '5000',
            body.phone ?? null,
            body.email ?? null,
            body.contractType ?? 'TIEMPO_INDETERMINADO',
            body.jobPosition.trim(),
            body.remunerationModality ?? cat.remuneration_modality,
            body.remunerationUnit ?? cat.remuneration_unit,
            body.paymentFrequency ?? cat.default_payment_frequency,
            body.obraSocialCode ?? '112103',
            body.obraSocialName ?? 'OSUOMRA',
            body.isUnionMember ?? true,
            body.bankName ?? null,
            body.cbu ?? null,
            ctx.userId,
        ]);
        const newSnapshot = {
            legajo: body.legajo,
            cuil: cleanCuil,
            lastName: body.lastName.trim().toUpperCase(),
            firstName: body.firstName.trim(),
            jobPosition: body.jobPosition.trim(),
            categoryId: cat.id,
            hireDate: body.hireDate,
        };
        await client.query(`INSERT INTO public.employee_employment_history (
         tenant_id, company_id, employee_id, event_type, effective_date,
         previous_snapshot, new_snapshot, reason, recorded_by
       ) VALUES ($1, $2, $3, 'ALTA_EMPLEADO', $4, NULL, $5::jsonb, 'Alta inicial en el sistema', $6)`, [ctx.activeTenantId, companyId, employeeId, body.hireDate, JSON.stringify(newSnapshot), ctx.userId]);
        await client.query(`INSERT INTO public.audit_logs (tenant_id, user_id, action, module, target_table, target_id, outcome, new_values, ip_address)
       VALUES ($1, $2, 'EMPLOYEE_CREATED', 'EMPLOYEES', 'employees', $3, 'SUCCESS', $4::jsonb, $5)`, [ctx.activeTenantId, ctx.userId, employeeId, JSON.stringify(newSnapshot), ipAddress ?? '127.0.0.1']);
        const rows = await this.listCompanyEmployees(client, companyId);
        return rows.find((r) => r.id === employeeId);
    }
    /**
     * Actualiza un empleado desde una celda en línea (tipo Excel) o desde su Ficha Individual,
     * generando una nueva versión trazable en employee_versions y registrando el cambio en employee_employment_history.
     */
    async updateEmployee(client, ctx, companyId, employeeId, body, ipAddress) {
        if (ctx.roleCode === 'VIEWER') {
            throw new AuthenticationError('El rol VIEWER no tiene permisos para modificar legajos.', 403);
        }
        const curRes = await client.query(`SELECT
         e.id, e.legajo, e.cuil, e.dni, e.current_version, e.employment_status,
         e.hire_date::text AS hire_date, e.recognized_prior_years,
         ev.branch_id, ev.agreement_id, ev.agreement_branch_id, ev.category_id,
         ev.last_name, ev.first_name, ev.birth_date::text AS birth_date, ev.registered_sex,
         ev.marital_status, ev.address, ev.locality, ev.province, ev.postal_code,
         ev.phone, ev.email, ev.contract_type, ev.job_position, ev.schedule_type,
         ev.habitual_schedule, ev.remuneration_modality, ev.remuneration_unit,
         ev.payment_frequency, ev.workplace_location, ev.obra_social_code,
         ev.obra_social_name, ev.is_union_member, ev.bank_name, ev.cbu
       FROM public.employees e
       JOIN public.employee_versions ev
         ON ev.tenant_id = e.tenant_id AND ev.company_id = e.company_id
        AND ev.employee_id = e.id AND ev.version = e.current_version
       WHERE e.company_id = $1 AND e.id = $2`, [companyId, employeeId]);
        if (curRes.rowCount === 0) {
            throw new Error('Empleado no encontrado en la empresa seleccionada.');
        }
        const cur = curRes.rows[0];
        const nextVersion = cur.current_version + 1;
        let agreementId = cur.agreement_id;
        let agreementBranchId = cur.agreement_branch_id;
        let categoryId = cur.category_id;
        let remModality = body.remunerationModality ?? cur.remuneration_modality;
        let remUnit = body.remunerationUnit ?? cur.remuneration_unit;
        let payFreq = body.paymentFrequency ?? cur.payment_frequency;
        if (body.categoryId && body.categoryId !== cur.category_id) {
            const catRes = await client.query(`SELECT id, agreement_id, branch_id, remuneration_modality, remuneration_unit, default_payment_frequency
         FROM public.agreement_categories WHERE id = $1`, [body.categoryId]);
            if (catRes.rowCount === 0) {
                throw new Error('La categoría de convenio seleccionada no existe.');
            }
            const cat = catRes.rows[0];
            categoryId = cat.id;
            agreementId = cat.agreement_id;
            agreementBranchId = cat.branch_id;
            if (!body.remunerationModality)
                remModality = cat.remuneration_modality;
            if (!body.remunerationUnit)
                remUnit = cat.remuneration_unit;
            if (!body.paymentFrequency)
                payFreq = cat.default_payment_frequency;
        }
        const nextLegajo = body.legajo !== undefined ? body.legajo.trim() : cur.legajo;
        const nextDni = body.dni !== undefined ? body.dni.trim() : cur.dni;
        const nextHireDate = body.hireDate ?? cur.hire_date;
        const nextPriorYears = body.recognizedPriorYears !== undefined ? body.recognizedPriorYears : cur.recognized_prior_years;
        const nextStatus = body.employmentStatus ?? cur.employment_status;
        const nextLastName = body.lastName !== undefined ? body.lastName.trim().toUpperCase() : cur.last_name;
        const nextFirstName = body.firstName !== undefined ? body.firstName.trim() : cur.first_name;
        const nextJobPosition = body.jobPosition !== undefined ? body.jobPosition.trim() : cur.job_position;
        const nextContractType = body.contractType ?? cur.contract_type;
        await client.query(`UPDATE public.employee_versions
          SET valid_to = CURRENT_DATE
        WHERE company_id = $1 AND employee_id = $2 AND version = $3`, [companyId, employeeId, cur.current_version]);
        await client.query(`INSERT INTO public.employee_versions (
         tenant_id, company_id, employee_id, branch_id, agreement_id, agreement_branch_id, category_id,
         version, valid_from, last_name, first_name, birth_date, registered_sex, marital_status,
         address, locality, province, postal_code, phone, email, contract_type, job_position,
         schedule_type, habitual_schedule, remuneration_modality, remuneration_unit, payment_frequency,
         workplace_location, obra_social_code, obra_social_name, is_union_member, bank_name, cbu,
         change_reason, updated_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, CURRENT_DATE, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18, $19, $20, $21,
         $22, $23, $24, $25, $26,
         $27, $28, $29, $30, $31, $32,
         $33, $34
       )`, [
            ctx.activeTenantId,
            companyId,
            employeeId,
            cur.branch_id,
            agreementId,
            agreementBranchId,
            categoryId,
            nextVersion,
            nextLastName,
            nextFirstName,
            body.birthDate ?? cur.birth_date,
            body.registeredSex ?? cur.registered_sex,
            body.maritalStatus ?? cur.marital_status,
            body.address ?? cur.address,
            body.locality ?? cur.locality,
            body.province ?? cur.province,
            body.postalCode ?? cur.postal_code,
            body.phone !== undefined ? body.phone : cur.phone,
            body.email !== undefined ? body.email : cur.email,
            nextContractType,
            nextJobPosition,
            cur.schedule_type,
            cur.habitual_schedule,
            remModality,
            remUnit,
            payFreq,
            cur.workplace_location,
            body.obraSocialCode ?? cur.obra_social_code,
            body.obraSocialName ?? cur.obra_social_name,
            body.isUnionMember !== undefined ? body.isUnionMember : cur.is_union_member,
            body.bankName !== undefined ? body.bankName : cur.bank_name,
            body.cbu !== undefined ? body.cbu : cur.cbu,
            body.changeReason ?? 'Edición en línea / ficha de legajo',
            ctx.userId,
        ]);
        await client.query(`UPDATE public.employees
          SET legajo = $1,
              dni = $2,
              hire_date = $3,
              recognized_prior_years = $4,
              employment_status = $5,
              current_version = $6,
              updated_at = now()
        WHERE company_id = $7 AND id = $8`, [
            nextLegajo,
            nextDni,
            nextHireDate,
            nextPriorYears,
            nextStatus,
            nextVersion,
            companyId,
            employeeId,
        ]);
        const prevSnapshot = {
            version: cur.current_version,
            legajo: cur.legajo,
            lastName: cur.last_name,
            firstName: cur.first_name,
            jobPosition: cur.job_position,
            categoryId: cur.category_id,
            contractType: cur.contract_type,
            employmentStatus: cur.employment_status,
            hireDate: cur.hire_date,
        };
        const newSnapshot = {
            version: nextVersion,
            legajo: nextLegajo,
            lastName: nextLastName,
            firstName: nextFirstName,
            jobPosition: nextJobPosition,
            categoryId,
            contractType: nextContractType,
            employmentStatus: nextStatus,
            hireDate: nextHireDate,
        };
        await client.query(`INSERT INTO public.employee_employment_history (
         tenant_id, company_id, employee_id, event_type, effective_date,
         previous_snapshot, new_snapshot, reason, recorded_by
       ) VALUES ($1, $2, $3, 'MODIFICACION_LEGAJO', CURRENT_DATE, $4::jsonb, $5::jsonb, $6, $7)`, [
            ctx.activeTenantId,
            companyId,
            employeeId,
            JSON.stringify(prevSnapshot),
            JSON.stringify(newSnapshot),
            body.changeReason ?? 'Edición en línea / ficha de legajo',
            ctx.userId,
        ]);
        await client.query(`INSERT INTO public.audit_logs (tenant_id, user_id, action, module, target_table, target_id, outcome, previous_values, new_values, ip_address)
       VALUES ($1, $2, 'EMPLOYEE_UPDATED', 'EMPLOYEES', 'employees', $3, 'SUCCESS', $4::jsonb, $5::jsonb, $6)`, [
            ctx.activeTenantId,
            ctx.userId,
            employeeId,
            JSON.stringify(prevSnapshot),
            JSON.stringify(newSnapshot),
            ipAddress ?? '127.0.0.1',
        ]);
        const rows = await this.listCompanyEmployees(client, companyId);
        return rows.find((r) => r.id === employeeId);
    }
    /**
     * Ejecuta acciones masivas seguras sobre múltiples empleados seleccionados en la grilla.
     */
    async bulkUpdateEmployees(client, ctx, companyId, body, ipAddress) {
        if (ctx.roleCode === 'VIEWER') {
            throw new AuthenticationError('El rol VIEWER no tiene permisos para acciones masivas.', 403);
        }
        const updated = [];
        for (const empId of body.employeeIds) {
            if (body.action === 'SET_STATUS' && body.employmentStatus) {
                const res = await this.updateEmployee(client, ctx, companyId, empId, { employmentStatus: body.employmentStatus, changeReason: body.reason }, ipAddress);
                updated.push(res);
            }
            else if (body.action === 'SET_CATEGORY' && body.categoryId) {
                const res = await this.updateEmployee(client, ctx, companyId, empId, { categoryId: body.categoryId, changeReason: body.reason }, ipAddress);
                updated.push(res);
            }
            else if (body.action === 'SET_CONTRACT_TYPE' && body.contractType) {
                const res = await this.updateEmployee(client, ctx, companyId, empId, { contractType: body.contractType, changeReason: body.reason }, ipAddress);
                updated.push(res);
            }
        }
        return updated;
    }
    /**
     * Obtiene la Ficha Individual Completa del Empleado con sus 10 secciones.
     */
    async getEmployeeFullProfile(client, companyId, employeeId) {
        const baseRes = await client.query(`SELECT
         e.id, e.company_id, e.cuil, e.dni, e.legajo, e.current_version,
         e.employment_status, e.hire_date::text AS hire_date, e.termination_date::text AS termination_date,
         e.recognized_prior_years, e.recognized_prior_months, e.recognized_prior_days,
         e.prior_services_notes, e.updated_at,
         ev.version, ev.valid_from::text AS valid_from, ev.last_name, ev.first_name,
         ev.birth_date::text AS birth_date, ev.registered_sex, ev.nationality, ev.marital_status,
         ev.address, ev.locality, ev.province, ev.postal_code, ev.phone, ev.email,
         ev.contract_type, ev.hiring_modality_code, ev.job_position, ev.schedule_type,
         ev.habitual_schedule, ev.weekly_hours::text, ev.remuneration_modality, ev.remuneration_unit,
         ev.payment_frequency, ev.workplace_location, ev.obra_social_code, ev.obra_social_name,
         ev.union_name, ev.is_union_member, ev.applies_solidarity_quota, ev.bank_name, ev.cbu,
         ev.has_scvo, ev.has_cct_insurance,
         ev.category_id, ac.code AS category_code, ac.name AS category_name,
         ev.agreement_id, ca.cct_number AS agreement_code, ca.name AS agreement_name,
         ev.agreement_branch_id, ab.name AS agreement_branch_name,
         ev.branch_id, cb.name AS branch_name
       FROM public.employees e
       JOIN public.employee_versions ev
         ON ev.tenant_id = e.tenant_id AND ev.company_id = e.company_id
        AND ev.employee_id = e.id AND ev.version = e.current_version
       JOIN public.agreement_categories ac ON ac.id = ev.category_id
       JOIN public.collective_agreements ca ON ca.id = ev.agreement_id
       JOIN public.agreement_branches ab ON ab.id = ev.agreement_branch_id
       JOIN public.company_branches cb ON cb.tenant_id = e.tenant_id AND cb.company_id = e.company_id AND cb.id = ev.branch_id
       WHERE e.company_id = $1 AND e.id = $2`, [companyId, employeeId]);
        if (baseRes.rowCount === 0) {
            return null;
        }
        const profile = baseRes.rows[0];
        const historyRes = await client.query(`SELECT h.id, h.event_type, h.effective_date::text, h.previous_snapshot, h.new_snapshot,
              h.reason, h.created_at, u.full_name AS recorded_by_name
       FROM public.employee_employment_history h
       LEFT JOIN public.users u ON u.id = h.recorded_by
       WHERE h.company_id = $1 AND h.employee_id = $2
       ORDER BY h.created_at DESC`, [companyId, employeeId]);
        const versionsRes = await client.query(`SELECT ev.version, ev.valid_from::text, ev.valid_to::text, ev.job_position,
              ev.remuneration_modality, ev.payment_frequency, ev.change_reason, ev.created_at,
              ac.name AS category_name
       FROM public.employee_versions ev
       JOIN public.agreement_categories ac ON ac.id = ev.category_id
       WHERE ev.company_id = $1 AND ev.employee_id = $2
       ORDER BY ev.version DESC`, [companyId, employeeId]);
        const scaleItemRes = await client.query(`SELECT ss.agreement_number, ss.period_code, ss.valid_from::text, ss.valid_to::text,
              ssi.hourly_rate::text, ssi.daily_rate::text, ssi.monthly_basic::text
       FROM public.salary_scale_items ssi
       JOIN public.salary_scales ss ON ss.id = ssi.salary_scale_id
       WHERE ssi.category_id = $1 AND ss.status = 'VALIDATED'
       ORDER BY ss.valid_from DESC LIMIT 3`, [profile.category_id]);
        const customParamsRes = await client.query(`SELECT id, parameter_code, numeric_value::text, text_value, valid_from::text, valid_to::text, reason
       FROM public.employee_custom_parameters
       WHERE company_id = $1 AND employee_id = $2
       ORDER BY valid_from DESC`, [companyId, employeeId]);
        const familyRes = await client.query(`SELECT id, relationship, last_name, first_name, dni, cuil, birth_date::text,
              is_dependent_charge, applies_obra_social_adherent, valid_from::text
       FROM public.employee_family_members
       WHERE company_id = $1 AND employee_id = $2
       ORDER BY created_at DESC`, [companyId, employeeId]);
        const leavesRes = await client.query(`SELECT id, situation_type, start_date::text, end_date::text, days_count, is_paid, status, observations
       FROM public.employee_leaves
       WHERE company_id = $1 AND employee_id = $2
       ORDER BY start_date DESC`, [companyId, employeeId]);
        const docsRes = await client.query(`SELECT id, document_type, title, original_filename, mime_type, size_bytes::text, sha256_hash, is_immutable, created_at
       FROM public.documents
       WHERE company_id = $1 AND employee_id = $2
       ORDER BY created_at DESC`, [companyId, employeeId]);
        const payslipsRes = await client.query(`SELECT ps.id, ps.receipt_code, ps.status, ps.current_version_number,
              p.liquidation_modality, pp.period_code,
              pv.worked_hours::text, pv.worked_days::text, pv.seniority_years,
              pv.reference_rate::text, pv.total_remunerative::text, pv.total_non_remunerative::text,
              pv.total_deductions::text, pv.net_pay::text, pv.is_immutable, ps.created_at
       FROM public.payslips ps
       JOIN public.payrolls p ON p.tenant_id = ps.tenant_id AND p.company_id = ps.company_id AND p.id = ps.payroll_id
       JOIN public.payroll_periods pp ON pp.tenant_id = p.tenant_id AND pp.company_id = p.company_id AND pp.id = p.period_id
       LEFT JOIN public.payslip_versions pv ON pv.tenant_id = ps.tenant_id AND pv.payslip_id = ps.id AND pv.version_number = ps.current_version_number
       WHERE ps.company_id = $1 AND ps.employee_id = $2
       ORDER BY pp.year DESC, pp.month DESC, ps.created_at DESC`, [companyId, employeeId]);
        return {
            profile,
            modificationHistory: historyRes.rows,
            versions: versionsRes.rows,
            salaryScales: scaleItemRes.rows,
            customParameters: customParamsRes.rows,
            familyMembers: familyRes.rows,
            leaves: leavesRes.rows,
            documents: docsRes.rows,
            payslips: payslipsRes.rows,
        };
    }
    async addFamilyMember(client, ctx, companyId, employeeId, body) {
        if (ctx.roleCode === 'VIEWER') {
            throw new AuthenticationError('El rol VIEWER no tiene permisos para agregar familiares.', 403);
        }
        const res = await client.query(`INSERT INTO public.employee_family_members (
         tenant_id, company_id, employee_id, relationship, last_name, first_name,
         dni, cuil, birth_date, is_dependent_charge, applies_obra_social_adherent, valid_from
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_DATE)
       RETURNING id, relationship, last_name, first_name, dni, cuil, birth_date::text, is_dependent_charge, applies_obra_social_adherent`, [
            ctx.activeTenantId,
            companyId,
            employeeId,
            body.relationship,
            body.lastName.trim().toUpperCase(),
            body.firstName.trim(),
            body.dni.trim(),
            body.cuil ? body.cuil.replace(/\D/g, '') : null,
            body.birthDate,
            body.isDependentCharge ?? true,
            body.appliesObraSocialAdherent ?? false,
        ]);
        return res.rows[0];
    }
    async addEmployeeLeave(client, ctx, companyId, employeeId, body) {
        if (ctx.roleCode === 'VIEWER') {
            throw new AuthenticationError('El rol VIEWER no tiene permisos para registrar licencias.', 403);
        }
        const res = await client.query(`INSERT INTO public.employee_leaves (
         tenant_id, company_id, employee_id, situation_type, start_date, end_date,
         days_count, is_paid, status, observations, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'APPROVED', $9, $10)
       RETURNING id, situation_type, start_date::text, end_date::text, days_count, is_paid, status, observations`, [
            ctx.activeTenantId,
            companyId,
            employeeId,
            body.situationType,
            body.startDate,
            body.endDate,
            body.daysCount,
            body.isPaid ?? true,
            body.observations ?? null,
            ctx.userId,
        ]);
        return res.rows[0];
    }
    async addVacation(client, ctx, companyId, employeeId, body) {
        if (ctx.roleCode === 'VIEWER') {
            throw new AuthenticationError('El rol VIEWER no tiene permisos para registrar vacaciones.', 403);
        }
        const start = parseDateOnly(body.startDate);
        const end = parseDateOnly(body.endDate);
        if (end < start) {
            throw new Error('La fecha de regreso no puede ser anterior a la fecha de salida.');
        }
        const daysCount = differenceInCalendarDays(start, end) + 1;
        const year = start.getUTCFullYear();
        const legalEntitlementDays = await getEmployeeVacationEntitlement(client, companyId, employeeId, year);
        if (!isVacationSeason(start)) {
            throw new Error('La licencia anual ordinaria debe otorgarse entre el 1 de octubre y el 30 de abril, salvo una excepción legal o convencional documentada.');
        }
        if (start.getUTCDay() !== 1) {
            throw new Error('La licencia debe comenzar un lunes o el día hábil siguiente si el lunes fuera feriado.');
        }
        if (daysCount > legalEntitlementDays) {
            throw new Error(`El período supera los ${legalEntitlementDays} días corridos correspondientes por antigüedad para el año ${year}.`);
        }
        const vacationPeriods = await client.query(`SELECT COUNT(*)::int AS count
         FROM public.employee_leaves
        WHERE company_id = $1
          AND employee_id = $2
          AND situation_type = 'VACACIONES'
          AND EXTRACT(YEAR FROM start_date) = $3`, [companyId, employeeId, year]);
        if (Number(vacationPeriods.rows[0].count) >= 2) {
            throw new Error(`El empleado ya tiene dos períodos de vacaciones registrados para el año ${year}.`);
        }
        const overlap = await client.query(`SELECT 1 FROM public.employee_leaves
       WHERE company_id = $1 AND employee_id = $2 AND situation_type = 'VACACIONES'
         AND start_date <= $4 AND end_date >= $3 LIMIT 1`, [companyId, employeeId, body.startDate, body.endDate]);
        if (overlap.rowCount) {
            throw new Error('El período se superpone con vacaciones ya registradas para el empleado.');
        }
        const res = await client.query(`INSERT INTO public.employee_leaves (
         tenant_id, company_id, employee_id, situation_type, start_date, end_date,
         days_count, is_paid, status, observations, created_by
       ) VALUES ($1, $2, $3, 'VACACIONES', $4, $5, $6, true, 'APPROVED', $7, $8)
       RETURNING id, company_id, employee_id, situation_type, start_date::text,
                 end_date::text, days_count, is_paid, status, observations`, [ctx.activeTenantId, companyId, employeeId, body.startDate, body.endDate, daysCount, body.observations ?? null, ctx.userId]);
        return { ...res.rows[0], legal_entitlement_days: legalEntitlementDays };
    }
}
export const employeeService = new EmployeeService();
function parseDateOnly(value) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw new Error('Fecha inválida.');
    }
    return date;
}
function differenceInCalendarDays(start, end) {
    return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}
function isVacationSeason(date) {
    const month = date.getUTCMonth() + 1;
    return month >= 10 || month <= 4;
}
function calculateVacationEntitlement(hireDate, recognizedPriorYears, year) {
    const hire = parseDateOnly(String(hireDate).slice(0, 10));
    const reference = parseDateOnly(`${year}-12-31`);
    let seniority = reference.getUTCFullYear() - hire.getUTCFullYear() + recognizedPriorYears;
    const anniversary = new Date(Date.UTC(year, hire.getUTCMonth(), hire.getUTCDate()));
    if (anniversary > reference)
        seniority -= 1;
    if (seniority < 5)
        return 14;
    if (seniority < 10)
        return 21;
    if (seniority < 20)
        return 28;
    return 35;
}
async function getEmployeeVacationEntitlement(client, companyId, employeeId, year) {
    const res = await client.query(`SELECT hire_date::text, recognized_prior_years
     FROM public.employees WHERE company_id = $1 AND id = $2`, [companyId, employeeId]);
    if (!res.rowCount)
        throw new Error('Empleado no encontrado en la empresa seleccionada.');
    return calculateVacationEntitlement(res.rows[0].hire_date, Number(res.rows[0].recognized_prior_years ?? 0), year);
}
