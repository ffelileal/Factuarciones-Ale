import { IEmpleadoRepository } from '@/domain/repositories/IEmpleadoRepository';
import { IClienteRepository } from '@/domain/repositories/IClienteRepository';
import { ILiquidacionRepository } from '@/domain/repositories/ILiquidacionRepository';
import { IConvenioRepository } from '@/domain/repositories/IConvenioRepository';
import { IConceptoRepository } from '@/domain/repositories/IConceptoRepository';
import { IPayrollProvider } from '@/domain/providers/IPayrollProvider';
import { Liquidacion, ReciboSueldo, ReciboDetalle } from '@/domain/entities/Liquidacion';
import { Periodo } from '@/domain/value-objects/Periodo';
import { Money } from '@/domain/value-objects/Money';
import { Percentage } from '@/domain/value-objects/Percentage';
import { Result } from '@/domain/utils/Result';
import { EmpleadoAptoParaLiquidarSpecification } from '@/domain/specifications/EmpleadoSpecifications';
import { FormulaEvaluator } from '@/domain/services/formula/Evaluator';
import { PayrollFactories } from '@/domain/factories/PayrollFactories';
import { Decimal } from 'decimal.js';

export interface LiquidarPeriodoMasivoCommand {
  tenantId: string;
  clienteId: string;
  periodoStr: string;
  quincena: number;
  tipo: string;
  userId: string;
  fechaPago: Date;
}

export class LiquidarPeriodoMasivo {
  public constructor(
    private readonly empresaRepo: IClienteRepository,
    private readonly empleadoRepo: IEmpleadoRepository,
    private readonly liquidacionRepo: ILiquidacionRepository,
    private readonly convenioRepo: IConvenioRepository,
    private readonly conceptoRepo: IConceptoRepository,
    private readonly payrollProvider: IPayrollProvider
  ) {}

