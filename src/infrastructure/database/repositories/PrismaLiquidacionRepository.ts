import { prisma } from '../client';
import { ILiquidacionRepository } from '@/domain/repositories/ILiquidacionRepository';
import { Liquidacion, WorkflowLog, ReciboSueldo, ReciboDetalle } from '@/domain/entities/Liquidacion';
import { Periodo } from '@/domain/value-objects/Periodo';
import { Money } from '@/domain/value-objects/Money';

export class PrismaLiquidacionRepository implements ILiquidacionRepository {
  public async findById(id: string, tenantId: string): Promise<Liquidacion | null> {
    const dbLiquidacion = await prisma.liquidacion.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        workflowLogs: true,
        recibos: {
          include: { detalles: true }
        }
      }
    });
    if (!dbLiquidacion) return null;
    return this.toDomain(dbLiquidacion);
  }

  public async findByUniqueKeys(
    clienteId: string,
    periodo: Periodo,
    quincena: number,
    tipo: string,
    tenantId: string
  ): Promise<Liquidacion | null> {
    const dbLiquidacion = await prisma.liquidacion.findFirst({
      where: {
        clienteId,
        periodo: periodo.getValue(),
        quincena,
        tipo,
        tenantId,
        deletedAt: null
      },
      include: {
        workflowLogs: true,
        recibos: {
          include: { detalles: true }
        }
      }
    });
    if (!dbLiquidacion) return null;
    return this.toDomain(dbLiquidacion);
  }

  public async findAllByEmpresa(clienteId: string, tenantId: string): Promise<Liquidacion[]> {
    const dbLiquidaciones = await prisma.liquidacion.findMany({
      where: { clienteId, tenantId, deletedAt: null },
      include: {
        workflowLogs: true,
        recibos: {
          include: { detalles: true }
        }
      }
    });
    return dbLiquidaciones.map(l => this.toDomain(l));
  }

  public async save(liquidacion: Liquidacion): Promise<void> {
    // 1. Save core Liquidacion
    await prisma.liquidacion.upsert({
      where: { id: liquidacion.id },
      update: {
        estado: liquidacion.getEstado() as any,
      },
      create: {
        id: liquidacion.id,
        tenantId: liquidacion.tenantId,
        clienteId: liquidacion.clienteId,
        periodo: liquidacion.getPeriodo().getValue(),
        quincena: liquidacion.quincena,
        tipo: liquidacion.tipo,
        estado: liquidacion.getEstado() as any,
        fechaLiquidacion: liquidacion.fechaLiquidacion,
      }
    });

    // 2. Save workflow logs
    for (const log of liquidacion.getWorkflowLogs()) {
      await prisma.workflowLog.upsert({
        where: { id: log.id },
        update: {},
        create: {
          id: log.id,
          tenantId: liquidacion.tenantId,
          liquidacionId: liquidacion.id,
          estadoOrigen: log.estadoOrigen as any,
          estadoDestino: log.estadoDestino as any,
          comentario: log.comentario,
          userId: log.userId,
          createdAt: log.createdAt,
        }
      });
    }

    // 3. Save receipts (ReciboSueldo and ReciboDetalle)
    for (const r of liquidacion.getRecibos()) {
      await prisma.reciboSueldo.upsert({
        where: { id: r.id },
        update: {
          estado: r.estado,
          pdfUrl: r.pdfUrl,
          cantidadImpresiones: r.cantidadImpresiones,
          fechaImpresion: r.fechaImpresion,
          xmlData: r.xmlData,
          firmaDigital: r.firmaDigital,
          hashSha256: r.hashSha256,
        },
        create: {
          id: r.id,
          liquidacionId: liquidacion.id,
          empleadoId: r.empleadoId,
          empleadoVersionId: r.empleadoVersionId,
          clienteId: r.clienteId,
          clienteVersionId: r.clienteVersionId,
          convenioVersionId: r.convenioVersionId,
          escalaId: r.escalaId,
          categoriaId: r.categoriaId,
          rectificaReciboId: r.rectificaReciboId,
          cuil: r.cuil,
          cuit: r.cuit,
          periodo: r.periodo,
          quincena: r.quincena,
          basicoAplicado: r.basicoAplicado.toDecimal(),
          antiguedadAnos: r.antiguedadAnos,
          totalRemunerativo: r.totalRemunerativo.toDecimal(),
          totalNoRemunerativo: r.totalNoRemunerativo.toDecimal(),
          totalDescuentos: r.totalDescuentos.toDecimal(),
          totalNeto: r.totalNeto.toDecimal(),
          costoLaboralTotal: r.costoLaboralTotal.toDecimal(),
          totalContribuciones: r.totalContribuciones.toDecimal(),
          uniqueCode: r.uniqueCode,
          hashSha256: r.hashSha256,
          reciboVersion: r.reciboVersion,
          firmaDigital: r.firmaDigital,
          xmlData: r.xmlData,
          fechaImpresion: r.fechaImpresion,
          cantidadImpresiones: r.cantidadImpresiones,
          estado: r.estado,
          fechaPago: r.fechaPago,
          bancoPago: r.bancoPago,
          cbuPago: r.cbuPago,
          pdfUrl: r.pdfUrl,
        }
      });

      // Save receipt details
      for (const d of r.getDetalles()) {
        await prisma.reciboDetalle.upsert({
          where: { id: d.id },
          update: {},
          create: {
            id: d.id,
            reciboId: r.id,
            conceptoVersionId: d.conceptoVersionId,
            conceptoCodigo: d.conceptoCodigo,
            conceptoNombre: d.conceptoNombre,
            tipo: d.tipo as any,
            cantidad: d.cantidad.toDecimal(),
            valorUnitario: d.valorUnitario.toDecimal(),
            subtotal: d.subtotal.toDecimal(),
            formulaAplicada: d.formulaAplicada,
            porcentajeAplicado: d.porcentajeAplicado ? d.porcentajeAplicado.toDecimal() : null,
          }
        });
      }
    }
  }

  private toDomain(dbLiquidacion: any): Liquidacion {
    const logs = dbLiquidacion.workflowLogs.map((l: any) => new WorkflowLog(
      l.id,
      l.estadoOrigen as any,
      l.estadoDestino as any,
      l.comentario,
      l.userId,
      l.createdAt
    ));

    const recibos = dbLiquidacion.recibos.map((r: any) => {
      const detalles = r.detalles.map((d: any) => new ReciboDetalle({
        conceptoVersionId: d.conceptoVersionId,
        conceptoCodigo: d.conceptoCodigo,
        conceptoNombre: d.conceptoNombre,
        tipo: d.tipo as any,
        cantidad: Money.create(d.cantidad),
        valorUnitario: Money.create(d.valorUnitario),
        subtotal: Money.create(d.subtotal),
        formulaAplicada: d.formulaAplicada,
        porcentajeAplicado: d.porcentajeAplicado ? Money.create(d.porcentajeAplicado) : null,
      }, d.id));

      return new ReciboSueldo({
        empleadoId: r.empleadoId,
        empleadoVersionId: r.empleadoVersionId,
        clienteId: r.clienteId,
        clienteVersionId: r.clienteVersionId,
        convenioVersionId: r.convenioVersionId,
        escalaId: r.escalaId,
        categoriaId: r.categoriaId,
        rectificaReciboId: r.rectificaReciboId,
        cuil: r.cuil,
        cuit: r.cuit,
        periodo: r.periodo,
        quincena: r.quincena,
        basicoAplicado: Money.create(r.basicoAplicado),
        antiguedadAnos: r.antiguedadAnos,
        totalRemunerativo: Money.create(r.totalRemunerativo),
        totalNoRemunerativo: Money.create(r.totalNoRemunerativo),
        totalDescuentos: Money.create(r.totalDescuentos),
        totalNeto: Money.create(r.totalNeto),
        costoLaboralTotal: Money.create(r.costoLaboralTotal),
        totalContribuciones: Money.create(r.totalContribuciones),
        uniqueCode: r.uniqueCode,
        hashSha256: r.hashSha256,
        reciboVersion: r.reciboVersion,
        firmaDigital: r.firmaDigital,
        xmlData: r.xmlData,
        fechaImpresion: r.fechaImpresion,
        cantidadImpresiones: r.cantidadImpresiones,
        estado: r.estado as any,
        fechaPago: r.fechaPago,
        bancoPago: r.bancoPago,
        cbuPago: r.cbuPago,
        pdfUrl: r.pdfUrl,
        detalles
      }, r.id);
    });

    return Liquidacion.reconstitute(
      dbLiquidacion.id,
      dbLiquidacion.tenantId,
      dbLiquidacion.clienteId,
      Periodo.create(dbLiquidacion.periodo),
      dbLiquidacion.quincena,
      dbLiquidacion.tipo,
      dbLiquidacion.estado as any,
      dbLiquidacion.fechaLiquidacion,
      recibos,
      logs
    );
  }
}
