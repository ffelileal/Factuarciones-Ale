import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import {
  LoginRequestSchema,
  SelectWorkspaceRequestSchema,
  CreateCompanyRequestSchema,
  UpdateCompanyRequestSchema,
  CreateEmployeeRequestSchema,
  InlineUpdateEmployeeRequestSchema,
  BulkEmployeeActionRequestSchema,
  CreateFamilyMemberRequestSchema,
  CreateEmployeeLeaveRequestSchema,
  CreateVacationRequestSchema,
  CreateImportStagingRequestSchema,
  UpdateStagingRowRequestSchema,
  ConfirmImportBatchRequestSchema,
  CreateManagedUserRequestSchema,
  RegisterWorkspaceUserRequestSchema,
} from '@ar-payroll/contracts';
import {
  withAuthenticatedTransaction,
  AuthenticationError,
  TenantContextRequiredError,
  tenantPool,
} from './db/pool.js';
import { authService } from './services/auth.service.js';
import { companyService } from './services/company.service.js';
import { employeeService } from './services/employee.service.js';
import { importService } from './services/import.service.js';
import { userService } from './services/user.service.js';
import * as payrollService from './services/payroll.service.js';
import { ZodError, z } from 'zod';

function extractBearerToken(req: FastifyRequest): string {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AuthenticationError('Encabezado Authorization Bearer requerido.');
  }
  return header.slice('Bearer '.length).trim();
}

