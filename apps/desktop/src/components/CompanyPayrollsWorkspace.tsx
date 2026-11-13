import React, { useEffect, useMemo, useState } from 'react';
import type { EmployeeGridRowDto } from '@ar-payroll/contracts';
import {
  desktopApiClient as apiClient,
  type CompanyPayrollWorkspaceDto,
} from '../lib/apiClient.js';
import { OfficialPayslipReceiptModal } from './OfficialPayslipReceiptModal.js';

interface Props {
  companyId: string;
  companyName: string;
  companyCuit: string;
  companyAddress: string;
  activeTab: 'NOVEDADES' | 'LIQUIDACIONES' | 'RECIBOS' | 'LSD';
  onChangeTab: (
    tab:
      | 'GENERAL'
      | 'EMPLOYEES'
      | 'CONVENIOS'
      | 'NOVEDADES'
      | 'LIQUIDACIONES'
      | 'RECIBOS'
      | 'LSD'
  ) => void;
  employees: EmployeeGridRowDto[];
  onRefreshCompany: () => Promise<void>;
}

const MODALITY_LABELS: Record<string, string> = {
  PRIMERA_QUINCENA: '1ra Quincena',
  SEGUNDA_QUINCENA: '2da Quincena',
  MENSUAL: 'Mensual',
  SAC_1: '1er SAC (Junio)',
  SAC_2: '2do SAC (Diciembre)',
  VACACIONES: 'Vacaciones Anuales',
  FINAL_EGRESO: 'Liquidación Final',
  COMPLEMENTARIA: 'Complementaria',
};

