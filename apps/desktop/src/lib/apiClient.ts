import type {
  LoginRequestDto,
  LoginResponseDto,
  CompanyDto,
  CreateCompanyRequestDto,
  UpdateCompanyRequestDto,
  WorkspaceMembershipDto,
  EmployeeGridRowDto,
  CreateEmployeeRequestDto,
  InlineUpdateEmployeeRequestDto,
  BulkEmployeeActionRequestDto,
  CreateImportStagingRequestDto,
  UpdateStagingRowRequestDto,
  ConfirmImportBatchRequestDto,
  CreateVacationRequestDto,
  CreateManagedUserRequestDto,
} from '@ar-payroll/contracts';
import { getSessionTokenSecure } from './credentialStore.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:4000';

export interface CompanyDetailResponseDto {
  company: CompanyDto;
  branches: Array<{
    id: string;
    code: string;
    name: string;
    address: string;
    locality: string;
    province: string;
    postal_code: string;
    is_active: boolean;
  }>;
  agreements: Array<{
    id: string;
    agreement_id: string;
    branch_id: string | null;
    is_active: boolean;
    cct_number: string;
    agreement_name: string;
    union_name: string;
    branch_code: string | null;
    branch_name: string | null;
  }>;
  periods: Array<{
    id: string;
    year: number;
    month: number;
    period_code: string;
    liquidation_modality: string;
    payment_frequency: string;
    accrual_start_date: string;
    accrual_end_date: string;
    period_status: string;
    scheduled_payment_date: string;
  }>;
  payrolls: Array<{
    id: string;
    period_id: string;
    period_code: string;
    version: number;
    liquidation_modality: string;
    status: string;
    employees_count: number;
    total_remunerative: string;
    total_non_remunerative: string;
    total_deductions: string;
    total_net_pay: string;
    total_employer_cost: string;
    is_immutable: boolean;
    calculated_at: string;
  }>;
  payslips: Array<{
    id: string;
    receipt_code: string;
    status: string;
    current_version_number: number;
    legajo: string;
    cuil: string;
    last_name: string;
    first_name: string;
    total_remunerative: string;
    total_deductions: string;
    net_pay: string;
    is_immutable: boolean;
  }>;
  novelties: Array<{
    id: string;
    period_id: string;
    period_code: string;
    employee_id: string;
    legajo: string;
    last_name: string;
    first_name: string;
    novelty_code: string;
    novelty_name: string;
    quantity: string;
    unit: string;
    status: string;
    novelty_date: string | null;
  }>;
  arcaExports: Array<{
    id: string;
    period_yyyymm: string;
    submission_type: string;
    liquidation_type: string;
    liquidation_number: number;
    employees_count: number;
    validation_status: string;
    official_spec_version: string;
    created_at: string;
  }>;
}

