import React, { useState } from 'react';
import type { DuplicateResolutionPolicy, ImportKind } from '@ar-payroll/contracts';
import {
  desktopApiClient,
  type StagingBatchDetailResponseDto,
  type ConfirmImportReportDto,
} from '../lib/apiClient.js';

interface ImportWizardModalProps {
  defaultTargetEntity: 'EMPLOYEES' | 'COMPANIES';
  companyId?: string;
  companyName?: string;
  onClose: () => void;
  onCompleted: () => void;
}

export function ImportWizardModal({
  defaultTargetEntity,
  companyId,
  companyName,
  onClose,
  onCompleted,
}: ImportWizardModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [targetEntity, setTargetEntity] = useState<'EMPLOYEES' | 'COMPANIES'>(
    defaultTargetEntity
  );
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: number;
    mimeType: string;
    base64: string;
  } | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [batch, setBatch] = useState<StagingBatchDetailResponseDto | null>(null);
  const [duplicatePolicy, setDuplicatePolicy] =
    useState<DuplicateResolutionPolicy>('SKIP');
  const [confirmResult, setConfirmResult] = useState<ConfirmImportReportDto | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  const handleFileChange = async (file: File | null) => {
    if (!file) return;
    setError(null);
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    setSelectedFile({
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      base64,
    });
  };

  const handleAnalyzeFile = async (sheetOverride?: string) => {
    if (!selectedFile) {
      setError('Seleccione un archivo Excel (.xlsx, .xlsm), CSV (.csv) o PDF (.pdf).');
      return;
    }
    if (targetEntity === 'EMPLOYEES' && !companyId) {
      setError('Debe abrir una empresa antes de importar empleados.');
      return;
    }

    const isPdf = selectedFile.name.toLowerCase().endsWith('.pdf');
    const importKind: ImportKind =
      targetEntity === 'EMPLOYEES'
        ? isPdf
          ? 'PDF_EMPLOYEES'
          : 'EMPLOYEES'
        : isPdf
        ? 'PDF_COMPANIES'
        : 'COMPANIES';

    setLoading(true);
    setError(null);
    try {
      const res = await desktopApiClient.createImportStaging({
        companyId: targetEntity === 'EMPLOYEES' ? companyId : null,
        importKind,
        fileName: selectedFile.name,
        mimeType: selectedFile.mimeType,
        base64Content: selectedFile.base64,
        selectedSheet: sheetOverride || selectedSheet || undefined,
        saveOriginalDocument: true,
      });
      setBatch(res);
      setSelectedSheet(res.metadata.selectedSheet);
      if (step === 1) {
        setStep(2);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al analizar el archivo.');
    } finally {
      setLoading(false);
    }
  };

  const startEditingRow = (rowId: string, data: Record<string, string>) => {
    setEditingRowId(rowId);
    setEditValues({ ...data });
  };

  const handleSaveRowEdit = async (
    rowId: string,
    rowDataFallback: Record<string, string>,
    duplicateResolution?: DuplicateResolutionPolicy
  ) => {
    if (!batch) return;
    setLoading(true);
    setError(null);
    try {
      const res = await desktopApiClient.updateImportRow(batch.batchId, rowId, {
        correctedData: editingRowId === rowId ? editValues : rowDataFallback,
        duplicateResolution,
      });
      setBatch(res);
      setEditingRowId(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al actualizar la fila.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmBatch = async () => {
    if (!batch) return;
    setLoading(true);
    setError(null);
    try {
      const res = await desktopApiClient.confirmImportBatch(batch.batchId, {
        defaultDuplicatePolicy: duplicatePolicy,
      });
      setConfirmResult(res);
      setStep(6);
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar la importación.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card modal-xl">
        <div className="modal-header">
          <div>
            <h3>
              Importar archivo
              {companyName ? ` — ${companyName}` : ''}
            </h3>
            <p className="text-muted">
              Excel, CSV o PDF. Nada se guarda hasta que confirmes.
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Stepper */}
        <div className="wizard-steps">
          {[
            { n: 1, label: 'Archivo' },
            { n: 2, label: 'Columnas' },
            { n: 3, label: 'Revisión' },
            { n: 4, label: 'Duplicados' },
            { n: 5, label: 'Resumen' },
            { n: 6, label: 'Resultado' },
          ].map((s) => (
            <div
              key={s.n}
              className={`wizard-step ${
                step === s.n ? 'active' : step > s.n ? 'done' : ''
              }`}
            >
              {s.label}
            </div>
          ))}
        </div>

        {error && <div className="alert-error">{error}</div>}

        <div className="modal-body">
          {step === 1 && (
            <div className="wizard-panel">
              <div className="form-grid-2">
                <div className="form-group">
                  <label>Tipo de registros a importar</label>
                  <select
                    value={targetEntity}
                    onChange={(e) =>
                      setTargetEntity(e.target.value as 'EMPLOYEES' | 'COMPANIES')
                    }
                    disabled={!companyId && defaultTargetEntity === 'COMPANIES'}
                  >
                    {companyId && (
                      <option value="EMPLOYEES">Empleados de {companyName}</option>
                    )}
                    <option value="COMPANIES">
                      Empresas (Razón social, CUIT, Domicilio)
                    </option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Formatos soportados</label>
                  <div className="text-muted" style={{ paddingTop: '0.4rem' }}>
                    Excel (`.xlsx`, `.xlsm` con exclusión automática de macros VBA), `.csv` y `.pdf`
                  </div>
                </div>
              </div>

              <label
                className="file-dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0] ?? null;
                  void handleFileChange(file);
                }}
              >
                <input
                  type="file"
                  accept=".xlsx,.xlsm,.csv,.tsv,.pdf"
                  onChange={(e) => void handleFileChange(e.target.files?.[0] ?? null)}
                  style={{ display: 'none' }}
                />
                <div className="dropzone-title">
                  {selectedFile
                    ? `Archivo seleccionado: ${selectedFile.name}`
                    : 'Arrastre aquí su archivo Excel (.xlsx / .xlsm), CSV o PDF, o haga clic para buscar'}
                </div>
                <div className="dropzone-subtitle">
                  {selectedFile
                    ? `Tamaño: ${(selectedFile.size / 1024).toFixed(1)} KB · Formato: ${selectedFile.name
                        .split('.')
                        .pop()
                        ?.toUpperCase()}`
                    : 'Se analizarán hojas, columnas, CUIL/CUIT, fechas y duplicados antes de importar.'}
                </div>
              </label>

              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={onClose}>
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!selectedFile || loading}
                  onClick={() => void handleAnalyzeFile()}
                >
                  {loading
                    ? 'Analizando archivo...'
                    : 'Analizar archivo y continuar →'}
                </button>
              </div>
            </div>
          )}

          {step === 2 && batch && (
            <div className="wizard-panel">
              <div className="form-grid-3">
                <div className="info-box">
                  <span className="info-label">Archivo</span>
                  <strong>{batch.metadata.fileName}</strong>
                  <span className="text-muted">
                    {batch.metadata.fileFormat}
                  </span>
                </div>
                <div className="form-group">
                  <label>Hoja de cálculo seleccionada</label>
                  <select
                    value={selectedSheet}
                    onChange={(e) => {
                      setSelectedSheet(e.target.value);
                      void handleAnalyzeFile(e.target.value);
                    }}
                  >
                    {batch.metadata.sheetNames.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="info-box">
                  <span className="info-label">Filas detectadas</span>
                  <strong>{batch.summary.totalDetected} registros</strong>
                  <span className="text-muted">
                    {batch.summary.validCount} válidos · {batch.summary.duplicateCount}{' '}
                    duplicados · {batch.summary.errorCount} con errores
                  </span>
                </div>
              </div>

              <h4 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
                Mapeo automático de columnas detectadas
              </h4>
              <div className="table-scroll" style={{ maxHeight: '220px' }}>
                <table className="spreadsheet-table">
                  <thead>
                    <tr>
                      <th>Campo del sistema AR-PAYROLL</th>
                      <th>Columna detectada en archivo origen</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(batch.metadata.suggestedMapping).map(
                      ([sysField, srcCol]) => (
                        <tr key={sysField}>
                          <td>
                            <strong>{sysField}</strong>
                          </td>
                          <td>{srcCol}</td>
                          <td>
                            <span className="badge badge-success">
                              Mapeado automáticamente
                            </span>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setStep(1)}>
                  ← Cambiar archivo
                </button>
                <button className="btn btn-primary" onClick={() => setStep(3)}>
                  Revisar filas detectadas ({batch.summary.totalDetected}) →
                </button>
              </div>
            </div>
          )}

          {step === 3 && batch && (
            <div className="wizard-panel">
              <div className="toolbar-row">
                <div>
                  Podés corregir cualquier fila marcada antes de importar.
                </div>
                <div className="badge-group">
                  <span className="badge badge-success">
                    Válidas: {batch.summary.validCount}
                  </span>
                  <span className="badge badge-warning">
                    Duplicadas: {batch.summary.duplicateCount}
                  </span>
                  <span className="badge badge-danger">
                    Con errores: {batch.summary.errorCount}
                  </span>
                </div>
              </div>

              <div className="table-scroll" style={{ maxHeight: '360px' }}>
                <table className="spreadsheet-table">
                  <thead>
                    <tr>
                      <th>Fila</th>
                      <th>Estado</th>
                      {targetEntity === 'EMPLOYEES' ? (
                        <>
                          <th>Legajo</th>
                          <th>Apellido</th>
                          <th>Nombre</th>
                          <th>CUIL</th>
                          <th>DNI</th>
                          <th>Ingreso</th>
                          <th>Categoría / Puesto</th>
                        </>
                      ) : (
                        <>
                          <th>Razón Social</th>
                          <th>Nombre Comercial</th>
                          <th>CUIT</th>
                          <th>Domicilio</th>
                        </>
                      )}
                      <th>Validaciones / Observaciones</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.rows.map((row) => {
                      const isEditing = editingRowId === row.id;
                      const p = isEditing ? editValues : row.data;
                      return (
                        <tr
                          key={row.id}
                          className={
                            row.rowStatus === 'ERROR'
                              ? 'row-error'
                              : row.rowStatus === 'DUPLICATE' ||
                                row.rowStatus === 'NEEDS_REVIEW'
                              ? 'row-warning'
                              : ''
                          }
                        >
                          <td className="mono">{row.rowIndex}</td>
                          <td>
                            <span
                              className={`badge ${
                                row.rowStatus === 'VALID'
                                  ? 'badge-success'
                                  : row.rowStatus === 'DUPLICATE' ||
                                    row.rowStatus === 'NEEDS_REVIEW'
                                  ? 'badge-warning'
                                  : row.rowStatus === 'SKIPPED'
                                  ? 'badge-neutral'
                                  : 'badge-danger'
                              }`}
                            >
                              {row.rowStatus}
                            </span>
                          </td>

                          {targetEntity === 'EMPLOYEES' ? (
                            <>
                              <td>
                                {isEditing ? (
                                  <input
                                    className="cell-input"
                                    value={p.legajo ?? ''}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        legajo: e.target.value,
                                      })
                                    }
                                  />
                                ) : (
                                  p.legajo || '—'
                                )}
                              </td>
                              <td>
                                {isEditing ? (
                                  <input
                                    className="cell-input"
                                    value={p.lastName ?? ''}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        lastName: e.target.value,
                                      })
                                    }
                                  />
                                ) : (
                                  p.lastName || '—'
                                )}
                              </td>
                              <td>
                                {isEditing ? (
                                  <input
                                    className="cell-input"
                                    value={p.firstName ?? ''}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        firstName: e.target.value,
                                      })
                                    }
                                  />
                                ) : (
                                  p.firstName || '—'
                                )}
                              </td>
                              <td className="mono">
                                {isEditing ? (
                                  <input
                                    className="cell-input"
                                    value={p.cuil ?? ''}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        cuil: e.target.value,
                                      })
                                    }
                                  />
                                ) : (
                                  p.cuil || '—'
                                )}
                              </td>
                              <td className="mono">
                                {isEditing ? (
                                  <input
                                    className="cell-input"
                                    value={p.dni ?? ''}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        dni: e.target.value,
                                      })
                                    }
                                  />
                                ) : (
                                  p.dni || '—'
                                )}
                              </td>
                              <td className="mono">
                                {isEditing ? (
                                  <input
                                    className="cell-input"
                                    value={p.hireDate ?? ''}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        hireDate: e.target.value,
                                      })
                                    }
                                  />
                                ) : (
                                  p.hireDate || '—'
                                )}
                              </td>
                              <td>
                                {isEditing ? (
                                  <input
                                    className="cell-input"
                                    value={p.categoryName ?? p.jobPosition ?? ''}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        categoryName: e.target.value,
                                        jobPosition: e.target.value,
                                      })
                                    }
                                  />
                                ) : (
                                  p.categoryName || p.jobPosition || '—'
                                )}
                              </td>
                            </>
                          ) : (
                            <>
                              <td>
                                {isEditing ? (
                                  <input
                                    className="cell-input"
                                    value={p.legalName ?? ''}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        legalName: e.target.value,
                                      })
                                    }
                                  />
                                ) : (
                                  p.legalName || '—'
                                )}
                              </td>
                              <td>
                                {isEditing ? (
                                  <input
                                    className="cell-input"
                                    value={p.tradeName ?? ''}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        tradeName: e.target.value,
                                      })
                                    }
                                  />
                                ) : (
                                  p.tradeName || '—'
                                )}
                              </td>
                              <td className="mono">
                                {isEditing ? (
                                  <input
                                    className="cell-input"
                                    value={p.cuit ?? ''}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        cuit: e.target.value,
                                      })
                                    }
                                  />
                                ) : (
                                  p.cuit || '—'
                                )}
                              </td>
                              <td>
                                {isEditing ? (
                                  <input
                                    className="cell-input"
                                    value={p.fiscalAddress ?? ''}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        fiscalAddress: e.target.value,
                                      })
                                    }
                                  />
                                ) : (
                                  p.fiscalAddress || '—'
                                )}
                              </td>
                            </>
                          )}

                          <td>
                            {row.errors.map((errText, idx) => (
                              <div key={idx} className="text-danger-sm">
                                • {errText}
                              </div>
                            ))}
                            {row.warnings.map((warnText, idx) => (
                              <div key={idx} className="text-warning-sm">
                                • {warnText}
                              </div>
                            ))}
                            {row.errors.length === 0 && row.warnings.length === 0 && (
                              <span className="text-muted">OK</span>
                            )}
                          </td>

                          <td>
                            {isEditing ? (
                              <div className="btn-row">
                                <button
                                  className="btn btn-primary btn-xs"
                                  onClick={() =>
                                    void handleSaveRowEdit(row.id, row.data)
                                  }
                                >
                                  Guardar
                                </button>
                                <button
                                  className="btn btn-secondary btn-xs"
                                  onClick={() => setEditingRowId(null)}
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <div className="btn-row">
                                <button
                                  className="btn btn-secondary btn-xs"
                                  onClick={() => startEditingRow(row.id, row.data)}
                                >
                                  Corregir
                                </button>
                                {row.rowStatus !== 'SKIPPED' ? (
                                  <button
                                    className="btn btn-secondary btn-xs"
                                    onClick={() =>
                                      void handleSaveRowEdit(row.id, row.data, 'SKIP')
                                    }
                                  >
                                    Omitir
                                  </button>
                                ) : (
                                  <span className="badge badge-neutral">Omitida</span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setStep(2)}>
                  ← Volver a columnas
                </button>
                <button className="btn btn-primary" onClick={() => setStep(4)}>
                  Configurar política de duplicados →
                </button>
              </div>
            </div>
          )}

          {step === 4 && batch && (
            <div className="wizard-panel">
              <h4>
                Política de resolución de registros duplicados (
                {batch.summary.duplicateCount} detectados)
              </h4>
              <p className="text-muted">
                Seleccione cómo debe proceder el motor transaccional frente a CUIL/CUIT o Legajos que ya existen en la base de datos.
              </p>

              <div className="policy-cards">
                <label
                  className={`policy-card ${duplicatePolicy === 'SKIP' ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="dupPolicy"
                    checked={duplicatePolicy === 'SKIP'}
                    onChange={() => setDuplicatePolicy('SKIP')}
                  />
                  <div>
                    <strong>Omitir duplicados (Recomendado)</strong>
                    <p className="text-muted">
                      Conserva intactos los registros existentes y crea únicamente los registros nuevos válidos.
                    </p>
                  </div>
                </label>

                <label
                  className={`policy-card ${
                    duplicatePolicy === 'UPDATE' ? 'selected' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="dupPolicy"
                    checked={duplicatePolicy === 'UPDATE'}
                    onChange={() => setDuplicatePolicy('UPDATE')}
                  />
                  <div>
                    <strong>
                      Actualizar registros existentes de forma segura (Versionado)
                    </strong>
                    <p className="text-muted">
                      Actualiza datos del empleado/empresa conservando el historial de cambios.
                    </p>
                  </div>
                </label>

                <label
                  className={`policy-card ${
                    duplicatePolicy === 'MANUAL_REVIEW' ? 'selected' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="dupPolicy"
                    checked={duplicatePolicy === 'MANUAL_REVIEW'}
                    onChange={() => setDuplicatePolicy('MANUAL_REVIEW')}
                  />
                  <div>
                    <strong>Revisar manualmente caso por caso</strong>
                    <p className="text-muted">
                      Solo actualiza aquellas filas duplicadas que usted haya marcado explícitamente para actualizar en la tabla previa.
                    </p>
                  </div>
                </label>
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setStep(3)}>
                  ← Volver a previsualización
                </button>
                <button className="btn btn-primary" onClick={() => setStep(5)}>
                  Ver resumen previo a confirmar →
                </button>
              </div>
            </div>
          )}

          {step === 5 && batch && (
            <div className="wizard-panel">
              <h4>Resumen previo a la confirmación transaccional</h4>
              <div className="kpi-grid">
                <div className="kpi-card">
                  <span className="kpi-label">Total detectados</span>
                  <strong className="kpi-value">{batch.summary.totalDetected}</strong>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">A crear (nuevos)</span>
                  <strong className="kpi-value text-success">
                    {batch.summary.toCreateCount}
                  </strong>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Duplicados detectados</span>
                  <strong className="kpi-value text-warning">
                    {batch.summary.duplicateCount}
                  </strong>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Con error / Omitidos</span>
                  <strong className="kpi-value text-danger">
                    {batch.summary.errorCount + batch.summary.skippedCount}
                  </strong>
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setStep(4)}>
                  ← Volver
                </button>
                <button
                  className="btn btn-primary"
                  disabled={loading}
                  onClick={() => void handleConfirmBatch()}
                >
                  {loading
                    ? 'Importando...'
                    : 'Confirmar e importar'}
                </button>
              </div>
            </div>
          )}

          {step === 6 && confirmResult && (
            <div className="wizard-panel">
              <div className="alert-success">
                <strong>Importación completada y auditada correctamente.</strong>
              </div>
              <div className="kpi-grid">
                <div className="kpi-card">
                  <span className="kpi-label">Registros Creados</span>
                  <strong className="kpi-value text-success">
                    {confirmResult.createdCount}
                  </strong>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Registros Actualizados</span>
                  <strong className="kpi-value">{confirmResult.updatedCount}</strong>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Registros Omitidos</span>
                  <strong className="kpi-value">{confirmResult.skippedCount}</strong>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Filas Rechazadas</span>
                  <strong className="kpi-value text-danger">
                    {confirmResult.rejectedCount}
                  </strong>
                </div>
              </div>

              {confirmResult.rejectedRows.length > 0 && (
                <div className="table-scroll" style={{ maxHeight: '220px' }}>
                  <table className="spreadsheet-table">
                    <thead>
                      <tr>
                        <th>Fila</th>
                        <th>Motivos de rechazo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {confirmResult.rejectedRows.map((r) => (
                        <tr key={r.rowIndex}>
                          <td className="mono">{r.rowIndex}</td>
                          <td>{r.reasons.join(' | ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="modal-footer">
                <button className="btn btn-primary" onClick={onClose}>
                  Finalizar y volver a la tabla
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