function fmtMoney(n: number | null | undefined): string {
  const val = Number(n ?? 0);
  return val.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const CompanyPayrollsWorkspace: React.FC<Props> = ({
  companyId,
  companyName,
  companyCuit,
  companyAddress,
  activeTab,
  onChangeTab,
  employees,
  onRefreshCompany,
}) => {
  const [workspace, setWorkspace] = useState<CompanyPayrollWorkspaceDto | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Selected Period for Novelties / Calculation
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');

  // Editable Novelty Grid State
  const [noveltyDrafts, setNoveltyDrafts] = useState<
    Record<
      string,
      {
        normalHours: number;
        overtime50Hours: number;
        overtime100Hours: number;
        holidayHours: number;
        nonRemunerativeAmount: number;
        advanceAmount: number;
        observation: string;
      }
    >
  >({});

  // Create Period Modal State
  const [showNewPeriodModal, setShowNewPeriodModal] = useState(false);
  const [newPeriodYear, setNewPeriodYear] = useState(2026);
  const [newPeriodMonth, setNewPeriodMonth] = useState(10);
  const [newPeriodModality, setNewPeriodModality] = useState<
    | 'PRIMERA_QUINCENA'
    | 'SEGUNDA_QUINCENA'
    | 'MENSUAL'
    | 'SAC_1'
    | 'SAC_2'
    | 'VACACIONES'
    | 'FINAL_EGRESO'
    | 'COMPLEMENTARIA'
  >('PRIMERA_QUINCENA');

  // Selected Payslip for Detailed Modal View
  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(
    null
  );
  const [selectedPayrollFilterId, setSelectedPayrollFilterId] =
    useState<string>('ALL');

  // Selected ARCA TXT Preview
  const [arcaPreview, setArcaPreview] = useState<{
    filename: string;
    sha256Hash: string;
    txtContent: string;
    employeesCount: number;
  } | null>(null);

  async function loadPayrollWorkspace(preferredPeriodId?: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getPayrollWorkspace(companyId);
      setWorkspace(data);
      const targetPeriodId =
        preferredPeriodId ||
        (selectedPeriodId &&
        data.periods.some((p) => p.id === selectedPeriodId)
          ? selectedPeriodId
          : data.periods[0]?.id ?? '');
      setSelectedPeriodId(targetPeriodId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error al cargar liquidaciones de la empresa.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPayrollWorkspace();
  }, [companyId]);

  // Synchronize novelty drafts whenever period or workspace changes
  useEffect(() => {
    if (!workspace || !selectedPeriodId) return;
    const period = workspace.periods.find((p) => p.id === selectedPeriodId);
    const periodNovs = workspace.novelties.filter(
      (n) => n.periodId === selectedPeriodId
    );

    const nextDrafts: typeof noveltyDrafts = {};
    for (const emp of employees) {
      const empNovs = periodNovs.filter((n) => n.employeeId === emp.id);
      const getQty = (code: string, fallback: number) => {
        const found = empNovs.find((n) => n.noveltyCode === code);
        return found ? Number(found.quantity) : fallback;
      };
      const getFixed = (code: string) => {
        const found = empNovs.find((n) => n.noveltyCode === code);
        return found ? Number(found.unitOrFixedAmount) : 0;
      };

      const defaultNormal =
        period?.liquidationModality === 'MENSUAL'
          ? 192
          : emp.remunerationModality === 'JORNALIZADO'
            ? 88
            : 96;

      nextDrafts[emp.id] = {
        normalHours: getQty('HORAS_NORMALES', defaultNormal),
        overtime50Hours: getQty('HORAS_EXTRAS_50', 0),
        overtime100Hours: getQty('HORAS_EXTRAS_100', 0),
        holidayHours: getQty('HORAS_FERIADO', 0),
        nonRemunerativeAmount: getFixed('SUMA_NO_REMUNERATIVA'),
        advanceAmount: getFixed('ANTICIPO_SUELDO'),
        observation: empNovs[0]?.observation ?? '',
      };
    }
    setNoveltyDrafts(nextDrafts);
  }, [workspace, selectedPeriodId, employees]);

  async function handleCreatePeriod(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await apiClient.createPayrollPeriod(companyId, {
        year: newPeriodYear,
        month: newPeriodMonth,
        liquidationModality: newPeriodModality,
      });
      setShowNewPeriodModal(false);
      setNotice(
        `Período ${res.periodCode} (${MODALITY_LABELS[newPeriodModality]}) abierto con éxito.`
      );
      await loadPayrollWorkspace(res.periodId);
      await onRefreshCompany();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo abrir el período.'
      );
    }
  }

  async function handleSaveNovelties(andCalculate = false) {
    if (!selectedPeriodId) return;
    setError(null);
    setNotice(null);
    try {
      const rows = employees.map((emp) => {
        const d = noveltyDrafts[emp.id] ?? {
          normalHours: 88,
          overtime50Hours: 0,
          overtime100Hours: 0,
          holidayHours: 0,
          nonRemunerativeAmount: 0,
          advanceAmount: 0,
          observation: '',
        };
        return {
          employeeId: emp.id,
          normalHours: Number(d.normalHours || 0),
          overtime50Hours: Number(d.overtime50Hours || 0),
          overtime100Hours: Number(d.overtime100Hours || 0),
          holidayHours: Number(d.holidayHours || 0),
          nonRemunerativeAmount: Number(d.nonRemunerativeAmount || 0),
          advanceAmount: Number(d.advanceAmount || 0),
          observation: d.observation || undefined,
        };
      });

      await apiClient.savePeriodNovelties(companyId, selectedPeriodId, rows);

      if (andCalculate) {
        const calcRes = await apiClient.calculatePayroll(
          companyId,
          selectedPeriodId
        );
        setNotice(
          `Novedades guardadas y Liquidación V${calcRes.version} calculada (${calcRes.employeesCount} empleados · Neto Total: $${fmtMoney(calcRes.totalNetPay)}).`
        );
        await loadPayrollWorkspace(selectedPeriodId);
        onChangeTab('LIQUIDACIONES');
      } else {
        setNotice('Novedades del período guardadas en PostgreSQL.');
        await loadPayrollWorkspace(selectedPeriodId);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al guardar novedades.'
      );
    }
  }

  async function handleCalculatePeriod(periodId: string) {
    setError(null);
    setNotice(null);
    try {
      const calcRes = await apiClient.calculatePayroll(companyId, periodId);
      setNotice(
        `Liquidación V${calcRes.version} calculada exitosamente para ${calcRes.employeesCount} legajos. Total Neto: $${fmtMoney(calcRes.totalNetPay)}.`
      );
      await loadPayrollWorkspace(periodId);
      await onRefreshCompany();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al calcular liquidación.'
      );
    }
  }

  async function handleApprovePayroll(payrollId: string) {
    setError(null);
    setNotice(null);
    try {
      await apiClient.approvePayroll(companyId, payrollId);
      setNotice(
        'Liquidación aprobada y sellada como INMUTABLE. Los recibos quedaron protegidos por trigger en PostgreSQL 16.'
      );
      await loadPayrollWorkspace(selectedPeriodId);
      await onRefreshCompany();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al aprobar liquidación.'
      );
    }
  }

  async function handleExportArca(payrollId: string) {
    setError(null);
    setNotice(null);
    try {
      const exp = await apiClient.exportArcaLsd(companyId, payrollId);
      setArcaPreview(exp);
      setNotice(
        `Libro de Sueldos Digital (${exp.filename}) generado y validado con hash SHA-256.`
      );
      await loadPayrollWorkspace(selectedPeriodId);
      onChangeTab('LSD');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al exportar ARCA LSD.'
      );
    }
  }

  function downloadArcaTxt() {
    if (!arcaPreview) return;
    const blob = new Blob([arcaPreview.txtContent], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = arcaPreview.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredPayslips = useMemo(() => {
    if (!workspace) return [];
    if (selectedPayrollFilterId === 'ALL') return workspace.payslips;
    return workspace.payslips.filter(
      (ps) => ps.payrollId === selectedPayrollFilterId
    );
  }, [workspace, selectedPayrollFilterId]);

  const activePayslipDetail = useMemo(() => {
    if (!workspace || !selectedPayslipId) return null;
    return workspace.payslips.find((ps) => ps.id === selectedPayslipId) ?? null;
  }, [workspace, selectedPayslipId]);

  return (
    <div className="tab-panel">
      {error && (
        <div className="alert-error" style={{ marginBottom: '0.75rem' }}>
          {error}
        </div>
      )}
      {notice && (
        <div className="alert-success" style={{ marginBottom: '0.75rem' }}>
          {notice}
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 4: NOVEDADES (PLANILLA TIPO EXCEL)
         ===================================================================== */}
      {activeTab === 'NOVEDADES' && (
        <div>
          <div
            className="grid-toolbar"
            style={{
              padding: '0 0 0.75rem 0',
              borderBottom: '1px solid var(--border)',
              marginBottom: '0.75rem',
            }}
          >
            <div className="toolbar-left">
              <strong>Período de carga:</strong>
              <select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                style={{ minWidth: '280px' }}
              >
                {(workspace?.periods ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.periodCode} —{' '}
                    {MODALITY_LABELS[p.liquidationModality] ??
                      p.liquidationModality}{' '}
                    ({p.periodStatus})
                  </option>
                ))}
              </select>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowNewPeriodModal(true)}
              >
                + Nuevo período
              </button>
            </div>

            <div className="toolbar-right">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => void handleSaveNovelties(false)}
                disabled={!selectedPeriodId || loading}
              >
                💾 Guardar novedades
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => void handleSaveNovelties(true)}
                disabled={!selectedPeriodId || loading}
              >
                ⚡ Guardar y Calcular Liquidación →
              </button>
            </div>
          </div>

          <p className="text-muted" style={{ marginBottom: '0.6rem' }}>
            Planilla rápida de horas y novedades para los{' '}
            <strong>{employees.length}</strong> empleados de{' '}
            <strong>{companyName}</strong>. Editá las celdas directamente y
            presioná <strong>Guardar y Calcular Liquidación</strong>.
          </p>

          <div className="spreadsheet-container">
            <table className="spreadsheet-table">
              <thead>
                <tr>
                  <th>Legajo</th>
                  <th>Apellido y Nombre</th>
                  <th>Categoría CCT</th>
                  <th>Modalidad</th>
                  <th>Horas Normales</th>
                  <th>Horas Extras 50%</th>
                  <th>Horas Extras 100%</th>
                  <th>Horas Feriado</th>
                  <th>No Remunerativo ($)</th>
                  <th>Anticipo / Desc. ($)</th>
                  <th>Observación</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const row = noveltyDrafts[emp.id] ?? {
                    normalHours: 88,
                    overtime50Hours: 0,
                    overtime100Hours: 0,
                    holidayHours: 0,
                    nonRemunerativeAmount: 0,
                    advanceAmount: 0,
                    observation: '',
                  };
                  const updateField = (
                    field: keyof typeof row,
                    value: number | string
                  ) => {
                    setNoveltyDrafts((prev) => ({
                      ...prev,
                      [emp.id]: {
                        ...row,
                        [field]: value,
                      },
                    }));
                  };

                  return (
                    <tr key={emp.id}>
                      <td className="mono">
                        <strong>{emp.legajo}</strong>
                      </td>
                      <td>
                        <strong>
                          {emp.lastName}, {emp.firstName}
                        </strong>
                      </td>
                      <td>{emp.categoryName}</td>
                      <td>
                        <span className="badge badge-info">
                          {emp.remunerationModality} ({emp.remunerationUnit})
                        </span>
                      </td>
                      <td className="editable-cell">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          className="inline-cell-input"
                          value={row.normalHours}
                          onChange={(e) =>
                            updateField('normalHours', Number(e.target.value))
                          }
                        />
                      </td>
                      <td className="editable-cell">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          className="inline-cell-input"
                          value={row.overtime50Hours}
                          onChange={(e) =>
                            updateField(
                              'overtime50Hours',
                              Number(e.target.value)
                            )
                          }
                        />
                      </td>
                      <td className="editable-cell">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          className="inline-cell-input"
                          value={row.overtime100Hours}
                          onChange={(e) =>
                            updateField(
                              'overtime100Hours',
                              Number(e.target.value)
                            )
                          }
                        />
                      </td>
                      <td className="editable-cell">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          className="inline-cell-input"
                          value={row.holidayHours}
                          onChange={(e) =>
                            updateField('holidayHours', Number(e.target.value))
                          }
                        />
                      </td>
                      <td className="editable-cell">
                        <input
                          type="number"
                          step="100"
                          min="0"
                          className="inline-cell-input"
                          value={row.nonRemunerativeAmount}
                          onChange={(e) =>
                            updateField(
                              'nonRemunerativeAmount',
                              Number(e.target.value)
                            )
                          }
                        />
                      </td>
                      <td className="editable-cell">
                        <input
                          type="number"
                          step="100"
                          min="0"
                          className="inline-cell-input"
                          value={row.advanceAmount}
                          onChange={(e) =>
                            updateField('advanceAmount', Number(e.target.value))
                          }
                        />
                      </td>
                      <td className="editable-cell">
                        <input
                          type="text"
                          className="inline-cell-input"
                          placeholder="Opcional..."
                          value={row.observation}
                          onChange={(e) =>
                            updateField('observation', e.target.value)
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 5: LIQUIDACIONES (PERÍODOS + EJECUCIÓN DEL MOTOR + APROBACIÓN)
         ===================================================================== */}
      {activeTab === 'LIQUIDACIONES' && (
        <div>
          <div
            className="grid-toolbar"
            style={{
              padding: '0 0 0.75rem 0',
              borderBottom: '1px solid var(--border)',
              marginBottom: '0.75rem',
            }}
          >
            <div className="toolbar-left">
              <h4 style={{ margin: 0 }}>
                Períodos y Motor de Liquidaciones de {companyName}
              </h4>
            </div>
            <div className="toolbar-right">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowNewPeriodModal(true)}
              >
                + Abrir Nuevo Período
              </button>
              {selectedPeriodId && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => void handleCalculatePeriod(selectedPeriodId)}
                >
                  ⚡ Calcular Período Seleccionado
                </button>
              )}
            </div>
          </div>

          {/* Tabla 1: Períodos de Liquidación */}
          <h4 style={{ marginBottom: '0.4rem' }}>
            1. Períodos de Liquidación (`payroll_periods`)
          </h4>
          <div
            className="spreadsheet-container"
            style={{ marginBottom: '1.25rem' }}
          >
            <table className="spreadsheet-table">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Modalidad de Liquidación</th>
                  <th>Frecuencia</th>
                  <th>Devengamiento Desde</th>
                  <th>Devengamiento Hasta</th>
                  <th>Fecha de Pago</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(workspace?.periods ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty-state">
                      No hay períodos creados aún. Hacé clic en{' '}
                      <strong>+ Abrir Nuevo Período</strong> para comenzar.
                    </td>
                  </tr>
                ) : (
                  (workspace?.periods ?? []).map((per) => (
                    <tr
                      key={per.id}
                      className={
                        selectedPeriodId === per.id ? 'row-selected' : ''
                      }
                      onClick={() => setSelectedPeriodId(per.id)}
                    >
                      <td className="mono">
                        <strong>{per.periodCode}</strong>
                      </td>
                      <td>
                        <strong>
                          {MODALITY_LABELS[per.liquidationModality] ??
                            per.liquidationModality}
                        </strong>
                      </td>
                      <td className="mono">{per.paymentFrequency}</td>
                      <td className="mono">{per.accrualStartDate}</td>
                      <td className="mono">{per.accrualEndDate}</td>
                      <td className="mono">{per.scheduledPaymentDate}</td>
                      <td>
                        <span
                          className={`badge ${
                            per.periodStatus === 'OPEN'
                              ? 'badge-info'
                              : 'badge-success'
                          }`}
                        >
                          {per.periodStatus}
                        </span>
                      </td>
                      <td>
                        <div className="btn-row">
                          <button
                            className="btn btn-secondary btn-xs"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSelectedPeriodId(per.id);
                              onChangeTab('NOVEDADES');
                            }}
                          >
                            📝 Novedades
                          </button>
                          <button
                            className="btn btn-primary btn-xs"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              void handleCalculatePeriod(per.id);
                            }}
                          >
                            ⚡ Calcular Liquidación
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Tabla 2: Liquidaciones Calculadas / Aprobadas */}
          <h4 style={{ marginBottom: '0.4rem' }}>
            2. Liquidaciones Calculadas e Inmutables (`payrolls`)
          </h4>
          <div className="spreadsheet-container">
            <table className="spreadsheet-table">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Modalidad</th>
                  <th>Versión</th>
                  <th>Estado</th>
                  <th>Legajos</th>
                  <th>Horas</th>
                  <th>Haberes Remun.</th>
                  <th>No Remun.</th>
                  <th>Retenciones</th>
                  <th>Neto a Pagar ($)</th>
                  <th>Contrib. Patronales</th>
                  <th>Costo Total Empleador</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(workspace?.payrolls ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={13} className="empty-state">
                      Todavía no calculaste ninguna liquidación. Hacé clic en{' '}
                      <strong>⚡ Calcular Liquidación</strong> en cualquiera de
                      los períodos de arriba.
                    </td>
                  </tr>
                ) : (
                  (workspace?.payrolls ?? []).map((pay) => (
                    <tr key={pay.id}>
                      <td className="mono">
                        <strong>{pay.periodCode}</strong>
                      </td>
                      <td>
                        {MODALITY_LABELS[pay.liquidationModality] ??
                          pay.liquidationModality}
                      </td>
                      <td className="mono">
                        <strong>V{pay.version}</strong>
                        {pay.rectifiesPayrollId ? ' (Rectif.)' : ''}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            pay.status === 'APPROVED'
                              ? 'badge-success'
                              : pay.status === 'RECTIFIED'
                                ? 'badge-warning'
                                : 'badge-info'
                          }`}
                        >
                          {pay.isImmutable
                            ? `🔒 ${pay.status} (INMUTABLE)`
                            : pay.status}
                        </span>
                      </td>
                      <td className="mono">{pay.employeesCount}</td>
                      <td className="mono">{pay.totalHours} hs</td>
                      <td className="mono">
                        ${fmtMoney(pay.totalRemunerative)}
                      </td>
                      <td className="mono">
                        ${fmtMoney(pay.totalNonRemunerative)}
                      </td>
                      <td className="mono">${fmtMoney(pay.totalDeductions)}</td>
                      <td className="mono">
                        <strong style={{ color: 'var(--success)' }}>
                          ${fmtMoney(pay.totalNetPay)}
                        </strong>
                      </td>
                      <td className="mono">
                        ${fmtMoney(pay.totalEmployerContributions)}
                      </td>
                      <td className="mono">
                        <strong>${fmtMoney(pay.totalEmployerCost)}</strong>
                      </td>
                      <td>
                        <div className="btn-row">
                          <button
                            className="btn btn-secondary btn-xs"
                            onClick={() => {
                              setSelectedPayrollFilterId(pay.id);
                              onChangeTab('RECIBOS');
                            }}
                          >
                            📄 Ver Recibos ({pay.employeesCount})
                          </button>
                          {!pay.isImmutable && pay.status === 'DRAFT' && (
                            <button
                              className="btn btn-primary btn-xs"
                              onClick={() => void handleApprovePayroll(pay.id)}
                            >
                              ✅ Aprobar y Sellar
                            </button>
                          )}
                          <button
                            className="btn btn-secondary btn-xs"
                            onClick={() => void handleExportArca(pay.id)}
                          >
                            📦 Exportar ARCA
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

      {/* =====================================================================
          PESTAÑA 6: RECIBOS DE SUELDO INMUTABLES
         ===================================================================== */}
      {activeTab === 'RECIBOS' && (
        <div>
          <div
            className="grid-toolbar"
            style={{
              padding: '0 0 0.75rem 0',
              borderBottom: '1px solid var(--border)',
              marginBottom: '0.75rem',
            }}
          >
            <div className="toolbar-left">
              <strong>Filtrar por liquidación:</strong>
              <select
                value={selectedPayrollFilterId}
                onChange={(e) => setSelectedPayrollFilterId(e.target.value)}
                style={{ minWidth: '300px' }}
              >
                <option value="ALL">
                  Todas las liquidaciones ({workspace?.payslips.length ?? 0}{' '}
                  recibos)
                </option>
                {(workspace?.payrolls ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.periodCode} ·{' '}
                    {MODALITY_LABELS[p.liquidationModality] ??
                      p.liquidationModality}{' '}
                    (V{p.version} — {p.status})
                  </option>
                ))}
              </select>
            </div>
            <div className="toolbar-right">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onChangeTab('LIQUIDACIONES')}
              >
                ← Ir a Liquidaciones
              </button>
            </div>
          </div>

          <div className="spreadsheet-container">
            <table className="spreadsheet-table">
              <thead>
                <tr>
                  <th>Código Recibo</th>
                  <th>Período</th>
                  <th>Legajo</th>
                  <th>Apellido y Nombre</th>
                  <th>CUIL</th>
                  <th>Categoría</th>
                  <th>Horas</th>
                  <th>Remunerativo</th>
                  <th>No Remun.</th>
                  <th>Retenciones</th>
                  <th>Neto a Cobrar ($)</th>
                  <th>Estado</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayslips.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="empty-state">
                      No hay recibos emitidos aún. Calculá una liquidación en la
                      pestaña <strong>5. Liquidaciones</strong>.
                    </td>
                  </tr>
                ) : (
                  filteredPayslips.map((ps) => (
                    <tr
                      key={ps.id}
                      onDoubleClick={() => setSelectedPayslipId(ps.id)}
                    >
                      <td className="mono">
                        <strong>{ps.receiptCode}</strong>
                      </td>
                      <td className="mono">
                        {ps.periodCode} (
                        {MODALITY_LABELS[ps.liquidationModality] ??
                          ps.liquidationModality}
                        )
                      </td>
                      <td className="mono">{ps.legajo}</td>
                      <td>
                        <strong>
                          {ps.lastName}, {ps.firstName}
                        </strong>
                      </td>
                      <td className="mono">{ps.cuil}</td>
                      <td>{ps.categoryName}</td>
                      <td className="mono">{ps.workedHours} hs</td>
                      <td className="mono">
                        ${fmtMoney(ps.totalRemunerative)}
                      </td>
                      <td className="mono">
                        ${fmtMoney(ps.totalNonRemunerative)}
                      </td>
                      <td className="mono">${fmtMoney(ps.totalDeductions)}</td>
                      <td className="mono">
                        <strong style={{ color: 'var(--success)' }}>
                          ${fmtMoney(ps.netPay)}
                        </strong>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            ps.isImmutable ? 'badge-success' : 'badge-info'
                          }`}
                        >
                          {ps.isImmutable ? '🔒 INMUTABLE' : ps.status}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-primary btn-xs"
                          onClick={() => setSelectedPayslipId(ps.id)}
                        >
                          🔍 Ver Recibo Completo
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 7: LIBRO DE SUELDOS DIGITAL (ARCA / ex-AFIP)
         ===================================================================== */}
      {activeTab === 'LSD' && (
        <div>
          <div
            className="grid-toolbar"
            style={{
              padding: '0 0 0.75rem 0',
              borderBottom: '1px solid var(--border)',
              marginBottom: '0.75rem',
            }}
          >
            <div className="toolbar-left">
              <h4 style={{ margin: 0 }}>
                Exportación Libro de Sueldos Digital ARCA (RG 5249 — Registros
                01, 02, 03 y 04)
              </h4>
            </div>
            <div className="toolbar-right">
              {(workspace?.payrolls ?? []).length > 0 && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() =>
                    void handleExportArca(workspace!.payrolls[0].id)
                  }
                >
                  📤 Generar TXT ARCA de última liquidación
                </button>
              )}
            </div>
          </div>

          <div
            className="spreadsheet-container"
            style={{ marginBottom: '1rem' }}
          >
            <table className="spreadsheet-table">
              <thead>
                <tr>
                  <th>Período AAAAMM</th>
                  <th>Tipo Presentación</th>
                  <th>Tipo Liq.</th>
                  <th>Nro. Liquidación</th>
                  <th>Legajos</th>
                  <th>Especificación</th>
                  <th>Estado Validación</th>
                  <th>Hash SHA-256</th>
                  <th>Fecha Exportación</th>
                </tr>
              </thead>
              <tbody>
                {(workspace?.arcaExports ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={9} className="empty-state">
                      Aún no se generaron exportaciones ARCA LSD. Calculá una
                      liquidación y presioná <strong>Exportar ARCA</strong>.
                    </td>
                  </tr>
                ) : (
                  (workspace?.arcaExports ?? []).map((ae) => (
                    <tr key={ae.id}>
                      <td className="mono">
                        <strong>{ae.periodYyyymm}</strong>
                      </td>
                      <td className="mono">{ae.submissionType}</td>
                      <td className="mono">{ae.liquidationType}</td>
                      <td className="mono">{ae.liquidationNumber}</td>
                      <td className="mono">{ae.employeesCount}</td>
                      <td className="mono">{ae.officialSpecVersion}</td>
                      <td>
                        <span className="badge badge-success">
                          {ae.validationStatus}
                        </span>
                      </td>
                      <td className="mono">
                        {(ae.sha256Hash ?? '').slice(0, 16)}…
                      </td>
                      <td className="mono">
                        {(ae.createdAt ?? '').slice(0, 19).replace('T', ' ')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {arcaPreview && (
            <div className="info-box">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                }}
              >
                <div>
                  <strong>Archivo generado: {arcaPreview.filename}</strong>
                  <span className="text-muted" style={{ marginLeft: '0.75rem' }}>
                    SHA-256: <code>{arcaPreview.sha256Hash}</code>
                  </span>
                </div>
                <button
                  className="btn btn-primary btn-xs"
                  onClick={downloadArcaTxt}
                >
                  ⬇️ Descargar {arcaPreview.filename}
                </button>
              </div>
              <pre
                style={{
                  background: '#0f172a',
                  color: '#f8fafc',
                  padding: '0.85rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  overflowX: 'auto',
                  margin: 0,
                }}
              >
                {arcaPreview.txtContent}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          MODAL: ABRIR NUEVO PERÍODO DE LIQUIDACIÓN
         ===================================================================== */}
      {showNewPeriodModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowNewPeriodModal(false)}
        >
          <div
            className="modal-window modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Abrir Período de Liquidación</h3>
              <button
                className="btn-close"
                onClick={() => setShowNewPeriodModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={(e) => void handleCreatePeriod(e)}>
              <div className="modal-body">
                <div className="form-grid-3">
                  <div className="form-group">
                    <label>Año *</label>
                    <input
                      type="number"
                      min={2020}
                      max={2035}
                      value={newPeriodYear}
                      onChange={(e) => setNewPeriodYear(Number(e.target.value))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Mes (1-12) *</label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={newPeriodMonth}
                      onChange={(e) =>
                        setNewPeriodMonth(Number(e.target.value))
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Modalidad de Liquidación *</label>
                    <select
                      value={newPeriodModality}
                      onChange={(e) =>
                        setNewPeriodModality(e.target.value as any)
                      }
                    >
                      <option value="PRIMERA_QUINCENA">1ra Quincena</option>
                      <option value="SEGUNDA_QUINCENA">2da Quincena</option>
                      <option value="MENSUAL">Mensual</option>
                      <option value="SAC_1">1er SAC (Junio)</option>
                      <option value="SAC_2">2do SAC (Diciembre)</option>
                      <option value="VACACIONES">Vacaciones Anuales</option>
                      <option value="FINAL_EGRESO">Liquidación Final</option>
                      <option value="COMPLEMENTARIA">Complementaria</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowNewPeriodModal(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Crear Período e Inicializar Novedades
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activePayslipDetail && (
        <OfficialPayslipReceiptModal
          payslip={activePayslipDetail}
          companyName={companyName}
          companyCuit={companyCuit}
          companyAddress={companyAddress}
          onClose={() => setSelectedPayslipId(null)}
        />
      )}
    </div>
  );
};
