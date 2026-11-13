import { z } from 'zod';

export const SEED_IDS = {
  TENANT_A: '11111111-1111-4111-8111-111111111111', // Espacio de Trabajo A: Mi Papá
  TENANT_B: '22222222-2222-4222-8222-222222222222', // Espacio de Trabajo B: Su Socio
  USER_A: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',   // Usuario A: Mi Papá
  USER_B: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',   // Usuario B: Su Socio
  USER_MULTI: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', // Usuario Auditor con membresía en ambos
  ROLE_OWNER: '10000000-0000-4000-8000-000000000001',
  ROLE_ADMIN: '10000000-0000-4000-8000-000000000002',
  ROLE_LIQUIDATOR: '10000000-0000-4000-8000-000000000003',
  ROLE_VIEWER: '10000000-0000-4000-8000-000000000004',
  CBA_UOM: '30000000-0000-4000-8000-000000000260',
  CBA_UOM_BRANCH_R4: '31000000-0000-4000-8000-000000000260',
  CBA_UOM_CAT_OFICIAL_MULTIPLE: '32000000-0000-4000-8000-000000000001',
  CBA_UOM_CAT_OPERARIO_ESP: '32000000-0000-4000-8000-000000000002',
  CBA_UOM_CAT_ADMIN_4TA: '32000000-0000-4000-8000-000000000003',
  COMPANY_A_COMBINA: 'a1000000-0000-4000-8000-000000000001',
  COMPANY_A_VERSION_1: 'a1100000-0000-4000-8000-000000000001',
  COMPANY_A_BRANCH_CENTRAL: 'a1200000-0000-4000-8000-000000000001',
  COMPANY_B_SOCIO: 'b1000000-0000-4000-8000-000000000001',
  COMPANY_B_VERSION_1: 'b1100000-0000-4000-8000-000000000001',
  COMPANY_B_BRANCH_CENTRAL: 'b1200000-0000-4000-8000-000000000001',
} as const;

/**
 * Validador oficial de CUIT/CUIL Argentino (Módulo 11 — ARCA/AFIP)
 */
export function isValidArgentineCuitOrCuil(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(digits[i]) * weights[i];
  }
  const mod = 11 - (sum % 11);
  const expectedCheck = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return Number(digits[10]) === expectedCheck;
}

export function formatCuitOrCuil(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 11) return raw;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

export const RoleCodeSchema = z.enum(['OWNER', 'ADMIN', 'LIQUIDATOR', 'VIEWER']);
export type RoleCode = z.infer<typeof RoleCodeSchema>;

export const LoginRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .min(3, 'Ingresá un correo electrónico o nombre de usuario válido')
    .refine(
      (value) =>
        z.string().email().safeParse(value).success ||
        /^[a-zA-Z0-9._-]+$/.test(value),
      'Ingresá un correo electrónico o nombre de usuario válido',
    ),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  deviceName: z.string().optional(),
});
export type LoginRequestDto = z.infer<typeof LoginRequestSchema>;

export const CreateManagedUserRequestSchema = z.object({
  firstName: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(75),
  lastName: z.string().trim().min(2, 'El apellido debe tener al menos 2 caracteres').max(75),
  username: z
    .string()
    .trim()
    .min(3, 'El usuario debe tener al menos 3 caracteres')
    .max(80)
    .regex(/^[a-zA-Z0-9._-]+$/, 'El usuario solo puede contener letras, números, punto, guion y guion bajo'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200),
});
export type CreateManagedUserRequestDto = z.infer<typeof CreateManagedUserRequestSchema>;

export const RegisterWorkspaceUserRequestSchema = CreateManagedUserRequestSchema.extend({
  workspaceSlug: z.string().regex(/^[a-z0-9-]+$/, 'Espacio de trabajo inválido'),
});
export type RegisterWorkspaceUserRequestDto = z.infer<typeof RegisterWorkspaceUserRequestSchema>;

