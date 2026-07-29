import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { z } from 'zod';
import { PrismaClienteRepository } from '@/infrastructure/database/repositories/PrismaClienteRepository';
import { PrismaEmpleadoRepository } from '@/infrastructure/database/repositories/PrismaEmpleadoRepository';
import { PrismaLiquidacionRepository } from '@/infrastructure/database/repositories/PrismaLiquidacionRepository';
import { PrismaConvenioRepository } from '@/infrastructure/database/repositories/PrismaConvenioRepository';
import { PrismaConceptoRepository } from '@/infrastructure/database/repositories/PrismaConceptoRepository';
import { ArgentinaPayrollProvider } from '@/infrastructure/providers/ArgentinaPayrollProvider';
import { LiquidarPeriodoMasivo } from '@/application/use-cases/LiquidarPeriodoMasivo';
import { prisma } from '@/infrastructure/database/client';

const runPayrollSchema = z.object({
  tenantId: z.string().uuid(),
  clienteId: z.string().uuid(),
  periodoStr: z.string().regex(/^\d{4}-\d{2}$/),
  quincena: z.number().int().min(0).max(2),
  tipo: z.string(),
  userId: z.string().uuid(),
  fechaPago: z.string().datetime(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = runPayrollSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: "Datos de entrada inválidos", details: result.error.flatten() }, { status: 400 });
    }

    const empresaRepo = new PrismaClienteRepository();
    const empleadoRepo = new PrismaEmpleadoRepository();
    const liquidacionRepo = new PrismaLiquidacionRepository();
    const convenioRepo = new PrismaConvenioRepository();
    const conceptoRepo = new PrismaConceptoRepository();
    const provider = new ArgentinaPayrollProvider();

    const useCase = new LiquidarPeriodoMasivo(
      empresaRepo,
      empleadoRepo,
      liquidacionRepo,
      convenioRepo,
      conceptoRepo,
      provider
    );

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
        action: 'RUN_MASS_PAYROLL',
        modulo: 'PAYROLL_ENGINE',
        tabla: 'Liquidacion',
        recordId: runResult.value.liquidacionId,
        valorNuevo: JSON.stringify({
          liquidacionId: runResult.value.liquidacionId,
          recibosGenerados: runResult.value.recibosGenerados,
          periodo: result.data.periodoStr,
          quincena: result.data.quincena
        }),
      }
    });

    return NextResponse.json(runResult.value, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
