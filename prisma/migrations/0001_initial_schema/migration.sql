-- =============================================================================
-- SUBFASE 2A: ESQUEMA COMPLETO DE LAS 41 TABLAS FÍSICAS DE POSTGRESQL
-- (7 Autenticación + 10 Catálogos Híbridos + 13 Datos Maestros/Staging + 11 Liquidaciones/ARCA/Auditoría)
-- Incluye Claves Foráneas Compuestas Intra-Tenant y ON DELETE RESTRICT
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- GRUPO 1: AUTENTICACIÓN, USUARIOS, ROLES, PERMISOS Y MEMBRESÍAS (Tablas #01 a #07)
-- =============================================================================

-- #01 tenants
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(80) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_tenants_slug UNIQUE (slug),
    CONSTRAINT chk_tenants_status CHECK (status IN ('ACTIVE', 'SUSPENDED'))
);

-- #02 users
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    password_hash TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ NULL,
    last_login_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'LOCKED'))
);
CREATE INDEX idx_users_email ON public.users (email);

-- #03 roles
CREATE TABLE public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(40) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_roles_code UNIQUE (code),
    CONSTRAINT chk_roles_code CHECK (code IN ('OWNER', 'ADMIN', 'LIQUIDATOR', 'VIEWER'))
);

-- #04 permissions
CREATE TABLE public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(80) NOT NULL,
    module VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_permissions_code UNIQUE (code)
);
CREATE INDEX idx_permissions_module ON public.permissions (module);

-- #05 role_permissions (Tabla Puente Explícita Role <-> Permission)
CREATE TABLE public.role_permissions (
    role_id UUID NOT NULL,
    permission_id UUID NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_role_permissions PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES public.roles (id) ON DELETE RESTRICT,
    CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES public.permissions (id) ON DELETE RESTRICT
);
CREATE INDEX idx_role_permissions_permission ON public.role_permissions (permission_id);

-- #06 tenant_memberships
CREATE TABLE public.tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,
    invited_by UUID NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_tenant_memberships_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_tenant_memberships_user_tenant_id UNIQUE (user_id, tenant_id, id),
    CONSTRAINT uq_tenant_memberships_tenant_user UNIQUE (tenant_id, user_id),
    CONSTRAINT chk_tenant_memberships_status CHECK (status IN ('ACTIVE', 'REVOKED', 'SUSPENDED')),
    CONSTRAINT fk_tm_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
    CONSTRAINT fk_tm_user FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_tm_role FOREIGN KEY (role_id) REFERENCES public.roles (id) ON DELETE RESTRICT,
    CONSTRAINT fk_tm_invited_by FOREIGN KEY (invited_by) REFERENCES public.users (id) ON DELETE SET NULL
);
CREATE INDEX idx_tm_user_status ON public.tenant_memberships (user_id, status);
CREATE INDEX idx_tm_tenant ON public.tenant_memberships (tenant_id);

-- #07 sessions
CREATE TABLE public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    active_tenant_id UUID NULL,
    membership_id UUID NULL,
    token_hash CHAR(64) NOT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ NULL,
    revoked_reason VARCHAR(100) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_sessions_token_hash UNIQUE (token_hash),
    CONSTRAINT chk_sessions_tenant_membership_pair CHECK (
        (active_tenant_id IS NULL AND membership_id IS NULL)
        OR (active_tenant_id IS NOT NULL AND membership_id IS NOT NULL)
    ),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_sessions_membership_same_user_tenant FOREIGN KEY (user_id, active_tenant_id, membership_id)
        REFERENCES public.tenant_memberships (user_id, tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_sessions_user_active ON public.sessions (user_id, revoked_at, expires_at);
CREATE INDEX idx_sessions_active_tenant ON public.sessions (active_tenant_id);

-- =============================================================================
-- GRUPO 2: CATÁLOGOS HÍBRIDOS (Tablas #08 a #17)
-- tenant_id IS NULL => Catálogo Global Compartido; tenant_id IS NOT NULL => Privado del Tenant
-- =============================================================================

-- #08 collective_agreements
CREATE TABLE public.collective_agreements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NULL,
    cct_number VARCHAR(30) NOT NULL,
    name VARCHAR(200) NOT NULL,
    union_name VARCHAR(150) NOT NULL,
    activity VARCHAR(200) NOT NULL,
    territorial_scope VARCHAR(150) NOT NULL,
    default_remuneration_modality VARCHAR(20) NOT NULL,
    default_payment_frequency VARCHAR(20) NOT NULL,
    standard_monthly_hours NUMERIC(8,2) NOT NULL DEFAULT 200.00,
    standard_quincenal_hours NUMERIC(8,2) NULL DEFAULT 96.00,
    seniority_computation_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
    overtime_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
    holiday_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
    vacation_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_collective_agreements_tenant_cct UNIQUE NULLS NOT DISTINCT (tenant_id, cct_number),
    CONSTRAINT chk_ca_rem_modality CHECK (default_remuneration_modality IN ('JORNALIZADO', 'MENSUALIZADO', 'MIXTO')),
    CONSTRAINT chk_ca_pay_freq CHECK (default_payment_frequency IN ('SEMANAL', 'QUINCENAL', 'MENSUAL')),
    CONSTRAINT fk_ca_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT
);
CREATE INDEX idx_ca_tenant_active ON public.collective_agreements (tenant_id, is_active);

-- #09 agreement_branches
CREATE TABLE public.agreement_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NULL,
    agreement_id UUID NOT NULL,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(200) NOT NULL,
    reference_monthly_hours NUMERIC(8,2) NOT NULL DEFAULT 192.00,
    reference_quincenal_hours NUMERIC(8,2) NULL DEFAULT 96.00,
    specific_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_agreement_branches_agreement_id UNIQUE (agreement_id, id),
    CONSTRAINT uq_agreement_branches_code UNIQUE (agreement_id, code),
    CONSTRAINT fk_ab_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
    CONSTRAINT fk_ab_agreement FOREIGN KEY (agreement_id) REFERENCES public.collective_agreements (id) ON DELETE RESTRICT
);
CREATE INDEX idx_ab_agreement ON public.agreement_branches (agreement_id);