export const WorkspaceMembershipSchema = z.object({
  membershipId: z.string().uuid(),
  tenantId: z.string().uuid(),
  tenantSlug: z.string(),
  tenantDisplayName: z.string(),
  roleCode: RoleCodeSchema,
  roleName: z.string(),
});
export type WorkspaceMembershipDto = z.infer<typeof WorkspaceMembershipSchema>;

export const LoginResponseSchema = z.object({
  sessionToken: z.string(),
  expiresAt: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    fullName: z.string(),
  }),
  activeTenantId: z.string().uuid().nullable(),
  requiresTenantSelection: z.boolean(),
  memberships: z.array(WorkspaceMembershipSchema),
});
export type LoginResponseDto = z.infer<typeof LoginResponseSchema>;

export const SelectWorkspaceRequestSchema = z.object({
  tenantId: z.string().uuid('Identificador de espacio de trabajo inválido'),
});
export type SelectWorkspaceRequestDto = z.infer<typeof SelectWorkspaceRequestSchema>;

// ============================================================================
// EMPRESAS (FASE B)
// ============================================================================
export const CompanySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  cuit: z.string().regex(/^\d{11}$/, 'El CUIT debe tener 11 dígitos numéricos'),
  legalName: z.string().min(2),
  tradeName: z.string().nullable(),
  primaryActivity: z.string().nullable(),
  arcaDomicilioExplotacion: z.string().nullable(),
  fiscalAddress: z.string().nullable().optional(),
  locality: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  vatCondition: z.string().nullable().optional(),
  artName: z.string().nullable().optional(),
  artAliquotPct: z.number().optional(),
  artFixedAmount: z.number().optional(),
  defaultCbaId: z.string().uuid().nullable(),
  employeesCount: z.number().optional(),
  activeEmployeesCount: z.number().optional(),
  currentPeriodLabel: z.string().nullable().optional(),
  updatedAt: z.string().optional(),
  isActive: z.boolean(),
});
export type CompanyDto = z.infer<typeof CompanySchema>;

export const CreateCompanyRequestSchema = z.object({
  cuit: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => /^\d{11}$/.test(v), 'El CUIT debe tener 11 dígitos numéricos'),
  legalName: z.string().min(2, 'La razón social es obligatoria'),
  tradeName: z.string().nullable().optional(),
  personType: z.enum(['FISICA', 'JURIDICA']).optional().default('JURIDICA'),
  companyType: z.string().optional().default('Sociedad Comercial'),
  primaryActivity: z.string().nullable().optional(),
  arcaActivityCode: z.string().optional().default('293011'),
  vatCondition: z.string().optional().default('Responsable Inscripto'),
  fiscalAddress: z.string().optional().default('Sin especificar'),
  locality: z.string().optional().default('Córdoba'),
  province: z.string().optional().default('Córdoba'),
  postalCode: z.string().optional().default('5000'),
  email: z.string().email().optional().default('administracion@empresa.com.ar'),
  phone: z.string().nullable().optional(),
  artName: z.string().optional().default('Prevención ART'),
  artAliquotPct: z.number().optional().default(3.5),
  artFixedAmount: z.number().optional().default(1100),
  arcaDomicilioExplotacion: z.string().nullable().optional(),
  defaultCbaId: z.string().uuid().nullable().optional(),
});
export type CreateCompanyRequestDto = z.input<typeof CreateCompanyRequestSchema>;

export const UpdateCompanyRequestSchema = CreateCompanyRequestSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateCompanyRequestDto = z.input<typeof UpdateCompanyRequestSchema>;

// ============================================================================
// EMPLEADOS — GRILLA TIPO EXCEL Y FICHA INDIVIDUAL (FASE C)
// ============================================================================
export const EmploymentStatusSchema = z.enum(['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED']);
export type EmploymentStatus = z.infer<typeof EmploymentStatusSchema>;

