import React, { useEffect, useState } from 'react';
import {
  desktopApiClient,
  type EmployeeFullDossierResponseDto,
  type CategoryCatalogItemDto,
} from '../lib/apiClient.js';

interface EmployeeDossierModalProps {
  companyId: string;
  employeeId: string;
  categories: CategoryCatalogItemDto[];
  onClose: () => void;
  onUpdated: () => void;
}

const DOSSIER_SECTIONS = [
  { id: 1, label: 'Datos personales' },
  { id: 2, label: 'Datos laborales' },
  { id: 3, label: 'Contrato' },
  { id: 4, label: 'Historial' },
  { id: 5, label: 'Convenio y categoría' },
  { id: 6, label: 'Haberes' },
  { id: 7, label: 'Familiares' },
  { id: 8, label: 'Licencias' },
  { id: 9, label: 'Documentos' },
  { id: 10, label: 'Recibos' },
] as const;

export function EmployeeDossierModal({
  companyId,
  employeeId,
  categories,
  onClose,
  onUpdated,
}: EmployeeDossierModalProps) {
  const [activeSection, setActiveSection] = useState<number>(1);
  const [dossier, setDossier] = useState<EmployeeFullDossierResponseDto | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Editable form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dni, setDni] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [legajo, setLegajo] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [recognizedPriorYears, setRecognizedPriorYears] = useState(0);
  const [jobPosition, setJobPosition] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState<
    'ACTIVE' | 'SUSPENDED' | 'TERMINATED' | 'ON_LEAVE'
  >('ACTIVE');
  const [contractType, setContractType] = useState('TIEMPO_INDETERMINADO');
  const [remunerationModality, setRemunerationModality] = useState<
    'MENSUALIZADO' | 'JORNALIZADO'
  >('JORNALIZADO');
  const [remunerationUnit, setRemunerationUnit] = useState<'HORA' | 'DIA' | 'MES'>(
    'HORA'
  );
  const [paymentFrequency, setPaymentFrequency] = useState<
    'QUINCENAL' | 'MENSUAL' | 'SEMANAL'
  >('QUINCENAL');
  const [categoryId, setCategoryId] = useState<string>('');
  const [changeReason, setChangeReason] = useState('');

  // Family form
  const [famRelation, setFamRelation] = useState<
    'CONYUGE' | 'CONVIVIENTE' | 'HIJO' | 'OTRO'
  >('HIJO');
  const [famLastName, setFamLastName] = useState('');
  const [famFirstName, setFamFirstName] = useState('');
  const [famDni, setFamDni] = useState('');
  const [famBirthDate, setFamBirthDate] = useState('2018-04-12');

  // Leave form
  const [situationType, setSituationType] = useState('VACACIONES');
  const [leaveStart, setLeaveStart] = useState('2026-10-01');
  const [leaveEnd, setLeaveEnd] = useState('2026-10-14');
  const [leaveDays, setLeaveDays] = useState(14);
  const [leavePaid, setLeavePaid] = useState(true);

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await desktopApiClient.getEmployeeProfile(companyId, employeeId);
      setDossier(p);
      setFirstName(p.profile.first_name);
      setLastName(p.profile.last_name);
      setDni(p.profile.dni);
      setBirthDate(p.profile.birth_date ?? '');
      setLegajo(p.profile.legajo);
      setHireDate(p.profile.hire_date);
      setRecognizedPriorYears(p.profile.recognized_prior_years ?? 0);
      setJobPosition(p.profile.job_position);
      setEmploymentStatus(p.profile.employment_status);
      setContractType(p.profile.contract_type);
      setRemunerationModality(p.profile.remuneration_modality);
      setRemunerationUnit(p.profile.remuneration_unit);
      setPaymentFrequency(p.profile.payment_frequency);
      setCategoryId(p.profile.category_id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error al cargar la ficha del empleado.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, [companyId, employeeId]);

  const handleSaveEmployeeChanges = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await desktopApiClient.updateEmployee(companyId, employeeId, {
        firstName,
        lastName,
        dni,
        birthDate: birthDate || undefined,
        legajo,
        hireDate,
        recognizedPriorYears: Number(recognizedPriorYears),
        jobPosition,
        employmentStatus,
        contractType,
        remunerationModality,
        remunerationUnit,
        paymentFrequency,
        categoryId: categoryId || undefined,
        changeReason:
          changeReason || 'Actualización desde ficha individual del empleado',
      });
      setSuccessMsg(
        'Cambios guardados y nueva versión registrada en el historial.'
      );
      setChangeReason('');
      await loadProfile();
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar cambios.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!famLastName.trim() || !famFirstName.trim() || !famDni.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await desktopApiClient.addFamilyMember(companyId, employeeId, {
        relationship: famRelation,
        lastName: famLastName,
        firstName: famFirstName,
        dni: famDni,
        birthDate: famBirthDate,
        isDependentCharge: true,
      });
      setFamLastName('');
      setFamFirstName('');
      setFamDni('');
      await loadProfile();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al registrar familiar.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await desktopApiClient.addEmployeeLeave(companyId, employeeId, {
        situationType,
        startDate: leaveStart,
        endDate: leaveEnd,
        daysCount: Number(leaveDays),
        isPaid: leavePaid,
      });
      await loadProfile();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al registrar licencia.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card modal-xl">
        <div className="modal-header">
          <div>
            <h3>
              Ficha del empleado —{' '}
              {dossier
                ? `Legajo ${dossier.profile.legajo} · ${dossier.profile.last_name}, ${dossier.profile.first_name}`
                : 'Cargando...'}
            </h3>
            {dossier && (
              <p className="text-muted">
                CUIL: <span className="mono">{dossier.profile.cuil}</span> ·
                Estado: <strong>{dossier.profile.employment_status}</strong> ·
                Versión activa: <strong>v{dossier.profile.current_version}</strong>
              </p>
            )}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        {error && <div className="alert-error">{error}</div>}
        {successMsg && <div className="alert-success">{successMsg}</div>}

        <div className="dossier-layout">
          <aside className="dossier-nav">
            {DOSSIER_SECTIONS.map((sec) => (
              <button
                key={sec.id}
                className={`dossier-nav-btn ${
                  activeSection === sec.id ? 'active' : ''
                }`}
                onClick={() => {
                  setActiveSection(sec.id);
                  setSuccessMsg(null);
                }}
              >
                {sec.label}
              </button>
            ))}
          </aside>

          <div className="dossier-content">
            {loading || !dossier ? (
              <div className="empty-state">
                Cargando ficha integral del empleado...
              </div>
            ) : (
              <>
                {activeSection === 1 && (
                  <div>
                    <h4>Datos personales</h4>
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>Apellido</label>
                        <input
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label>Nombre</label>
                        <input
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label>CUIL</label>
                        <input
                          className="mono"
                          value={dossier.profile.cuil}
                          disabled
                        />
                      </div>
                      <div className="form-group">
                        <label>DNI</label>
                        <input
                          className="mono"
                          value={dni}
                          onChange={(e) => setDni(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label>Fecha de nacimiento (AAAA-MM-DD)</label>
                        <input
                          type="date"
                          value={birthDate}
                          onChange={(e) => setBirthDate(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label>Motivo de actualización (para auditoría)</label>
                        <input
                          placeholder="Ej: Corrección de fecha de nacimiento"
                          value={changeReason}
                          onChange={(e) => setChangeReason(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button
                        className="btn btn-primary"
                        disabled={saving}
                        onClick={() => void handleSaveEmployeeChanges()}
                      >
                        {saving ? 'Guardando...' : 'Guardar datos personales'}
                      </button>
                    </div>
                  </div>
                )}

                {activeSection === 2 && (
                  <div>
                    <h4>Datos laborales</h4>
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>Legajo</label>
                        <input
                          className="mono"
                          value={legajo}
                          onChange={(e) => setLegajo(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label>Puesto / Calificación Profesional</label>
                        <input
                          value={jobPosition}
                          onChange={(e) => setJobPosition(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label>Fecha de ingreso</label>
                        <input
                          type="date"
                          value={hireDate}
                          onChange={(e) => setHireDate(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label>Años de antigüedad previa reconocidos</label>
                        <input
                          type="number"
                          min={0}
                          value={recognizedPriorYears}
                          onChange={(e) =>
                            setRecognizedPriorYears(Number(e.target.value))
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label>Estado laboral</label>
                        <select
                          value={employmentStatus}
                          onChange={(e) =>
                            setEmploymentStatus(
                              e.target.value as typeof employmentStatus
                            )
                          }
                        >
                          <option value="ACTIVE">ACTIVE (Activo)</option>
                          <option value="ON_LEAVE">ON_LEAVE (En licencia)</option>
                          <option value="SUSPENDED">
                            SUSPENDED (Suspendido)
                          </option>
                          <option value="TERMINATED">
                            TERMINATED (Baja / Egresado)
                          </option>
                        </select>
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button
                        className="btn btn-primary"
                        disabled={saving}
                        onClick={() => void handleSaveEmployeeChanges()}
                      >
                        {saving ? 'Guardando...' : 'Guardar datos laborales'}
                      </button>
                    </div>
                  </div>
                )}

                {activeSection === 3 && (
                  <div>
                    <h4>Contrato</h4>
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>Modalidad de contratación (LCT)</label>
                        <select
                          value={contractType}
                          onChange={(e) => setContractType(e.target.value)}
                        >
                          <option value="TIEMPO_INDETERMINADO">
                            TIEMPO_INDETERMINADO (Tiempo Indeterminado)
                          </option>
                          <option value="PLAZO_FIJO">
                            PLAZO_FIJO (Plazo Fijo)
                          </option>
                          <option value="TEMPORADA">TEMPORADA (Temporada)</option>
                          <option value="EVENTUAL">EVENTUAL (Eventual)</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Modalidad de remuneración</label>
                        <select
                          value={remunerationModality}
                          onChange={(e) =>
                            setRemunerationModality(
                              e.target.value as typeof remunerationModality
                            )
                          }
                        >
                          <option value="JORNALIZADO">JORNALIZADO</option>
                          <option value="MENSUALIZADO">MENSUALIZADO</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Unidad de remuneración</label>
                        <select
                          value={remunerationUnit}
                          onChange={(e) =>
                            setRemunerationUnit(
                              e.target.value as typeof remunerationUnit
                            )
                          }
                        >
                          <option value="HORA">HORA (Por Hora)</option>
                          <option value="DIA">DIA (Por Día / Jornal)</option>
                          <option value="MES">MES (Mensual)</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Frecuencia de pago</label>
                        <select
                          value={paymentFrequency}
                          onChange={(e) =>
                            setPaymentFrequency(
                              e.target.value as typeof paymentFrequency
                            )
                          }
                        >
                          <option value="QUINCENAL">
                            QUINCENAL (1ra y 2da Quincena)
                          </option>
                          <option value="MENSUAL">MENSUAL</option>
                          <option value="SEMANAL">SEMANAL</option>
                        </select>
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button
                        className="btn btn-primary"
                        disabled={saving}
                        onClick={() => void handleSaveEmployeeChanges()}
                      >
                        {saving ? 'Guardando...' : 'Guardar datos contractuales'}
                      </button>
                    </div>
                  </div>
                )}

                {activeSection === 4 && (
                  <div>
                    <h4>
                      Historial de cambios
                      
                    </h4>
                    <div className="table-scroll" style={{ maxHeight: '220px' }}>
                      <table className="spreadsheet-table">
                        <thead>
                          <tr>
                            <th>Versión</th>
                            <th>Vigencia Desde</th>
                            <th>Puesto</th>
                            <th>Modalidad</th>
                            <th>Categoría</th>
                            <th>Motivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dossier.versions.map((v) => (
                            <tr key={v.version}>
                              <td className="mono">v{v.version}</td>
                              <td className="mono">{v.valid_from}</td>
                              <td>{v.job_position}</td>
                              <td>
                                {v.remuneration_modality} / {v.payment_frequency}
                              </td>
                              <td>{v.category_name}</td>
                              <td>{v.change_reason ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <h5 style={{ marginTop: '1rem', marginBottom: '0.4rem' }}>
                      Eventos registrados
                    </h5>
                    <div className="table-scroll" style={{ maxHeight: '180px' }}>
                      <table className="spreadsheet-table">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Tipo de Evento</th>
                            <th>Motivo</th>
                            <th>Registrado por</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dossier.modificationHistory.map((h) => (
                            <tr key={h.id}>
                              <td className="mono">{h.effective_date}</td>
                              <td>
                                <span className="badge badge-neutral">
                                  {h.event_type}
                                </span>
                              </td>
                              <td>{h.reason ?? '—'}</td>
                              <td>{h.recorded_by_name ?? 'Sistema'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeSection === 5 && (
                  <div>
                    <h4>Convenio y categoría</h4>
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>Categoría de Convenio Colectivo</label>
                        <select
                          value={categoryId}
                          onChange={(e) => setCategoryId(e.target.value)}
                        >
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              CCT {cat.cct_number} — {cat.name} ({cat.code})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="info-box">
                        <span className="info-label">Convenio actual</span>
                        <strong>{dossier.profile.agreement_name}</strong>
                        <span className="text-muted">
                          Categoría: {dossier.profile.category_name} (Rama:{' '}
                          {dossier.profile.agreement_branch_name})
                        </span>
                      </div>
                    </div>

                    {dossier.salaryScales.length > 0 && (
                      <div style={{ marginTop: '1rem' }}>
                        <h5>Escala salarial vigente aplicable a la categoría</h5>
                        <table className="spreadsheet-table">
                          <thead>
                            <tr>
                              <th>Acuerdo</th>
                              <th>Período</th>
                              <th>Valor Hora</th>
                              <th>Básico Mensual</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dossier.salaryScales.map((s, idx) => (
                              <tr key={idx}>
                                <td>{s.agreement_number}</td>
                                <td className="mono">{s.period_code}</td>
                                <td className="mono">
                                  {s.hourly_rate ? `$${s.hourly_rate}` : '—'}
                                </td>
                                <td className="mono">
                                  {s.monthly_basic ? `$${s.monthly_basic}` : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="modal-footer">
                      <button
                        className="btn btn-primary"
                        disabled={saving}
                        onClick={() => void handleSaveEmployeeChanges()}
                      >
                        {saving
                          ? 'Guardando...'
                          : 'Guardar convenio y categoría'}
                      </button>
                    </div>
                  </div>
                )}

                {activeSection === 6 && (
                  <div>
                    <h4>Haberes</h4>
                    <table className="spreadsheet-table">
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Concepto</th>
                          <th>Tipo</th>
                          <th>Regla / Base</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="mono">0100</td>
                          <td>Sueldo Básico / Jornal según Escala CCT</td>
                          <td>
                            <span className="badge badge-success">
                              REMUNERATIVO
                            </span>
                          </td>
                          <td>
                            Escala vigente ({dossier.profile.category_name}) ·
                            Unidad: {dossier.profile.remuneration_unit}
                          </td>
                        </tr>
                        <tr>
                          <td className="mono">0210</td>
                          <td>Adicional por Antigüedad (1% por año)</td>
                          <td>
                            <span className="badge badge-success">
                              REMUNERATIVO
                            </span>
                          </td>
                          <td>Fecha ingreso: {dossier.profile.hire_date}</td>
                        </tr>
                        <tr>
                          <td className="mono">0401</td>
                          <td>Jubilación SIPA (11%)</td>
                          <td>
                            <span className="badge badge-warning">RETENCIÓN</span>
                          </td>
                          <td>11% sobre total remunerativo</td>
                        </tr>
                        <tr>
                          <td className="mono">0402</td>
                          <td>Ley 19.032 INSSJP (3%)</td>
                          <td>
                            <span className="badge badge-warning">RETENCIÓN</span>
                          </td>
                          <td>3% sobre total remunerativo</td>
                        </tr>
                        <tr>
                          <td className="mono">0403</td>
                          <td>Obra Social {dossier.profile.obra_social_name} (3%)</td>
                          <td>
                            <span className="badge badge-warning">RETENCIÓN</span>
                          </td>
                          <td>3% sobre total remunerativo</td>
                        </tr>
                        <tr>
                          <td className="mono">0410</td>
                          <td>Cuota Sindical UOM (2.5%)</td>
                          <td>
                            <span className="badge badge-warning">RETENCIÓN</span>
                          </td>
                          <td>2.5% sobre total remunerativo</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {activeSection === 7 && (
                  <div>
                    <h4>Grupo familiar</h4>
                    <table className="spreadsheet-table">
                      <thead>
                        <tr>
                          <th>Vínculo</th>
                          <th>Apellido y Nombre</th>
                          <th>DNI</th>
                          <th>Fecha Nac.</th>
                          <th>Carga de Familia</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dossier.familyMembers.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-muted">
                              Sin familiares registrados.
                            </td>
                          </tr>
                        ) : (
                          dossier.familyMembers.map((f) => (
                            <tr key={f.id}>
                              <td>{f.relationship}</td>
                              <td>
                                {f.last_name}, {f.first_name}
                              </td>
                              <td className="mono">{f.dni}</td>
                              <td className="mono">{f.birth_date}</td>
                              <td>{f.is_dependent_charge ? 'Sí' : 'No'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>

                    <form
                      onSubmit={(e) => void handleAddFamily(e)}
                      style={{ marginTop: '1rem' }}
                    >
                      <h5>Agregar familiar</h5>
                      <div className="form-grid-4">
                        <select
                          value={famRelation}
                          onChange={(e) =>
                            setFamRelation(e.target.value as typeof famRelation)
                          }
                        >
                          <option value="HIJO">Hijo/a (HIJO)</option>
                          <option value="CONYUGE">Cónyuge (CONYUGE)</option>
                          <option value="CONVIVIENTE">
                            Conviviente (CONVIVIENTE)
                          </option>
                          <option value="OTRO">Otro (OTRO)</option>
                        </select>
                        <input
                          placeholder="Apellido"
                          value={famLastName}
                          onChange={(e) => setFamLastName(e.target.value)}
                          required
                        />
                        <input
                          placeholder="Nombre"
                          value={famFirstName}
                          onChange={(e) => setFamFirstName(e.target.value)}
                          required
                        />
                        <input
                          placeholder="DNI"
                          value={famDni}
                          onChange={(e) => setFamDni(e.target.value)}
                          required
                        />
                      </div>
                      <div className="modal-footer">
                        <button
                          className="btn btn-primary btn-sm"
                          type="submit"
                          disabled={saving}
                        >
                          + Agregar Familiar
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {activeSection === 8 && (
                  <div>
                    <h4>Licencias y ausencias</h4>
                    <table className="spreadsheet-table">
                      <thead>
                        <tr>
                          <th>Tipo</th>
                          <th>Desde</th>
                          <th>Hasta</th>
                          <th>Días</th>
                          <th>Goce de sueldo</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dossier.leaves.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-muted">
                              Sin licencias ni ausencias registradas.
                            </td>
                          </tr>
                        ) : (
                          dossier.leaves.map((lv) => (
                            <tr key={lv.id}>
                              <td>{lv.situation_type}</td>
                              <td className="mono">{lv.start_date}</td>
                              <td className="mono">{lv.end_date}</td>
                              <td className="mono">{lv.days_count}</td>
                              <td>{lv.is_paid ? 'Con goce' : 'Sin goce'}</td>
                              <td>
                                <span className="badge badge-success">
                                  {lv.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>

                    <form
                      onSubmit={(e) => void handleAddLeave(e)}
                      style={{ marginTop: '1rem' }}
                    >
                      <h5>Registrar licencia o ausencia</h5>
                      <div className="form-grid-4">
                        <input
                          placeholder="Tipo (VACACIONES, ENFERMEDAD...)"
                          value={situationType}
                          onChange={(e) => setSituationType(e.target.value)}
                          required
                        />
                        <input
                          type="date"
                          value={leaveStart}
                          onChange={(e) => setLeaveStart(e.target.value)}
                          required
                        />
                        <input
                          type="date"
                          value={leaveEnd}
                          onChange={(e) => setLeaveEnd(e.target.value)}
                          required
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          type="submit"
                          disabled={saving}
                        >
                          + Registrar Licencia
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {activeSection === 9 && (
                  <div>
                    <h4>Documentos</h4>
                    <table className="spreadsheet-table">
                      <thead>
                        <tr>
                          <th>Tipo</th>
                          <th>Archivo</th>
                          <th>Tamaño</th>
                          
                          <th>Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dossier.documents.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-muted">
                              Sin documentos digitales adjuntos a este legajo.
                            </td>
                          </tr>
                        ) : (
                          dossier.documents.map((doc) => (
                            <tr key={doc.id}>
                              <td>
                                <span className="badge badge-neutral">
                                  {doc.document_type}
                                </span>
                              </td>
                              <td>{doc.original_filename}</td>
                              <td className="mono">
                                {(Number(doc.size_bytes) / 1024).toFixed(1)} KB
                              </td>
                              <td className="mono">
                                {doc.sha256_hash.slice(0, 16)}…
                              </td>
                              <td className="mono">
                                {String(doc.created_at).slice(0, 10)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeSection === 10 && (
                  <div>
                    <h4>Recibos de sueldo</h4>
                    <table className="spreadsheet-table">
                      <thead>
                        <tr>
                          <th>Recibo #</th>
                          <th>Período</th>
                          <th>Estado</th>
                          <th>Haberes Rem.</th>
                          <th>No Rem.</th>
                          <th>Deducciones</th>
                          <th>Neto a Cobrar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dossier.payslips.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-muted">
                              No hay recibos emitidos para este empleado aún.
                            </td>
                          </tr>
                        ) : (
                          dossier.payslips.map((ps) => (
                            <tr key={ps.id}>
                              <td className="mono">{ps.receipt_code}</td>
                              <td className="mono">{ps.period_code}</td>
                              <td>
                                <span className="badge badge-success">
                                  {ps.status}
                                </span>
                              </td>
                              <td className="mono">
                                ${ps.total_remunerative ?? '0.00'}
                              </td>
                              <td className="mono">
                                ${ps.total_non_remunerative ?? '0.00'}
                              </td>
                              <td className="mono">
                                ${ps.total_deductions ?? '0.00'}
                              </td>
                              <td className="mono">
                                <strong>${ps.net_pay ?? '0.00'}</strong>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