-- #10 agreement_categories
CREATE TABLE public.agreement_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NULL,
    agreement_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(150) NOT NULL,
    remuneration_modality VARCHAR(20) NOT NULL,
    remuneration_unit VARCHAR(20) NOT NULL,
    default_payment_frequency VARCHAR(20) NOT NULL,
    hierarchy_order INT NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ac_agreement_branch_id UNIQUE (agreement_id, branch_id, id),
    CONSTRAINT uq_ac_branch_code UNIQUE (branch_id, code),
    CONSTRAINT chk_ac_rem_modality CHECK (remuneration_modality IN ('JORNALIZADO', 'MENSUALIZADO')),
    CONSTRAINT chk_ac_rem_unit CHECK (remuneration_unit IN ('HORA', 'DIA', 'MES')),
    CONSTRAINT chk_ac_pay_freq CHECK (default_payment_frequency IN ('SEMANAL', 'QUINCENAL', 'MENSUAL')),
    CONSTRAINT fk_ac_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
    CONSTRAINT fk_ac_branch FOREIGN KEY (agreement_id, branch_id) REFERENCES public.agreement_branches (agreement_id, id) ON DELETE RESTRICT
);

-- #11 salary_scales
CREATE TABLE public.salary_scales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NULL,
    agreement_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    superseded_by_id UUID NULL,
    version INT NOT NULL DEFAULT 1,
    agreement_number VARCHAR(120) NOT NULL,
    homologation_disposition VARCHAR(150) NULL,
    period_code CHAR(7) NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE NOT NULL,
    status VARCHAR(25) NOT NULL DEFAULT 'PENDING_VALIDATION',
    source_document_ref TEXT NULL,
    validated_by UUID NULL,
    validated_at TIMESTAMPTZ NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ss_agreement_branch_id UNIQUE (agreement_id, branch_id, id),
    CONSTRAINT uq_ss_tenant_branch_period_ver UNIQUE NULLS NOT DISTINCT (tenant_id, branch_id, period_code, version),
    CONSTRAINT chk_ss_dates CHECK (valid_to >= valid_from),
    CONSTRAINT chk_ss_status CHECK (status IN ('PENDING_VALIDATION', 'VALIDATED', 'SUPERSEDED')),
    CONSTRAINT fk_ss_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
    CONSTRAINT fk_ss_branch FOREIGN KEY (agreement_id, branch_id) REFERENCES public.agreement_branches (agreement_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_ss_superseded_by FOREIGN KEY (superseded_by_id) REFERENCES public.salary_scales (id) ON DELETE RESTRICT,
    CONSTRAINT fk_ss_validated_by FOREIGN KEY (validated_by) REFERENCES public.users (id) ON DELETE RESTRICT
);
CREATE INDEX idx_ss_branch_validity ON public.salary_scales (branch_id, valid_from, valid_to, status);

-- #12 salary_scale_items
CREATE TABLE public.salary_scale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NULL,
    salary_scale_id UUID NOT NULL,
    agreement_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    category_id UUID NOT NULL,
    hourly_rate NUMERIC(18,6) NULL,
    daily_rate NUMERIC(18,6) NULL,
    monthly_basic NUMERIC(18,2) NULL,
    remunerative_additionals JSONB NOT NULL DEFAULT '[]'::jsonb,
    non_remunerative_concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
    fixed_amounts JSONB NOT NULL DEFAULT '{}'::jsonb,
    percentages JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT NULL,
    CONSTRAINT uq_ssi_scale_category UNIQUE (salary_scale_id, category_id),
    CONSTRAINT fk_ssi_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
    CONSTRAINT fk_ssi_scale_same_branch FOREIGN KEY (agreement_id, branch_id, salary_scale_id)
        REFERENCES public.salary_scales (agreement_id, branch_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_ssi_category_same_branch FOREIGN KEY (agreement_id, branch_id, category_id)
        REFERENCES public.agreement_categories (agreement_id, branch_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_ssi_scale ON public.salary_scale_items (salary_scale_id);

-- #13 payroll_concepts
CREATE TABLE public.payroll_concepts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NULL,
    agreement_id UUID NULL,
    code VARCHAR(30) NOT NULL,
    name VARCHAR(150) NOT NULL,
    nature VARCHAR(30) NOT NULL,
    default_unit VARCHAR(20) NOT NULL,
    accrual_scope VARCHAR(30) NOT NULL,
    print_order INT NOT NULL DEFAULT 100,
    tax_previsional_treatment JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_pc_tenant_agreement_code UNIQUE NULLS NOT DISTINCT (tenant_id, agreement_id, code),
    CONSTRAINT chk_pc_nature CHECK (nature IN ('REMUNERATIVE', 'NON_REMUNERATIVE', 'EMPLOYEE_DEDUCTION', 'EMPLOYER_CONTRIBUTION')),
    CONSTRAINT chk_pc_unit CHECK (default_unit IN ('HORA', 'DIA', 'MES', 'PORCENTAJE', 'UNIDAD', 'PESOS')),
    CONSTRAINT chk_pc_accrual CHECK (accrual_scope IN ('PER_PAY_PERIOD', 'MONTHLY_CLOSE_ONLY', 'SEMESTRAL', 'ANNUAL', 'EVENTUAL')),
    CONSTRAINT fk_pc_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
    CONSTRAINT fk_pc_agreement FOREIGN KEY (agreement_id) REFERENCES public.collective_agreements (id) ON DELETE RESTRICT
);
CREATE INDEX idx_pc_nature_order ON public.payroll_concepts (nature, print_order);

-- #14 payroll_rules
CREATE TABLE public.payroll_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NULL,
    concept_id UUID NOT NULL,
    agreement_id UUID NULL,
    branch_id UUID NULL,
    version INT NOT NULL DEFAULT 1,
    rule_code VARCHAR(60) NOT NULL,
    applicable_modalities TEXT[] NOT NULL,
    applicable_remuneration_types TEXT[] NOT NULL,
    applicable_payment_frequencies TEXT[] NOT NULL,
    quantity_formula TEXT NULL,
    base_formula TEXT NOT NULL,
    rate_formula TEXT NULL,
    amount_formula TEXT NOT NULL,
    conditions_expression TEXT NULL,
    exceptions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    cap_min_param_code VARCHAR(60) NULL,
    cap_max_param_code VARCHAR(60) NULL,
    normative_source VARCHAR(200) NOT NULL,
    normative_article VARCHAR(150) NOT NULL,
    territorial_or_activity_scope VARCHAR(150) NOT NULL,
    consulted_at DATE NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE NULL,
    validation_status VARCHAR(30) NOT NULL DEFAULT 'PENDING_VALIDATION',
    validated_by UUID NULL,
    validated_at TIMESTAMPTZ NULL,
    observations TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_pr_concept_id UNIQUE (concept_id, id),
    CONSTRAINT uq_pr_concept_version UNIQUE (concept_id, version),
    CONSTRAINT chk_pr_validation_status CHECK (validation_status IN ('PENDING_VALIDATION', 'VALIDATED', 'DEPRECATED')),
    CONSTRAINT fk_pr_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
    CONSTRAINT fk_pr_concept FOREIGN KEY (concept_id) REFERENCES public.payroll_concepts (id) ON DELETE RESTRICT,
    CONSTRAINT fk_pr_agreement FOREIGN KEY (agreement_id) REFERENCES public.collective_agreements (id) ON DELETE RESTRICT,
    CONSTRAINT fk_pr_branch FOREIGN KEY (branch_id) REFERENCES public.agreement_branches (id) ON DELETE RESTRICT,
    CONSTRAINT fk_pr_validated_by FOREIGN KEY (validated_by) REFERENCES public.users (id) ON DELETE RESTRICT
);
CREATE INDEX idx_pr_concept_validity ON public.payroll_rules (concept_id, valid_from, valid_to, validation_status);

