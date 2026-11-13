-- Las vacaciones se almacenan como licencias tipificadas para conservar el legajo
-- y permitir que los convenios colectivos agreguen condiciones más favorables.
CREATE INDEX IF NOT EXISTS idx_el_tenant_vacations_dates
    ON public.employee_leaves (tenant_id, company_id, start_date, end_date)
    WHERE situation_type = 'VACACIONES';
