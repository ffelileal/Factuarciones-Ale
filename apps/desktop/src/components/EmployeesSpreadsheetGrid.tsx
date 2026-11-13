import React, { useMemo, useState } from 'react';
import type { EmployeeGridRowDto, EmploymentStatus } from '@ar-payroll/contracts';
import {
  desktopApiClient,
  type CategoryCatalogItemDto,
} from '../lib/apiClient.js';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activo',
  ON_LEAVE: 'De licencia',
  SUSPENDED: 'Suspendido',
  TERMINATED: 'Baja',
};

function humanize(v: string | null | undefined): string {
  if (!v) return '—';
  const s = v.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}


interface EmployeesSpreadsheetGridProps {
  companyId: string;
  companyName: string;
  employees: EmployeeGridRowDto[];
  categories: CategoryCatalogItemDto[];
  onRefresh: () => Promise<void>;
  onOpenDossier: (employeeId: string, employeeLabel: string) => void;
  onOpenImport: () => void;
}

type EditableField =
  | 'legajo'
  | 'lastName'
  | 'firstName'
  | 'dni'
  | 'hireDate'
  | 'jobPosition'
  | 'categoryId'
  | 'contractType'
  | 'employmentStatus';

const EDITABLE_COLUMNS: EditableField[] = [
  'legajo',
  'lastName',
  'firstName',
  'dni',
  'hireDate',
  'jobPosition',
  'categoryId',
  'contractType',
  'employmentStatus',
];

type SortField =
  | 'legajo'
  | 'lastName'
  | 'firstName'
  | 'cuil'
  | 'dni'
  | 'hireDate'
  | 'jobPosition'
  | 'categoryName'
  | 'agreementName'
  | 'contractType'
  | 'employmentStatus';