-- #15 system_parameters
CREATE TABLE public.system_parameters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NULL,
    code VARCHAR(60) NOT NULL,
    name VARCHAR(150) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    numeric_value NUMERIC(18,6) NULL,
    json_value JSONB NULL,
    normative_source VARCHAR(200) NOT NULL,
    normative_resolution VARCHAR(150) NOT NULL,
    consulted_at DATE NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE NULL,
    validation_status VARCHAR(30) NOT NULL DEFAULT 'PENDING_VALIDATION',
    observations TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_sp_tenant_code_ver UNIQUE NULLS NOT DISTINCT (tenant_id, code, version),
    CONSTRAINT chk_sp_validation_status CHECK (validation_status IN ('PENDING_VALIDATION', 'VALIDATED', 'DEPRECATED')),
    CONSTRAINT fk_sp_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT
);
CREATE INDEX idx_sp_code_validity ON public.system_parameters (code, valid_from, valid_to);

-- #16 holiday_calendars
CREATE TABLE public.holiday_calendars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NULL,
    agreement_id UUID NULL,
    holiday_date DATE NOT NULL,
    name VARCHAR(150) NOT NULL,
    holiday_type VARCHAR(30) NOT NULL,
    province VARCHAR(80) NULL,
    locality VARCHAR(100) NULL,
    is_bank_business_day BOOLEAN NOT NULL DEFAULT false,
    normative_source VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_hc_tenant_date_name UNIQUE NULLS NOT DISTINCT (tenant_id, holiday_date, name),
    CONSTRAINT chk_hc_type CHECK (holiday_type IN ('NACIONAL_INAMOVIBLE', 'NACIONAL_TRASLADABLE', 'NO_LABORABLE', 'PROVINCIAL', 'LOCAL', 'DIA_GREMIO')),
    CONSTRAINT fk_hc_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
    CONSTRAINT fk_hc_agreement FOREIGN KEY (agreement_id) REFERENCES public.collective_agreements (id) ON DELETE RESTRICT
);
CREATE INDEX idx_hc_date ON public.holiday_calendars (holiday_date);

-- #17 payroll_novelty_types
CREATE TABLE public.payroll_novelty_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NULL,
    linked_concept_id UUID NULL,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(120) NOT NULL,
    group_category VARCHAR(30) NOT NULL,
    default_unit VARCHAR(20) NOT NULL,
    requires_justification BOOLEAN NOT NULL DEFAULT false,
    requires_document BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT uq_pnt_tenant_code UNIQUE NULLS NOT DISTINCT (tenant_id, code),
    CONSTRAINT chk_pnt_group CHECK (group_category IN ('ASISTENCIA', 'ECONOMICA_HABER', 'ECONOMICA_DESCUENTO')),
    CONSTRAINT fk_pnt_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
    CONSTRAINT fk_pnt_concept FOREIGN KEY (linked_concept_id) REFERENCES public.payroll_concepts (id) ON DELETE RESTRICT
);

-- =============================================================================
-- GRUPO 3: DATOS MAESTROS, LEGAJOS, DOCUMENTOS Y STAGING PRIVADOS (Tablas #18 a #30)
-- =============================================================================

-- #18 companies
CREATE TABLE public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    cuit CHAR(11) NOT NULL,
    current_version INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_companies_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_companies_tenant_cuit UNIQUE (tenant_id, cuit),
    CONSTRAINT fk_companies_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
    CONSTRAINT fk_companies_created_by FOREIGN KEY (created_by) REFERENCES public.users (id) ON DELETE RESTRICT
);
CREATE INDEX idx_companies_tenant_active ON public.companies (tenant_id, is_active);

-- #19 company_versions
CREATE TABLE public.company_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    company_id UUID NOT NULL,
    version INT NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE NULL,
    legal_name VARCHAR(200) NOT NULL,
    trade_name VARCHAR(200) NULL,
    person_type VARCHAR(20) NOT NULL,
    company_type VARCHAR(60) NOT NULL,
    holder_or_representatives VARCHAR(250) NULL,
    registration_date DATE NULL,
    activity_start_date DATE NOT NULL,
    main_activity VARCHAR(200) NOT NULL,
    secondary_activities TEXT NULL,
    arca_activity_code VARCHAR(20) NOT NULL,
    vat_condition VARCHAR(60) NOT NULL,
    fiscal_address VARCHAR(250) NOT NULL,
    legal_address VARCHAR(250) NOT NULL,
    commercial_address VARCHAR(250) NULL,
    province VARCHAR(80) NOT NULL,
    locality VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    phone VARCHAR(50) NULL,
    email VARCHAR(150) NOT NULL,
    registration_numbers JSONB NOT NULL DEFAULT '{}'::jsonb,
    bank_name VARCHAR(100) NULL,
    cbu CHAR(22) NULL,
    art_name VARCHAR(120) NOT NULL,
    art_aliquot_pct NUMERIC(10,6) NOT NULL DEFAULT 0,
    art_fixed_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    institutional_obra_social VARCHAR(150) NULL,
    payment_schedule_rule JSONB NOT NULL DEFAULT '{"businessDaysAfterClose": 4}'::jsonb,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_company_versions_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_company_versions_tenant_company_id UNIQUE (tenant_id, company_id, id),
    CONSTRAINT uq_company_versions_company_ver UNIQUE (company_id, version),
    CONSTRAINT chk_cv_person_type CHECK (person_type IN ('FISICA', 'JURIDICA')),
    CONSTRAINT fk_cv_company_same_tenant FOREIGN KEY (tenant_id, company_id)
        REFERENCES public.companies (tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_cv_created_by FOREIGN KEY (created_by) REFERENCES public.users (id) ON DELETE RESTRICT
);
CREATE INDEX idx_cv_tenant_company_validity ON public.company_versions (tenant_id, company_id, valid_from, valid_to);

