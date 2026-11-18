import React, { useEffect, useMemo, useState } from 'react';
import type {
  CompanyDto,
  EmployeeGridRowDto,
  WorkspaceMembershipDto,
} from '@ar-payroll/contracts';
import {
  desktopApiClient,
  type CompanyDetailResponseDto,
  type CategoryCatalogItemDto,
} from './lib/apiClient.js';
import {
  clearSessionTokenSecure,
  saveSessionTokenSecure,
} from './lib/credentialStore.js';
import { EmployeesSpreadsheetGrid } from './components/EmployeesSpreadsheetGrid.js';
import { EmployeeDossierModal } from './components/EmployeeDossierModal.js';
import { ImportWizardModal } from './components/ImportWizardModal.js';
import { CompanyPayrollsWorkspace } from './components/CompanyPayrollsWorkspace.js';
import { VacationWorkspace } from './components/VacationWorkspace.js';

type MainSection =
  | 'DASHBOARD'
  | 'COMPANIES'
  | 'VACATIONS'
  | 'PAYROLLS'
  | 'DOCUMENTS'
  | 'REPORTS'
  | 'AUDIT'
  | 'USERS';

type CompanyTab =
  | 'GENERAL'
  | 'EMPLOYEES'
  | 'CONVENIOS'
  | 'NOVEDADES'
  | 'LIQUIDACIONES'
  | 'RECIBOS'
  | 'LSD';

const SIDEBAR_SECTIONS: Array<{ id: MainSection; icon: string; label: string }> =
  [
    { id: 'DASHBOARD', icon: '🏠', label: 'Inicio' },
    { id: 'COMPANIES', icon: '🏢', label: 'Empresas' },
    { id: 'VACATIONS', icon: '🌴', label: 'Vacaciones' },
    { id: 'PAYROLLS', icon: '🧮', label: 'Liquidaciones' },
    { id: 'DOCUMENTS', icon: '📁', label: 'Documentos' },
    { id: 'REPORTS', icon: '📊', label: 'Reportes' },
    { id: 'AUDIT', icon: '🕘', label: 'Actividad' },
    { id: 'USERS', icon: '👥', label: 'Usuarios' },
  ];

const COMPANY_TABS: Array<{ id: CompanyTab; label: string }> = [
  { id: 'EMPLOYEES', label: 'Empleados' },
  { id: 'NOVEDADES', label: 'Novedades' },
  { id: 'LIQUIDACIONES', label: 'Liquidaciones' },
  { id: 'RECIBOS', label: 'Recibos' },
  { id: 'LSD', label: 'Libro de Sueldos' },
  { id: 'CONVENIOS', label: 'Convenio' },
  { id: 'GENERAL', label: 'Datos de la empresa' },
];

const AUDIT_ACTION_LABELS: Record<string, string> = {
  AUTH_LOGIN_SUCCESS: 'Inicio de sesión',
  AUTH_LOGOUT: 'Cierre de sesión',
  AUTH_REVOKE_ALL_SESSIONS: 'Cierre de todas las sesiones',
  TENANT_SWITCH_SUCCESS: 'Cambio de espacio de trabajo',
  TENANT_SWITCH_DENIED: 'Cambio de espacio rechazado',
  COMPANY_CREATE: 'Alta de empresa',
  COMPANY_UPDATE: 'Modificación de empresa',
  COMPANY_ARCHIVE: 'Empresa archivada',
  COMPANY_ACTIVATE: 'Empresa reactivada',
  EMPLOYEE_CREATE: 'Alta de empleado',
  EMPLOYEE_INLINE_UPDATE: 'Edición de empleado',
  EMPLOYEE_BULK_UPDATE: 'Edición masiva de empleados',
  IMPORT_STAGING_CREATE: 'Archivo cargado para revisión',
  IMPORT_BATCH_CONFIRM: 'Importación confirmada',
  PAYROLL_PERIOD_CREATE: 'Apertura de período',
  PAYROLL_NOVELTIES_SAVE: 'Carga de novedades',
  PAYROLL_CALCULATE: 'Cálculo de liquidación',
  PAYROLL_APPROVE_IMMUTABLE: 'Liquidación aprobada',
};

function humanizeAction(code: string): string {
  return (
    AUDIT_ACTION_LABELS[code] ??
    code
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase())
  );
}

function formatCuit(raw: string): string {
  const d = (raw ?? '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : raw;
}

function formatDateTime(raw: string | Date): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  ARCA_LSD_TXT: 'Libro de Sueldos (TXT)',
  IMPORT_SOURCE_EXCEL: 'Planilla Excel',
  IMPORT_SOURCE_CSV: 'Planilla CSV',
  IMPORT_SOURCE_PDF: 'PDF importado',
};