export function EmployeesSpreadsheetGrid({
  companyId,
  companyName,
  employees,
  categories,
  onRefresh,
  onOpenDossier,
  onOpenImport,
}: EmployeesSpreadsheetGridProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<SortField>('legajo');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Multi-selection & bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionType, setBulkActionType] = useState<
    'SET_STATUS' | 'SET_CATEGORY' | 'SET_CONTRACT_TYPE'
  >('SET_STATUS');
  const [bulkValue, setBulkValue] = useState<string>('ACTIVE');
  const [bulkSaving, setBulkSaving] = useState(false);

  // Inline cell editing state
  const [activeCell, setActiveCell] = useState<{
    employeeId: string;
    field: EditableField;
  } | null>(null);
  const [cellValue, setCellValue] = useState<string>('');
  const [savingCell, setSavingCell] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  // Resizable column widths
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    legajo: 85,
    lastName: 145,
    firstName: 145,
    cuil: 135,
    dni: 100,
    hireDate: 118,
    jobPosition: 170,
    categoryName: 185,
    agreementName: 165,
    contractType: 155,
    employmentStatus: 115,
  });

  // New employee modal state
  const [showNewModal, setShowNewModal] = useState(false);
  const [newEmp, setNewEmp] = useState({
    legajo: '',
    lastName: '',
    firstName: '',
    cuil: '',
    dni: '',
    hireDate: '2026-10-01',
    jobPosition: 'Operario Especializado',
    categoryId: categories[0]?.id ?? '32000000-0000-4000-8000-000000000001',
    contractType: 'TIEMPO_INDETERMINADO',
    remunerationModality: 'JORNALIZADO' as 'JORNALIZADO' | 'MENSUALIZADO',
    remunerationUnit: 'HORA' as 'HORA' | 'DIA' | 'MES',
    paymentFrequency: 'QUINCENAL' as 'QUINCENAL' | 'MENSUAL' | 'SEMANAL',
  });

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = employees.filter((e) => {
      if (statusFilter !== 'ALL' && e.employmentStatus !== statusFilter)
        return false;
      if (categoryFilter !== 'ALL' && e.categoryId !== categoryFilter)
        return false;
      if (!q) return true;
      return (
        e.legajo.toLowerCase().includes(q) ||
        e.lastName.toLowerCase().includes(q) ||
        e.firstName.toLowerCase().includes(q) ||
        e.cuil.toLowerCase().includes(q) ||
        e.dni.toLowerCase().includes(q) ||
        e.jobPosition.toLowerCase().includes(q) ||
        e.categoryName.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      if (sortField === 'legajo') {
        const na = Number(a.legajo);
        const nb = Number(b.legajo);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) {
          return sortAsc ? na - nb : nb - na;
        }
      }
      const va = String(a[sortField] ?? '').toLowerCase();
      const vb = String(b[sortField] ?? '').toLowerCase();
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [
    employees,
    searchQuery,
    statusFilter,
    categoryFilter,
    sortField,
    sortAsc,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize));
  const pagedEmployees = filteredAndSorted.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const startResize = (colKey: string, startX: number) => {
    const initialWidth = colWidths[colKey] ?? 130;
    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      setColWidths((prev) => ({
        ...prev,
        [colKey]: Math.max(75, initialWidth + delta),
      }));
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const beginEdit = (emp: EmployeeGridRowDto, field: EditableField) => {
    setActiveCell({ employeeId: emp.id, field });
    setCellValue(String(emp[field] ?? ''));
  };

  const commitInlineEdit = async (
    emp: EmployeeGridRowDto,
    field: EditableField,
    nextFieldOnTab?: EditableField
  ) => {
    const originalVal = String(emp[field] ?? '');

    if (cellValue === originalVal) {
      if (nextFieldOnTab) {
        beginEdit(emp, nextFieldOnTab);
      } else {
        setActiveCell(null);
      }
      return;
    }

    setSavingCell(true);
    setFeedback(null);
    try {
      await desktopApiClient.updateEmployee(companyId, emp.id, {
        [field]: cellValue,
        changeReason: `Edición rápida tipo planilla (${field})`,
      });
      await onRefresh();
      setFeedback({
        type: 'ok',
        text: `Cambios guardados (legajo ${emp.legajo})`,
      });
      if (nextFieldOnTab) {
        beginEdit(emp, nextFieldOnTab);
      } else {
        setActiveCell(null);
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error al actualizar celda',
      });
    } finally {
      setSavingCell(false);
    }
  };

  const handleCellKeyDown = (
    e: React.KeyboardEvent,
    emp: EmployeeGridRowDto,
    field: EditableField
  ) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setActiveCell(null);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void commitInlineEdit(emp, field);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const idx = EDITABLE_COLUMNS.indexOf(field);
      const nextIdx = e.shiftKey
        ? (idx - 1 + EDITABLE_COLUMNS.length) % EDITABLE_COLUMNS.length
        : (idx + 1) % EDITABLE_COLUMNS.length;
      const nextField = EDITABLE_COLUMNS[nextIdx];
      void commitInlineEdit(emp, field, nextField);
    }
  };

  const toggleSelectAll = () => {
    if (
      selectedIds.size === pagedEmployees.length &&
      pagedEmployees.length > 0
    ) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pagedEmployees.map((e) => e.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleExecuteBulk = async () => {
    if (selectedIds.size === 0) return;
    setBulkSaving(true);
    setFeedback(null);
    try {
      const body: {
        employeeIds: string[];
        action: 'SET_STATUS' | 'SET_CATEGORY' | 'SET_CONTRACT_TYPE';
        employmentStatus?: EmploymentStatus;
        categoryId?: string;
        contractType?: string;
      } = {
        employeeIds: Array.from(selectedIds),
        action: bulkActionType,
      };

      if (bulkActionType === 'SET_STATUS') {
        body.employmentStatus = bulkValue as EmploymentStatus;
      } else if (bulkActionType === 'SET_CATEGORY') {
        body.categoryId = bulkValue;
      } else if (bulkActionType === 'SET_CONTRACT_TYPE') {
        body.contractType = bulkValue;
      }

      const res = await desktopApiClient.bulkUpdateEmployees(companyId, body);
      await onRefresh();
      setSelectedIds(new Set());
      setFeedback({
        type: 'ok',
        text: `Cambios aplicados a ${res.employees.length} empleado(s).`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error en acción masiva',
      });
    } finally {
      setBulkSaving(false);
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCell(true);
    setFeedback(null);
    try {
      await desktopApiClient.createEmployee(companyId, {
        legajo: newEmp.legajo,
        lastName: newEmp.lastName,
        firstName: newEmp.firstName,
        cuil: newEmp.cuil,
        dni: newEmp.dni,
        hireDate: newEmp.hireDate,
        jobPosition: newEmp.jobPosition,
        categoryId:
          newEmp.categoryId ||
          categories[0]?.id ||
          '32000000-0000-4000-8000-000000000001',
        contractType: newEmp.contractType,
        remunerationModality: newEmp.remunerationModality,
        remunerationUnit: newEmp.remunerationUnit,
        paymentFrequency: newEmp.paymentFrequency,
      });
      setShowNewModal(false);
      setNewEmp({
        ...newEmp,
        legajo: '',
        lastName: '',
        firstName: '',
        cuil: '',
        dni: '',
      });
      await onRefresh();
      setFeedback({
        type: 'ok',
        text: 'Empleado creado.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error al crear empleado',
      });
    } finally {
      setSavingCell(false);
    }
  };

  return (
    <div className="spreadsheet-module">
      {/* Toolbar */}
      <div className="spreadsheet-toolbar">
        <div className="toolbar-left">
          <input
            className="search-input"
            placeholder="Buscar por legajo, apellido, nombre, CUIL, DNI, puesto..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">Todos los estados</option>
            <option value="ACTIVE">Activos (ACTIVE)</option>
            <option value="ON_LEAVE">En licencia (ON_LEAVE)</option>
            <option value="SUSPENDED">Suspendidos (SUSPENDED)</option>
            <option value="TERMINATED">Bajas (TERMINATED)</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">Todas las categorías</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar-right">
          <button className="btn btn-secondary" onClick={onOpenImport}>
            📥 Importar empleados (Excel / CSV / PDF)
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowNewModal(true)}
          >
            + Nuevo empleado
          </button>
        </div>
      </div>

      {/* Spreadsheet helper banner */}
      <div className="spreadsheet-hint">
        <span>
          Doble clic en una celda para editarla · <kbd>Tab</kbd> siguiente · <kbd>Enter</kbd> guardar · <kbd>Esc</kbd> cancelar
        </span>
        {feedback && (
          <span
            className={feedback.type === 'ok' ? 'text-success' : 'text-danger'}
          >
            {feedback.text}
          </span>
        )}
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="bulk-bar">
          <strong>{selectedIds.size} empleado(s) seleccionado(s):</strong>
          <select
            value={bulkActionType}
            onChange={(e) => {
              const nextType = e.target.value as typeof bulkActionType;
              setBulkActionType(nextType);
              if (nextType === 'SET_STATUS') setBulkValue('ACTIVE');
              else if (nextType === 'SET_CATEGORY')
                setBulkValue(categories[0]?.id ?? '');
              else setBulkValue('TIEMPO_INDETERMINADO');
            }}
          >
            <option value="SET_STATUS">Cambiar Estado</option>
            <option value="SET_CATEGORY">Asignar Categoría CCT</option>
            <option value="SET_CONTRACT_TYPE">
              Cambiar Modalidad Contratación
            </option>
          </select>

          {bulkActionType === 'SET_STATUS' && (
            <select
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="ON_LEAVE">ON_LEAVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="TERMINATED">TERMINATED</option>
            </select>
          )}

          {bulkActionType === 'SET_CATEGORY' && (
            <select
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  CCT {c.cct_number} - {c.name}
                </option>
              ))}
            </select>
          )}

          {bulkActionType === 'SET_CONTRACT_TYPE' && (
            <select
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
            >
              <option value="TIEMPO_INDETERMINADO">TIEMPO_INDETERMINADO</option>
              <option value="PLAZO_FIJO">PLAZO_FIJO</option>
              <option value="TEMPORADA">TEMPORADA</option>
              <option value="EVENTUAL">EVENTUAL</option>
            </select>
          )}

          <button
            className="btn btn-primary btn-sm"
            disabled={bulkSaving}
            onClick={() => void handleExecuteBulk()}
          >
            {bulkSaving ? 'Aplicando...' : 'Aplicar acción masiva'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setSelectedIds(new Set())}
          >
            Cancelar selección
          </button>
        </div>
      )}

      {/* Main Excel-like Grid */}
      <div className="spreadsheet-container">
        <table className="spreadsheet-table">
          <thead>
            <tr>
              <th style={{ width: 38 }}>
                <input
                  type="checkbox"
                  checked={
                    pagedEmployees.length > 0 &&
                    selectedIds.size === pagedEmployees.length
                  }
                  onChange={toggleSelectAll}
                />
              </th>
              {[
                { key: 'legajo', label: 'Legajo' },
                { key: 'lastName', label: 'Apellido' },
                { key: 'firstName', label: 'Nombre' },
                { key: 'cuil', label: 'CUIL' },
                { key: 'dni', label: 'DNI' },
                { key: 'hireDate', label: 'Fecha de ingreso' },
                { key: 'jobPosition', label: 'Puesto' },
                { key: 'categoryName', label: 'Categoría' },
                { key: 'agreementName', label: 'Convenio' },
                { key: 'contractType', label: 'Modalidad de contratación' },
                { key: 'employmentStatus', label: 'Estado' },
              ].map((col) => (
                <th
                  key={col.key}
                  style={{
                    width: colWidths[col.key] ?? 130,
                    position: 'relative',
                  }}
                  onClick={() => toggleSort(col.key as SortField)}
                >
                  <div className="th-inner">
                    <span>{col.label}</span>
                    {sortField === col.key && (
                      <span className="sort-arrow">{sortAsc ? '▲' : '▼'}</span>
                    )}
                  </div>
                  <div
                    className="col-resizer"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => startResize(col.key, e.clientX)}
                  />
                </th>
              ))}
              <th style={{ width: 115 }}>Ficha 360°</th>
            </tr>
          </thead>
          <tbody>
            {pagedEmployees.length === 0 ? (
              <tr>
                <td colSpan={13} className="empty-state">
                  No se encontraron empleados con los filtros actuales en{' '}
                  {companyName}.
                </td>
              </tr>
            ) : (
              pagedEmployees.map((emp) => {
                const isSelected = selectedIds.has(emp.id);
                const renderCell = (
                  field: EditableField,
                  displayValue: React.ReactNode
                ) => {
                  const isEditing =
                    activeCell?.employeeId === emp.id &&
                    activeCell?.field === field;
                  if (isEditing) {
                    if (field === 'employmentStatus') {
                      return (
                        <select
                          autoFocus
                          className="cell-input"
                          value={cellValue}
                          onChange={(e) => setCellValue(e.target.value)}
                          onBlur={() => void commitInlineEdit(emp, field)}
                          onKeyDown={(e) => handleCellKeyDown(e, emp, field)}
                        >
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="ON_LEAVE">ON_LEAVE</option>
                          <option value="SUSPENDED">SUSPENDED</option>
                          <option value="TERMINATED">TERMINATED</option>
                        </select>
                      );
                    }
                    if (field === 'contractType') {
                      return (
                        <select
                          autoFocus
                          className="cell-input"
                          value={cellValue}
                          onChange={(e) => setCellValue(e.target.value)}
                          onBlur={() => void commitInlineEdit(emp, field)}
                          onKeyDown={(e) => handleCellKeyDown(e, emp, field)}
                        >
                          <option value="TIEMPO_INDETERMINADO">
                            TIEMPO_INDETERMINADO
                          </option>
                          <option value="PLAZO_FIJO">PLAZO_FIJO</option>
                          <option value="TEMPORADA">TEMPORADA</option>
                          <option value="EVENTUAL">EVENTUAL</option>
                        </select>
                      );
                    }
                    if (field === 'categoryId') {
                      return (
                        <select
                          autoFocus
                          className="cell-input"
                          value={cellValue}
                          onChange={(e) => setCellValue(e.target.value)}
                          onBlur={() => void commitInlineEdit(emp, field)}
                          onKeyDown={(e) => handleCellKeyDown(e, emp, field)}
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      );
                    }
                    return (
                      <input
                        autoFocus
                        className="cell-input"
                        type={field === 'hireDate' ? 'date' : 'text'}
                        value={cellValue}
                        disabled={savingCell}
                        onChange={(e) => setCellValue(e.target.value)}
                        onBlur={() => void commitInlineEdit(emp, field)}
                        onKeyDown={(e) => handleCellKeyDown(e, emp, field)}
                      />
                    );
                  }
                  return (
                    <div
                      className="editable-cell"
                      onDoubleClick={() => beginEdit(emp, field)}
                      title="Doble clic para editar en línea"
                    >
                      {displayValue}
                    </div>
                  );
                };

                return (
                  <tr
                    key={emp.id}
                    className={isSelected ? 'row-selected' : ''}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRow(emp.id)}
                      />
                    </td>
                    <td className="mono">{renderCell('legajo', emp.legajo)}</td>
                    <td>
                      <strong>{renderCell('lastName', emp.lastName)}</strong>
                    </td>
                    <td>{renderCell('firstName', emp.firstName)}</td>
                    <td className="mono">{emp.cuil}</td>
                    <td className="mono">{renderCell('dni', emp.dni)}</td>
                    <td className="mono">
                      {renderCell('hireDate', emp.hireDate)}
                    </td>
                    <td>{renderCell('jobPosition', emp.jobPosition)}</td>
                    <td>{renderCell('categoryId', emp.categoryName)}</td>
                    <td>CCT {emp.agreementCode}</td>
                    <td>
                      {renderCell(
                        'contractType',
                        humanize(emp.contractType)
                      )}
                    </td>
                    <td>
                      {renderCell(
                        'employmentStatus',
                        <span
                          className={`badge ${
                            emp.employmentStatus === 'ACTIVE'
                              ? 'badge-success'
                              : emp.employmentStatus === 'TERMINATED'
                              ? 'badge-danger'
                              : 'badge-warning'
                          }`}
                        >
                          {STATUS_LABELS[emp.employmentStatus] ?? emp.employmentStatus}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() =>
                          onOpenDossier(
                            emp.id,
                            `Leg. ${emp.legajo} - ${emp.lastName}, ${emp.firstName}`
                          )
                        }
                      >
                        Abrir Ficha
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="spreadsheet-footer">
        <div>
          Mostrando {pagedEmployees.length} de {filteredAndSorted.length}{' '}
          empleados (Total empresa: {employees.length})
        </div>
        <div className="pagination-controls">
          <button
            className="btn btn-secondary btn-xs"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            ← Anterior
          </button>
          <span>
            Página {page} de {totalPages}
          </span>
          <button
            className="btn btn-secondary btn-xs"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Siguiente →
          </button>
        </div>
      </div>

      {/* New Employee Modal */}
      {showNewModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Nuevo Empleado — {companyName}</h3>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowNewModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={(e) => void handleCreateEmployee(e)}>
              <div className="modal-body">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Legajo</label>
                    <input
                      className="mono"
                      placeholder="Ej: 4"
                      value={newEmp.legajo}
                      onChange={(e) =>
                        setNewEmp({ ...newEmp, legajo: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Fecha de Ingreso</label>
                    <input
                      type="date"
                      value={newEmp.hireDate}
                      onChange={(e) =>
                        setNewEmp({ ...newEmp, hireDate: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Apellido</label>
                    <input
                      value={newEmp.lastName}
                      onChange={(e) =>
                        setNewEmp({ ...newEmp, lastName: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Nombre</label>
                    <input
                      value={newEmp.firstName}
                      onChange={(e) =>
                        setNewEmp({ ...newEmp, firstName: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>CUIL</label>
                    <input
                      className="mono"
                      placeholder="20-35812264-8"
                      value={newEmp.cuil}
                      onChange={(e) =>
                        setNewEmp({ ...newEmp, cuil: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>DNI</label>
                    <input
                      className="mono"
                      placeholder="35812264"
                      value={newEmp.dni}
                      onChange={(e) =>
                        setNewEmp({ ...newEmp, dni: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Categoría CCT</label>
                    <select
                      value={newEmp.categoryId}
                      onChange={(e) => {
                        const cat = categories.find(
                          (c) => c.id === e.target.value
                        );
                        setNewEmp({
                          ...newEmp,
                          categoryId: e.target.value,
                          jobPosition: cat ? cat.name : newEmp.jobPosition,
                        });
                      }}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          CCT {c.cct_number} - {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Puesto / Calificación Profesional</label>
                    <input
                      value={newEmp.jobPosition}
                      onChange={(e) =>
                        setNewEmp({ ...newEmp, jobPosition: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Modalidad Laboral</label>
                    <select
                      value={newEmp.remunerationModality}
                      onChange={(e) => {
                        const mod = e.target.value as
                          | 'JORNALIZADO'
                          | 'MENSUALIZADO';
                        setNewEmp({
                          ...newEmp,
                          remunerationModality: mod,
                          remunerationUnit:
                            mod === 'JORNALIZADO' ? 'HORA' : 'MES',
                          paymentFrequency:
                            mod === 'JORNALIZADO' ? 'QUINCENAL' : 'MENSUAL',
                        });
                      }}
                    >
                      <option value="JORNALIZADO">
                        JORNALIZADO (Por Hora / Quincenal)
                      </option>
                      <option value="MENSUALIZADO">
                        MENSUALIZADO (Mensual)
                      </option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Modalidad de Contratación</label>
                    <select
                      value={newEmp.contractType}
                      onChange={(e) =>
                        setNewEmp({
                          ...newEmp,
                          contractType: e.target.value,
                        })
                      }
                    >
                      <option value="TIEMPO_INDETERMINADO">
                        TIEMPO_INDETERMINADO (Tiempo Indeterminado)
                      </option>
                      <option value="PLAZO_FIJO">PLAZO_FIJO (Plazo Fijo)</option>
                      <option value="TEMPORADA">TEMPORADA (Temporada)</option>
                      <option value="EVENTUAL">EVENTUAL (Eventual)</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowNewModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingCell}
                >
                  {savingCell
                    ? 'Guardando...'
                    : 'Guardar empleado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