export interface EmployeeFullDossierResponseDto {
  profile: {
    id: string;
    company_id: string;
    cuil: string;
    dni: string;
    legajo: string;
    current_version: number;
    employment_status: 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'TERMINATED';
    hire_date: string;
    termination_date: string | null;
    recognized_prior_years: number;
    version: number;
    valid_from: string;
    last_name: string;
    first_name: string;
    birth_date: string;
    registered_sex: 'M' | 'F' | 'X';
    marital_status: string;
    address: string;
    locality: string;
    province: string;
    postal_code: string;
    phone: string | null;
    email: string | null;
    contract_type: string;
    job_position: string;
    schedule_type: string;
    habitual_schedule: string;
    remuneration_modality: 'JORNALIZADO' | 'MENSUALIZADO';
    remuneration_unit: 'HORA' | 'DIA' | 'MES';
    payment_frequency: 'SEMANAL' | 'QUINCENAL' | 'MENSUAL';
    obra_social_code: string;
    obra_social_name: string;
    is_union_member: boolean;
    bank_name: string | null;
    cbu: string | null;
    category_id: string;
    category_code: string;
    category_name: string;
    agreement_id: string;
    agreement_code: string;
    agreement_name: string;
    agreement_branch_id: string;
    agreement_branch_name: string;
  };
  modificationHistory: Array<{
    id: string;
    event_type: string;
    effective_date: string;
    reason: string | null;
    created_at: string;
    recorded_by_name: string | null;
  }>;
  versions: Array<{
    version: number;
    valid_from: string;
    valid_to: string | null;
    job_position: string;
    remuneration_modality: string;
    payment_frequency: string;
    change_reason: string | null;
    category_name: string;
    created_at: string;
  }>;
  salaryScales: Array<{
    agreement_number: string;
    period_code: string;
    valid_from: string;
    valid_to: string;
    hourly_rate: string | null;
    daily_rate: string | null;
    monthly_basic: string | null;
  }>;
  familyMembers: Array<{
    id: string;
    relationship: string;
    last_name: string;
    first_name: string;
    dni: string;
    cuil: string | null;
    birth_date: string;
    is_dependent_charge: boolean;
  }>;
  leaves: Array<{
    id: string;
    situation_type: string;
    start_date: string;
    end_date: string;
    days_count: number;
    is_paid: boolean;
    status: string;
    observations: string | null;
  }>;
  documents: Array<{
    id: string;
    document_type: string;
    title: string;
    original_filename: string;
    mime_type: string;
    size_bytes: string;
    sha256_hash: string;
    is_immutable: boolean;
    created_at: string;
  }>;
  payslips: Array<{
    id: string;
    receipt_code: string;
    status: string;
    period_code: string;
    liquidation_modality: string;
    total_remunerative: string | null;
    total_non_remunerative: string | null;
    total_deductions: string | null;
    net_pay: string | null;
    created_at: string;
  }>;
}

export interface StagingBatchDetailResponseDto {
  batchId: string;
  companyId: string | null;
  sourceDocumentId: string | null;
  importKind: 'COMPANIES' | 'EMPLOYEES' | 'PDF_EMPLOYEES' | 'PDF_COMPANIES';
  status: string;
  metadata: {
    fileName: string;
    fileFormat: string;
    sizeBytes: number;
    sheetNames: string[];
    selectedSheet: string;
    headers: string[];
    suggestedMapping: Record<string, string>;
    pdfMetadata?: {
      hasSelectableText: boolean;
      requiresOcrOrManualReview: boolean;
      extractedRawText: string;
    } | null;
  };
  summary: {
    totalDetected: number;
    validCount: number;
    errorCount: number;
    duplicateCount: number;
    toCreateCount: number;
    toUpdateCount: number;
    skippedCount: number;
    needsReviewCount: number;
  };
  rows: Array<{
    id: string;
    rowIndex: number;
    sheetName: string;
    targetEntity: 'COMPANY' | 'EMPLOYEE';
    rawData: Record<string, string>;
    data: Record<string, string>;
    errors: string[];
    warnings: string[];
    rowStatus: 'VALID' | 'DUPLICATE' | 'NEEDS_REVIEW' | 'ERROR' | 'SKIPPED';
    duplicateInfo: {
      existingId: string;
      keyField: string;
      keyValue: string;
      resolution: 'SKIP' | 'UPDATE' | 'MANUAL_REVIEW';
    } | null;
  }>;
}

export interface ConfirmImportReportDto {
  batchId: string;
  status: string;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  rejectedCount: number;
  rejectedRows: Array<{ rowIndex: number; reasons: string[] }>;
  completedAt: string;
}

export interface CategoryCatalogItemDto {
  id: string;
  code: string;
  name: string;
  remuneration_modality: string;
  remuneration_unit: string;
  default_payment_frequency: string;
  agreement_id: string;
  cct_number: string;
  agreement_name: string;
  branch_id: string;
  branch_name: string;
  hourly_rate: string | null;
  monthly_basic: string | null;
}

export interface VacationDto {
  id: string;
  company_id: string;
  company_name: string;
  employee_id: string;
  legajo: string;
  last_name: string;
  first_name: string;
  start_date: string;
  end_date: string;
  days_count: number;
  status: string;
  observations: string | null;
  hire_date: string;
  recognized_prior_years: number;
  legal_entitlement_days: number;
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getSessionTokenSecure();
  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      typeof payload?.message === 'string'
        ? payload.message
        : `Error HTTP ${response.status}`;
    throw new Error(msg);
  }
  return payload as T;
}