export function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [registrationWorkspace, setRegistrationWorkspace] = useState<string | null>(null);
  const [registrationForm, setRegistrationForm] = useState({
    firstName: '',
    lastName: '',
    username: '',
    password: '',
  });
  const [user, setUser] = useState<{
    id: string;
    email: string;
    fullName: string;
  } | null>(null);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [roleCode, setRoleCode] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<WorkspaceMembershipDto[]>([]);
  const [rlsInfo, setRlsInfo] = useState<{
    current_db_user: string;
    verified_tenant_id: string | null;
  } | null>(null);

  // Navigation state
  const [activeSection, setActiveSection] = useState<MainSection>('DASHBOARD');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    null
  );
  const [activeCompanyTab, setActiveCompanyTab] =
    useState<CompanyTab>('EMPLOYEES');

  // Data state
  const [companies, setCompanies] = useState<CompanyDto[]>([]);
  const [selectedCompanyDetail, setSelectedCompanyDetail] =
    useState<CompanyDetailResponseDto | null>(null);
  const [companyEmployees, setCompanyEmployees] = useState<
    EmployeeGridRowDto[]
  >([]);
  const [categories, setCategories] = useState<CategoryCatalogItemDto[]>([]);
  const [cbas, setCbas] = useState<
    Array<{
      id: string;
      tenantId: string | null;
      scope: 'GLOBAL' | 'TENANT';
      code: string;
      name: string;
      branchCode: string | null;
      branchName: string | null;
    }>
  >([]);
  const [documentsList, setDocumentsList] = useState<
    Array<{
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
    }>
  >([]);
  const [auditLogs, setAuditLogs] = useState<
    Array<{
      id: string;
      tenant_id: string;
      user_id: string | null;
      action: string;
      module: string;
      target_table: string;
      target_id: string | null;
      outcome: string;
      created_at: string;
    }>
  >([]);
  const [managedUsers, setManagedUsers] = useState<
    Array<{
      id: string;
      username: string;
      full_name: string;
      email: string;
      status: string;
      created_at: string;
    }>
  >([]);
  const [showManagedUserModal, setShowManagedUserModal] = useState(false);
  const [managedUserForm, setManagedUserForm] = useState({
    firstName: '',
    lastName: '',
    username: '',
    password: '',
  });
  const [dashboardSummary, setDashboardSummary] = useState<{
    companiesCount: number;
    activeCompaniesCount: number;
    employeesCount: number;
    activeEmployeesCount: number;
    payrollsCount: number;
    payslipsCount: number;
    documentsCount: number;
    stagingBatchesCount: number;
  } | null>(null);

  // Companies table filters & sorting
  const [companySearch, setCompanySearch] = useState('');
  const [companyStatusFilter, setCompanyStatusFilter] = useState<string>('ALL');
  const [companySortField, setCompanySortField] = useState<
    'legalName' | 'cuit' | 'employeesCount' | 'isActive' | 'updatedAt'
  >('legalName');
  const [companySortAsc, setCompanySortAsc] = useState(true);

  // Modals state
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyDto | null>(null);
  const [compForm, setCompForm] = useState({
    cuit: '',
    legalName: '',
    tradeName: '',
    fiscalAddress: '',
    locality: 'Trenque Lauquen',
    province: 'Buenos Aires',
    primaryActivity: 'Industria Metalúrgica',
  });

  const [dossierTarget, setDossierTarget] = useState<{
    employeeId: string;
    label: string;
  } | null>(null);
  const [importModalTarget, setImportModalTarget] = useState<
    'EMPLOYEES' | 'COMPANIES' | null
  >(null);

  const loadWorkspaceData = async (keepSelectedCompanyId?: string | null) => {
    const [me, compRes, catRes, cbaRes, dashRes, docsRes, auditRes] =
      await Promise.all([
        desktopApiClient.getMe(),
        desktopApiClient.listCompanies(),
        desktopApiClient.listCategories(),
        desktopApiClient.listCbas(),
        desktopApiClient.getDashboardSummary(),
        desktopApiClient.listDocuments(),
        desktopApiClient.listAuditLogs(),
      ]);

    setUser(me.user);
    setActiveTenantId(me.activeTenantId);
    setRoleCode(me.roleCode);
    setMemberships(me.memberships);
    setRlsInfo(me.rlsContext);
    setCompanies(compRes.companies);
    setCategories(catRes.categories);
    setCbas(cbaRes.cbas);
    setDashboardSummary(dashRes.summary);
    setDocumentsList(docsRes.documents);
    setAuditLogs(auditRes.logs);
    if (me.roleCode === 'OWNER') {
      const usersRes = await desktopApiClient.listManagedUsers();
      setManagedUsers(usersRes.users);
    } else {
      setManagedUsers([]);
    }

    const targetId =
      keepSelectedCompanyId !== undefined
        ? keepSelectedCompanyId
        : selectedCompanyId;
    if (targetId) {
      await loadSelectedCompany(targetId);
    }
  };

  const loadSelectedCompany = async (companyId: string) => {
    const [detailRes, empRes] = await Promise.all([
      desktopApiClient.getCompanyDetail(companyId),
      desktopApiClient.listEmployees(companyId),
    ]);
    setSelectedCompanyId(companyId);
    setSelectedCompanyDetail(detailRes);
    setCompanyEmployees(empRes.employees);
  };

  useEffect(() => {
    (async () => {
      try {
        const me = await desktopApiClient.getMe();
        setUser(me.user);
        setActiveTenantId(me.activeTenantId);
        setRoleCode(me.roleCode);
        setMemberships(me.memberships);
        setRlsInfo(me.rlsContext);
        if (me.activeTenantId) {
          await loadWorkspaceData(null);
        }
      } catch {
        await clearSessionTokenSecure();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await desktopApiClient.login({
        email,
        password,
        deviceName: 'web-browser',
      });
      await saveSessionTokenSecure(res.sessionToken);
      setUser(res.user);
      setActiveTenantId(res.activeTenantId);
      setMemberships(res.memberships);
      if (res.activeTenantId) {
        await loadWorkspaceData(null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error de autenticación'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleWorkspaceRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await desktopApiClient.registerWorkspaceUser({
        ...registrationForm,
        workspaceSlug: registrationWorkspace ?? '',
      });
      setEmail(registrationForm.username);
      setPassword('');
      setRegistrationForm({ firstName: '', lastName: '', username: '', password: '' });
      setRegistrationWorkspace(null);
      setError('Usuario creado. Ahora ingresá con tu usuario y contraseña.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar el registro');
    }
  };

  const handleSelectWorkspace = async (tenantId: string) => {
    setError(null);
    setLoading(true);
    try {
      await desktopApiClient.selectWorkspace(tenantId);
      setSelectedCompanyId(null);
      setSelectedCompanyDetail(null);
      await loadWorkspaceData(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error al cambiar espacio de trabajo'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await desktopApiClient.logout();
    } catch {
      // Ignore
    }
    await clearSessionTokenSecure();
    setUser(null);
    setActiveTenantId(null);
    setSelectedCompanyId(null);
    setSelectedCompanyDetail(null);
    setCompanies([]);
    setManagedUsers([]);
  };

  const handleCreateManagedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await desktopApiClient.createManagedUser(managedUserForm);
      setManagedUserForm({ firstName: '', lastName: '', username: '', password: '' });
      setShowManagedUserModal(false);
      await loadWorkspaceData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al dar de alta el usuario';
      if (message.toLowerCase().includes('sesión') || message.toLowerCase().includes('session')) {
        await clearSessionTokenSecure();
        setUser(null);
        setActiveTenantId(null);
        setMemberships([]);
      }
      setError(message);
    }
  };

  const handleRemoveManagedUser = async (managedUser: {
    id: string;
    full_name: string;
  }) => {
    if (!window.confirm(`¿Eliminar el acceso de ${managedUser.full_name}?`)) return;
    setError(null);
    try {
      await desktopApiClient.removeManagedUser(managedUser.id);
      await loadWorkspaceData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar el usuario');
    }
  };

  const openNewCompanyModal = () => {
    setEditingCompany(null);
    setCompForm({
      cuit: '',
      legalName: '',
      tradeName: '',
      fiscalAddress: '',
      locality: 'Trenque Lauquen',
      province: 'Buenos Aires',
      primaryActivity: 'Industria Metalúrgica',
    });
    setShowCompanyModal(true);
  };

  const openEditCompanyModal = (comp: CompanyDto) => {
    setEditingCompany(comp);
    setCompForm({
      cuit: comp.cuit,
      legalName: comp.legalName,
      tradeName: comp.tradeName ?? '',
      fiscalAddress: comp.fiscalAddress ?? comp.arcaDomicilioExplotacion ?? '',
      locality: comp.locality ?? 'Trenque Lauquen',
      province: comp.province ?? 'Buenos Aires',
      primaryActivity: comp.primaryActivity ?? 'Industria Metalúrgica',
    });
    setShowCompanyModal(true);
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editingCompany) {
        await desktopApiClient.updateCompany(editingCompany.id, {
          cuit: compForm.cuit,
          legalName: compForm.legalName,
          tradeName: compForm.tradeName || null,
          fiscalAddress: compForm.fiscalAddress || undefined,
          locality: compForm.locality || undefined,
          province: compForm.province || undefined,
          primaryActivity: compForm.primaryActivity || null,
        });
      } else {
        await desktopApiClient.createCompany({
          cuit: compForm.cuit,
          legalName: compForm.legalName,
          tradeName: compForm.tradeName || null,
          fiscalAddress: compForm.fiscalAddress || undefined,
          locality: compForm.locality || undefined,
          province: compForm.province || undefined,
          primaryActivity: compForm.primaryActivity || null,
        });
      }
      setShowCompanyModal(false);
      await loadWorkspaceData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al guardar empresa'
      );
    }
  };

  const handleToggleCompanyStatus = async (comp: CompanyDto) => {
    try {
      await desktopApiClient.updateCompany(comp.id, {
        isActive: !comp.isActive,
      });
      await loadWorkspaceData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error al cambiar estado de empresa'
      );
    }
  };

  const filteredCompanies = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    const list = companies.filter((c) => {
      if (companyStatusFilter === 'ACTIVE' && !c.isActive) return false;
      if (companyStatusFilter === 'ARCHIVED' && c.isActive) return false;
      if (!q) return true;
      return (
        c.legalName.toLowerCase().includes(q) ||
        (c.tradeName ?? '').toLowerCase().includes(q) ||
        c.cuit.toLowerCase().includes(q) ||
        (c.arcaDomicilioExplotacion ?? '').toLowerCase().includes(q)
      );
    });
    list.sort((a, b) => {
      if (companySortField === 'employeesCount') {
        const ca = a.employeesCount ?? 0;
        const cb = b.employeesCount ?? 0;
        return companySortAsc ? ca - cb : cb - ca;
      }
      const va = String(a[companySortField] ?? '').toLowerCase();
      const vb = String(b[companySortField] ?? '').toLowerCase();
      if (va < vb) return companySortAsc ? -1 : 1;
      if (va > vb) return companySortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [
    companies,
    companySearch,
    companyStatusFilter,
    companySortField,
    companySortAsc,
  ]);

  const toggleCompanySort = (
    field: 'legalName' | 'cuit' | 'employeesCount' | 'isActive' | 'updatedAt'
  ) => {
    if (companySortField === field) {
      setCompanySortAsc(!companySortAsc);
    } else {
      setCompanySortField(field);
      setCompanySortAsc(true);
    }
  };

  if (loading) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h2>AR-PAYROLL</h2>
          <p className="text-muted">
            Cargando entorno seguro PostgreSQL 16 + RLS...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="brand-badge">AR-PAYROLL · ESTUDIO CONTABLE</div>
          <h2>Ingreso al Sistema de Liquidación y Personal</h2>
          <p className="text-muted">
            Aplicación web segura con PostgreSQL 16 y sesiones protegidas en el navegador.
          </p>

          {error && <div className="alert-error">{error}</div>}

          <div className="btn-row" style={{ marginBottom: '1rem' }}>
            <button
              type="button"
              className={`btn ${authMode === 'LOGIN' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setAuthMode('LOGIN');
                setRegistrationWorkspace(null);
                setError(null);
              }}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              className={`btn ${authMode === 'REGISTER' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setAuthMode('REGISTER');
                setError(null);
              }}
            >
              Registrarse
            </button>
          </div>

          {authMode === 'REGISTER' && !registrationWorkspace ? (
            <div>
              <div className="btn-row">
                <button type="button" className="btn btn-secondary" onClick={() => setRegistrationWorkspace('estudio-papa')}>
                  CR. Alejandro Leal
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setRegistrationWorkspace('estudio-socio')}>
                  CR. Jorge Lopez
                </button>
              </div>
            </div>
          ) : authMode === 'REGISTER' && registrationWorkspace ? (
            <form onSubmit={(e) => void handleWorkspaceRegistration(e)}>
              <p className="text-muted">
                Registro para {registrationWorkspace === 'estudio-papa' ? 'CR. Alejandro Leal' : 'CR. Jorge Lopez'}.
              </p>
              <div className="form-group">
                <label>Nombre</label>
                <input value={registrationForm.firstName} onChange={(e) => setRegistrationForm({ ...registrationForm, firstName: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Apellido</label>
                <input value={registrationForm.lastName} onChange={(e) => setRegistrationForm({ ...registrationForm, lastName: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Usuario</label>
                <input value={registrationForm.username} onChange={(e) => setRegistrationForm({ ...registrationForm, username: e.target.value })} pattern="[a-zA-Z0-9._-]+" required />
              </div>
              <div className="form-group">
                <label>Contraseña</label>
                <input type="password" minLength={8} value={registrationForm.password} onChange={(e) => setRegistrationForm({ ...registrationForm, password: e.target.value })} required />
              </div>
              <div className="btn-row">
                <button type="button" className="btn btn-secondary" onClick={() => setRegistrationWorkspace(null)}>Volver</button>
                <button type="submit" className="btn btn-primary">Registrarme</button>
              </div>
            </form>
          ) : (
          <form onSubmit={(e) => void handleLogin(e)}>
            <div className="form-group">
              <label>Usuario o correo electrónico</label>
              <input
                type="text"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block">
              Iniciar sesión segura
            </button>
          </form>
          )}

        </div>
      </div>
    );
  }

  const activeMembership = memberships.find(
    (m) => m.tenantId === activeTenantId
  );

  return (
    <div className={`app-layout${mobileMenuOpen ? ' mobile-menu-open' : ''}`}>
      {mobileMenuOpen && (
        <button
          type="button"
          className="mobile-menu-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      {/* Compact 6-Section Left Sidebar */}
      <aside className="app-sidebar">
        <button
          type="button"
          className="mobile-sidebar-close"
          aria-label="Cerrar menú"
          onClick={() => setMobileMenuOpen(false)}
        >
          ×
        </button>
        <div className="sidebar-brand">
          <div className="brand-title">AR-PAYROLL</div>
          <div className="brand-subtitle">
            Gestión tipo Planilla · PostgreSQL 16
          </div>
        </div>

        <nav className="sidebar-nav">
          {SIDEBAR_SECTIONS.filter((sec) => sec.id !== 'USERS' || roleCode === 'OWNER').map((sec) => (
            <button
              key={sec.id}
              className={`sidebar-link ${
                activeSection === sec.id ? 'active' : ''
              }`}
              onClick={() => {
                setActiveSection(sec.id);
                setMobileMenuOpen(false);
                if (sec.id !== 'COMPANIES') {
                  setSelectedCompanyId(null);
                }
              }}
            >
              <span className="sidebar-num">{sec.icon}</span>
              <span>{sec.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-pill">
            <strong>{user.fullName}</strong>
            <span>
              {user.email} ({roleCode})
            </span>
          </div>
          {memberships.length > 1 && (
            <select
              value={activeTenantId ?? ''}
              onChange={(e) => void handleSelectWorkspace(e.target.value)}
              style={{ marginTop: '0.4rem', width: '100%' }}
            >
              {memberships.map((m) => (
                <option key={m.tenantId} value={m.tenantId}>
                  {m.tenantDisplayName}
                </option>
              ))}
            </select>
          )}
          <button
            className="btn btn-secondary btn-sm btn-block"
            style={{ marginTop: '0.5rem' }}
            onClick={() => void handleLogout()}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="app-main">
        {/* Top Header with Breadcrumb Navigation */}
        <header className="app-topbar">
          <button
            type="button"
            className="mobile-menu-button"
            aria-label="Abrir menú"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          >
            ☰
          </button>
          <div className="breadcrumb-bar">
            <span
              className="breadcrumb-item clickable"
              onClick={() => {
                setActiveSection('COMPANIES');
                setSelectedCompanyId(null);
              }}
            >
              🏢 {activeMembership?.tenantDisplayName ?? 'Instalación local'}
            </span>
            <span className="breadcrumb-sep">→</span>
            <span
              className="breadcrumb-item clickable"
              onClick={() => {
                if (activeSection === 'COMPANIES') {
                  setSelectedCompanyId(null);
                }
              }}
            >
              {SIDEBAR_SECTIONS.find((s) => s.id === activeSection)?.label}
            </span>
            {activeSection === 'COMPANIES' && selectedCompanyDetail && (
              <>
                <span className="breadcrumb-sep">→</span>
                <span
                  className="breadcrumb-item clickable"
                  onClick={() => setActiveCompanyTab('EMPLOYEES')}
                >
                  <strong>{selectedCompanyDetail.company.legalName}</strong>
                </span>
                <span className="breadcrumb-sep">→</span>
                <span className="breadcrumb-item active">
                  {COMPANY_TABS.find((t) => t.id === activeCompanyTab)?.label}
                </span>
              </>
            )}
            {dossierTarget && (
              <>
                <span className="breadcrumb-sep">→</span>
                <span className="breadcrumb-item active">
                  {dossierTarget.label}
                </span>
              </>
            )}
          </div>

          <div className="topbar-security">
            <strong style={{ marginRight: '1rem' }}>Hola Cr. {user.fullName}</strong>
            <span className="badge badge-success">
              🔒 RLS: {rlsInfo?.current_db_user ?? 'app_tenant_user'} · Sesión web
            </span>
          </div>
        </header>

        {error && (
          <div className="alert-error" style={{ margin: '0.75rem 1.25rem 0' }}>
            {error}
          </div>
        )}

        <main className="app-content">
          {/* SECTION 1: PANEL PRINCIPAL */}
          {activeSection === 'DASHBOARD' && (
            <div className="section-container">
              <div className="section-header">
                <div>
                  <h2>1. Panel Principal del Estudio</h2>
                  <p className="text-muted">
                    Resumen operativo en tiempo real de su instalación local (`
                    {activeMembership?.tenantDisplayName}`).
                  </p>
                </div>
                <div className="btn-row">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setImportModalTarget('COMPANIES')}
                  >
                    📥 Importar archivo (Excel / CSV / PDF)
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setActiveSection('COMPANIES');
                      setSelectedCompanyId(null);
                    }}
                  >
                    Ir a Empresas y Empleados →
                  </button>
                </div>
              </div>

              <div className="kpi-grid">
                <div
                  className="kpi-card clickable"
                  onClick={() => {
                    setActiveSection('COMPANIES');
                    setSelectedCompanyId(null);
                  }}
                >
                  <span className="kpi-label">Empresas Registradas</span>
                  <strong className="kpi-value">
                    {dashboardSummary?.companiesCount ?? companies.length}
                  </strong>
                  <span className="text-muted">
                    Clic para abrir planilla de empresas
                  </span>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Empleados Activos</span>
                  <strong className="kpi-value text-success">
                    {dashboardSummary?.activeEmployeesCount ?? 0}
                  </strong>
                  <span className="text-muted">
                    Total legajos: {dashboardSummary?.employeesCount ?? 0}
                  </span>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Liquidaciones y Recibos</span>
                  <strong className="kpi-value">
                    {dashboardSummary?.payrollsCount ?? 0} /{' '}
                    {dashboardSummary?.payslipsCount ?? 0}
                  </strong>
                  <span className="text-muted">
                    Con snapshot normativo inmutable
                  </span>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">
                    Lotes Importados / Documentos
                  </span>
                  <strong className="kpi-value">
                    {dashboardSummary?.stagingBatchesCount ?? 0} /{' '}
                    {dashboardSummary?.documentsCount ?? 0}
                  </strong>
                  <span className="text-muted">
                    Staging validado + Hash SHA-256
                  </span>
                </div>
              </div>

              <h3 style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>
                Acceso rápido a Empresas del Espacio de Trabajo
              </h3>
              <div className="spreadsheet-container">
                <table className="spreadsheet-table">
                  <thead>
                    <tr>
                      <th>Razón Social</th>
                      <th>Nombre Comercial</th>
                      <th>CUIT</th>
                      <th>Domicilio</th>
                      <th>Empleados</th>
                      <th>Estado</th>
                      <th>Acción Rápida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.legalName}</strong>
                        </td>
                        <td>{c.tradeName ?? '—'}</td>
                        <td className="mono">{c.cuit}</td>
                        <td>{c.arcaDomicilioExplotacion ?? '—'}</td>
                        <td className="mono">
                          <strong>{c.activeEmployeesCount ?? 0}</strong> activos
                          ({c.employeesCount ?? 0} total)
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              c.isActive ? 'badge-success' : 'badge-danger'
                            }`}
                          >
                            {c.isActive ? 'ACTIVE' : 'ARCHIVED'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-primary btn-xs"
                            onClick={() => {
                              setActiveSection('COMPANIES');
                              setActiveCompanyTab('EMPLOYEES');
                              void loadSelectedCompany(c.id);
                            }}
                          >
                            Abrir planilla de empleados →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SECTION 2: EMPRESAS (LISTA O EMPRESA SELECCIONADA) */}
          {activeSection === 'COMPANIES' && !selectedCompanyId && (
            <div className="section-container">
              <div className="section-header">
                <div>
                  <h2>2. Empresas del Espacio de Trabajo</h2>
                  <p className="text-muted">
                    Seleccione una empresa para abrir su planilla tipo Excel de empleados, convenios, novedades y liquidaciones.
                  </p>
                </div>
                <div className="btn-row">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setImportModalTarget('COMPANIES')}
                  >
                    📥 Importar archivo
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={openNewCompanyModal}
                  >
                    + Nueva empresa
                  </button>
                </div>
              </div>

              <div className="spreadsheet-toolbar">
                <div className="toolbar-left">
                  <input
                    className="search-input"
                    placeholder="Buscar empresa por razón social, nombre comercial, CUIT o domicilio..."
                    value={companySearch}
                    onChange={(e) => setCompanySearch(e.target.value)}
                  />
                  <select
                    value={companyStatusFilter}
                    onChange={(e) => setCompanyStatusFilter(e.target.value)}
                  >
                    <option value="ALL">Todos los estados</option>
                    <option value="ACTIVE">Activas (ACTIVE)</option>
                    <option value="ARCHIVED">Archivadas (ARCHIVED)</option>
                  </select>
                </div>
              </div>

              <div className="spreadsheet-container">
                <table className="spreadsheet-table">
                  <thead>
                    <tr>
                      <th onClick={() => toggleCompanySort('legalName')}>
                        Razón social{' '}
                        {companySortField === 'legalName'
                          ? companySortAsc
                            ? '▲'
                            : '▼'
                          : ''}
                      </th>
                      <th>Nombre comercial</th>
                      <th onClick={() => toggleCompanySort('cuit')}>
                        CUIT{' '}
                        {companySortField === 'cuit'
                          ? companySortAsc
                            ? '▲'
                            : '▼'
                          : ''}
                      </th>
                      <th>Domicilio</th>
                      <th onClick={() => toggleCompanySort('employeesCount')}>
                        Cantidad de empleados{' '}
                        {companySortField === 'employeesCount'
                          ? companySortAsc
                            ? '▲'
                            : '▼'
                          : ''}
                      </th>
                      <th onClick={() => toggleCompanySort('isActive')}>
                        Estado{' '}
                        {companySortField === 'isActive'
                          ? companySortAsc
                            ? '▲'
                            : '▼'
                          : ''}
                      </th>
                      <th onClick={() => toggleCompanySort('updatedAt')}>
                        Última modificación{' '}
                        {companySortField === 'updatedAt'
                          ? companySortAsc
                            ? '▲'
                            : '▼'
                          : ''}
                      </th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompanies.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="empty-state">
                          No se encontraron empresas con el filtro actual.
                        </td>
                      </tr>
                    ) : (
                      filteredCompanies.map((comp) => (
                        <tr
                          key={comp.id}
                          onDoubleClick={() => {
                            setActiveCompanyTab('EMPLOYEES');
                            void loadSelectedCompany(comp.id);
                          }}
                        >
                          <td>
                            <strong>{comp.legalName}</strong>
                          </td>
                          <td>{comp.tradeName ?? '—'}</td>
                          <td className="mono">{comp.cuit}</td>
                          <td>{comp.arcaDomicilioExplotacion ?? '—'}</td>
                          <td className="mono">
                            <strong>{comp.activeEmployeesCount ?? 0}</strong>{' '}
                            activos ({comp.employeesCount ?? 0} total)
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                comp.isActive ? 'badge-success' : 'badge-danger'
                              }`}
                            >
                              {comp.isActive ? 'ACTIVE' : 'ARCHIVED'}
                            </span>
                          </td>
                          <td className="mono">
                            {(comp.updatedAt ?? '').slice(0, 10)}
                          </td>
                          <td>
                            <div className="btn-row">
                              <button
                                className="btn btn-primary btn-xs"
                                onClick={() => {
                                  setActiveCompanyTab('EMPLOYEES');
                                  void loadSelectedCompany(comp.id);
                                }}
                              >
                                Abrir empresa
                              </button>
                              <button
                                className="btn btn-secondary btn-xs"
                                onClick={() => openEditCompanyModal(comp)}
                              >
                                Editar
                              </button>
                              <button
                                className="btn btn-secondary btn-xs"
                                onClick={() =>
                                  void handleToggleCompanyStatus(comp)
                                }
                              >
                                {comp.isActive ? 'Archivar' : 'Activar'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}

                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeSection === 'VACATIONS' && (
            <VacationWorkspace companies={companies} onError={setError} />
          )}

          {/* SELECTED COMPANY CENTRALIZED VIEW (7 INTERNAL TABS) */}
          {activeSection === 'COMPANIES' &&
            selectedCompanyId &&
            selectedCompanyDetail && (
              <div className="section-container">
                {/* Centralized Company Header */}
                <div className="company-header-card">
                  <div className="company-header-main">
                    <div>
                      <div
                        className="btn-row"
                        style={{ marginBottom: '0.35rem' }}
                      >
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => {
                            setSelectedCompanyId(null);
                            setSelectedCompanyDetail(null);
                          }}
                        >
                          ← Volver a Empresas
                        </button>
                        <span
                          className={`badge ${
                            selectedCompanyDetail.company.isActive
                              ? 'badge-success'
                              : 'badge-danger'
                          }`}
                        >
                          {selectedCompanyDetail.company.isActive
                            ? 'ACTIVE'
                            : 'ARCHIVED'}
                        </span>
                        <span className="mono text-muted">
                          CUIT:{' '}
                          <strong>{selectedCompanyDetail.company.cuit}</strong>
                        </span>
                      </div>
                      <h2>{selectedCompanyDetail.company.legalName}</h2>
                      <p className="text-muted">
                        📍 Domicilio:{' '}
                        <strong>
                          {selectedCompanyDetail.company
                            .arcaDomicilioExplotacion ?? 'Sin domicilio'}
                        </strong>{' '}
                        · Empleados activos:{' '}
                        <strong>
                          {selectedCompanyDetail.company.activeEmployeesCount ??
                            0}
                        </strong>{' '}
                        (de{' '}
                        {selectedCompanyDetail.company.employeesCount ?? 0}) ·
                        Período actual:{' '}
                        <strong>
                          {selectedCompanyDetail.company.currentPeriodLabel ??
                            '2026-10'}
                        </strong>
                      </p>
                    </div>

                    <div className="btn-row">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() =>
                          openEditCompanyModal(selectedCompanyDetail.company)
                        }
                      >
                        Editar empresa
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setImportModalTarget('EMPLOYEES')}
                      >
                        📥 Importar empleados (Excel / CSV / PDF)
                      </button>
                    </div>
                  </div>

                  {/* 7 Internal Company Tabs */}
                  <div className="company-tabs">
                    {COMPANY_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        className={`company-tab-btn ${
                          activeCompanyTab === tab.id ? 'active' : ''
                        }`}
                        onClick={() => setActiveCompanyTab(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* TAB 1: GENERAL */}
                {activeCompanyTab === 'GENERAL' && (
                  <div className="tab-panel">
                    <div className="form-grid-3">
                      <div className="info-box">
                        <span className="info-label">Razón Social</span>
                        <strong>{selectedCompanyDetail.company.legalName}</strong>
                        <span className="text-muted">
                          Nombre comercial:{' '}
                          {selectedCompanyDetail.company.tradeName ?? '—'}
                        </span>
                      </div>
                      <div className="info-box">
                        <span className="info-label">
                          Identificación Fiscal (ARCA)
                        </span>
                        <strong className="mono">
                          {selectedCompanyDetail.company.cuit}
                        </strong>
                        <span className="text-muted">
                          Actividad:{' '}
                          {selectedCompanyDetail.company.primaryActivity ??
                            'Industria Metalúrgica'}
                        </span>
                      </div>
                      <div className="info-box">
                        <span className="info-label">
                          Domicilio de Explotación
                        </span>
                        <strong>
                          {selectedCompanyDetail.company
                            .arcaDomicilioExplotacion ?? '—'}
                        </strong>
                        <span className="text-muted">
                          ART: {selectedCompanyDetail.company.artName ?? '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: EMPLEADOS (EXCEL-LIKE GRID) */}
                {activeCompanyTab === 'EMPLOYEES' && (
                  <EmployeesSpreadsheetGrid
                    companyId={selectedCompanyDetail.company.id}
                    companyName={selectedCompanyDetail.company.legalName}
                    employees={companyEmployees}
                    categories={categories}
                    onRefresh={async () => {
                      await loadSelectedCompany(
                        selectedCompanyDetail.company.id
                      );
                      await loadWorkspaceData(selectedCompanyDetail.company.id);
                    }}
                    onOpenDossier={(empId, label) =>
                      setDossierTarget({ employeeId: empId, label })
                    }
                    onOpenImport={() => setImportModalTarget('EMPLOYEES')}
                  />
                )}

                {/* TAB 3: CONVENIOS Y ESCALAS */}
                {activeCompanyTab === 'CONVENIOS' && (
                  <div className="tab-panel">
                    <h4>Convenios Colectivos y Escalas Vigentes Aplicables</h4>
                    <table className="spreadsheet-table">
                      <thead>
                        <tr>
                          <th>Código CCT</th>
                          <th>Nombre del Convenio</th>
                          <th>Rama</th>
                          <th>Categoría</th>
                          <th>Valor Hora</th>
                          <th>Básico Mensual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categories.map((cat) => (
                          <tr key={cat.id}>
                            <td className="mono">
                              <strong>{cat.cct_number}</strong>
                            </td>
                            <td>{cat.agreement_name}</td>
                            <td>{cat.branch_name}</td>
                            <td>
                              <strong>{cat.name}</strong> ({cat.code})
                            </td>
                            <td className="mono">
                              {cat.hourly_rate ? `$${cat.hourly_rate}` : '—'}
                            </td>
                            <td className="mono">
                              {cat.monthly_basic
                                ? `$${cat.monthly_basic}`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* TABS 4, 5, 6 & 7: NOVEDADES, LIQUIDACIONES, RECIBOS Y LIBRO DE SUELDOS DIGITAL */}
                {(activeCompanyTab === 'NOVEDADES' ||
                  activeCompanyTab === 'LIQUIDACIONES' ||
                  activeCompanyTab === 'RECIBOS' ||
                  activeCompanyTab === 'LSD') && (
                  <CompanyPayrollsWorkspace
                    companyId={selectedCompanyDetail.company.id}
                    companyName={selectedCompanyDetail.company.legalName}
                    companyCuit={selectedCompanyDetail.company.cuit}
                    companyAddress={
                      selectedCompanyDetail.company.arcaDomicilioExplotacion ??
                      'Av. Sabattini 3200 — Córdoba Capital'
                    }
                    activeTab={activeCompanyTab}
                    onChangeTab={(tab) => setActiveCompanyTab(tab)}
                    employees={companyEmployees}
                    onRefreshCompany={async () => {
                      await loadSelectedCompany(
                        selectedCompanyDetail.company.id
                      );
                      await loadWorkspaceData(selectedCompanyDetail.company.id);
                    }}
                  />
                )}
              </div>
            )}

          {/* SECTION 3: LIQUIDACIONES GLOBAL */}
          {activeSection === 'PAYROLLS' && (
            <div className="section-container">
              <div className="section-header">
                <div>
                  <h2>3. Motor de Liquidaciones Versionado e Inmutable</h2>
                  <p className="text-muted">
                    Soporte para 1ra Quincena, 2da Quincena, Mensual, SAC, Vacaciones, Liquidación Final y Rectificativas con snapshot JSONB inmutable.
                  </p>
                </div>
              </div>
              <div className="spreadsheet-container">
                <table className="spreadsheet-table">
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>CUIT</th>
                      <th>Empleados Activos</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.legalName}</strong>
                        </td>
                        <td className="mono">{c.cuit}</td>
                        <td className="mono">{c.activeEmployeesCount ?? 0}</td>
                        <td>
                          <button
                            className="btn btn-primary btn-xs"
                            onClick={() => {
                              setActiveSection('COMPANIES');
                              setActiveCompanyTab('LIQUIDACIONES');
                              void loadSelectedCompany(c.id);
                            }}
                          >
                            Abrir liquidaciones de empresa →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SECTION 4: RECIBOS Y DOCUMENTACION */}
          {activeSection === 'DOCUMENTS' && (
            <div className="section-container">
              <div className="section-header">
                <div>
                  <h2>4. Recibos y Documentación Digital (`documents`)</h2>
                  <p className="text-muted">
                    Repositorio documental local con verificación criptográfica SHA-256 de archivos PDF, Excel y CSV importados.
                  </p>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => setImportModalTarget('COMPANIES')}
                >
                  📥 Importar nuevo documento PDF / Excel
                </button>
              </div>
              <div className="spreadsheet-container">
                <table className="spreadsheet-table">
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th>Tipo</th>
                      <th>Archivo</th>
                      <th>Tamaño</th>
                      <th>Hash SHA-256</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentsList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="empty-state">
                          No hay documentos registrados aún. Importe un PDF o Excel para ver su registro SHA-256.
                        </td>
                      </tr>
                    ) : (
                      documentsList.map((d) => (
                        <tr key={d.id}>
                          <td>
                            <strong>{d.title}</strong>
                          </td>
                          <td>
                            <span className="badge badge-neutral">
                              {d.document_type}
                            </span>
                          </td>
                          <td>{d.original_filename}</td>
                          <td className="mono">
                            {(Number(d.size_bytes) / 1024).toFixed(1)} KB
                          </td>
                          <td className="mono">
                            {d.sha256_hash.slice(0, 20)}…
                          </td>
                          <td className="mono">
                            {String(d.created_at).slice(0, 19).replace('T', ' ')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SECTION 5: REPORTES */}
          {activeSection === 'REPORTS' && (
            <div className="section-container">
              <div className="section-header">
                <div>
                  <h2>5. Reportes y Resumen de Plantillas</h2>
                  <p className="text-muted">
                    Consolidado de dotación, costos laborales y estado de padrones por empresa.
                  </p>
                </div>
              </div>
              <div className="spreadsheet-container">
                <table className="spreadsheet-table">
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>CUIT</th>
                      <th>Dotación Activa</th>
                      <th>Dotación Total</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.legalName}</strong>
                        </td>
                        <td className="mono">{c.cuit}</td>
                        <td className="mono">{c.activeEmployeesCount ?? 0}</td>
                        <td className="mono">{c.employeesCount ?? 0}</td>
                        <td>
                          <span className="badge badge-success">
                            {c.isActive ? 'ACTIVE' : 'ARCHIVED'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SECTION 6: AUDITORIA Y SEGURIDAD */}
          {activeSection === 'AUDIT' && (
            <div className="section-container">
              <div className="section-header">
                <div>
                  <h2>6. Auditoría y Seguridad Multi-Tenant (`audit_logs`)</h2>
                  <p className="text-muted">
                    Registro inmutable de todas las altas, ediciones en línea, acciones masivas e importaciones confirmadas en la instalación local `
                    {activeTenantId}`.
                  </p>
                </div>
              </div>
              <div className="spreadsheet-container">
                <table className="spreadsheet-table">
                  <thead>
                    <tr>
                      <th>Fecha y Hora</th>
                      <th>Acción</th>
                      <th>Módulo</th>
                      <th>Tabla</th>
                      <th>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="mono">
                          {String(log.created_at).slice(0, 19).replace('T', ' ')}
                        </td>
                        <td>
                          <span className="badge badge-neutral">
                            {log.action}
                          </span>
                        </td>
                        <td className="mono">{log.module}</td>
                        <td className="mono">{log.target_table}</td>
                        <td>
                          <span className="badge badge-success">
                            {log.outcome}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeSection === 'USERS' && roleCode === 'OWNER' && (
            <div className="section-container">
              <div className="section-header">
                <div>
                  <h2>7. Usuarios del espacio</h2>
                  <p className="text-muted">
                    Alta de usuarios para la instalación local.
                    El usuario creado podrá iniciar sesión con su nombre de usuario.
                  </p>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowManagedUserModal(true)}
                >
                  + Dar de alta usuario
                </button>
              </div>
              <div className="spreadsheet-container">
                <table className="spreadsheet-table">
                  <thead>
                    <tr>
                      <th>Nombre y apellido</th>
                      <th>Usuario</th>
                      <th>Estado</th>
                      <th>Alta</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managedUsers.map((managedUser) => (
                      <tr key={managedUser.id}>
                        <td>{managedUser.full_name}</td>
                        <td className="mono">{managedUser.username}</td>
                        <td><span className="badge badge-success">{managedUser.status}</span></td>
                        <td>{String(managedUser.created_at).slice(0, 10)}</td>
                        <td>
                          {managedUser.id !== user.id && (
                            <button
                              className="btn btn-danger btn-xs"
                              onClick={() => void handleRemoveManagedUser(managedUser)}
                            >
                              Eliminar acceso
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {managedUsers.length === 0 && (
                      <tr><td colSpan={5} className="text-muted">Todavía no hay usuarios en este espacio.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Create / Edit Company Modal */}
      {showCompanyModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{editingCompany ? 'Editar Empresa' : 'Nueva Empresa'}</h3>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowCompanyModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={(e) => void handleSaveCompany(e)}>
              <div className="modal-body">
                <h4>1. Identificación Fiscal y Legal</h4>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Razón Social</label>
                    <input
                      value={compForm.legalName}
                      onChange={(e) =>
                        setCompForm({ ...compForm, legalName: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Nombre Comercial / Fantasía</label>
                    <input
                      value={compForm.tradeName}
                      onChange={(e) =>
                        setCompForm({ ...compForm, tradeName: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>CUIT (11 dígitos con Módulo 11)</label>
                    <input
                      className="mono"
                      placeholder="30-71009999-1"
                      value={compForm.cuit}
                      onChange={(e) =>
                        setCompForm({ ...compForm, cuit: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Actividad Principal</label>
                    <input
                      value={compForm.primaryActivity}
                      onChange={(e) =>
                        setCompForm({
                          ...compForm,
                          primaryActivity: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <h4 style={{ marginTop: '1rem' }}>
                  2. Domicilio de Explotación
                </h4>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Calle y Número</label>
                    <input
                      value={compForm.fiscalAddress}
                      onChange={(e) =>
                        setCompForm({
                          ...compForm,
                          fiscalAddress: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Localidad</label>
                    <input
                      value={compForm.locality}
                      onChange={(e) =>
                        setCompForm({ ...compForm, locality: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCompanyModal(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Guardar en PostgreSQL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showManagedUserModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Dar de alta usuario</h3>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowManagedUserModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={(e) => void handleCreateManagedUser(e)}>
              <div className="modal-body">
                <p className="text-muted">
                  Se asignará como administrador de la instalación local.
                </p>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Nombre</label>
                    <input
                      value={managedUserForm.firstName}
                      onChange={(e) => setManagedUserForm({ ...managedUserForm, firstName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Apellido</label>
                    <input
                      value={managedUserForm.lastName}
                      onChange={(e) => setManagedUserForm({ ...managedUserForm, lastName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Usuario</label>
                    <input
                      value={managedUserForm.username}
                      onChange={(e) => setManagedUserForm({ ...managedUserForm, username: e.target.value })}
                      pattern="[a-zA-Z0-9._-]+"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Contraseña</label>
                    <input
                      type="password"
                      minLength={8}
                      value={managedUserForm.password}
                      onChange={(e) => setManagedUserForm({ ...managedUserForm, password: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowManagedUserModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Crear usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 10-Section Employee Dossier Modal */}
      {dossierTarget && selectedCompanyId && (
        <EmployeeDossierModal
          companyId={selectedCompanyId}
          employeeId={dossierTarget.employeeId}
          categories={categories}
          onClose={() => setDossierTarget(null)}
          onUpdated={() => {
            void loadSelectedCompany(selectedCompanyId);
            void loadWorkspaceData(selectedCompanyId);
          }}
        />
      )}

      {/* 6-Step Import Wizard Modal (Excel / CSV / PDF) */}
      {importModalTarget && (
        <ImportWizardModal
          defaultTargetEntity={importModalTarget}
          companyId={selectedCompanyId ?? undefined}
          companyName={selectedCompanyDetail?.company.legalName}
          onClose={() => setImportModalTarget(null)}
          onCompleted={() => {
            void loadWorkspaceData(selectedCompanyId);
          }}
        />
      )}
    </div>
  );
}