-- #20 company_branches
CREATE TABLE public.company_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    company_id UUID NOT NULL,
    code VARCHAR(30) NOT NULL,
    name VARCHAR(150) NOT NULL,
    address VARCHAR(250) NOT NULL,
    locality VARCHAR(100) NOT NULL,
    province VARCHAR(80) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    identification_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cb_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_cb_tenant_company_id UNIQUE (tenant_id, company_id, id),
    CONSTRAINT uq_cb_tenant_company_code UNIQUE (tenant_id, company_id, code),
    CONSTRAINT fk_cb_company_same_tenant FOREIGN KEY (tenant_id, company_id)
        REFERENCES public.companies (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_cb_tenant_company ON public.company_branches (tenant_id, company_id);

-- #21 company_agreements
CREATE TABLE public.company_agreements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    company_id UUID NOT NULL,
    agreement_id UUID NOT NULL,
    branch_id UUID NULL,
    confirmed_by UUID NOT NULL,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    payment_frequency_override VARCHAR(20) NULL,
    custom_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT uq_comp_agr_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_comp_agr_unique UNIQUE NULLS NOT DISTINCT (tenant_id, company_id, agreement_id, branch_id),
    CONSTRAINT fk_comp_agr_company_same_tenant FOREIGN KEY (tenant_id, company_id)
        REFERENCES public.companies (tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_comp_agr_agreement FOREIGN KEY (agreement_id) REFERENCES public.collective_agreements (id) ON DELETE RESTRICT,
    CONSTRAINT fk_comp_agr_branch FOREIGN KEY (branch_id) REFERENCES public.agreement_branches (id) ON DELETE RESTRICT,
    CONSTRAINT fk_comp_agr_confirmed_by FOREIGN KEY (confirmed_by) REFERENCES public.users (id) ON DELETE RESTRICT
);
CREATE INDEX idx_comp_agr_tenant_company ON public.company_agreements (tenant_id, company_id);

-- #22 employees
CREATE TABLE public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    company_id UUID NOT NULL,
    cuil CHAR(11) NOT NULL,
    dni VARCHAR(12) NOT NULL,
    legajo VARCHAR(30) NOT NULL,
    current_version INT NOT NULL DEFAULT 1,
    employment_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    hire_date DATE NOT NULL,
    termination_date DATE NULL,
    recognized_prior_years INT NOT NULL DEFAULT 0,
    recognized_prior_months INT NOT NULL DEFAULT 0,
    recognized_prior_days INT NOT NULL DEFAULT 0,
    prior_services_notes TEXT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_employees_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_employees_tenant_company_id UNIQUE (tenant_id, company_id, id),
    CONSTRAINT uq_employees_tenant_company_cuil UNIQUE (tenant_id, company_id, cuil),
    CONSTRAINT uq_employees_tenant_company_legajo UNIQUE (tenant_id, company_id, legajo),
    CONSTRAINT chk_employees_status CHECK (employment_status IN ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED')),
    CONSTRAINT fk_employees_company_same_tenant FOREIGN KEY (tenant_id, company_id)
        REFERENCES public.companies (tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_employees_created_by FOREIGN KEY (created_by) REFERENCES public.users (id) ON DELETE RESTRICT
);
CREATE INDEX idx_employees_tenant_company_status ON public.employees (tenant_id, company_id, employment_status);

-- #23 employee_versions
CREATE TABLE public.employee_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    agreement_id UUID NOT NULL,
    agreement_branch_id UUID NOT NULL,
    category_id UUID NOT NULL,
    version INT NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE NULL,
    last_name VARCHAR(120) NOT NULL,
    first_name VARCHAR(120) NOT NULL,
    birth_date DATE NOT NULL,
    registered_sex CHAR(1) NOT NULL,
    nationality VARCHAR(80) NOT NULL DEFAULT 'Argentina',
    marital_status VARCHAR(40) NOT NULL,
    address VARCHAR(250) NOT NULL,
    locality VARCHAR(100) NOT NULL,
    province VARCHAR(80) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    phone VARCHAR(50) NULL,
    email VARCHAR(150) NULL,
    contract_type VARCHAR(60) NOT NULL,
    hiring_modality_code CHAR(3) NOT NULL DEFAULT '001',
    job_position VARCHAR(120) NOT NULL,
    schedule_type VARCHAR(40) NOT NULL,
    habitual_schedule VARCHAR(120) NOT NULL,
    weekly_hours NUMERIC(6,2) NOT NULL DEFAULT 48.00,
    remuneration_modality VARCHAR(20) NOT NULL,
    remuneration_unit VARCHAR(20) NOT NULL,
    payment_frequency VARCHAR(20) NOT NULL,
    custom_monthly_hours_divisor NUMERIC(8,2) NULL,
    workplace_location VARCHAR(150) NOT NULL,
    obra_social_code CHAR(6) NOT NULL,
    obra_social_name VARCHAR(150) NOT NULL,
    union_name VARCHAR(150) NULL,
    is_union_member BOOLEAN NOT NULL DEFAULT true,
    applies_solidarity_quota BOOLEAN NOT NULL DEFAULT false,
    art_override VARCHAR(120) NULL,
    bank_name VARCHAR(100) NULL,
    cbu CHAR(22) NULL,
    payment_method_code CHAR(1) NOT NULL DEFAULT '3',
    arca_condition_code CHAR(2) NOT NULL DEFAULT '01',
    arca_situation_code CHAR(2) NOT NULL DEFAULT '01',
    arca_activity_code CHAR(3) NOT NULL DEFAULT '049',
    arca_zone_code CHAR(2) NOT NULL DEFAULT '01',
    arca_siniestrado_code CHAR(2) NOT NULL DEFAULT '00',
    has_scvo BOOLEAN NOT NULL DEFAULT true,
    has_cct_insurance BOOLEAN NOT NULL DEFAULT true,
    change_reason VARCHAR(200) NOT NULL,
    updated_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ev_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_ev_tenant_emp_id UNIQUE (tenant_id, employee_id, id),
    CONSTRAINT uq_ev_emp_version UNIQUE (employee_id, version),
    CONSTRAINT chk_ev_sex CHECK (registered_sex IN ('M', 'F', 'X')),
    CONSTRAINT chk_ev_rem_mod CHECK (remuneration_modality IN ('JORNALIZADO', 'MENSUALIZADO')),
    CONSTRAINT chk_ev_rem_unit CHECK (remuneration_unit IN ('HORA', 'DIA', 'MES')),
    CONSTRAINT chk_ev_pay_freq CHECK (payment_frequency IN ('SEMANAL', 'QUINCENAL', 'MENSUAL')),
    CONSTRAINT fk_ev_employee_same_company FOREIGN KEY (tenant_id, company_id, employee_id)
        REFERENCES public.employees (tenant_id, company_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_ev_branch_same_company FOREIGN KEY (tenant_id, company_id, branch_id)
        REFERENCES public.company_branches (tenant_id, company_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_ev_category_hierarchy FOREIGN KEY (agreement_id, agreement_branch_id, category_id)
        REFERENCES public.agreement_categories (agreement_id, branch_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_ev_updated_by FOREIGN KEY (updated_by) REFERENCES public.users (id) ON DELETE RESTRICT
);
CREATE INDEX idx_ev_tenant_emp_validity ON public.employee_versions (tenant_id, employee_id, valid_from, valid_to);

-- #27 documents (Declarada antes de #24 y #26 para resolver referencias directas)
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    company_id UUID NULL,
    employee_id UUID NULL,
    document_type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    storage_key TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256_hash CHAR(64) NOT NULL,
    is_restricted_sensitive BOOLEAN NOT NULL DEFAULT false,
    is_immutable BOOLEAN NOT NULL DEFAULT false,
    uploaded_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_documents_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_documents_tenant_company_id UNIQUE (tenant_id, company_id, id),
    CONSTRAINT uq_documents_tenant_storage_key UNIQUE (tenant_id, storage_key),
    CONSTRAINT chk_documents_employee_requires_company CHECK (employee_id IS NULL OR company_id IS NOT NULL),
    CONSTRAINT fk_documents_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
    CONSTRAINT fk_documents_company_same_tenant FOREIGN KEY (tenant_id, company_id)
        REFERENCES public.companies (tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_documents_employee_same_company FOREIGN KEY (tenant_id, company_id, employee_id)
        REFERENCES public.employees (tenant_id, company_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_documents_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES public.users (id) ON DELETE RESTRICT
);
CREATE INDEX idx_documents_tenant_company ON public.documents (tenant_id, company_id);
CREATE INDEX idx_documents_tenant_employee ON public.documents (tenant_id, employee_id);

-- #24 employee_family_members
CREATE TABLE public.employee_family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    supporting_document_id UUID NULL,
    relationship VARCHAR(30) NOT NULL,
    last_name VARCHAR(120) NOT NULL,
    first_name VARCHAR(120) NOT NULL,
    dni VARCHAR(12) NOT NULL,
    cuil CHAR(11) NULL,
    birth_date DATE NOT NULL,
    is_dependent_charge BOOLEAN NOT NULL DEFAULT false,
    applies_obra_social_adherent BOOLEAN NOT NULL DEFAULT false,
    applies_arca_spouse_flag BOOLEAN NOT NULL DEFAULT false,
    applies_arca_child_count BOOLEAN NOT NULL DEFAULT false,
    has_disability_restricted BOOLEAN NOT NULL DEFAULT false,
    valid_from DATE NOT NULL,
    valid_to DATE NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_efm_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT chk_efm_rel CHECK (relationship IN ('CONYUGE', 'CONVIVIENTE', 'HIJO', 'OTRO')),
    CONSTRAINT fk_efm_employee_same_company FOREIGN KEY (tenant_id, company_id, employee_id)
        REFERENCES public.employees (tenant_id, company_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_efm_doc_same_company FOREIGN KEY (tenant_id, company_id, supporting_document_id)
        REFERENCES public.documents (tenant_id, company_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_efm_tenant_employee ON public.employee_family_members (tenant_id, employee_id);

-- #25 employee_employment_history
CREATE TABLE public.employee_employment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    effective_date DATE NOT NULL,
    previous_snapshot JSONB NULL,
    new_snapshot JSONB NOT NULL,
    reason TEXT NOT NULL,
    recorded_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_eeh_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_eeh_employee_same_company FOREIGN KEY (tenant_id, company_id, employee_id)
        REFERENCES public.employees (tenant_id, company_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_eeh_recorded_by FOREIGN KEY (recorded_by) REFERENCES public.users (id) ON DELETE RESTRICT
);
CREATE INDEX idx_eeh_tenant_emp_date ON public.employee_employment_history (tenant_id, employee_id, effective_date DESC);

-- #26 employee_leaves
CREATE TABLE public.employee_leaves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    supporting_document_id UUID NULL,
    situation_type VARCHAR(40) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days_count INT NOT NULL,
    is_paid BOOLEAN NOT NULL DEFAULT true,
    arca_situation_code CHAR(2) NOT NULL DEFAULT '01',
    status VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
    observations TEXT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_el_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT chk_el_dates CHECK (end_date >= start_date),
    CONSTRAINT fk_el_employee_same_company FOREIGN KEY (tenant_id, company_id, employee_id)
        REFERENCES public.employees (tenant_id, company_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_el_doc_same_company FOREIGN KEY (tenant_id, company_id, supporting_document_id)
        REFERENCES public.documents (tenant_id, company_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_el_created_by FOREIGN KEY (created_by) REFERENCES public.users (id) ON DELETE RESTRICT
);
CREATE INDEX idx_el_tenant_emp_dates ON public.employee_leaves (tenant_id, employee_id, start_date, end_date);

-- #28 import_staging_batches
CREATE TABLE public.import_staging_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    company_id UUID NULL,
    source_document_id UUID NULL,
    import_kind VARCHAR(40) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW',
    total_rows INT NOT NULL DEFAULT 0,
    blocking_errors_count INT NOT NULL DEFAULT 0,
    warnings_count INT NOT NULL DEFAULT 0,
    detected_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
    uploaded_by UUID NOT NULL,
    approved_by UUID NULL,
    approved_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_isb_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT chk_isb_status CHECK (status IN ('PENDING_REVIEW', 'READY_TO_APPROVE', 'APPROVED_COMMITTED', 'CANCELLED')),
    CONSTRAINT fk_isb_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
    CONSTRAINT fk_isb_company_same_tenant FOREIGN KEY (tenant_id, company_id)
        REFERENCES public.companies (tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_isb_doc_same_tenant FOREIGN KEY (tenant_id, source_document_id)
        REFERENCES public.documents (tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_isb_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES public.users (id) ON DELETE RESTRICT
);
CREATE INDEX idx_isb_tenant_status ON public.import_staging_batches (tenant_id, status, created_at DESC);

-- #29 import_staging_rows
CREATE TABLE public.import_staging_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    batch_id UUID NOT NULL,
    sheet_name VARCHAR(80) NOT NULL,
    row_index INT NOT NULL,
    target_entity VARCHAR(40) NOT NULL,
    raw_data JSONB NOT NULL,
    proposed_data JSONB NOT NULL,
    corrected_data JSONB NULL,
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
    row_status VARCHAR(25) NOT NULL DEFAULT 'NEEDS_REVIEW',
    CONSTRAINT uq_isr_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_isr_batch_sheet_row UNIQUE (batch_id, sheet_name, row_index),
    CONSTRAINT fk_isr_batch_same_tenant FOREIGN KEY (tenant_id, batch_id)
        REFERENCES public.import_staging_batches (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_isr_tenant_batch ON public.import_staging_rows (tenant_id, batch_id);

-- #30 employee_custom_parameters
CREATE TABLE public.employee_custom_parameters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    parameter_code VARCHAR(60) NOT NULL,
    numeric_value NUMERIC(18,6) NULL,
    text_value TEXT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE NULL,
    reason TEXT NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ecp_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_ecp_emp_param_from UNIQUE (tenant_id, employee_id, parameter_code, valid_from),
    CONSTRAINT fk_ecp_employee_same_company FOREIGN KEY (tenant_id, company_id, employee_id)
        REFERENCES public.employees (tenant_id, company_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_ecp_created_by FOREIGN KEY (created_by) REFERENCES public.users (id) ON DELETE RESTRICT
);

-- =============================================================================
-- GRUPO 4: PERÍODOS, NOVEDADES, LIQUIDACIONES, RECIBOS, ARCA Y AUDITORÍA (Tablas #31 a #41)
-- =============================================================================

-- #31 payroll_periods
CREATE TABLE public.payroll_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    company_id UUID NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    period_code CHAR(7) NOT NULL,
    liquidation_modality VARCHAR(30) NOT NULL,
    payment_frequency VARCHAR(20) NOT NULL,
    arca_sequence_number INT NOT NULL DEFAULT 1,
    accrual_start_date DATE NOT NULL,
    accrual_end_date DATE NOT NULL,
    closing_date DATE NOT NULL,
    legal_due_date DATE NOT NULL,
    scheduled_payment_date DATE NOT NULL,
    effective_payment_date DATE NULL,
    compliance_status VARCHAR(25) NOT NULL DEFAULT 'ON_TIME',
    period_status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_pp_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_pp_tenant_company_id UNIQUE (tenant_id, company_id, id),
    CONSTRAINT uq_pp_unique_period UNIQUE (tenant_id, company_id, year, month, liquidation_modality, arca_sequence_number),
    CONSTRAINT chk_pp_dates CHECK (accrual_end_date >= accrual_start_date),
    CONSTRAINT chk_pp_modality CHECK (liquidation_modality IN ('PRIMERA_QUINCENA', 'SEGUNDA_QUINCENA', 'MENSUAL', 'SEMANAL', 'COMPLEMENTARIA', 'AJUSTE_RETROACTIVO', 'SAC_1', 'SAC_2', 'VACACIONES', 'FINAL_EGRESO')),
    CONSTRAINT fk_pp_company_same_tenant FOREIGN KEY (tenant_id, company_id)
        REFERENCES public.companies (tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_pp_created_by FOREIGN KEY (created_by) REFERENCES public.users (id) ON DELETE RESTRICT
);
CREATE INDEX idx_pp_tenant_company_code ON public.payroll_periods (tenant_id, company_id, period_code);

-- #32 payroll_novelties
CREATE TABLE public.payroll_novelties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    company_id UUID NOT NULL,
    period_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    novelty_type_id UUID NOT NULL,
    attachment_document_id UUID NULL,
    quantity NUMERIC(12,4) NOT NULL DEFAULT 0,
    unit VARCHAR(20) NOT NULL,
    unit_or_fixed_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
    novelty_date DATE NULL,
    retroactive_accrual_period CHAR(7) NULL,
    observation TEXT NULL,
    justification TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED',
    created_by UUID NOT NULL,
    updated_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_pn_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_pn_period_same_company FOREIGN KEY (tenant_id, company_id, period_id)
        REFERENCES public.payroll_periods (tenant_id, company_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_pn_employee_same_company FOREIGN KEY (tenant_id, company_id, employee_id)
        REFERENCES public.employees (tenant_id, company_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_pn_doc_same_company FOREIGN KEY (tenant_id, company_id, attachment_document_id)
        REFERENCES public.documents (tenant_id, company_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_pn_novelty_type FOREIGN KEY (novelty_type_id) REFERENCES public.payroll_novelty_types (id) ON DELETE RESTRICT
);
CREATE INDEX idx_pn_tenant_period_emp ON public.payroll_novelties (tenant_id, period_id, employee_id);

-- #33 payrolls
CREATE TABLE public.payrolls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    company_id UUID NOT NULL,
    period_id UUID NOT NULL,
    rectifies_payroll_id UUID NULL,
    version INT NOT NULL DEFAULT 1,
    liquidation_modality VARCHAR(30) NOT NULL,
    status VARCHAR(25) NOT NULL DEFAULT 'DRAFT',
    employees_count INT NOT NULL DEFAULT 0,
    total_hours NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_remunerative NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_non_remunerative NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_deductions NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_net_pay NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_employer_contributions NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_employer_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
    engine_version VARCHAR(20) NOT NULL,
    global_context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_immutable BOOLEAN NOT NULL DEFAULT false,
    calculated_by UUID NOT NULL,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_by UUID NULL,
    approved_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_payrolls_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_payrolls_tenant_company_id UNIQUE (tenant_id, company_id, id),
    CONSTRAINT uq_payrolls_tenant_company_period_id UNIQUE (tenant_id, company_id, period_id, id),
    CONSTRAINT uq_payrolls_period_ver UNIQUE (tenant_id, period_id, version),
    CONSTRAINT chk_payrolls_status CHECK (status IN ('DRAFT', 'VALIDATED', 'APPROVED', 'RECTIFIED', 'ANNULLED')),
    CONSTRAINT fk_payrolls_period_same_company FOREIGN KEY (tenant_id, company_id, period_id)
        REFERENCES public.payroll_periods (tenant_id, company_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_payrolls_rectifies_same_company FOREIGN KEY (tenant_id, company_id, rectifies_payroll_id)
        REFERENCES public.payrolls (tenant_id, company_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_payrolls_calculated_by FOREIGN KEY (calculated_by) REFERENCES public.users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_payrolls_approved_by FOREIGN KEY (approved_by) REFERENCES public.users (id) ON DELETE RESTRICT
);
CREATE INDEX idx_payrolls_tenant_company_status ON public.payrolls (tenant_id, company_id, status);

-- #34 payslips
CREATE TABLE public.payslips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    company_id UUID NOT NULL,
    payroll_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    receipt_code VARCHAR(40) NOT NULL,
    current_version_number INT NOT NULL DEFAULT 1,
    status VARCHAR(25) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_payslips_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_payslips_tenant_company_emp_id UNIQUE (tenant_id, company_id, employee_id, id),
    CONSTRAINT uq_payslips_payroll_emp UNIQUE (tenant_id, payroll_id, employee_id),
    CONSTRAINT uq_payslips_company_code UNIQUE (tenant_id, company_id, receipt_code),
    CONSTRAINT chk_payslips_status CHECK (status IN ('DRAFT', 'APPROVED', 'ISSUED', 'RECTIFIED')),
    CONSTRAINT fk_payslips_payroll_same_company FOREIGN KEY (tenant_id, company_id, payroll_id)
        REFERENCES public.payrolls (tenant_id, company_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_payslips_employee_same_company FOREIGN KEY (tenant_id, company_id, employee_id)
        REFERENCES public.employees (tenant_id, company_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_payslips_tenant_employee ON public.payslips (tenant_id, employee_id);

-- #35 payslip_versions
CREATE TABLE public.payslip_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    payslip_id UUID NOT NULL,
    company_version_id UUID NOT NULL,
    employee_version_id UUID NOT NULL,
    salary_scale_id UUID NOT NULL,
    category_id UUID NOT NULL,
    pdf_document_id UUID NULL,
    rectifies_version_id UUID NULL,
    version_number INT NOT NULL DEFAULT 1,
    remuneration_modality VARCHAR(20) NOT NULL,
    remuneration_unit VARCHAR(20) NOT NULL,
    payment_frequency VARCHAR(20) NOT NULL,
    worked_days NUMERIC(8,2) NOT NULL DEFAULT 0,
    worked_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
    seniority_years INT NOT NULL DEFAULT 0,
    reference_rate NUMERIC(18,6) NOT NULL DEFAULT 0,
    exact_remunerative_sum NUMERIC(18,6) NOT NULL DEFAULT 0,
    total_remunerative NUMERIC(18,2) NOT NULL DEFAULT 0,
    exact_non_remunerative_sum NUMERIC(18,6) NOT NULL DEFAULT 0,
    total_non_remunerative NUMERIC(18,2) NOT NULL DEFAULT 0,
    exact_deductions_sum NUMERIC(18,6) NOT NULL DEFAULT 0,
    total_deductions NUMERIC(18,2) NOT NULL DEFAULT 0,
    preliminary_net_pay NUMERIC(18,2) NOT NULL DEFAULT 0,
    explicit_rounding_adjustment NUMERIC(18,2) NOT NULL DEFAULT 0,
    net_pay NUMERIC(18,2) NOT NULL DEFAULT 0,
    net_pay_in_words TEXT NOT NULL,
    exact_employer_contributions_sum NUMERIC(18,6) NOT NULL DEFAULT 0,
    total_employer_contributions NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_employer_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
    cost_composition_chart JSONB NOT NULL DEFAULT '[]'::jsonb,
    calculation_snapshot JSONB NOT NULL,
    sha256_hash CHAR(64) NOT NULL,
    is_immutable BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_pv_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_pv_payslip_ver UNIQUE (payslip_id, version_number),
    CONSTRAINT chk_pv_net_math CHECK (total_remunerative + total_non_remunerative - total_deductions = net_pay),
    CONSTRAINT chk_pv_employer_cost_math CHECK (total_remunerative + total_non_remunerative + total_employer_contributions = total_employer_cost),
    CONSTRAINT fk_pv_payslip_same_company_emp FOREIGN KEY (tenant_id, company_id, employee_id, payslip_id)
        REFERENCES public.payslips (tenant_id, company_id, employee_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_pv_company_ver_same_company FOREIGN KEY (tenant_id, company_id, company_version_id)
        REFERENCES public.company_versions (tenant_id, company_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_pv_employee_ver_same_emp FOREIGN KEY (tenant_id, employee_id, employee_version_id)
        REFERENCES public.employee_versions (tenant_id, employee_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_pv_pdf_doc_same_company FOREIGN KEY (tenant_id, company_id, pdf_document_id)
        REFERENCES public.documents (tenant_id, company_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_pv_rectifies_same_tenant FOREIGN KEY (tenant_id, rectifies_version_id)
        REFERENCES public.payslip_versions (tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_pv_salary_scale FOREIGN KEY (salary_scale_id) REFERENCES public.salary_scales (id) ON DELETE RESTRICT,
    CONSTRAINT fk_pv_category FOREIGN KEY (category_id) REFERENCES public.agreement_categories (id) ON DELETE RESTRICT
);

-- #36 payroll_items
CREATE TABLE public.payroll_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    payslip_version_id UUID NOT NULL,
    concept_id UUID NOT NULL,
    rule_id UUID NULL,
    scale_item_id UUID NULL,
    concept_code VARCHAR(30) NOT NULL,
    concept_name VARCHAR(150) NOT NULL,
    item_nature VARCHAR(25) NOT NULL,
    is_explicit_rounding_item BOOLEAN NOT NULL DEFAULT false,
    unit VARCHAR(20) NOT NULL,
    quantity NUMERIC(12,4) NOT NULL DEFAULT 1,
    calculation_base NUMERIC(18,6) NOT NULL DEFAULT 0,
    percentage_applied NUMERIC(10,6) NULL,
    exact_amount NUMERIC(18,6) NOT NULL,
    rounded_amount NUMERIC(18,2) NOT NULL,
    rounding_delta NUMERIC(18,6) NOT NULL DEFAULT 0,
    retroactive_accrual_period CHAR(7) NULL,
    formula_applied TEXT NOT NULL,
    normative_trace JSONB NOT NULL DEFAULT '{}'::jsonb,
    print_order INT NOT NULL DEFAULT 100,
    CONSTRAINT uq_pi_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT chk_pi_nature CHECK (item_nature IN ('REMUNERATIVE', 'NON_REMUNERATIVE')),
    CONSTRAINT fk_pi_pv_same_tenant FOREIGN KEY (tenant_id, payslip_version_id)
        REFERENCES public.payslip_versions (tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_pi_concept FOREIGN KEY (concept_id) REFERENCES public.payroll_concepts (id) ON DELETE RESTRICT,
    CONSTRAINT fk_pi_rule FOREIGN KEY (rule_id) REFERENCES public.payroll_rules (id) ON DELETE RESTRICT,
    CONSTRAINT fk_pi_scale_item FOREIGN KEY (scale_item_id) REFERENCES public.salary_scale_items (id) ON DELETE RESTRICT
);
CREATE INDEX idx_pi_tenant_pv_order ON public.payroll_items (tenant_id, payslip_version_id, print_order);

-- #37 payroll_deductions
CREATE TABLE public.payroll_deductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    payslip_version_id UUID NOT NULL,
    concept_id UUID NOT NULL,
    rule_id UUID NULL,
    concept_code VARCHAR(30) NOT NULL,
    concept_name VARCHAR(150) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    quantity NUMERIC(12,4) NOT NULL DEFAULT 1,
    gross_base NUMERIC(18,6) NOT NULL DEFAULT 0,
    cap_applied NUMERIC(18,2) NULL,
    taxable_base NUMERIC(18,6) NOT NULL DEFAULT 0,
    percentage_applied NUMERIC(10,6) NULL,
    exact_amount NUMERIC(18,6) NOT NULL,
    rounded_amount NUMERIC(18,2) NOT NULL,
    rounding_delta NUMERIC(18,6) NOT NULL DEFAULT 0,
    formula_applied TEXT NOT NULL,
    normative_trace JSONB NOT NULL DEFAULT '{}'::jsonb,
    print_order INT NOT NULL DEFAULT 100,
    CONSTRAINT uq_pd_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_pd_pv_same_tenant FOREIGN KEY (tenant_id, payslip_version_id)
        REFERENCES public.payslip_versions (tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_pd_concept FOREIGN KEY (concept_id) REFERENCES public.payroll_concepts (id) ON DELETE RESTRICT,
    CONSTRAINT fk_pd_rule FOREIGN KEY (rule_id) REFERENCES public.payroll_rules (id) ON DELETE RESTRICT
);
CREATE INDEX idx_pd_tenant_pv_order ON public.payroll_deductions (tenant_id, payslip_version_id, print_order);

-- #38 employer_contributions
CREATE TABLE public.employer_contributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    payslip_version_id UUID NOT NULL,
    concept_id UUID NOT NULL,
    rule_id UUID NULL,
    concept_code VARCHAR(30) NOT NULL,
    concept_name VARCHAR(150) NOT NULL,
    cost_group VARCHAR(30) NOT NULL,
    gross_base NUMERIC(18,6) NOT NULL DEFAULT 0,
    detraction_applied NUMERIC(18,2) NOT NULL DEFAULT 0,
    taxable_base NUMERIC(18,6) NOT NULL DEFAULT 0,
    percentage_applied NUMERIC(10,6) NULL,
    fixed_amount NUMERIC(18,2) NULL,
    exact_amount NUMERIC(18,6) NOT NULL,
    rounded_amount NUMERIC(18,2) NOT NULL,
    rounding_delta NUMERIC(18,6) NOT NULL DEFAULT 0,
    formula_applied TEXT NOT NULL,
    normative_trace JSONB NOT NULL DEFAULT '{}'::jsonb,
    print_order INT NOT NULL DEFAULT 100,
    CONSTRAINT uq_ec_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT chk_ec_cost_group CHECK (cost_group IN ('SEGURIDAD_SOCIAL', 'INSSJP', 'OBRA_SOCIAL', 'COSTO_SINDICAL', 'ART', 'SCVO', 'OTROS_PATRONALES')),
    CONSTRAINT fk_ec_pv_same_tenant FOREIGN KEY (tenant_id, payslip_version_id)
        REFERENCES public.payslip_versions (tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_ec_concept FOREIGN KEY (concept_id) REFERENCES public.payroll_concepts (id) ON DELETE RESTRICT,
    CONSTRAINT fk_ec_rule FOREIGN KEY (rule_id) REFERENCES public.payroll_rules (id) ON DELETE RESTRICT
);
CREATE INDEX idx_ec_tenant_pv_order ON public.employer_contributions (tenant_id, payslip_version_id, print_order);

-- #39 arca_concept_mappings
CREATE TABLE public.arca_concept_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    company_id UUID NULL,
    concept_id UUID NOT NULL,
    employer_concept_code CHAR(10) NOT NULL,
    arca_official_code CHAR(6) NOT NULL,
    debit_credit_flag CHAR(1) NOT NULL,
    unit_flag CHAR(1) NOT NULL,
    sipa_aportes_flag CHAR(1) NOT NULL,
    sipa_contrib_flag CHAR(1) NOT NULL,
    inssjp_aportes_flag CHAR(1) NOT NULL,
    inssjp_contrib_flag CHAR(1) NOT NULL,
    os_aportes_flag CHAR(1) NOT NULL,
    os_contrib_flag CHAR(1) NOT NULL,
    fsr_flag CHAR(1) NOT NULL,
    renatre_flag CHAR(1) NOT NULL,
    lrt_art_flag CHAR(1) NOT NULL,
    regimenes_especiales_flag CHAR(1) NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE NULL,
    validation_status VARCHAR(25) NOT NULL DEFAULT 'VALIDATED',
    CONSTRAINT uq_acm_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_acm_mapping UNIQUE NULLS NOT DISTINCT (tenant_id, company_id, concept_id, valid_from),
    CONSTRAINT fk_acm_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
    CONSTRAINT fk_acm_company_same_tenant FOREIGN KEY (tenant_id, company_id)
        REFERENCES public.companies (tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_acm_concept FOREIGN KEY (concept_id) REFERENCES public.payroll_concepts (id) ON DELETE RESTRICT
);
CREATE INDEX idx_acm_tenant_concept ON public.arca_concept_mappings (tenant_id, concept_id);

-- #40 arca_exports
CREATE TABLE public.arca_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    company_id UUID NOT NULL,
    payroll_id UUID NOT NULL,
    txt_document_id UUID NULL,
    period_yyyymm CHAR(6) NOT NULL,
    submission_type CHAR(2) NOT NULL,
    liquidation_type CHAR(1) NOT NULL,
    liquidation_number INT NOT NULL,
    employees_count INT NOT NULL,
    validation_status VARCHAR(25) NOT NULL,
    inconsistencies_report JSONB NOT NULL DEFAULT '[]'::jsonb,
    official_spec_version VARCHAR(50) NOT NULL,
    sha256_hash CHAR(64) NULL,
    exported_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ae_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_ae_payroll_same_company FOREIGN KEY (tenant_id, company_id, payroll_id)
        REFERENCES public.payrolls (tenant_id, company_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_ae_doc_same_company FOREIGN KEY (tenant_id, company_id, txt_document_id)
        REFERENCES public.documents (tenant_id, company_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_ae_exported_by FOREIGN KEY (exported_by) REFERENCES public.users (id) ON DELETE RESTRICT
);
CREATE INDEX idx_ae_tenant_company_period ON public.arca_exports (tenant_id, company_id, period_yyyymm);

-- #41 audit_logs
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NULL,
    action VARCHAR(80) NOT NULL,
    module VARCHAR(50) NOT NULL,
    target_table VARCHAR(60) NOT NULL,
    target_id UUID NULL,
    outcome VARCHAR(20) NOT NULL,
    previous_values JSONB NULL,
    new_values JSONB NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_al_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT chk_al_outcome CHECK (outcome IN ('SUCCESS', 'DENIED', 'VALIDATION_ERROR')),
    CONSTRAINT fk_al_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
    CONSTRAINT fk_al_user FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE RESTRICT
);
CREATE INDEX idx_al_tenant_created ON public.audit_logs (tenant_id, created_at DESC);
CREATE INDEX idx_al_tenant_target ON public.audit_logs (tenant_id, target_table, target_id);
