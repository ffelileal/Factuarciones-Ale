import crypto from 'node:crypto';
import type pg from 'pg';
import {
  SEED_IDS,
  isValidArgentineCuitOrCuil,
  type CreateImportStagingRequestDto,
  type UpdateStagingRowRequestDto,
  type ConfirmImportBatchRequestDto,
} from '@ar-payroll/contracts';
import { AuthenticationError, type ActivatedSessionContext } from '../db/pool.js';
import { parseUploadedFile } from './file-parser.service.js';
import { companyService } from './company.service.js';
import { employeeService } from './employee.service.js';

export interface ValidatedStagingRow {
  rowIndex: number;
  sheetName: string;
  targetEntity: 'COMPANY' | 'EMPLOYEE';
  rawData: Record<string, string>;
  proposedData: Record<string, string>;
  correctedData: Record<string, string> | null;
  errors: string[];
  warnings: string[];
  rowStatus: 'VALID' | 'DUPLICATE' | 'NEEDS_REVIEW' | 'ERROR' | 'SKIPPED';
  duplicateInfo?: {
    existingId: string;
    keyField: 'CUIT' | 'CUIL' | 'LEGAJO';
    keyValue: string;
    resolution: 'SKIP' | 'UPDATE' | 'MANUAL_REVIEW';
  };
}

/**
 * Normaliza fechas desde formatos argentinos (DD/MM/YYYY), ISO (YYYY-MM-DD) o números de serie de Excel.
 */
export function normalizeDateString(raw: string): string | null {
  const val = (raw ?? '').trim();
  if (!val) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return val;
  }

  const dmy = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    const y = dmy[3];
    return `${y}-${m}-${d}`;
  }

  // Número de serie de fecha de Excel (ej: 36281 -> 1999-05-01)
  if (/^\d{4,5}(?:\.\d+)?$/.test(val)) {
    const serial = Math.floor(Number(val));
    if (serial > 10000 && serial < 70000) {
      const utcDays = serial - 25569;
      const date = new Date(utcDays * 86400 * 1000);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10);
      }
    }
  }

  return null;
}

/**
 * Detecta automáticamente la correspondencia entre los encabezados del archivo y los campos del sistema.
 */
export function buildSuggestedColumnMapping(
  headers: string[],
  targetEntity: 'COMPANY' | 'EMPLOYEE',
): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const h of headers) {
    const norm = h
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    if (targetEntity === 'COMPANY') {
      if (norm.includes('cuit')) mapping.cuit = h;
      else if (norm.includes('razon') || norm.includes('denominacion') || norm === 'empresa')
        mapping.legalName = h;
      else if (norm.includes('comercial') || norm.includes('fantasia')) mapping.tradeName = h;
      else if (norm.includes('domicilio') || norm.includes('direccion')) mapping.fiscalAddress = h;
      else if (norm.includes('localidad') || norm.includes('ciudad')) mapping.locality = h;
      else if (norm.includes('provincia')) mapping.province = h;
      else if (norm.includes('actividad')) mapping.primaryActivity = h;
    } else {
      if (norm.includes('legajo') || norm === 'leg') mapping.legajo = h;
      else if (norm === 'apellido y nombre' || norm === 'nombre y apellido' || norm === 'empleado')
        mapping.fullName = h;
      else if (norm.includes('apellido')) mapping.lastName = h;
      else if (norm.includes('nombre')) mapping.firstName = h;
      else if (norm.includes('cuil') || norm.includes('cuit')) mapping.cuil = h;
      else if (norm.includes('dni') || norm.includes('documento')) mapping.dni = h;
      else if (norm.includes('ingreso') || norm.includes('alta') || norm.includes('fecha'))
        mapping.hireDate = h;
      else if (norm.includes('puesto') || norm.includes('cargo') || norm.includes('funcion'))
        mapping.jobPosition = h;
      else if (norm.includes('categoria') || norm.includes('cat')) mapping.categoryName = h;
      else if (norm.includes('modalidad') || norm.includes('contrato')) mapping.contractType = h;
    }
  }

  return mapping;
}

