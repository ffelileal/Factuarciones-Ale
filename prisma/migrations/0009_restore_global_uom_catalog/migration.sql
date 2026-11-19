-- Restauración idempotente del catálogo global requerido por la creación de empresas.
-- Los registros son globales (tenant_id NULL) y se identifican con los UUID del contrato.
INSERT INTO public.collective_agreements (
    id, tenant_id, cct_number, name, union_name, activity, territorial_scope,
    default_remuneration_modality, default_payment_frequency,
    standard_monthly_hours, standard_quincenal_hours, is_active
)
VALUES (
    '30000000-0000-4000-8000-000000000260', NULL, '260/75',
    'Unión Obrera Metalúrgica (UOMRA) — CCT 260/75', 'UOMRA',
    'Industria Metalúrgica', 'Nacional (excepto Tierra del Fuego)',
    'MIXTO', 'QUINCENAL', 192.00, 96.00, true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.agreement_branches (
    id, tenant_id, agreement_id, code, name,
    reference_monthly_hours, reference_quincenal_hours, is_active
)
VALUES (
    '31000000-0000-4000-8000-000000000260', NULL,
    '30000000-0000-4000-8000-000000000260',
    'RAMA_4', 'Rama 4 Automotor (Laudo 29)', 192.00, 96.00, true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.agreement_categories (
    id, tenant_id, agreement_id, branch_id, code, name,
    remuneration_modality, remuneration_unit, default_payment_frequency, hierarchy_order
)
VALUES
    (
        '32000000-0000-4000-8000-000000000001', NULL,
        '30000000-0000-4000-8000-000000000260',
        '31000000-0000-4000-8000-000000000260',
        'OFICIAL_MULTIPLE', 'Oficial Múltiple', 'JORNALIZADO', 'HORA', 'QUINCENAL', 10
    ),
    (
        '32000000-0000-4000-8000-000000000002', NULL,
        '30000000-0000-4000-8000-000000000260',
        '31000000-0000-4000-8000-000000000260',
        'OPERARIO_ESP', 'Operario Especializado', 'JORNALIZADO', 'HORA', 'QUINCENAL', 20
    ),
    (
        '32000000-0000-4000-8000-000000000003', NULL,
        '30000000-0000-4000-8000-000000000260',
        '31000000-0000-4000-8000-000000000260',
        'ADMIN_4TA', 'Administrativo 4ta Categoría', 'MENSUALIZADO', 'MES', 'MENSUAL', 30
    )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.salary_scales (
    id, tenant_id, agreement_id, branch_id, version, agreement_number,
    period_code, valid_from, valid_to, status, notes
)
VALUES (
    '33000000-0000-4000-8000-000000002026', NULL,
    '30000000-0000-4000-8000-000000000260',
    '31000000-0000-4000-8000-000000000260',
    1, 'Acuerdo Paritario UOMRA Rama 4 — Octubre 2026', '2026-10',
    '2026-10-01', '2026-10-31', 'VALIDATED',
    'Escala oficial Octubre 2026 + Seguro de Vida UOM $16.734,96'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.salary_scale_items (
    id, tenant_id, salary_scale_id, agreement_id, branch_id, category_id,
    hourly_rate, monthly_basic
)
VALUES
    (
        '33100000-0000-4000-8000-000000000001', NULL,
        '33000000-0000-4000-8000-000000002026',
        '30000000-0000-4000-8000-000000000260',
        '31000000-0000-4000-8000-000000000260',
        '32000000-0000-4000-8000-000000000001', 7684.000000, NULL
    ),
    (
        '33100000-0000-4000-8000-000000000002', NULL,
        '33000000-0000-4000-8000-000000002026',
        '30000000-0000-4000-8000-000000000260',
        '31000000-0000-4000-8000-000000000260',
        '32000000-0000-4000-8000-000000000002', 6973.000000, NULL
    ),
    (
        '33100000-0000-4000-8000-000000000003', NULL,
        '33000000-0000-4000-8000-000000002026',
        '30000000-0000-4000-8000-000000000260',
        '31000000-0000-4000-8000-000000000260',
        '32000000-0000-4000-8000-000000000003', NULL, 1106590.00
    )
ON CONFLICT (id) DO NOTHING;
