-- Limpieza inicial de datos operativos de clientes. Se conservan usuarios,
-- espacios de trabajo y catálogos globales (tenant_id IS NULL).
DELETE FROM public.arca_concept_mappings
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.payroll_novelty_types
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.payroll_rules
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.payroll_concepts
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.salary_scale_items
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.salary_scales
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.agreement_categories
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.agreement_branches
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.holiday_calendars
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.system_parameters
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.collective_agreements
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.import_staging_rows
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.payroll_items
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.payroll_deductions
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.employer_contributions
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.payslip_versions
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.payslips
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.payroll_novelties
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.payrolls
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.payroll_periods
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.arca_exports
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.employee_custom_parameters
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.employee_leaves
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.employee_employment_history
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.employee_family_members
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.employee_versions
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.employees
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.documents
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.import_staging_batches
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.company_agreements
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.company_branches
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.company_versions
 WHERE tenant_id IN (SELECT id FROM public.tenants);
DELETE FROM public.companies
 WHERE tenant_id IN (SELECT id FROM public.tenants);

ALTER TABLE public.audit_logs DISABLE TRIGGER trg_immutable_audit_logs;
DELETE FROM public.audit_logs
 WHERE tenant_id IN (SELECT id FROM public.tenants);
ALTER TABLE public.audit_logs ENABLE TRIGGER trg_immutable_audit_logs;