export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: false,
    bodyLimit: 25 * 1024 * 1024, // Soporta subida de archivos Excel y PDF en base64 hasta ~15MB binarios
  });

  app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthenticationError) {
      return reply.status(error.statusCode).send({
        error: error.name,
        message: error.message,
      });
    }
    if (error instanceof TenantContextRequiredError) {
      return reply.status(error.statusCode).send({
        error: error.name,
        message: error.message,
      });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: error.issues.map((i) => i.message).join(' | ') || 'Datos de entrada inválidos.',
        issues: error.issues,
      });
    }
    return reply.status(400).send({
      error: 'BadRequestError',
      message: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  });

  // 1. Health & RLS Status Check
  app.get('/api/v1/health', async () => {
    const res = await tenantPool.query<{
      current_user: string;
      bypass_rls: boolean;
      table_count: string;
      rls_forced_count: string;
    }>(`
      SELECT
        current_user,
        (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass_rls,
        (SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_schema_migrations') AS table_count,
        (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_schema_migrations' AND c.relforcerowsecurity = true) AS rls_forced_count
    `);
    const row = res.rows[0];
    return {
      status: 'ok',
      engine: 'PostgreSQL 16',
      dbRole: row.current_user,
      bypassRls: row.bypass_rls,
      physicalTables: Number(row.table_count),
      rlsForcedTables: Number(row.rls_forced_count),
      timestamp: new Date().toISOString(),
    };
  });

  // 2. Autenticación
  app.post('/api/v1/auth/login', async (req, reply) => {
    const body = LoginRequestSchema.parse(req.body);
    const result = await authService.login({
      email: body.email,
      password: body.password,
      deviceName: body.deviceName,
      ipAddress: req.ip,
    });
    return reply.status(200).send(result);
  });

  app.post('/api/v1/auth/select-workspace', async (req, reply) => {
    const token = extractBearerToken(req);
    const body = SelectWorkspaceRequestSchema.parse(req.body);
    const result = await authService.selectWorkspace(token, body.tenantId);
    return reply.status(200).send(result);
  });

  app.get('/api/v1/auth/me', async (req, reply) => {
    const token = extractBearerToken(req);
    const profile = await authService.getMe(token);
    return reply.status(200).send(profile);
  });

  app.post('/api/v1/auth/logout', async (req, reply) => {
    const token = extractBearerToken(req);
    await authService.logout(token);
    return reply.status(200).send({ revoked: true });
  });

  app.get('/api/v1/users', async (req, reply) => {
    const token = extractBearerToken(req);
    const users = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
      return userService.listManagedUsers(client, ctx);
    });
    return reply.status(200).send({ users });
  });

  app.post('/api/v1/users', async (req, reply) => {
    const token = extractBearerToken(req);
    const body = CreateManagedUserRequestSchema.parse(req.body);
    const user = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
      return userService.createManagedUser(client, ctx, body);
    });
    return reply.status(201).send({ user });
  });

  app.delete<{ Params: { userId: string } }>('/api/v1/users/:userId', async (req, reply) => {
    const token = extractBearerToken(req);
    const userId = z.string().uuid('Identificador de usuario inválido').parse(req.params.userId);
    const user = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
      return userService.removeManagedUser(client, ctx, userId);
    });
    return reply.status(200).send({ user });
  });

  app.post('/api/v1/auth/register', async (req, reply) => {
    const body = RegisterWorkspaceUserRequestSchema.parse(req.body);
    const user = await tenantPool.connect().then(async (client) => {
      try {
        await client.query('BEGIN');
        const result = await userService.registerWorkspaceUser(client, body);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    });
    return reply.status(201).send({ user });
  });

  // 3. Resumen ejecutivo para el Panel Principal
  app.get('/api/v1/dashboard/summary', async (req, reply) => {
    const token = extractBearerToken(req);
    const summary = await withAuthenticatedTransaction(token, true, async (client) => {
      const res = await client.query<{
        companies_count: string;
        active_companies_count: string;
        employees_count: string;
        active_employees_count: string;
        payrolls_count: string;
        payslips_count: string;
        documents_count: string;
        staging_batches_count: string;
      }>(`
        SELECT
          (SELECT count(*)::text FROM public.companies) AS companies_count,
          (SELECT count(*)::text FROM public.companies WHERE is_active = true) AS active_companies_count,
          (SELECT count(*)::text FROM public.employees) AS employees_count,
          (SELECT count(*)::text FROM public.employees WHERE employment_status = 'ACTIVE') AS active_employees_count,
          (SELECT count(*)::text FROM public.payrolls) AS payrolls_count,
          (SELECT count(*)::text FROM public.payslips) AS payslips_count,
          (SELECT count(*)::text FROM public.documents) AS documents_count,
          (SELECT count(*)::text FROM public.import_staging_batches) AS staging_batches_count
      `);
      const r = res.rows[0];
      return {
        companiesCount: Number(r.companies_count),
        activeCompaniesCount: Number(r.active_companies_count),
        employeesCount: Number(r.employees_count),
        activeEmployeesCount: Number(r.active_employees_count),
        payrollsCount: Number(r.payrolls_count),
        payslipsCount: Number(r.payslips_count),
        documentsCount: Number(r.documents_count),
        stagingBatchesCount: Number(r.staging_batches_count),
      };
    });
    return reply.status(200).send({ summary });
  });

  // 4. Módulo Empresas (Fase B)
  app.get('/api/v1/companies', async (req, reply) => {
    const token = extractBearerToken(req);
    const companies = await withAuthenticatedTransaction(token, true, async (client) => {
      return companyService.listCompanies(client);
    });
    return reply.status(200).send({ companies });
  });

  app.get<{ Params: { id: string } }>('/api/v1/companies/:id', async (req, reply) => {
    const token = extractBearerToken(req);
    const detail = await withAuthenticatedTransaction(token, true, async (client) => {
      return companyService.getCompanyDetail(client, req.params.id);
    });
    if (!detail) {
      return reply.status(404).send({
        error: 'NotFound',
        message: 'Empresa no encontrada en el espacio de trabajo activo.',
      });
    }
    return reply.status(200).send(detail);
  });

  app.post('/api/v1/companies', async (req, reply) => {
    const token = extractBearerToken(req);
    const body = CreateCompanyRequestSchema.parse(req.body);
    const created = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
      return companyService.createCompany(client, ctx, body, req.ip);
    });
    return reply.status(201).send({ company: created });
  });

  app.patch<{ Params: { id: string } }>('/api/v1/companies/:id', async (req, reply) => {
    const token = extractBearerToken(req);
    const body = UpdateCompanyRequestSchema.parse(req.body);
    const updated = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
      return companyService.updateCompany(client, ctx, req.params.id, body, req.ip);
    });
    if (!updated) {
      return reply.status(404).send({
        error: 'NotFound',
        message: 'Empresa no encontrada en el espacio de trabajo activo.',
      });
    }
    return reply.status(200).send({ company: updated });
  });

  // 5. Módulo Empleados — Grilla Estilo Excel y Ficha Individual (Fase C)
  app.get<{ Params: { companyId: string } }>(
    '/api/v1/companies/:companyId/employees',
    async (req, reply) => {
      const token = extractBearerToken(req);
      const employees = await withAuthenticatedTransaction(token, true, async (client) => {
        return employeeService.listCompanyEmployees(client, req.params.companyId);
      });
      return reply.status(200).send({ employees });
    },
  );

  app.post<{ Params: { companyId: string } }>(
    '/api/v1/companies/:companyId/employees',
    async (req, reply) => {
      const token = extractBearerToken(req);
      const body = CreateEmployeeRequestSchema.parse(req.body);
      const employee = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
        return employeeService.createEmployee(client, ctx, req.params.companyId, body, req.ip);
      });
      return reply.status(201).send({ employee });
    },
  );

  app.patch<{ Params: { companyId: string; employeeId: string } }>(
    '/api/v1/companies/:companyId/employees/:employeeId',
    async (req, reply) => {
      const token = extractBearerToken(req);
      const body = InlineUpdateEmployeeRequestSchema.parse(req.body);
      const employee = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
        return employeeService.updateEmployee(
          client,
          ctx,
          req.params.companyId,
          req.params.employeeId,
          body,
          req.ip,
        );
      });
      return reply.status(200).send({ employee });
    },
  );

  app.post<{ Params: { companyId: string } }>(
    '/api/v1/companies/:companyId/employees/bulk',
    async (req, reply) => {
      const token = extractBearerToken(req);
      const body = BulkEmployeeActionRequestSchema.parse(req.body);
      const employees = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
        return employeeService.bulkUpdateEmployees(client, ctx, req.params.companyId, body, req.ip);
      });
      return reply.status(200).send({ employees });
    },
  );

  app.get<{ Params: { companyId: string; employeeId: string } }>(
    '/api/v1/companies/:companyId/employees/:employeeId/profile',
    async (req, reply) => {
      const token = extractBearerToken(req);
      const dossier = await withAuthenticatedTransaction(token, true, async (client) => {
        return employeeService.getEmployeeFullProfile(
          client,
          req.params.companyId,
          req.params.employeeId,
        );
      });
      if (!dossier) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Legajo no encontrado en la empresa seleccionada.',
        });
      }
      return reply.status(200).send(dossier);
    },
  );

  app.post<{ Params: { companyId: string; employeeId: string } }>(
    '/api/v1/companies/:companyId/employees/:employeeId/family',
    async (req, reply) => {
      const token = extractBearerToken(req);
      const body = CreateFamilyMemberRequestSchema.parse(req.body);
      const member = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
        return employeeService.addFamilyMember(
          client,
          ctx,
          req.params.companyId,
          req.params.employeeId,
          body,
        );

      });
      return reply.status(201).send({ familyMember: member });
    },
  );

  app.get<{ Querystring: { companyId?: string; year?: string } }>(
    '/api/v1/vacations',
    async (req, reply) => {
      const token = extractBearerToken(req);
      const vacations = await withAuthenticatedTransaction(token, true, async (client) => {
        return employeeService.listVacations(client, {
          companyId: req.query.companyId,
          year: req.query.year ? Number(req.query.year) : undefined,
        });
      });
      return reply.status(200).send({ vacations });
    },
  );

  app.post<{ Params: { companyId: string; employeeId: string } }>(
    '/api/v1/companies/:companyId/employees/:employeeId/vacations',
    async (req, reply) => {
      const token = extractBearerToken(req);
      const body = CreateVacationRequestSchema.parse(req.body);
      const vacation = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
        return employeeService.addVacation(
          client,
          ctx,
          req.params.companyId,
          req.params.employeeId,
          body,
        );
      });
      return reply.status(201).send({ vacation });
    },
  );

  app.post<{ Params: { companyId: string; employeeId: string } }>(
    '/api/v1/companies/:companyId/employees/:employeeId/leaves',
    async (req, reply) => {
      const token = extractBearerToken(req);
      const body = CreateEmployeeLeaveRequestSchema.parse(req.body);
      const leave = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
        return employeeService.addEmployeeLeave(
          client,
          ctx,
          req.params.companyId,
          req.params.employeeId,
          body,
        );
      });
      return reply.status(201).send({ leave });
    },
  );

  // 6. Catálogos de Convenios y Categorías
  app.get('/api/v1/cbas', async (req, reply) => {
    const token = extractBearerToken(req);
    const cbas = await withAuthenticatedTransaction(token, true, async (client) => {
      const res = await client.query<{
        id: string;
        tenant_id: string | null;
        cct_number: string;
        name: string;
        branch_code: string | null;
        branch_name: string | null;
      }>(`
        SELECT ca.id, ca.tenant_id, ca.cct_number, ca.name,
               ab.code AS branch_code, ab.name AS branch_name
        FROM public.collective_agreements ca
        LEFT JOIN public.agreement_branches ab ON ab.agreement_id = ca.id
        WHERE ca.is_active = true
        ORDER BY ca.cct_number ASC
      `);
      return res.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        scope: r.tenant_id === null ? ('GLOBAL' as const) : ('TENANT' as const),
        code: r.cct_number,
        name: r.name,
        branchCode: r.branch_code,
        branchName: r.branch_name,
      }));
    });
    return reply.status(200).send({ cbas });
  });

  app.get('/api/v1/categories', async (req, reply) => {
    const token = extractBearerToken(req);
    const categories = await withAuthenticatedTransaction(token, true, async (client) => {
      return employeeService.listAvailableCategories(client);
    });
    return reply.status(200).send({ categories });
  });

  // 7. Importación Masiva desde Excel/CSV y PDF con Staging (Fases D y E)
  app.post('/api/v1/imports/staging', async (req, reply) => {
    const token = extractBearerToken(req);
    const body = CreateImportStagingRequestSchema.parse(req.body);
    const batch = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
      return importService.createStagingBatch(client, ctx, body, req.ip);
    });
    return reply.status(201).send(batch);
  });

  app.get<{ Params: { batchId: string } }>(
    '/api/v1/imports/batches/:batchId',
    async (req, reply) => {
      const token = extractBearerToken(req);
      const batch = await withAuthenticatedTransaction(token, true, async (client) => {
        return importService.getStagingBatchDetail(client, req.params.batchId);
      });
      if (!batch) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Lote de importación no encontrado.',
        });
      }
      return reply.status(200).send(batch);
    },
  );

  app.patch<{ Params: { batchId: string; rowId: string } }>(
    '/api/v1/imports/batches/:batchId/rows/:rowId',
    async (req, reply) => {
      const token = extractBearerToken(req);
      const body = UpdateStagingRowRequestSchema.parse(req.body);
      const batch = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
        return importService.updateStagingRow(
          client,
          ctx,
          req.params.batchId,
          req.params.rowId,
          body,
        );
      });
      return reply.status(200).send(batch);
    },
  );

  app.post<{ Params: { batchId: string } }>(
    '/api/v1/imports/batches/:batchId/confirm',
    async (req, reply) => {
      const token = extractBearerToken(req);
      const body = ConfirmImportBatchRequestSchema.parse(req.body ?? {});
      const report = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
        return importService.confirmStagingBatch(client, ctx, req.params.batchId, body, req.ip);
      });
      return reply.status(200).send(report);
    },
  );

  // 8. Documentos y Recibos Globales del Tenant
  app.get('/api/v1/documents', async (req, reply) => {
    const token = extractBearerToken(req);
    const documents = await withAuthenticatedTransaction(token, true, async (client) => {
      const res = await client.query(`
        SELECT d.id, d.company_id, d.employee_id, d.document_type, d.title,
               d.original_filename, d.mime_type, d.size_bytes::text, d.sha256_hash,
               d.is_immutable, d.created_at
        FROM public.documents d
        ORDER BY d.created_at DESC
        LIMIT 100
      `);
      return res.rows;
    });
    return reply.status(200).send({ documents });
  });

  // 9. Auditoría del Tenant Activo
  app.get('/api/v1/audit-logs', async (req, reply) => {
    const token = extractBearerToken(req);
    const logs = await withAuthenticatedTransaction(token, true, async (client) => {
      const res = await client.query<{
        id: string;
        tenant_id: string;
        user_id: string | null;
        action: string;
        module: string;
        target_table: string;
        target_id: string | null;
        outcome: string;
        new_values: Record<string, unknown> | null;
        created_at: Date;
      }>(`
        SELECT id, tenant_id, user_id, action, module, target_table, target_id, outcome, new_values, created_at
        FROM public.audit_logs
        ORDER BY created_at DESC
        LIMIT 100
      `);
      return res.rows;
    });
    return reply.status(200).send({ logs });
  });

  // 10. Períodos, Novedades, Liquidaciones, Recibos e Inmutabilidad / LSD ARCA
  app.get<{ Params: { companyId: string } }>(
    '/api/v1/companies/:companyId/payrolls-workspace',
    async (req, reply) => {
      const token = extractBearerToken(req);
      const workspace = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
        return payrollService.getCompanyPayrollWorkspace(client, ctx, req.params.companyId);
      });
      return reply.status(200).send(workspace);
    },
  );

  app.post<{ Params: { companyId: string } }>(
    '/api/v1/companies/:companyId/payroll-periods',
    async (req, reply) => {
      const token = extractBearerToken(req);
      const bodySchema = z.object({
        year: z.number().int().min(2000).max(2100),
        month: z.number().int().min(1).max(12),
        liquidationModality: z.enum([
          'PRIMERA_QUINCENA',
          'SEGUNDA_QUINCENA',
          'MENSUAL',
          'SAC_1',
          'SAC_2',
          'VACACIONES',
          'FINAL_EGRESO',
          'COMPLEMENTARIA',
        ]),
        scheduledPaymentDate: z.string().optional(),
      });
      const body = bodySchema.parse(req.body);
      const result = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
        if (ctx.roleCode === 'VIEWER') {
          const err = new Error('El rol VIEWER no tiene permisos para abrir períodos.') as Error & { statusCode?: number };
          err.statusCode = 403;
          throw err;
        }
        return payrollService.createPayrollPeriod(client, ctx, req.params.companyId, body);
      });
      return reply.status(201).send(result);
    },
  );

  app.put<{ Params: { companyId: string; periodId: string } }>(
    '/api/v1/companies/:companyId/payroll-periods/:periodId/novelties',
    async (req, reply) => {
      const token = extractBearerToken(req);
      const bodySchema = z.object({
        rows: z.array(
          z.object({
            employeeId: z.string().uuid(),
            normalHours: z.number().min(0),
            overtime50Hours: z.number().min(0),
            overtime100Hours: z.number().min(0),
            holidayHours: z.number().min(0),
            nonRemunerativeAmount: z.number().min(0),
            advanceAmount: z.number().min(0),
            observation: z.string().optional(),
          }),
        ),
      });
      const body = bodySchema.parse(req.body);
      const result = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
        if (ctx.roleCode === 'VIEWER') {
          const err = new Error('El rol VIEWER no tiene permisos para editar novedades.') as Error & { statusCode?: number };
          err.statusCode = 403;
          throw err;
        }
        return payrollService.savePeriodNovelties(
          client,
          ctx,
          req.params.companyId,
          req.params.periodId,
          body.rows,
        );
      });
      return reply.status(200).send(result);
    },
  );

  app.post<{ Params: { companyId: string; periodId: string } }>(
    '/api/v1/companies/:companyId/payroll-periods/:periodId/calculate',
    async (req, reply) => {
      const token = extractBearerToken(req);
      const result = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
        if (ctx.roleCode === 'VIEWER') {
          const err = new Error('El rol VIEWER no tiene permisos para calcular liquidaciones.') as Error & { statusCode?: number };
          err.statusCode = 403;
          throw err;
        }
        return payrollService.calculatePayrollForPeriod(
          client,
          ctx,
          req.params.companyId,
          req.params.periodId,
        );
      });
      return reply.status(200).send(result);
    },
  );

  app.post<{ Params: { companyId: string; payrollId: string } }>(
    '/api/v1/companies/:companyId/payrolls/:payrollId/approve',
    async (req, reply) => {
      const token = extractBearerToken(req);
      const result = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
        if (ctx.roleCode === 'VIEWER') {
          const err = new Error('El rol VIEWER no tiene permisos para aprobar liquidaciones.') as Error & { statusCode?: number };
          err.statusCode = 403;
          throw err;
        }
        return payrollService.approvePayroll(
          client,
          ctx,
          req.params.companyId,
          req.params.payrollId,
        );
      });
      return reply.status(200).send(result);
    },
  );

  app.post<{ Params: { companyId: string; payrollId: string } }>(
    '/api/v1/companies/:companyId/payrolls/:payrollId/export-arca',
    async (req, reply) => {
      const token = extractBearerToken(req);
      const result = await withAuthenticatedTransaction(token, true, async (client, ctx) => {
        if (ctx.roleCode === 'VIEWER') {
          const err = new Error('El rol VIEWER no tiene permisos para exportar ARCA LSD.') as Error & { statusCode?: number };
          err.statusCode = 403;
          throw err;
        }
        return payrollService.generateArcaLibroSueldosExport(
          client,
          ctx,
          req.params.companyId,
          req.params.payrollId,
        );
      });
      return reply.status(200).send(result);
    },
  );

  return app;
}

if (/server\.(ts|js)$/.test(process.argv[1] ?? '')) {
  const server = buildServer();
  const port = Number(process.env.API_PORT ?? 4000);
  const host = process.env.API_HOST ?? '127.0.0.1';
  server.listen({ port, host }).then(() => {
    console.log(`[API] Servidor Fastify escuchando en http://${host}:${port}`);
  });
}