export const EmployeeGridRowSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  legajo: z.string(),
  lastName: z.string(),
  firstName: z.string(),
  cuil: z.string(),
  dni: z.string(),
  hireDate: z.string(),
  terminationDate: z.string().nullable(),
  recognizedPriorYears: z.number(),
  jobPosition: z.string(),
  categoryId: z.string().uuid(),
  categoryCode: z.string(),
  categoryName: z.string(),
  agreementId: z.string().uuid(),
  agreementCode: z.string(),
  agreementName: z.string(),
  agreementBranchId: z.string().uuid(),
  agreementBranchName: z.string(),
  branchId: z.string().uuid(),
  branchName: z.string(),
  contractType: z.string(),
  remunerationModality: z.enum(['JORNALIZADO', 'MENSUALIZADO']),
  remunerationUnit: z.enum(['HORA', 'DIA', 'MES']),
  paymentFrequency: z.enum(['SEMANAL', 'QUINCENAL', 'MENSUAL']),
  employmentStatus: EmploymentStatusSchema,
  obraSocialCode: z.string(),
  obraSocialName: z.string(),
  isUnionMember: z.boolean(),
  updatedAt: z.string(),
});
export type EmployeeGridRowDto = z.infer<typeof EmployeeGridRowSchema>;

export const CreateEmployeeRequestSchema = z.object({
  legajo: z.string().min(1, 'El legajo es obligatorio'),
  lastName: z.string().min(1, 'El apellido es obligatorio'),
  firstName: z.string().min(1, 'El nombre es obligatorio'),
  cuil: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => isValidArgentineCuitOrCuil(v), 'CUIL inválido (falló verificación Módulo 11)'),
  dni: z.string().min(6, 'El DNI es obligatorio'),
  birthDate: z.string().optional().default('1990-01-01'),
  registeredSex: z.enum(['M', 'F', 'X']).optional().default('M'),
  maritalStatus: z.string().optional().default('SOLTERO'),
  address: z.string().optional().default('Sin especificar'),
  locality: z.string().optional().default('Córdoba'),
  province: z.string().optional().default('Córdoba'),
  postalCode: z.string().optional().default('5000'),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha YYYY-MM-DD requerido'),
  recognizedPriorYears: z.number().int().min(0).optional().default(0),
  jobPosition: z.string().min(1, 'El puesto es obligatorio'),
  categoryId: z.string().uuid('Categoría de convenio inválida'),
  contractType: z.string().optional().default('TIEMPO_INDETERMINADO'),
  remunerationModality: z.enum(['JORNALIZADO', 'MENSUALIZADO']).optional(),
  remunerationUnit: z.enum(['HORA', 'DIA', 'MES']).optional(),
  paymentFrequency: z.enum(['SEMANAL', 'QUINCENAL', 'MENSUAL']).optional(),
  obraSocialCode: z.string().optional().default('112103'),
  obraSocialName: z.string().optional().default('OSUOMRA'),
  isUnionMember: z.boolean().optional().default(true),
  cbu: z.string().nullable().optional(),
  bankName: z.string().nullable().optional(),
});
export type CreateEmployeeRequestDto = z.input<typeof CreateEmployeeRequestSchema>;

/**
 * Campos permitidos para edición rápida en línea (tipo Excel) y actualización de ficha
 */
export const InlineUpdateEmployeeRequestSchema = z.object({
  legajo: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  dni: z.string().min(6).optional(),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  recognizedPriorYears: z.number().int().min(0).optional(),
  jobPosition: z.string().min(1).optional(),
  categoryId: z.string().uuid().optional(),
  contractType: z.string().min(1).optional(),
  remunerationModality: z.enum(['JORNALIZADO', 'MENSUALIZADO']).optional(),
  remunerationUnit: z.enum(['HORA', 'DIA', 'MES']).optional(),
  paymentFrequency: z.enum(['SEMANAL', 'QUINCENAL', 'MENSUAL']).optional(),
  employmentStatus: EmploymentStatusSchema.optional(),
  birthDate: z.string().optional(),
  registeredSex: z.enum(['M', 'F', 'X']).optional(),
  maritalStatus: z.string().optional(),
  address: z.string().optional(),
  locality: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  obraSocialCode: z.string().optional(),
  obraSocialName: z.string().optional(),
  isUnionMember: z.boolean().optional(),
  bankName: z.string().nullable().optional(),
  cbu: z.string().nullable().optional(),
  changeReason: z.string().optional().default('Edición en grilla / ficha de legajo'),
});
export type InlineUpdateEmployeeRequestDto = z.input<typeof InlineUpdateEmployeeRequestSchema>;

