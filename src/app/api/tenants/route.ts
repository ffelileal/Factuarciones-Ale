import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { z } from 'zod';
import { PrismaTenantRepository } from '@/infrastructure/database/repositories/PrismaTenantRepository';
import { PrismaClienteRepository } from '@/infrastructure/database/repositories/PrismaClienteRepository';
import { RegistrarTenantCliente } from '@/application/use-cases/RegistrarTenantCliente';
import { prisma } from '@/infrastructure/database/client';

const registerSchema = z.object({
  nombreTenant: z.string().min(3),
  subdominio: z.string().min(3).regex(/^[a-z0-9-]+$/),
  cuit: z.string().length(11),
  razonSocial: z.string().min(3),
  inicioActividades: z.string().datetime(),
  tipoSocietario: z.string(),
  condicionIva: z.string(),
  actividadPrincipal: z.string(),
  codigoAfip: z.string(),
  legalAddress: z.string(),
  fiscalAddress: z.string(),
  provincia: z.string(),
  localidad: z.string(),
  codigoPostal: z.string(),
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = registerSchema.safeParse(body);
    
    if (!result.success) {
      return NextResponse.json({ error: "Datos de entrada inválidos", details: result.error.flatten() }, { status: 400 });
    }

    const tenantRepo = new PrismaTenantRepository();
    const empresaRepo = new PrismaClienteRepository();
    const useCase = new RegistrarTenantCliente(tenantRepo, empresaRepo);

    const runResult = await useCase.execute({
      ...result.data,
      inicioActividades: new Date(result.data.inicioActividades),
    });

    if (!runResult.isSuccess) {
      return NextResponse.json({ error: runResult.error }, { status: 422 });
    }

    // Write audit log in database
    await prisma.auditLog.create({
      data: {
        action: 'CREATE_TENANT_EMPRESA',
        modulo: 'TENANT_MANAGEMENT',
        tabla: 'Tenant',
        recordId: runResult.value.tenantId,
        valorNuevo: JSON.stringify({ tenantId: runResult.value.tenantId, clienteId: runResult.value.clienteId }),
        userEmail: result.data.email,
      }
    });

    return NextResponse.json(runResult.value, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