export class ImportService {
  /**
   * Valida una fila propuesta de Empresa o Empleado contra las reglas de negocio y la base de datos.
   */
  private async validateRowData(
    client: pg.PoolClient,
    targetEntity: 'COMPANY' | 'EMPLOYEE',
    companyId: string | null,
    data: Record<string, string>,
    seenKeysInBatch: Set<string>,
    categoriesMap: Map<string, string>,
    defaultResolution: 'SKIP' | 'UPDATE' | 'MANUAL_REVIEW' = 'MANUAL_REVIEW',
  ): Promise<{
    normalized: Record<string, string>;
    errors: string[];
    warnings: string[];
    rowStatus: 'VALID' | 'DUPLICATE' | 'NEEDS_REVIEW' | 'ERROR' | 'SKIPPED';
    duplicateInfo?: ValidatedStagingRow['duplicateInfo'];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (targetEntity === 'COMPANY') {
      const cleanCuit = (data.cuit ?? '').replace(/\D/g, '');
      const legalName = (data.legalName ?? '').trim();
      const tradeName = (data.tradeName ?? '').trim();
      const fiscalAddress = (data.fiscalAddress ?? 'Sin especificar').trim();
      const locality = (data.locality ?? 'Córdoba').trim();
      const province = (data.province ?? 'Córdoba').trim();
      const primaryActivity = (data.primaryActivity ?? 'Industria Metalúrgica').trim();

      if (!cleanCuit) {
        errors.push('Falta el campo obligatorio CUIT.');
      } else if (!isValidArgentineCuitOrCuil(cleanCuit)) {
        errors.push(`El CUIT "${data.cuit}" es inválido (falló verificación Módulo 11).`);
      }

      if (!legalName || legalName.length < 2) {
        errors.push('Falta el campo obligatorio Razón Social.');
      }

      let duplicateInfo: ValidatedStagingRow['duplicateInfo'];
      if (cleanCuit.length === 11) {
        if (seenKeysInBatch.has(`CUIT:${cleanCuit}`)) {
          errors.push(`CUIT ${cleanCuit} duplicado dentro del mismo archivo.`);
        } else {
          seenKeysInBatch.add(`CUIT:${cleanCuit}`);
          const existing = await client.query<{ id: string }>(
            `SELECT id FROM public.companies WHERE cuit = $1`,
            [cleanCuit],
          );
          if ((existing.rowCount ?? 0) > 0) {
            duplicateInfo = {
              existingId: existing.rows[0].id,
              keyField: 'CUIT',
              keyValue: cleanCuit,
              resolution: defaultResolution,
            };
            warnings.push(`Ya existe una empresa con CUIT ${cleanCuit} en el espacio de trabajo.`);
          }
        }
      }

      const normalized = {
        cuit: cleanCuit,
        legalName,
        tradeName,
        fiscalAddress,
        locality,
        province,
        primaryActivity,
      };

      let rowStatus: 'VALID' | 'DUPLICATE' | 'NEEDS_REVIEW' | 'ERROR' | 'SKIPPED' = 'VALID';
      if (errors.length > 0) rowStatus = 'ERROR';
      else if (duplicateInfo) {
        rowStatus =
          duplicateInfo.resolution === 'SKIP'
            ? 'SKIPPED'
            : duplicateInfo.resolution === 'UPDATE'
              ? 'DUPLICATE'
              : 'NEEDS_REVIEW';
      }

      return { normalized, errors, warnings, rowStatus, duplicateInfo };
    }

    // Validación de EMPLEADO
    let lastName = (data.lastName ?? '').trim().toUpperCase();
    let firstName = (data.firstName ?? '').trim();
    if (!lastName && !firstName && data.fullName) {
      const full = data.fullName.trim();
      if (full.includes(',')) {
        const [l, f] = full.split(',').map((s) => s.trim());
        lastName = (l ?? '').toUpperCase();
        firstName = f ?? '';
      } else {
        const parts = full.split(/\s+/);
        lastName = (parts[0] ?? '').toUpperCase();
        firstName = parts.slice(1).join(' ');
      }
    }

    const cleanCuil = (data.cuil ?? '').replace(/\D/g, '');
    const legajo = (data.legajo ?? '').trim();
    const dni = ((data.dni ?? '').replace(/\D/g, '') || cleanCuil.slice(2, 10)).trim();
    const normalizedHireDate = normalizeDateString(data.hireDate ?? '');
    const jobPosition = (data.jobPosition ?? 'Operario').trim() || 'Operario';
    const categoryName = (data.categoryName ?? 'Oficial Múltiple').trim();
    const contractType = (data.contractType ?? 'TIEMPO_INDETERMINADO').trim();

    if (!legajo) errors.push('Falta el número de Legajo.');
    if (!lastName) errors.push('Falta el Apellido del empleado.');
    if (!firstName) errors.push('Falta el Nombre del empleado.');

    if (!cleanCuil) {
      errors.push('Falta el CUIL del empleado.');
    } else if (!isValidArgentineCuitOrCuil(cleanCuil)) {
      errors.push(`El CUIL "${data.cuil}" es inválido (falló verificación Módulo 11).`);
    }

    if (!normalizedHireDate) {
      errors.push(`Fecha de ingreso inválida o faltante ("${data.hireDate ?? ''}").`);
    }

    // Resolver categoría en el catálogo
    let resolvedCategoryId = data.categoryId ?? '';
    if (!resolvedCategoryId) {
      const normCat = categoryName.toLowerCase();
      for (const [catKey, catUuid] of categoriesMap.entries()) {
        if (catKey.includes(normCat) || normCat.includes(catKey)) {
          resolvedCategoryId = catUuid;
          break;
        }
      }
      if (!resolvedCategoryId) {
        resolvedCategoryId = SEED_IDS.CBA_UOM_CAT_OFICIAL_MULTIPLE;
        warnings.push(
          `Categoría "${categoryName}" asignada por defecto a "Oficial Múltiple" (CCT 260/75).`,
        );
      }
    }

    let duplicateInfo: ValidatedStagingRow['duplicateInfo'];
    if (cleanCuil.length === 11) {
      if (seenKeysInBatch.has(`CUIL:${cleanCuil}`)) {
        errors.push(
          `El CUIL ${cleanCuil} está repetido en varias filas del archivo (posible error de copiado en planilla).`,
        );
      } else {
        seenKeysInBatch.add(`CUIL:${cleanCuil}`);
      }
    }
    if (legajo) {
      if (seenKeysInBatch.has(`LEGAJO:${legajo}`)) {
        warnings.push(`El Legajo ${legajo} aparece repetido dentro del mismo archivo.`);
      } else {
        seenKeysInBatch.add(`LEGAJO:${legajo}`);
      }
    }

    if (companyId && cleanCuil.length === 11 && errors.length === 0) {
      const existingEmp = await client.query<{ id: string; cuil: string; legajo: string }>(
        `SELECT id, cuil, legajo FROM public.employees WHERE company_id = $1 AND (cuil = $2 OR legajo = $3) LIMIT 1`,
        [companyId, cleanCuil, legajo],
      );
      if ((existingEmp.rowCount ?? 0) > 0) {
        const match = existingEmp.rows[0];
        duplicateInfo = {
          existingId: match.id,
          keyField: match.cuil === cleanCuil ? 'CUIL' : 'LEGAJO',
          keyValue: match.cuil === cleanCuil ? cleanCuil : legajo,
          resolution: defaultResolution,
        };
        warnings.push(
          `Empleado existente detectado por ${duplicateInfo.keyField} (${duplicateInfo.keyValue}).`,
        );
      }
    }

    const normalized = {
      legajo,
      lastName,
      firstName,
      cuil: cleanCuil,
      dni,
      hireDate: normalizedHireDate ?? data.hireDate ?? '',
      jobPosition,
      categoryName,
      categoryId: resolvedCategoryId,
      contractType,
    };

    let rowStatus: 'VALID' | 'DUPLICATE' | 'NEEDS_REVIEW' | 'ERROR' | 'SKIPPED' = 'VALID';
    if (errors.length > 0) rowStatus = 'ERROR';
    else if (duplicateInfo) {
      rowStatus =
        duplicateInfo.resolution === 'SKIP'
          ? 'SKIPPED'
          : duplicateInfo.resolution === 'UPDATE'
            ? 'DUPLICATE'
            : 'NEEDS_REVIEW';
    }

    return { normalized, errors, warnings, rowStatus, duplicateInfo };
  }

