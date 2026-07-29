import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { z } from 'zod';
import { PrismaLiquidacionRepository } from '@/infrastructure/database/repositories/PrismaLiquidacionRepository';
import { PrismaEmpleadoRepository } from '@/infrastructure/database/repositories/PrismaEmpleadoRepository';
import { GenerarRectificativa } from '@/application/use-cases/GenerarRectificativa';
import { prisma } from '@/infrastructure/database/client';

const rectifySchema = z.object({
  tenantId: z.string().uuid(),
  clienteId: z.string().uuid(),
  reciboOriginalId: z.string().uuid(),
  userId: z.string().uuid(),
  nuevasNovedadesPatch: z.any().optional().default({}),
  fechaPago: z.string().datetime(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = rectifySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: "Datos de entrada inválidos", details: result.error.flatten() }, { status: 400 });
    }

    const liquidacionRepo = new PrismaLiquidacionRepository();
    const empleadoRepo = new PrismaEmpleadoRepository();
    
    const useCase = new GenerarRectificativa(liquidacionRepo, empleadoRepo);

    const runResult = await useCase.execute({
      ...result.data,
      fechaPago: new Date(result.data.fechaPago),
    });

    if (!runResult.isSuccess) {
      return NextResponse.json({ error: runResult.error }, { status: 422 });
    }

    // Write audit log in database
    await prisma.auditLog.create({
      data: {
        tenantId: result.data.tenantId,
        userId: result.data.userId,
        action: 'RECTIFY_RECEIPT',
        modulo: 'PAYROLL_ENGINE',
        tabla: 'ReciboSueldo',
        recordId: runResult.value.reciboRectificativoId,
        valorAnterior: result.data.reciboOriginalId,
        valorNuevo: runResult.value.reciboRectificativoId,
      }
    });

    return NextResponse.json(runResult.value, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
