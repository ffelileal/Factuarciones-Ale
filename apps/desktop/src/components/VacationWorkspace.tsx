import { useEffect, useMemo, useState } from 'react';
import type { CompanyDto, EmployeeGridRowDto } from '@ar-payroll/contracts';
import { desktopApiClient, type VacationDto } from '../lib/apiClient.js';

interface Props {
  companies: CompanyDto[];
  onError: (message: string | null) => void;
}

function formatDate(value: string): string {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('es-AR');
}

export function VacationWorkspace({ companies, onError }: Props) {
  const [vacations, setVacations] = useState<VacationDto[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [employees, setEmployees] = useState<EmployeeGridRowDto[]>([]);
  const [form, setForm] = useState({ companyId: '', employeeId: '', startDate: '', endDate: '', observations: '' });

  const loadVacations = async () => {
    setLoading(true);
    try {
      const result = await desktopApiClient.listVacations({ companyId: companyId || undefined, year });
      setVacations(result.vacations);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudieron cargar las vacaciones.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadVacations();
  }, [companyId, year]);

  useEffect(() => {
    if (!form.companyId) {
      setEmployees([]);
      return;
    }
    void desktopApiClient.listEmployees(form.companyId)
      .then((result) => setEmployees(result.employees))
      .catch((error: unknown) => onError(error instanceof Error ? error.message : 'No se pudieron cargar los empleados.'));
  }, [form.companyId, onError]);

  const activeCount = useMemo(
    () => vacations.filter((vacation) => vacation.status === 'APPROVED').length,
    [vacations],
  );

  const submitVacation = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await desktopApiClient.addVacation(form.companyId, form.employeeId, {
        startDate: form.startDate,
        endDate: form.endDate,
        observations: form.observations || null,
      });
      setForm({ companyId: '', employeeId: '', startDate: '', endDate: '', observations: '' });
      setShowForm(false);
      onError(null);
      await loadVacations();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudieron registrar las vacaciones.');
    }
  };

  return (
    <div className="section-container">
      <div className="section-header">
        <div>
          <h2>Vacaciones de los clientes</h2>
          <p className="text-muted">
            Licencia anual ordinaria: días corridos, con trazabilidad por empresa y empleado.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cerrar' : '+ Registrar vacaciones'}
        </button>
      </div>

      <div className="info-box" style={{ marginBottom: '1rem' }}>
        <strong>Regla general LCT 20.744 (arts. 150, 151 y 154)</strong>
        <span className="text-muted">
          {' '}14 días corridos hasta 5 años; 21 hasta 10; 28 hasta 20; 35 con más de 20.
          Se otorgan entre el 1/10 y el 30/4 y comienzan lunes o día hábil siguiente.
          El convenio colectivo puede mejorar estos mínimos.
        </span>
      </div>

      {showForm && (
        <form className="panel-card" onSubmit={(event) => void submitVacation(event)} style={{ marginBottom: '1rem' }}>
          <h3>Registrar período de vacaciones</h3>
          <div className="form-grid-3">
            <div className="form-group">
              <label>Empresa</label>
              <select value={form.companyId} onChange={(event) => setForm({ ...form, companyId: event.target.value, employeeId: '' })} required>
                <option value="">Seleccione...</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.legalName}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Empleado</label>
              <select value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })} required disabled={!form.companyId}>
                <option value="">Seleccione...</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.legajo} · {employee.lastName}, {employee.firstName}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Fecha de salida</label><input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} required /></div>
            <div className="form-group"><label>Fecha de regreso</label><input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} required /></div>
            <div className="form-group"><label>Observaciones / convenio</label><input value={form.observations} onChange={(event) => setForm({ ...form, observations: event.target.value })} placeholder="Opcional" /></div>
          </div>
          <div className="modal-footer">
            <button type="submit" className="btn btn-primary">Guardar vacaciones</button>
          </div>
        </form>
      )}

      <div className="spreadsheet-toolbar">
        <div className="toolbar-left">
          <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            <option value="">Todas las empresas</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.legalName}</option>)}
          </select>
          <input type="number" min="2000" max="2100" value={year} onChange={(event) => setYear(Number(event.target.value))} />
          <span className="text-muted">{activeCount} período(s) aprobado(s)</span>
        </div>
      </div>

      <div className="spreadsheet-container">
        <table className="spreadsheet-table">
          <thead><tr><th>Empresa</th><th>Empleado</th><th>Salida</th><th>Regreso</th><th>Días corridos</th><th>Mínimo legal</th><th>Estado</th><th>Observaciones</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="empty-state">Cargando vacaciones...</td></tr> : vacations.length === 0 ? <tr><td colSpan={8} className="empty-state">No hay vacaciones registradas para el filtro.</td></tr> : vacations.map((vacation) => (
              <tr key={vacation.id}>
                <td><strong>{vacation.company_name}</strong></td>
                <td>{vacation.legajo} · {vacation.last_name}, {vacation.first_name}</td>
                <td className="mono">{formatDate(vacation.start_date)}</td>
                <td className="mono">{formatDate(vacation.end_date)}</td>
                <td className="num">{vacation.days_count}</td>
                <td className="num">{vacation.legal_entitlement_days}</td>
                <td><span className="badge badge-success">{vacation.status}</span></td>
                <td>{vacation.observations ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