  /**
   * Paso 1 a 4: Analiza un archivo Excel (.xlsx/.xlsm), CSV o PDF, guarda opcionalmente el documento original
   * en `documents` y crea un lote de staging persistente en `import_staging_batches` + `import_staging_rows`.
   */
  async createStagingBatch(
    client: pg.PoolClient,
    ctx: ActivatedSessionContext,
    body: CreateImportStagingRequestDto,
    ipAddress?: string,
  ) {
    if (ctx.roleCode === 'VIEWER') {
      throw new AuthenticationError(
        'El rol VIEWER no tiene permisos para importar archivos.',
        403,
      );
    }

    const targetEntity: 'COMPANY' | 'EMPLOYEE' =
      body.importKind === 'COMPANIES' || body.importKind === 'PDF_COMPANIES'
        ? 'COMPANY'
        : 'EMPLOYEE';

    if (targetEntity === 'EMPLOYEE' && !body.companyId) {
      throw new Error('Debe seleccionar una empresa activa antes de importar empleados.');
    }

    if (body.companyId) {
      const compCheck = await client.query(
        `SELECT id FROM public.companies WHERE id = $1`,
        [body.companyId],
      );
      if (compCheck.rowCount === 0) {
        throw new AuthenticationError(
          'La empresa indicada no existe o no pertenece al espacio de trabajo activo.',
          403,
        );
      }
    }

    const parsed = parseUploadedFile({
      fileName: body.fileName,
      base64Content: body.base64Content,
      importKind: body.importKind,
      selectedSheet: body.selectedSheet,
    });

    // Si se solicita conservar el archivo original (especialmente en PDF o Excel de respaldo), guardarlo en `documents`
    let sourceDocumentId: string | null = null;
    if (body.saveOriginalDocument !== false) {
      const fileBuf = Buffer.from(body.base64Content, 'base64');
      const sha256Hash = crypto.createHash('sha256').update(fileBuf).digest('hex');
      const storageKey = `tenants/${ctx.activeTenantId}/imports/${Date.now()}_${body.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

      const docRes = await client.query<{ id: string }>(
        `INSERT INTO public.documents (
           tenant_id, company_id, document_type, title, original_filename,
           storage_key, mime_type, size_bytes, sha256_hash, is_immutable, uploaded_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10)
         RETURNING id`,
        [
          ctx.activeTenantId,
          body.companyId ?? null,
          `IMPORT_${parsed.fileFormat}`,
          `Archivo de Importación: ${body.fileName}`,
          body.fileName,
          storageKey,
          body.mimeType ?? 'application/octet-stream',
          parsed.sizeBytes,
          sha256Hash,
          ctx.userId,
        ],
      );
      sourceDocumentId = docRes.rows[0].id;
    }

    const suggestedMapping =
      body.customColumnMapping && Object.keys(body.customColumnMapping).length > 0
        ? body.customColumnMapping
        : buildSuggestedColumnMapping(parsed.headers, targetEntity);

    // Cargar mapa de categorías para resolver nombres
    const catRes = await client.query<{ id: string; code: string; name: string }>(
      `SELECT id, code, name FROM public.agreement_categories WHERE is_active = true`,
    );
    const categoriesMap = new Map<string, string>();
    for (const c of catRes.rows) {
      categoriesMap.set(c.name.toLowerCase(), c.id);
      categoriesMap.set(c.code.toLowerCase(), c.id);
    }

    const seenKeysInBatch = new Set<string>();
    const validatedRows: ValidatedStagingRow[] = [];
    let blockingErrorsCount = 0;
    let warningsCount = 0;

    for (let i = 0; i < parsed.rows.length; i++) {
      const rawRow = parsed.rows[i];
      const extracted: Record<string, string> = {};

      for (const [systemField, sourceHeader] of Object.entries(suggestedMapping)) {
        if (sourceHeader && rawRow[sourceHeader] !== undefined) {
          extracted[systemField] = rawRow[sourceHeader];
        }
      }

      const v = await this.validateRowData(
        client,
        targetEntity,
        body.companyId ?? null,
        extracted,
        seenKeysInBatch,
        categoriesMap,
        'MANUAL_REVIEW',
      );

      if (parsed.pdfMetadata?.requiresOcrOrManualReview) {
        v.warnings.push(
          'Documento PDF escaneado / sin texto estructurado completo: verifique y complete los campos manualmente antes de confirmar.',
        );
      }

      if (v.errors.length > 0) blockingErrorsCount++;
      if (v.warnings.length > 0) warningsCount++;

      validatedRows.push({
        rowIndex: i + 1,
        sheetName: parsed.selectedSheet,
        targetEntity,
        rawData: rawRow,
        proposedData: v.normalized,
        correctedData: null,
        errors: v.errors,
        warnings: v.warnings,
        rowStatus: v.rowStatus,
        duplicateInfo: v.duplicateInfo,
      });
    }

    const batchStatus =
      blockingErrorsCount === 0 &&
      validatedRows.every((r) => r.rowStatus === 'VALID' || r.rowStatus === 'SKIPPED')
        ? 'READY_TO_APPROVE'
        : 'PENDING_REVIEW';

    const batchRes = await client.query<{ id: string; created_at: Date }>(
      `INSERT INTO public.import_staging_batches (
         tenant_id, company_id, source_document_id, import_kind, status,
         total_rows, blocking_errors_count, warnings_count, detected_issues, uploaded_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
       RETURNING id, created_at`,
      [
        ctx.activeTenantId,
        body.companyId ?? null,
        sourceDocumentId,
        body.importKind,
        batchStatus,
        validatedRows.length,
        blockingErrorsCount,
        warningsCount,
        JSON.stringify({
          fileName: body.fileName,
          fileFormat: parsed.fileFormat,
          sizeBytes: parsed.sizeBytes,
          sheetNames: parsed.sheetNames,
          selectedSheet: parsed.selectedSheet,
          headers: parsed.headers,
          suggestedMapping,
          pdfMetadata: parsed.pdfMetadata ?? null,
        }),
        ctx.userId,
      ],
    );

    const batchId = batchRes.rows[0].id;

    for (const r of validatedRows) {
      await client.query(
        `INSERT INTO public.import_staging_rows (
           tenant_id, batch_id, sheet_name, row_index, target_entity,
           raw_data, proposed_data, corrected_data, errors, warnings, row_status
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11)`,
        [
          ctx.activeTenantId,
          batchId,
          r.sheetName,
          r.rowIndex,
          r.targetEntity,
          JSON.stringify(r.rawData),
          JSON.stringify({
            ...r.proposedData,
            _duplicateInfo: r.duplicateInfo ?? null,
          }),
          null,
          JSON.stringify(r.errors),
          JSON.stringify(r.warnings),
          r.rowStatus,
        ],
      );
    }

    await client.query(
      `INSERT INTO public.audit_logs (tenant_id, user_id, action, module, target_table, target_id, outcome, new_values, ip_address)
       VALUES ($1, $2, 'IMPORT_STAGING_CREATED', 'IMPORTS', 'import_staging_batches', $3, 'SUCCESS', $4::jsonb, $5)`,
      [
        ctx.activeTenantId,
        ctx.userId,
        batchId,
        JSON.stringify({
          fileName: body.fileName,
          importKind: body.importKind,
          totalRows: validatedRows.length,
          blockingErrorsCount,
        }),
        ipAddress ?? '127.0.0.1',
      ],
    );

    return this.getStagingBatchDetail(client, batchId);
  }

  /**
   * Obtiene el detalle completo de un lote de staging y sus filas para la vista previa editable.
   */
  async getStagingBatchDetail(client: pg.PoolClient, batchId: string) {
    const batchRes = await client.query<{
      id: string;
      company_id: string | null;
      source_document_id: string | null;
      import_kind: string;
      status: string;
      total_rows: number;
      blocking_errors_count: number;
      warnings_count: number;
      detected_issues: Record<string, unknown>;
      created_at: Date;
    }>(
      `SELECT id, company_id, source_document_id, import_kind, status,
              total_rows, blocking_errors_count, warnings_count, detected_issues, created_at
       FROM public.import_staging_batches
       WHERE id = $1`,
      [batchId],
    );

    if (batchRes.rowCount === 0) {
      return null;
    }

    const batch = batchRes.rows[0];
    const rowsRes = await client.query<{
      id: string;
      sheet_name: string;
      row_index: number;
      target_entity: 'COMPANY' | 'EMPLOYEE';
      raw_data: Record<string, string>;
      proposed_data: Record<string, unknown>;
      corrected_data: Record<string, unknown> | null;
      errors: string[];
      warnings: string[];
      row_status: string;
    }>(
      `SELECT id, sheet_name, row_index, target_entity, raw_data, proposed_data,
              corrected_data, errors, warnings, row_status
       FROM public.import_staging_rows
       WHERE batch_id = $1
       ORDER BY row_index ASC`,
      [batchId],
    );

    const rows = rowsRes.rows.map((r) => {
      const effectiveData = (r.corrected_data ?? r.proposed_data) as Record<string, unknown>;
      const duplicateInfo = effectiveData._duplicateInfo ?? r.proposed_data._duplicateInfo ?? null;
      const cleanData: Record<string, string> = {};
      for (const [k, v] of Object.entries(effectiveData)) {
        if (k !== '_duplicateInfo' && v !== null && v !== undefined) {
          cleanData[k] = String(v);
        }
      }
      return {
        id: r.id,
        rowIndex: r.row_index,
        sheetName: r.sheet_name,
        targetEntity: r.target_entity,
        rawData: r.raw_data,
        data: cleanData,
        errors: r.errors,
        warnings: r.warnings,
        rowStatus: r.row_status,
        duplicateInfo,
      };
    });

    const summary = {
      totalDetected: rows.length,
      validCount: rows.filter((r) => r.rowStatus === 'VALID').length,
      errorCount: rows.filter((r) => r.rowStatus === 'ERROR').length,
      duplicateCount: rows.filter((r) => r.duplicateInfo !== null).length,
      toCreateCount: rows.filter((r) => r.rowStatus === 'VALID' && !r.duplicateInfo).length,
      toUpdateCount: rows.filter((r) => r.rowStatus === 'DUPLICATE').length,
      skippedCount: rows.filter((r) => r.rowStatus === 'SKIPPED').length,
      needsReviewCount: rows.filter((r) => r.rowStatus === 'NEEDS_REVIEW').length,
    };

    return {
      batchId: batch.id,
      companyId: batch.company_id,
      sourceDocumentId: batch.source_document_id,
      importKind: batch.import_kind,
      status: batch.status,
      metadata: batch.detected_issues,
      summary,
      rows,
    };
  }

  /**
   * Permite corregir manualmente una fila en la vista previa de importación y re-ejecuta las validaciones.
   */
  async updateStagingRow(
    client: pg.PoolClient,
    ctx: ActivatedSessionContext,
    batchId: string,
    rowId: string,
    body: UpdateStagingRowRequestDto,
  ) {
    if (ctx.roleCode === 'VIEWER') {
      throw new AuthenticationError('El rol VIEWER no tiene permisos para editar importaciones.', 403);
    }

    const batchRes = await client.query<{
      id: string;
      company_id: string | null;
      status: string;
    }>(`SELECT id, company_id, status FROM public.import_staging_batches WHERE id = $1`, [batchId]);

    if (batchRes.rowCount === 0) {
      throw new Error('Lote de importación no encontrado.');
    }
    if (batchRes.rows[0].status === 'APPROVED_COMMITTED') {
      throw new Error('No se puede modificar un lote de importación que ya fue confirmado.');
    }

    const rowRes = await client.query<{
      id: string;
      target_entity: 'COMPANY' | 'EMPLOYEE';
      proposed_data: Record<string, unknown>;
    }>(
      `SELECT id, target_entity, proposed_data FROM public.import_staging_rows WHERE batch_id = $1 AND id = $2`,
      [batchId, rowId],
    );
    if (rowRes.rowCount === 0) {
      throw new Error('Fila de staging no encontrada.');
    }

    const catRes = await client.query<{ id: string; code: string; name: string }>(
      `SELECT id, code, name FROM public.agreement_categories WHERE is_active = true`,
    );
    const categoriesMap = new Map<string, string>();
    for (const c of catRes.rows) {
      categoriesMap.set(c.name.toLowerCase(), c.id);
      categoriesMap.set(c.code.toLowerCase(), c.id);
    }

    const stringData: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.correctedData)) {
      if (v !== null && v !== undefined) {
        stringData[k] = String(v);
      }
    }

    const resolution = body.duplicateResolution ?? 'MANUAL_REVIEW';
    const v = await this.validateRowData(
      client,
      rowRes.rows[0].target_entity,
      batchRes.rows[0].company_id,
      stringData,
      new Set<string>(),
      categoriesMap,
      resolution,
    );

    if (body.duplicateResolution === 'SKIP') {
      v.rowStatus = 'SKIPPED';
      v.errors = [];
    }

    await client.query(
      `UPDATE public.import_staging_rows
          SET corrected_data = $1::jsonb,
              errors = $2::jsonb,
              warnings = $3::jsonb,
              row_status = $4
        WHERE batch_id = $5 AND id = $6`,
      [
        JSON.stringify({
          ...v.normalized,
          _duplicateInfo: v.duplicateInfo ?? null,
        }),
        JSON.stringify(v.errors),
        JSON.stringify(v.warnings),
        v.rowStatus,
        batchId,
        rowId,
      ],
    );

    // Recalcular estado del lote
    const detail = await this.getStagingBatchDetail(client, batchId);
    if (detail) {
      const nextStatus =
        detail.summary.errorCount === 0 && detail.summary.needsReviewCount === 0
          ? 'READY_TO_APPROVE'
          : 'PENDING_REVIEW';
      await client.query(
        `UPDATE public.import_staging_batches
            SET blocking_errors_count = $1,
                warnings_count = $2,
                status = $3
          WHERE id = $4`,
        [detail.summary.errorCount, detail.summary.duplicateCount, nextStatus, batchId],
      );
      detail.status = nextStatus;
    }

    return detail;
  }

  /**
   * Paso 5 y 6: Confirma e importa transaccionalmente los registros validados en PostgreSQL,
   * generando un informe detallado de creados, actualizados, omitidos y rechazados, y registrando auditoría.
   */
  async confirmStagingBatch(
    client: pg.PoolClient,
    ctx: ActivatedSessionContext,
    batchId: string,
    body: ConfirmImportBatchRequestDto,
    ipAddress?: string,
  ) {
    if (ctx.roleCode === 'VIEWER') {
      throw new AuthenticationError(
        'El rol VIEWER no tiene permisos para confirmar importaciones.',
        403,
      );
    }

    const detail = await this.getStagingBatchDetail(client, batchId);
    if (!detail) {
      throw new Error('Lote de importación no encontrado.');
    }
    if (detail.status === 'APPROVED_COMMITTED') {
      throw new Error('Este lote de importación ya fue confirmado previamente.');
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const rejectedRows: Array<{ rowIndex: number; reasons: string[] }> = [];

    for (const row of detail.rows) {
      if (row.rowStatus === 'SKIPPED') {
        skippedCount++;
        continue;
      }

      if (row.rowStatus === 'ERROR' || row.errors.length > 0) {
        rejectedRows.push({ rowIndex: row.rowIndex, reasons: row.errors });
        continue;
      }

      const dup = row.duplicateInfo as
        | { existingId: string; resolution: 'SKIP' | 'UPDATE' | 'MANUAL_REVIEW' }
        | null;
      const effectiveResolution =
        dup?.resolution && dup.resolution !== 'MANUAL_REVIEW'
          ? dup.resolution
          : body.defaultDuplicatePolicy ?? 'SKIP';

      if (dup && effectiveResolution === 'SKIP') {
        skippedCount++;
        continue;
      }

      if (row.targetEntity === 'COMPANY') {
        if (dup && effectiveResolution === 'UPDATE') {
          await companyService.updateCompany(
            client,
            ctx,
            dup.existingId,
            {
              legalName: row.data.legalName,
              tradeName: row.data.tradeName || null,
              fiscalAddress: row.data.fiscalAddress,
              locality: row.data.locality,
              province: row.data.province,
              primaryActivity: row.data.primaryActivity,
            },
            ipAddress,
          );
          updatedCount++;
        } else {
          await companyService.createCompany(
            client,
            ctx,
            {
              cuit: row.data.cuit,
              legalName: row.data.legalName,
              tradeName: row.data.tradeName || null,
              fiscalAddress: row.data.fiscalAddress,
              locality: row.data.locality,
              province: row.data.province,
              primaryActivity: row.data.primaryActivity,
            },
            ipAddress,
          );
          createdCount++;
        }
      } else {
        // EMPLOYEE
        const companyId = detail.companyId!;
        if (dup && effectiveResolution === 'UPDATE') {
          await employeeService.updateEmployee(
            client,
            ctx,
            companyId,
            dup.existingId,
            {
              legajo: row.data.legajo,
              lastName: row.data.lastName,
              firstName: row.data.firstName,
              dni: row.data.dni,
              hireDate: row.data.hireDate,
              jobPosition: row.data.jobPosition,
              categoryId: row.data.categoryId,
              contractType: row.data.contractType,
              changeReason: `Actualización autorizada por importación (Lote ${batchId.slice(0, 8)})`,
            },
            ipAddress,
          );
          updatedCount++;
        } else {
          await employeeService.createEmployee(
            client,
            ctx,
            companyId,
            {
              legajo: row.data.legajo,
              lastName: row.data.lastName,
              firstName: row.data.firstName,
              cuil: row.data.cuil,
              dni: row.data.dni,
              hireDate: row.data.hireDate,
              jobPosition: row.data.jobPosition,
              categoryId: row.data.categoryId || SEED_IDS.CBA_UOM_CAT_OFICIAL_MULTIPLE,
              contractType: row.data.contractType || 'TIEMPO_INDETERMINADO',
            },
            ipAddress,
          );
          createdCount++;
        }
      }
    }

    await client.query(
      `UPDATE public.import_staging_batches
          SET status = 'APPROVED_COMMITTED',
              approved_by = $1,
              approved_at = now()
        WHERE id = $2`,
      [ctx.userId, batchId],
    );

    const report = {
      batchId,
      status: 'APPROVED_COMMITTED',
      createdCount,
      updatedCount,
      skippedCount,
      rejectedCount: rejectedRows.length,
      rejectedRows,
      completedAt: new Date().toISOString(),
    };

    await client.query(
      `INSERT INTO public.audit_logs (tenant_id, user_id, action, module, target_table, target_id, outcome, new_values, ip_address)
       VALUES ($1, $2, 'IMPORT_BATCH_COMMITTED', 'IMPORTS', 'import_staging_batches', $3, 'SUCCESS', $4::jsonb, $5)`,
      [ctx.activeTenantId, ctx.userId, batchId, JSON.stringify(report), ipAddress ?? '127.0.0.1'],
    );

    return report;
  }
}

export const importService = new ImportService();