export const BulkEmployeeActionRequestSchema = z.object({
  employeeIds: z.array(z.string().uuid()).min(1),
  action: z.enum(['SET_STATUS', 'SET_CATEGORY', 'SET_CONTRACT_TYPE']),
  employmentStatus: EmploymentStatusSchema.optional(),
  categoryId: z.string().uuid().optional(),
  contractType: z.string().optional(),
  reason: z.string().optional().default('Actualización masiva en grilla'),
});
export type BulkEmployeeActionRequestDto = z.input<typeof BulkEmployeeActionRequestSchema>;

export const CreateFamilyMemberRequestSchema = z.object({
  relationship: z.enum(['CONYUGE', 'CONVIVIENTE', 'HIJO', 'OTRO']),
  lastName: z.string().min(1),
  firstName: z.string().min(1),
  dni: z.string().min(6),
  cuil: z.string().nullable().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isDependentCharge: z.boolean().optional().default(true),
  appliesObraSocialAdherent: z.boolean().optional().default(false),
});

export const CreateEmployeeLeaveRequestSchema = z.object({
  situationType: z.string().min(2),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daysCount: z.number().int().min(1),
  isPaid: z.boolean().optional().default(true),
  observations: z.string().nullable().optional(),
});

export const CreateVacationRequestSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha YYYY-MM-DD requerido'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha YYYY-MM-DD requerido'),
  observations: z.string().nullable().optional(),
});
export type CreateVacationRequestDto = z.infer<typeof CreateVacationRequestSchema>;

// ============================================================================
// IMPORTACIÓN DESDE EXCEL / CSV Y PDF CON STAGING (FASES D Y E)
// ============================================================================
export const ImportKindSchema = z.enum(['COMPANIES', 'EMPLOYEES', 'PDF_EMPLOYEES', 'PDF_COMPANIES']);
export type ImportKind = z.infer<typeof ImportKindSchema>;

export const DuplicateResolutionPolicySchema = z.enum(['SKIP', 'UPDATE', 'MANUAL_REVIEW']);
export type DuplicateResolutionPolicy = z.infer<typeof DuplicateResolutionPolicySchema>;

export const CreateImportStagingRequestSchema = z.object({
  companyId: z.string().uuid().nullable().optional(),
  importKind: ImportKindSchema,
  fileName: z.string().min(1),
  mimeType: z.string().optional().default('application/octet-stream'),
  base64Content: z.string().min(1),
  selectedSheet: z.string().optional(),
  customColumnMapping: z.record(z.string(), z.string()).optional(),
  saveOriginalDocument: z.boolean().optional().default(true),
});
export type CreateImportStagingRequestDto = z.input<typeof CreateImportStagingRequestSchema>;

export const UpdateStagingRowRequestSchema = z.object({
  correctedData: z.record(z.string(), z.unknown()),
  duplicateResolution: DuplicateResolutionPolicySchema.optional(),
});
export type UpdateStagingRowRequestDto = z.input<typeof UpdateStagingRowRequestSchema>;

export const ConfirmImportBatchRequestSchema = z.object({
  defaultDuplicatePolicy: DuplicateResolutionPolicySchema.optional().default('SKIP'),
});
export type ConfirmImportBatchRequestDto = z.input<typeof ConfirmImportBatchRequestSchema>;
