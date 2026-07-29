import { ILiquidacionRepository } from '@/domain/repositories/ILiquidacionRepository';
import { IEmpleadoRepository } from '@/domain/repositories/IEmpleadoRepository';
import { Liquidacion, ReciboSueldo, ReciboDetalle } from '@/domain/entities/Liquidacion';
import { Periodo } from '@/domain/value-objects/Periodo';
import { Money } from '@/domain/value-objects/Money';
import { Result } from '@/domain/utils/Result';
import { PayrollFactories } from '@/domain/factories/PayrollFactories';

export interface GenerarRectificativaCommand {
  tenantId: string;
  clienteId: string;
  reciboOriginalId: string;
  userId: string;
  nuevasNovedadesPatch: any; // e.g. modified parameters to calculate difference
  fechaPago: Date;
}

export class GenerarRectificativa {
  public constructor(
    private readonly liquidacionRepo: ILiquidacionRepository,
    private readonly empleadoRepo: IEmpleadoRepository
  ) {}

  public async execute(command: GenerarRectificativaCommand): Promise<Result<{ reciboRectificativoId: string }>> {
    try {
      // 1. Fetch the liquidation containing the original receipt
      // We can query all liquidations and find the receipt
      const liquidaciones = await this.liquidacionRepo.findAllByEmpresa(command.clienteId, command.tenantId);
      
      let originalReceipt: ReciboSueldo | null = null;
      let originalLiqui: Liquidacion | null = null;
      
      for (const liq of liquidaciones) {
        const found = liq.getRecibos().find(r => r.id === command.reciboOriginalId);
        if (found) {
          originalReceipt = found;
          originalLiqui = liq;
          break;
        }
      }

      if (!originalReceipt || !originalLiqui) {
        return Result.fail("No se encontró el recibo original a rectificar.");
      }

      // In real systems, the original liquidation must be CERRADA
      // if (originalLiqui.getEstado() !== 'CERRADO') {
      //   return Result.fail("Solo se pueden rectificar recibos pertenecientes a liquidaciones cerradas.");
      // }

      // 2. Create a new liquidación of type RECTIFICATIVA
      const rectificativaPeriodo = Periodo.create(originalReceipt.periodo);
      const liquiId = Math.random().toString(36).substring(7);
      
      const liquidacionRect = Liquidacion.reconstitute(
        liquiId,
        command.tenantId,
        command.clienteId,
        rectificativaPeriodo,
        originalReceipt.quincena,
        'RECTIFICATIVA',
        'BORRADOR',
        new Date(),
        [],
        []
      );

      liquidacionRect.transicionarEstado('CALCULANDO', command.userId, `Generando rectificación para recibo original ${originalReceipt.id}`);

      // 3. Re-calculate corrected receipt (For this mock use-case, we simulate adding correction lines)
      const correctionAmount = Money.create(15000.00); // 15000 difference
      const detalles: ReciboDetalle[] = [
        new ReciboDetalle({
          conceptoVersionId: originalReceipt.getDetalles()[0]?.conceptoVersionId || Math.random().toString(36).substring(7),
          conceptoCodigo: "AJUSTE",
          conceptoNombre: "Ajuste de Haberes Retroactivo (Rectificación)",
          tipo: 'REMUNERATIVO',
          cantidad: Money.create(1),
          valorUnitario: correctionAmount,
          subtotal: correctionAmount,
          formulaAplicada: "RECTIFICACION_MOCK",
          porcentajeAplicado: null
        })
      ];

      // New values
      const nuevoRemunerativo = originalReceipt.totalRemunerativo.add(correctionAmount);
      const nuevoNeto = originalReceipt.totalNeto.add(correctionAmount);
      const nuevoCosto = originalReceipt.costoLaboralTotal.add(correctionAmount);

      const reciboRect = PayrollFactories.createRecibo(
        liquidacionRect.id,
        originalReceipt.empleadoId,
        originalReceipt.empleadoVersionId,
        originalReceipt.clienteId,
        originalReceipt.clienteVersionId,
        originalReceipt.convenioVersionId,
        originalReceipt.escalaId,
        originalReceipt.categoriaId,
        originalReceipt.id, // Reference to original receipt!
        originalReceipt.cuil,
        originalReceipt.cuit,
        originalReceipt.periodo,
        originalReceipt.quincena,
        originalReceipt.basicoAplicado,
        originalReceipt.antiguedadAnos,
        nuevoRemunerativo,
        originalReceipt.totalNoRemunerativo,
        originalReceipt.totalDescuentos,
        nuevoNeto,
        nuevoCosto,
        originalReceipt.totalContribuciones,
        detalles,
        command.fechaPago
      );

      liquidacionRect.registrarRecibo(reciboRect);
      liquidacionRect.transicionarEstado('GENERADO', command.userId, `Ajuste generado con éxito.`);

      // 4. Save new rectificativa
      await this.liquidacionRepo.save(liquidacionRect);

      console.log(`[Use Case] Generación de recibo rectificativo ${reciboRect.id} para original ${originalReceipt.id} completado.`);

      return Result.ok({ reciboRectificativoId: reciboRect.id });
    } catch (err: any) {
      return Result.fail(`Error al generar recibo rectificativo: ${err.message}`);
    }
  }
}