export const desktopApiClient = {
  getHealth: () =>
    apiRequest<{
      status: string;
      engine: string;
      dbRole: string;
      bypassRls: boolean;
      physicalTables: number;
      rlsForcedTables: number;
      timestamp: string;
    }>('/api/v1/health'),

  login: (body: LoginRequestDto) =>
    apiRequest<LoginResponseDto>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  selectWorkspace: (tenantId: string) =>
    apiRequest<{ activeTenantId: string; roleCode: string }>('/api/v1/auth/select-workspace', {
      method: 'POST',
      body: JSON.stringify({ tenantId }),
    }),

  getMe: () =>
    apiRequest<{
      user: { id: string; email: string; fullName: string };
      activeTenantId: string | null;
      roleCode: string | null;
      requiresTenantSelection: boolean;
      memberships: WorkspaceMembershipDto[];
      rlsContext: {
        current_db_user: string;
        verified_tenant_id: string | null;
        verified_user_id: string | null;
      };
    }>('/api/v1/auth/me'),

  logout: () =>
    apiRequest<{ revoked: boolean }>('/api/v1/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  listManagedUsers: () =>
    apiRequest<{
      users: Array<{
        id: string;
        username: string;
        full_name: string;
        email: string;
        status: string;
        created_at: string;
      }>;
    }>('/api/v1/users'),

  createManagedUser: (body: CreateManagedUserRequestDto) =>
    apiRequest<{ user: { user_id: string; username: string; full_name: string; tenant_id: string } }>(
      '/api/v1/users',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),

  registerWorkspaceUser: (body: {
    workspaceSlug: string;
    firstName: string;
    lastName: string;
    username: string;
    password: string;
  }) =>
    apiRequest<{ user: { user_id: string; username: string; full_name: string; tenant_id: string } }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),

  removeManagedUser: (userId: string) =>
    apiRequest<{ user: { removed_user_id: string; user_status: string } }>(
      `/api/v1/users/${userId}`,
      { method: 'DELETE' },
    ),

  getDashboardSummary: () =>
    apiRequest<{
      summary: {
        companiesCount: number;
        activeCompaniesCount: number;
        employeesCount: number;
        activeEmployeesCount: number;
        payrollsCount: number;
        payslipsCount: number;
        documentsCount: number;
        stagingBatchesCount: number;
      };
    }>('/api/v1/dashboard/summary'),

  listCompanies: () => apiRequest<{ companies: CompanyDto[] }>('/api/v1/companies'),

  getCompanyDetail: (companyId: string) =>
    apiRequest<CompanyDetailResponseDto>(`/api/v1/companies/${companyId}`),

  createCompany: (body: CreateCompanyRequestDto) =>
    apiRequest<{ company: CompanyDto }>('/api/v1/companies', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateCompany: (companyId: string, body: UpdateCompanyRequestDto) =>
    apiRequest<{ company: CompanyDto }>(`/api/v1/companies/${companyId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  listEmployees: (companyId: string) =>
    apiRequest<{ employees: EmployeeGridRowDto[] }>(
      `/api/v1/companies/${companyId}/employees`
    ),

  createEmployee: (companyId: string, body: CreateEmployeeRequestDto) =>
    apiRequest<{ employee: EmployeeGridRowDto }>(
      `/api/v1/companies/${companyId}/employees`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),

  updateEmployee: (
    companyId: string,
    employeeId: string,
    body: InlineUpdateEmployeeRequestDto
  ) =>
    apiRequest<{ employee: EmployeeGridRowDto }>(
      `/api/v1/companies/${companyId}/employees/${employeeId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      }
    ),

  bulkUpdateEmployees: (companyId: string, body: BulkEmployeeActionRequestDto) =>
    apiRequest<{ employees: EmployeeGridRowDto[] }>(
      `/api/v1/companies/${companyId}/employees/bulk`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),

  getEmployeeProfile: (companyId: string, employeeId: string) =>
    apiRequest<EmployeeFullDossierResponseDto>(
      `/api/v1/companies/${companyId}/employees/${employeeId}/profile`
    ),

  addFamilyMember: (
    companyId: string,
    employeeId: string,
    body: {
      relationship: 'CONYUGE' | 'CONVIVIENTE' | 'HIJO' | 'OTRO';
      lastName: string;
      firstName: string;
      dni: string;
      cuil?: string | null;
      birthDate: string;
      isDependentCharge?: boolean;
    }
  ) =>
    apiRequest<{ familyMember: { id: string } }>(
      `/api/v1/companies/${companyId}/employees/${employeeId}/family`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),

  addEmployeeLeave: (
    companyId: string,
    employeeId: string,
    body: {
      situationType: string;
      startDate: string;
      endDate: string;
      daysCount: number;
      isPaid?: boolean;
      observations?: string | null;
    }
  ) =>
    apiRequest<{ leave: { id: string } }>(
      `/api/v1/companies/${companyId}/employees/${employeeId}/leaves`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),

  listVacations: (filters?: { companyId?: string; year?: number }) => {
    const params = new URLSearchParams();
    if (filters?.companyId) params.set('companyId', filters.companyId);
    if (filters?.year) params.set('year', String(filters.year));
    const query = params.toString();
    return apiRequest<{ vacations: VacationDto[] }>(
      `/api/v1/vacations${query ? `?${query}` : ''}`,
    );
  },

  addVacation: (
    companyId: string,
    employeeId: string,
    body: CreateVacationRequestDto,
  ) =>
    apiRequest<{ vacation: VacationDto }>(
      `/api/v1/companies/${companyId}/employees/${employeeId}/vacations`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),

  listCbas: () =>
    apiRequest<{
      cbas: Array<{
        id: string;
        tenantId: string | null;
        scope: 'GLOBAL' | 'TENANT';
        code: string;
        name: string;
        branchCode: string | null;
        branchName: string | null;
      }>;
    }>('/api/v1/cbas'),

  listCategories: () =>
    apiRequest<{
      categories: CategoryCatalogItemDto[];
    }>('/api/v1/categories'),

  createImportStaging: (body: CreateImportStagingRequestDto) =>
    apiRequest<StagingBatchDetailResponseDto>('/api/v1/imports/staging', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getImportBatch: (batchId: string) =>
    apiRequest<StagingBatchDetailResponseDto>(`/api/v1/imports/batches/${batchId}`),

  updateImportRow: (batchId: string, rowId: string, body: UpdateStagingRowRequestDto) =>
    apiRequest<StagingBatchDetailResponseDto>(
      `/api/v1/imports/batches/${batchId}/rows/${rowId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      }
    ),

  confirmImportBatch: (batchId: string, body: ConfirmImportBatchRequestDto) =>
    apiRequest<ConfirmImportReportDto>(`/api/v1/imports/batches/${batchId}/confirm`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listDocuments: () =>
    apiRequest<{
      documents: Array<{
        id: string;
        company_id: string | null;
        employee_id: string | null;
        document_type: string;
        title: string;
        original_filename: string;
        mime_type: string;
        size_bytes: string;
        sha256_hash: string;
        is_immutable: boolean;
        created_at: string;
      }>;
    }>('/api/v1/documents'),

  listAuditLogs: () =>
    apiRequest<{
      logs: Array<{
        id: string;
        tenant_id: string;
        user_id: string | null;
        action: string;
        module: string;
        target_table: string;
        target_id: string | null;
        outcome: string;
        created_at: string;
      }>;
    }>('/api/v1/audit-logs'),

  getPayrollWorkspace: (companyId: string) =>
    apiRequest<CompanyPayrollWorkspaceDto>(
      `/api/v1/companies/${companyId}/payrolls-workspace`
    ),

  createPayrollPeriod: (
    companyId: string,
    body: {
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
  ) =>
    apiRequest<{ periodId: string; periodCode: string }>(
      `/api/v1/companies/${companyId}/payroll-periods`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),

  savePeriodNovelties: (
    companyId: string,
    periodId: string,
    rows: Array<{
      employeeId: string;
      normalHours: number;
      overtime50Hours: number;
      overtime100Hours: number;
      holidayHours: number;
      nonRemunerativeAmount: number;
      advanceAmount: number;
      observation?: string;
    }>
  ) =>
    apiRequest<{ savedCount: number }>(
      `/api/v1/companies/${companyId}/payroll-periods/${periodId}/novelties`,
      {
        method: 'PUT',
        body: JSON.stringify({ rows }),
      }
    ),

  calculatePayroll: (companyId: string, periodId: string) =>
    apiRequest<{
      payrollId: string;
      version: number;
      employeesCount: number;
      totalNetPay: number;
    }>(`/api/v1/companies/${companyId}/payroll-periods/${periodId}/calculate`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  approvePayroll: (companyId: string, payrollId: string) =>
    apiRequest<{
      payrollId: string;
      status: string;
      isImmutable: boolean;
    }>(`/api/v1/companies/${companyId}/payrolls/${payrollId}/approve`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  exportArcaLsd: (companyId: string, payrollId: string) =>
    apiRequest<{
      exportId: string;
      filename: string;
      sha256Hash: string;
      txtContent: string;
      employeesCount: number;
    }>(`/api/v1/companies/${companyId}/payrolls/${payrollId}/export-arca`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
};

export interface CompanyPayrollWorkspaceDto {
  periods: Array<{
    id: string;
    year: number;
    month: number;
    periodCode: string;
    liquidationModality: string;
    paymentFrequency: string;
    arcaSequenceNumber: number;
    accrualStartDate: string;
    accrualEndDate: string;
    closingDate: string;
    scheduledPaymentDate: string;
    periodStatus: string;
  }>;
  novelties: Array<{
    id: string;
    periodId: string;
    employeeId: string;
    noveltyCode: string;
    noveltyName: string;
    quantity: number;
    unit: string;
    unitOrFixedAmount: number;
    observation: string | null;
  }>;
  payrolls: Array<{
    id: string;
    periodId: string;
    periodCode: string;
    rectifiesPayrollId: string | null;
    version: number;
    liquidationModality: string;
    status: string;
    employeesCount: number;
    totalHours: number;
    totalRemunerative: number;
    totalNonRemunerative: number;
    totalDeductions: number;
    totalNetPay: number;
    totalEmployerContributions: number;
    totalEmployerCost: number;
    engineVersion: string;
    isImmutable: boolean;
    calculatedAt: string;
    approvedAt: string | null;
  }>;
  payslips: Array<{
    id: string;
    payrollId: string;
    employeeId: string;
    receiptCode: string;
    currentVersionNumber: number;
    status: string;
    legajo: string;
    cuil: string;
    hireDate?: string;
    lastName: string;
    firstName: string;
    jobPosition: string;
    categoryName: string;
    payslipVersionId: string;
    remunerationModality: string;
    remunerationUnit: string;
    paymentFrequency: string;
    workedDays: number;
    workedHours: number;
    seniorityYears: number;
    referenceRate: number;
    totalRemunerative: number;
    totalNonRemunerative: number;
    totalDeductions: number;
    explicitRoundingAdjustment?: number;
    netPay: number;
    netPayInWords: string;
    totalEmployerContributions: number;
    totalEmployerCost: number;
    sha256Hash: string;
    isImmutable: boolean;
    liquidationModality: string;
    periodCode: string;
    scheduledPaymentDate?: string;
    items: Array<{
      id: string;
      conceptCode: string;
      conceptName: string;
      itemNature: string;
      unit: string;
      quantity: number;
      calculationBase: number;
      percentageApplied: number | null;
      roundedAmount: number;
      formulaApplied: string;
    }>;
    deductions: Array<{
      id: string;
      conceptCode: string;
      conceptName: string;
      unit: string;
      quantity: number;
      taxableBase: number;
      percentageApplied: number | null;
      roundedAmount: number;
      formulaApplied: string;
    }>;
    contributions: Array<{
      id: string;
      conceptCode: string;
      conceptName: string;
      costGroup: string;
      taxableBase: number;
      percentageApplied: number | null;
      roundedAmount: number;
      formulaApplied: string;
    }>;
  }>;
  arcaExports: Array<{
    id: string;
    payrollId: string;
    periodYyyymm: string;
    submissionType: string;
    liquidationType: string;
    liquidationNumber: number;
    employeesCount: number;
    validationStatus: string;
    officialSpecVersion: string;
    sha256Hash: string;
    createdAt: string;
  }>;
}