  public async execute(command: LiquidarPeriodoMasivoCommand): Promise<Result<{ liquidacionId: string; recibosGenerados: number }>> {
    try {
      const periodo = Periodo.create(command.periodoStr);
      const executionDate = new Date();

      // 1. Verify Cliente existence
      const cliente = await this.empresaRepo.findById(command.clienteId, command.tenantId);
      if (!cliente) {
        return Result.fail("La cliente especificada no existe.");
      }
      const clienteVersion = cliente.getVersionVigente(executionDate);

      // 2. Fetch or create Liquidacion aggregate
      let liquidacion = await this.liquidacionRepo.findByUniqueKeys(
        command.clienteId,
        periodo,
        command.quincena,
        command.tipo,
        command.tenantId
      );
      if (!liquidacion) {
        const id = Math.random().toString(36).substring(7);
        liquidacion = Liquidacion.create(id, command.tenantId, command.clienteId, periodo, command.quincena, command.tipo, command.userId);
      }

      liquidacion.transicionarEstado('CALCULANDO', command.userId, "Iniciando cálculo masivo de haberes.");

      // 3. Load active employees
      const empleados = await this.empleadoRepo.findAllByEmpresa(command.clienteId, command.tenantId);
      console.log(`[DEBUG] LiquidarPeriodoMasivo: loaded ${empleados.length} employees for clienteId ${command.clienteId}, tenantId ${command.tenantId}`);
      if (empleados.length > 0) {
        console.log(`[DEBUG] Employee 0: id=${empleados[0].id}, clienteId=${empleados[0].clienteId}, tenantId=${empleados[0].tenantId}`);
      }
      const liquidadorSpec = new EmpleadoAptoParaLiquidarSpecification();
      
      const empleadosAptos = empleados.filter(emp => 
        liquidadorSpec.isSatisfiedBy({ empleado: emp, fecha: executionDate })
      );

      if (empleadosAptos.length === 0) {
        return Result.fail("No hay empleados activos aptos para liquidar en este periodo.");
      }

      // 4. Fetch all concepts map (maestro de conceptos)
      const conceptos = await this.conceptoRepo.findAll(command.tenantId);
      // Sort concepts by printing order to guarantee dependency calculation
      const conceptosOrdenados = conceptos
        .filter(c => c.getVersionVigente(executionDate).activo)
        .sort((a, b) => {
          const vA = a.getVersionVigente(executionDate);
          const vB = b.getVersionVigente(executionDate);
          return vA.ordenImpresion - vB.ordenImpresion;
        });

      let recibosContador = 0;

      // 5. Loop and calculate each employee
      for (const empleado of empleadosAptos) {
        const empVersion = empleado.getVersionVigente(executionDate);
        console.log(`[DEBUG Loop] Processing employee: ${empleado.id}. convenioVersionId: ${empVersion.convenioVersionId}`);
        
        // Fetch convenio version and category
        const convenio = await this.convenioRepo.findByVersionId(empVersion.convenioVersionId, command.tenantId);
        if (!convenio) {
          console.log(`[DEBUG Loop] Convenio not found for id ${empVersion.convenioVersionId}`);
          continue;
        }
        const convenioVersion = convenio.getVersionVigente(executionDate);
        console.log(`[DEBUG Loop] Found convenio ${convenio.id}. Checking scales count: ${convenio.getEscalas().length}`);
        
                let escala: any = null;
        let categoria: any = null;
        for (const esc of convenio.getEscalas()) {
          const cat = esc.getCategorias().find(c => c.id === empVersion.categoriaId);
          if (cat) {
            escala = esc;
            categoria = cat;
            break;
          }
        }
        if (!escala || !categoria) {
          console.log(`[DEBUG Loop] Escala or Categoria not found for id ${empVersion.categoriaId}`);
          continue;
        }
        console.log(`[DEBUG Loop] Found escala ${escala.id} and categoria ${categoria.id}. Basic salary: ${categoria.valorMensual.toString()}`);

        // Fetch novelty for current period/quincena
        const novedad = empleado.getNovedad(periodo, command.quincena);

        // Compute base variables
        const basicSalary = Money.create(categoria.valorMensual);
        const workedDays = novedad ? 30 - novedad.ausencias : 30;

        // Calculate seniority
        const { years: seniorityYears, allowance: seniorityAllowance, percentage: seniorityPct } = 
          this.payrollProvider.calculateSeniority(empleado, executionDate, convenioVersion.antiguedadPorc, basicSalary);

        // Build AST execution context
        const contextMap = new Map<string, any>([
          ['BASIC', basicSalary.toDecimal()],
          ['VALOR_HORA', categoria.valorHora.toDecimal()],
          ['VALOR_JORNADA', categoria.valorJornada.toDecimal()],
          ['ANTIGUEDAD_ANOS', new Decimal(seniorityYears)],
          ['ANTIGUEDAD_PORC', seniorityPct.toDecimal()],
          ['DIAS_TRABAJADOS', new Decimal(workedDays)],
          ['SINDICATO', empVersion.sindicatoVersionId !== null],
          ['HORAS_EXTRAS_50', novedad ? novedad.horasExtras50 : new Decimal(0)],
          ['HORAS_EXTRAS_100', novedad ? novedad.horasExtras100 : new Decimal(0)],
          ['FERIADOS_TRABAJADOS', novedad ? novedad.feriadosTrabajados : new Decimal(0)],
          // Run totals
          ['REMUNERATIVO_TOTAL', new Decimal(0)],
          ['NO_REMUNERATIVO_TOTAL', new Decimal(0)],
          ['DESCUENTO_TOTAL', new Decimal(0)],
        ]);

        const detalles: ReciboDetalle[] = [];
        let runningRemunerative = Money.zero();
        let runningNonRemunerative = Money.zero();
        let runningDeductions = Money.zero();
        let runningPatronalContributions = Money.zero();

        // 6. Evaluate each concept sequentially
        for (const concepto of conceptosOrdenados) {
          const v = concepto.getVersionVigente(executionDate);
          
          // Inject updated running totals into context for deductions
          contextMap.set('REMUNERATIVO_TOTAL', runningRemunerative.toDecimal());
          contextMap.set('NO_REMUNERATIVO_TOTAL', runningNonRemunerative.toDecimal());
          contextMap.set('DESCUENTO_TOTAL', runningDeductions.toDecimal());

          try {
            // Evaluate formula
            const evaluated = FormulaEvaluator.evaluate(v.formula, contextMap);
            let amount = Money.zero();

            if (evaluated instanceof Decimal) {
              amount = Money.create(evaluated);
            } else if (typeof evaluated === 'boolean') {
              amount = evaluated ? Money.create(1) : Money.zero();
            }

            if (amount.isZero()) {
              continue; // Skip zero valued receipt lines
            }

            // Accumulate totals
            if (v.tipo === 'REMUNERATIVO') {
              runningRemunerative = runningRemunerative.add(amount);
            } else if (v.tipo === 'NO_REMUNERATIVO') {
              runningNonRemunerative = runningNonRemunerative.add(amount);
            } else if (v.tipo === 'DESCUENTO') {
              runningDeductions = runningDeductions.add(amount);
            } else if (v.tipo === 'CONTRIBUCION') {
              runningPatronalContributions = runningPatronalContributions.add(amount);
            }

            // Add receipt line
            detalles.push(new ReciboDetalle({
              conceptoVersionId: v.id,
              conceptoCodigo: concepto.codigo,
              conceptoNombre: v.nombre,
              tipo: v.tipo as any,
              cantidad: Money.create(1), // Default quantity
              valorUnitario: amount,
              subtotal: amount,
              formulaAplicada: v.formula,
              porcentajeAplicado: null
            }));
          } catch (err: any) {
            console.error(`[Engine Error] Fallo al evaluar concepto '${concepto.codigo}' para empleado ${empleado.id}:`, err.message);
          }
        }

        const totalNeto = runningRemunerative.add(runningNonRemunerative).subtract(runningDeductions);
        const costoLaboralTotal = runningRemunerative.add(runningNonRemunerative).add(runningPatronalContributions);

        // 7. Factory create pay receipt
        const recibo = PayrollFactories.createRecibo(
          liquidacion.id,
          empleado.id,
          empVersion.id,
          cliente.id,
          clienteVersion.id,
          convenioVersion.id,
          escala.id,
          categoria.id,
          null, // No rectifica
          empleado.getCuil().getFormatted(),
          cliente.getCuit().getFormatted(),
          periodo.getValue(),
          command.quincena,
          basicSalary,
          seniorityYears,
          runningRemunerative,
          runningNonRemunerative,
          runningDeductions,
          totalNeto,
          costoLaboralTotal,
          runningPatronalContributions,
          detalles,
          command.fechaPago
        );

        liquidacion.registrarRecibo(recibo);
        recibosContador++;
      }

      liquidacion.transicionarEstado('GENERADO', command.userId, `Cálculo de haberes terminado. Recibos generados: ${recibosContador}`);

      // 8. Persist the payroll run
      await this.liquidacionRepo.save(liquidacion);

      return Result.ok({ liquidacionId: liquidacion.id, recibosGenerados: recibosContador });
    } catch (err: any) {
      return Result.fail(`Error fatal durante el procesamiento de la liquidación: ${err.message}`);
    }
  }
}
