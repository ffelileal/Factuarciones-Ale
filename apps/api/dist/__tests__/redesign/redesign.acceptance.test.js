import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { SEED_IDS } from '@ar-payroll/contracts';
import { buildServer } from '../../server.js';
import { adminPool } from '../../db/pool.js';
const TENANT_B_ID = SEED_IDS.TENANT_B;
const COMBINA_COMPANY_ID = SEED_IDS.COMPANY_A_COMBINA;
const METALURGICA_B_COMPANY_ID = SEED_IDS.COMPANY_B_SOCIO;
describe('Rediseño Funcional y UX (Fases A a F) — Pruebas Integrales de Aceptación', () => {
    const app = buildServer();
    let tokenPapa = '';
    let tokenSocio = '';
    let secondCompanyAId = '';
    const cleanTestCompanyByCuit = async (cuit) => {
        const compRes = await adminPool.query(`SELECT id FROM companies WHERE cuit = $1`, [cuit]);
        for (const row of compRes.rows) {
            const cid = row.id;
            await adminPool.query(`DELETE FROM import_staging_rows WHERE batch_id IN (SELECT id FROM import_staging_batches WHERE company_id = $1)`, [cid]);
            await adminPool.query(`DELETE FROM import_staging_batches WHERE company_id = $1`, [cid]);
            await adminPool.query(`DELETE FROM documents WHERE company_id = $1`, [cid]);
            await adminPool.query(`DELETE FROM employee_family_members WHERE company_id = $1`, [cid]);
            await adminPool.query(`DELETE FROM employee_leaves WHERE company_id = $1`, [cid]);
            await adminPool.query(`DELETE FROM employee_employment_history WHERE company_id = $1`, [cid]);
            await adminPool.query(`DELETE FROM employee_versions WHERE company_id = $1`, [cid]);
            await adminPool.query(`DELETE FROM employees WHERE company_id = $1`, [cid]);
            await adminPool.query(`DELETE FROM company_agreements WHERE company_id = $1`, [cid]);
            await adminPool.query(`DELETE FROM company_branches WHERE company_id = $1`, [cid]);
            await adminPool.query(`DELETE FROM company_versions WHERE company_id = $1`, [cid]);
            await adminPool.query(`DELETE FROM companies WHERE id = $1`, [cid]);
        }
    };
    beforeAll(async () => {
        await app.ready();
        // Limpiar restos de corridas previas si existiesen
        await cleanTestCompanyByCuit('30710099991');
        await adminPool.query(`DELETE FROM employees WHERE legajo = '301' AND company_id = $1`, [
            COMBINA_COMPANY_ID,
        ]);
        const loginA = await app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            payload: {
                email: 'papa@estudiocontable.ar',
                password: 'Papa_Sueldos_2026!',
            },
        });
        expect(loginA.statusCode).toBe(200);
        tokenPapa = loginA.json().sessionToken;
        const loginB = await app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            payload: {
                email: 'socio@estudiocontable.ar',
                password: 'Socio_Sueldos_2026!',
            },
        });
        expect(loginB.statusCode).toBe(200);
        tokenSocio = loginB.json().sessionToken;
    });
    afterAll(async () => {
        await cleanTestCompanyByCuit('30710099991');
        await app.close();
    });
    it('1. Módulo Empresas: Lista empresas con conteo de empleados, crea segunda empresa en Tenant A, edita generando nueva versión y archiva/reactiva', async () => {
        const listRes = await app.inject({
            method: 'GET',
            url: '/api/v1/companies',
            headers: { authorization: `Bearer ${tokenPapa}` },
        });
        expect(listRes.statusCode).toBe(200);
        const companies = listRes.json().companies;
        const combina = companies.find((c) => c.id === COMBINA_COMPANY_ID);
        expect(combina).toBeDefined();
        expect(combina.employeesCount).toBeGreaterThanOrEqual(3);
        // Crear segunda empresa en Tenant A (CUIT Módulo 11 válido: 30-71009999-1)
        const createRes = await app.inject({
            method: 'POST',
            url: '/api/v1/companies',
            headers: { authorization: `Bearer ${tokenPapa}` },
            payload: {
                cuit: '30-71009999-1',
                legalName: 'AGROPECUARIA PAMPEANA SRL',
                tradeName: 'Agro Pampeana',
                fiscalAddress: 'Av. Villegas 550',
                locality: 'Trenque Lauquen',
                province: 'Buenos Aires',
            },
        });
        expect(createRes.statusCode).toBe(201);
        secondCompanyAId = createRes.json().company.id;
        // Actualizar empresa (archivar y cambiar domicilio) y verificar nueva versión en company_versions
        const patchRes = await app.inject({
            method: 'PATCH',
            url: `/api/v1/companies/${secondCompanyAId}`,
            headers: { authorization: `Bearer ${tokenPapa}` },
            payload: {
                fiscalAddress: 'Av. Villegas 580 Piso 2',
                isActive: false,
            },
        });
        expect(patchRes.statusCode).toBe(200);
        expect(patchRes.json().company.isActive).toBe(false);
        expect(patchRes.json().company.fiscalAddress).toBe('Av. Villegas 580 Piso 2');
        // Reactivar
        const reactivateRes = await app.inject({
            method: 'PATCH',
            url: `/api/v1/companies/${secondCompanyAId}`,
            headers: { authorization: `Bearer ${tokenPapa}` },
            payload: {
                isActive: true,
            },
        });
        expect(reactivateRes.statusCode).toBe(200);
        expect(reactivateRes.json().company.isActive).toBe(true);
        // Verificar detalle centralizado (7 pestañas)
        const detailRes = await app.inject({
            method: 'GET',
            url: `/api/v1/companies/${COMBINA_COMPANY_ID}`,
            headers: { authorization: `Bearer ${tokenPapa}` },
        });
        expect(detailRes.statusCode).toBe(200);
        expect(detailRes.json().company.legalName.toUpperCase()).toContain('COMBINA');
    });
    it('2. Módulo Empleados (Modo Planilla Excel): Edición rápida en línea genera nueva versión en employee_versions, historial en employee_employment_history y Ficha 10 secciones', async () => {
        const listRes = await app.inject({
            method: 'GET',
            url: `/api/v1/companies/${COMBINA_COMPANY_ID}/employees`,
            headers: { authorization: `Bearer ${tokenPapa}` },
        });
        expect(listRes.statusCode).toBe(200);
        const employees = listRes.json().employees;
        expect(employees.length).toBeGreaterThanOrEqual(3);
        const tejedor = employees.find((e) => e.legajo === '1');
        expect(tejedor).toBeDefined();
        // Edición en línea de celda Puesto (jobPosition)
        const inlinePatch = await app.inject({
            method: 'PATCH',
            url: `/api/v1/companies/${COMBINA_COMPANY_ID}/employees/${tejedor.id}`,
            headers: { authorization: `Bearer ${tokenPapa}` },
            payload: {
                jobPosition: 'Oficial Múltiple Senior',
                changeReason: 'Promoción desde grilla tipo Excel',
            },
        });
        expect(inlinePatch.statusCode).toBe(200);
        expect(inlinePatch.json().employee.jobPosition).toBe('Oficial Múltiple Senior');
        // Acción masiva segura (Bulk Update)
        const bulkRes = await app.inject({
            method: 'POST',
            url: `/api/v1/companies/${COMBINA_COMPANY_ID}/employees/bulk`,
            headers: { authorization: `Bearer ${tokenPapa}` },
            payload: {
                employeeIds: [tejedor.id],
                action: 'SET_STATUS',
                employmentStatus: 'ACTIVE',
            },
        });
        expect(bulkRes.statusCode).toBe(200);
        expect(bulkRes.json().employees).toHaveLength(1);
        // Ficha Individual del Empleado (10 secciones) + alta de familiar y licencia
        const famRes = await app.inject({
            method: 'POST',
            url: `/api/v1/companies/${COMBINA_COMPANY_ID}/employees/${tejedor.id}/family`,
            headers: { authorization: `Bearer ${tokenPapa}` },
            payload: {
                relationship: 'HIJO',
                lastName: 'TEJEDOR',
                firstName: 'Lucas',
                dni: '56123456',
                birthDate: '2018-04-12',
                isDependentCharge: true,
            },
        });
        expect(famRes.statusCode).toBe(201);
        const leaveRes = await app.inject({
            method: 'POST',
            url: `/api/v1/companies/${COMBINA_COMPANY_ID}/employees/${tejedor.id}/leaves`,
            headers: { authorization: `Bearer ${tokenPapa}` },
            payload: {
                situationType: 'VACACIONES',
                startDate: '2026-10-05',
                endDate: '2026-10-18',
                daysCount: 14,
                isPaid: true,
            },
        });
        expect(leaveRes.statusCode).toBe(201);
        const profileRes = await app.inject({
            method: 'GET',
            url: `/api/v1/companies/${COMBINA_COMPANY_ID}/employees/${tejedor.id}/profile`,
            headers: { authorization: `Bearer ${tokenPapa}` },
        });
        expect(profileRes.statusCode).toBe(200);
        const dossier = profileRes.json();
        expect(dossier.versions.length).toBeGreaterThanOrEqual(2);
        expect(dossier.modificationHistory.length).toBeGreaterThanOrEqual(1);
        expect(dossier.familyMembers.length).toBeGreaterThanOrEqual(1);
        expect(dossier.leaves.length).toBeGreaterThanOrEqual(1);
    });
    it('3. Importación de Excel real (.xlsm Combina SH) y CSV con errores, corrección en Staging y políticas de duplicados (SKIP vs UPDATE)', async () => {
        // 3A. Si existe la plantilla real .xlsm en Downloads, verificamos que se parsee ignorando macros VBA y detectando hojas
        const realExcelPath = 'C:\\Users\\crale\\Downloads\\010-2026 Recibos nuevo formato Combina SH.xlsm';
        if (fs.existsSync(realExcelPath)) {
            const buf = fs.readFileSync(realExcelPath);
            const xlsmStaging = await app.inject({
                method: 'POST',
                url: '/api/v1/imports/staging',
                headers: { authorization: `Bearer ${tokenPapa}` },
                payload: {
                    companyId: COMBINA_COMPANY_ID,
                    importKind: 'EMPLOYEES',
                    fileName: '010-2026 Recibos nuevo formato Combina SH.xlsm',
                    base64Content: buf.toString('base64'),
                },
            });
            expect(xlsmStaging.statusCode).toBe(201);
            const batch = xlsmStaging.json();
            expect(['XLSX', 'XLSM']).toContain(batch.metadata.fileFormat);
            expect(batch.metadata.sheetNames.length).toBeGreaterThan(0);
        }
        // 3B. Importación CSV con 1 fila válida nueva, 1 fila con CUIL inválido (Módulo 11 erróneo) y 1 fila a omitir
        const csvContent = [
            'Legajo;Apellido;Nombre;CUIL;DNI;Fecha de Ingreso;Puesto;Categoria',
            '101;PEREZ;Juan Carlos;23-28853336-9;28853336;2026-01-15;Oficial Múltiple;Oficial Múltiple',
            '102;RODRIGUEZ;Martín;20-35812264-0;35812264;2026-02-01;Operario Especializado;Operario Especializado', // CUIL inválido (debe ser 20-35812264-4)
            '103;GOMEZ;Lucía;27-35812264-9;35812264;2026-03-10;Administrativo 4ta Categoría;Administrativo 4ta Categoría',
        ].join('\n');
        const stagingRes = await app.inject({
            method: 'POST',
            url: '/api/v1/imports/staging',
            headers: { authorization: `Bearer ${tokenPapa}` },
            payload: {
                companyId: secondCompanyAId,
                importKind: 'EMPLOYEES',
                fileName: 'nomina_agro_pampeana.csv',
                base64Content: Buffer.from(csvContent, 'utf8').toString('base64'),
            },
        });
        expect(stagingRes.statusCode).toBe(201);
        const stagingBatch = stagingRes.json();
        expect(stagingBatch.summary.totalDetected).toBe(3);
        // La fila 2 tiene CUIL 20-35812264-0 (Módulo 11 inválido -> debe ser 20-35812264-8)
        const row2 = stagingBatch.rows.find((r) => r.rowIndex === 2);
        expect(row2.rowStatus).toBe('ERROR');
        // Corregimos la fila 2 directamente en el Staging interactivo antes de confirmar
        const fixRow2 = await app.inject({
            method: 'PATCH',
            url: `/api/v1/imports/batches/${stagingBatch.batchId}/rows/${row2.id}`,
            headers: { authorization: `Bearer ${tokenPapa}` },
            payload: {
                correctedData: {
                    ...row2.data,
                    cuil: '20-35812264-8',
                },
            },
        });
        expect(fixRow2.statusCode).toBe(200);
        const updatedRow2 = fixRow2
            .json()
            .rows.find((r) => r.rowIndex === 2);
        expect(updatedRow2.rowStatus).toBe('VALID');
        // Omitimos la fila 3 manualmente
        const row3 = stagingBatch.rows.find((r) => r.rowIndex === 3);
        await app.inject({
            method: 'PATCH',
            url: `/api/v1/imports/batches/${stagingBatch.batchId}/rows/${row3.id}`,
            headers: { authorization: `Bearer ${tokenPapa}` },
            payload: {
                correctedData: row3.data,
                duplicateResolution: 'SKIP',
            },
        });
        // Confirmamos el lote con política SKIP para duplicados
        const confirmRes = await app.inject({
            method: 'POST',
            url: `/api/v1/imports/batches/${stagingBatch.batchId}/confirm`,
            headers: { authorization: `Bearer ${tokenPapa}` },
            payload: {
                defaultDuplicatePolicy: 'SKIP',
            },
        });
        expect(confirmRes.statusCode).toBe(200);
        const result = confirmRes.json();
        expect(result.createdCount).toBe(2);
        expect(result.skippedCount).toBe(1);
        // Re-importar registro existente con defaultDuplicatePolicy = 'UPDATE'
        const dupStagingRes = await app.inject({
            method: 'POST',
            url: '/api/v1/imports/staging',
            headers: { authorization: `Bearer ${tokenPapa}` },
            payload: {
                companyId: secondCompanyAId,
                importKind: 'EMPLOYEES',
                fileName: 'nomina_agro_pampeana_actualizacion.csv',
                base64Content: Buffer.from([
                    'Legajo;Apellido;Nombre;CUIL;DNI;Fecha de Ingreso;Puesto;Categoria',
                    '101;PEREZ;Juan Carlos;23-28853336-9;28853336;2026-01-15;Supervisor de Planta;Oficial Múltiple',
                ].join('\n'), 'utf8').toString('base64'),
            },
        });
        const dupBatch = dupStagingRes.json();
        expect(dupBatch.summary.duplicateCount).toBe(1);
        const confirmUpdateRes = await app.inject({
            method: 'POST',
            url: `/api/v1/imports/batches/${dupBatch.batchId}/confirm`,
            headers: { authorization: `Bearer ${tokenPapa}` },
            payload: {
                defaultDuplicatePolicy: 'UPDATE',
            },
        });
        expect(confirmUpdateRes.statusCode).toBe(200);
        expect(confirmUpdateRes.json().updatedCount).toBe(1);
    }, 25000);
    it('4. Importación de archivo grande (50 empleados en lote) y aislamiento entre empresas del mismo tenant', async () => {
        const computeValidCuil = (prefix, dniNum) => {
            const base = `${prefix}${String(dniNum).padStart(8, '0')}`;
            const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
            let sum = 0;
            for (let i = 0; i < 10; i++)
                sum += Number(base[i]) * weights[i];
            const mod = sum % 11;
            const check = mod === 0 ? 0 : mod === 1 ? 9 : 11 - mod;
            const finalPrefix = mod === 1 ? '23' : prefix;
            if (finalPrefix !== prefix)
                return computeValidCuil('23', dniNum);
            return `${finalPrefix}-${String(dniNum).padStart(8, '0')}-${check}`;
        };
        const lines = ['Legajo;Apellido;Nombre;CUIL;DNI;Fecha de Ingreso;Puesto'];
        for (let i = 1; i <= 50; i++) {
            const dniNum = 31000000 + i;
            const cuil = computeValidCuil('20', dniNum);
            lines.push(`${200 + i};EMPLEADO_${i};Nombre_${i};${cuil};${dniNum};2026-01-01;Operario Especializado`);
        }
        const largeStaging = await app.inject({
            method: 'POST',
            url: '/api/v1/imports/staging',
            headers: { authorization: `Bearer ${tokenPapa}` },
            payload: {
                companyId: secondCompanyAId,
                importKind: 'EMPLOYEES',
                fileName: 'lote_masivo_50.csv',
                base64Content: Buffer.from(lines.join('\n'), 'utf8').toString('base64'),
            },
        });
        expect(largeStaging.statusCode).toBe(201);
        const batch = largeStaging.json();
        expect(batch.summary.totalDetected).toBe(50);
        expect(batch.summary.validCount).toBe(50);
        const confirmLarge = await app.inject({
            method: 'POST',
            url: `/api/v1/imports/batches/${batch.batchId}/confirm`,
            headers: { authorization: `Bearer ${tokenPapa}` },
            payload: { defaultDuplicatePolicy: 'SKIP' },
        });
        expect(confirmLarge.statusCode).toBe(200);
        expect(confirmLarge.json().createdCount).toBe(50);
        // Verificar aislamiento entre empresas del mismo tenant: Combina SH sigue teniendo solo sus 3 empleados originales
        const combinaEmps = await app.inject({
            method: 'GET',
            url: `/api/v1/companies/${COMBINA_COMPANY_ID}/employees`,
            headers: { authorization: `Bearer ${tokenPapa}` },
        });
        expect(combinaEmps.json().employees.length).toBe(3);
        const agroEmps = await app.inject({
            method: 'GET',
            url: `/api/v1/companies/${secondCompanyAId}/employees`,
            headers: { authorization: `Bearer ${tokenPapa}` },
        });
        expect(agroEmps.json().employees.length).toBe(52);
    }, 25000);
    it('5. Importación de PDF (PDF con texto seleccionable FlateDecode, PDF incompleto y PDF escaneado sin texto) + registro SHA-256 en documents', async () => {
        // 5A. PDF con flujo FlateDecode y datos de empleado válidos
        const pdfTextStream = `BT /F1 12 Tf 72 720 Td (Legajo: 301) Tj 0 -20 Td (Apellido: MARTINEZ) Tj 0 -20 Td (Nombre: Roberto) Tj 0 -20 Td (CUIL: 20-35812264-8) Tj 0 -20 Td (Fecha de ingreso: 15/03/2026) Tj 0 -20 Td (Categoria: Oficial Multiple) Tj ET`;
        const compressed = zlib.deflateSync(Buffer.from(pdfTextStream, 'latin1'));
        const pdfHeader = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n', 'latin1');
        const pdfFooter = Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1');
        const validPdfBuffer = Buffer.concat([pdfHeader, compressed, pdfFooter]);
        const pdfStagingRes = await app.inject({
            method: 'POST',
            url: '/api/v1/imports/staging',
            headers: { authorization: `Bearer ${tokenPapa}` },
            payload: {
                companyId: COMBINA_COMPANY_ID,
                importKind: 'PDF_EMPLOYEES',
                fileName: 'alta_temprana_martinez.pdf',
                base64Content: validPdfBuffer.toString('base64'),
            },
        });
        expect(pdfStagingRes.statusCode).toBe(201);
        const pdfBatch = pdfStagingRes.json();
        expect(pdfBatch.metadata.fileFormat).toBe('PDF');
        expect(pdfBatch.rows[0].data.lastName).toBe('MARTINEZ');
        expect(pdfBatch.rows[0].data.cuil).toBe('20358122648');
        expect(pdfBatch.rows[0].rowStatus).toBe('VALID');
        // Verificar que el documento PDF haya quedado registrado en la tabla `documents` con su hash SHA-256
        const docsRes = await app.inject({
            method: 'GET',
            url: `/api/v1/documents`,
            headers: { authorization: `Bearer ${tokenPapa}` },
        });
        expect(docsRes.statusCode).toBe(200);
        const savedDoc = docsRes
            .json()
            .documents.find((d) => d.original_filename === 'alta_temprana_martinez.pdf');
        expect(savedDoc).toBeDefined();
        expect(savedDoc.sha256_hash).toHaveLength(64);
        // 5B. PDF escaneado (imagen sin texto seleccionable) -> debe detectarse con error/advertencia OCR y no importarse automáticamente
        const scannedPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /XObject /Subtype /Image /Width 1200 /Height 1600 >>\nendobj\n%%EOF', 'latin1');
        const scannedRes = await app.inject({
            method: 'POST',
            url: '/api/v1/imports/staging',
            headers: { authorization: `Bearer ${tokenPapa}` },
            payload: {
                companyId: COMBINA_COMPANY_ID,
                importKind: 'PDF_EMPLOYEES',
                fileName: 'recibo_escaneado_imagen.pdf',
                base64Content: scannedPdfBuffer.toString('base64'),
            },
        });
        expect(scannedRes.statusCode).toBe(201);
        const scannedBatch = scannedRes.json();
        expect(scannedBatch.rows[0].rowStatus).toBe('ERROR');
        const confirmScanned = await app.inject({
            method: 'POST',
            url: `/api/v1/imports/batches/${scannedBatch.batchId}/confirm`,
            headers: { authorization: `Bearer ${tokenPapa}` },
            payload: { defaultDuplicatePolicy: 'SKIP' },
        });
        expect(confirmScanned.statusCode).toBe(200);
        expect(confirmScanned.json().createdCount).toBe(0);
        expect(confirmScanned.json().rejectedCount).toBe(1);
    });
    it('6. Seguridad: Aislamiento estricto Multi-Tenant (Tenant A vs Tenant B) y bloqueo de rol VIEWER (403)', async () => {
        // 6A. El Socio (Tenant B) no puede ver las empresas, empleados, lotes de importación ni documentos de Papá (Tenant A)
        const socioCompanies = await app.inject({
            method: 'GET',
            url: '/api/v1/companies',
            headers: { authorization: `Bearer ${tokenSocio}` },
        });
        expect(socioCompanies.statusCode).toBe(200);
        const socioCompIds = socioCompanies.json().companies.map((c) => c.id);
        expect(socioCompIds).toContain(METALURGICA_B_COMPANY_ID);
        expect(socioCompIds).not.toContain(COMBINA_COMPANY_ID);
        expect(socioCompIds).not.toContain(secondCompanyAId);
        // Intento de acceso cruzado directo por ID de empresa de Tenant A usando el token de Tenant B
        const crossAccess = await app.inject({
            method: 'GET',
            url: `/api/v1/companies/${COMBINA_COMPANY_ID}/employees`,
            headers: { authorization: `Bearer ${tokenSocio}` },
        });
        expect(crossAccess.statusCode).toBe(200);
        expect(crossAccess.json().employees).toHaveLength(0);
        // 6B. Rol VIEWER no puede crear empresas, editar empleados ni confirmar importaciones (403)
        await adminPool.query(`UPDATE tenant_memberships SET role_id = $1 WHERE tenant_id = $2`, [SEED_IDS.ROLE_VIEWER, TENANT_B_ID]);
        try {
            const viewerCreateComp = await app.inject({
                method: 'POST',
                url: '/api/v1/companies',
                headers: { authorization: `Bearer ${tokenSocio}` },
                payload: {
                    cuit: '30-65485086-8',
                    legalName: 'Intento Viewer SA',
                },
            });
            expect(viewerCreateComp.statusCode).toBe(403);
        }
        finally {
            await adminPool.query(`UPDATE tenant_memberships SET role_id = $1 WHERE tenant_id = $2`, [SEED_IDS.ROLE_OWNER, TENANT_B_ID]);
        }
    });
});
