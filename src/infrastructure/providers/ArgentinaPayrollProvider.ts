import { IPayrollProvider, CalculationContext } from '@/domain/providers/IPayrollProvider';
import { Empleado } from '@/domain/entities/Empleado';
import { Money } from '@/domain/value-objects/Money';
import { Percentage } from '@/domain/value-objects/Percentage';
import { Decimal } from 'decimal.js';

export class ArgentinaPayrollProvider implements IPayrollProvider {
  public readonly countryCode = 'AR';

  public calculateSeniority(
    empleado: Empleado,
    date: Date,
    basePct: Percentage,
    basicSalary: Money
  ): { years: number; allowance: Money; percentage: Percentage } {
    const version = empleado.getVersionVigente(date);
    const diffTime = Math.abs(date.getTime() - version.fechaIngreso.getTime());
    const diffYears = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 365.25));

    console.log(`[DEBUG Seniority] basePct: ${basePct.toString()}, toDecimal: ${basePct.toDecimal()}, constructor: ${basePct.toDecimal()?.constructor?.name}`);
    const totalPct = basePct.toDecimal().mul(diffYears);
    const percentage = Percentage.create(totalPct);

    // Seniority allowance: basicSalary * totalPct / 100
    const allowance = percentage.applyTo(basicSalary);

    return {
      years: diffYears,
      allowance,
      percentage,
    };
  }

  public calculateVacationPay(
    empleado: Empleado,
    date: Date,
    days: number,
    basicSalary: Money
  ): Money {
    // In Argentina, LCT (Ley de Contrato de Trabajo) specifies that vacation days
    // are paid using a 25 divisor (Salary / 25) instead of 30, which increases the value per day.
    const dailyValue = basicSalary.divide(25);
    return dailyValue.multiply(days);
  }

  public calculateSAC(
    empleado: Empleado,
    period: string, // e.g. "2026-06" or "2026-12"
    historicReceipts: any[]
  ): Money {
    if (historicReceipts.length === 0) {
      return Money.zero();
    }

    // Filter receipts for the current semester:
    // First semester: months 01 to 06
    // Second semester: months 07 to 12
    const targetMonth = parseInt(period.split("-")[1], 10);
    const targetYear = period.split("-")[0];
    const isFirstSemester = targetMonth <= 6;

    const semesterReceipts = historicReceipts.filter(r => {
      const rYear = r.periodo.split("-")[0];
      const rMonth = parseInt(r.periodo.split("-")[1], 10);
      if (rYear !== targetYear) return false;
      return isFirstSemester ? rMonth <= 6 : rMonth > 6;
    });

    if (semesterReceipts.length === 0) {
      return Money.zero();
    }

    // Find the highest remunerative salary in the semester
    let highestRemunerative = Money.zero();
    for (const r of semesterReceipts) {
      const rem = Money.create(r.totalRemunerativo);
      if (rem.isGreaterThan(highestRemunerative)) {
        highestRemunerative = rem;
      }
    }

    // In Argentina, SAC is 50% of the highest monthly wage. Proportional based on worked days if less than full semester
    // Standard semester is 180 days. For simplicity we assume full semester unless entry date is during the semester
    const version = empleado.getVersionVigente(new Date());
    const entryDate = version.fechaIngreso;
    const semesterStartDate = isFirstSemester 
      ? new Date(`${targetYear}-01-01T00:00:00.000Z`)
      : new Date(`${targetYear}-07-01T00:00:00.000Z`);

    let workedDaysInSemester = 180;
    if (entryDate > semesterStartDate) {
      const diffTime = Math.abs(new Date(`${targetYear}-${targetMonth}-30`).getTime() - entryDate.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      workedDaysInSemester = Math.min(diffDays, 180);
    }

    const sacBase = highestRemunerative.divide(2);
    const proportion = new Decimal(workedDaysInSemester).dividedBy(180);
    return sacBase.multiply(proportion);
  }

  public calculateTermination(
    type: 'RENUNCIA' | 'DESPIDO_SIN_CAUSA' | 'DESPIDO_CON_CAUSA' | 'JUBILACION' | 'FALLECIMIENTO',
    empleado: Empleado,
    date: Date,
    context: CalculationContext
  ): Map<string, Money> {
    const payouts = new Map<string, Money>();
    const version = empleado.getVersionVigente(date);
    const basic = context.basicSalary;

    // 1. Proportional SAC and Vacations (Applies to all termination types)
    const propSac = basic.multiply(0.0833); // Rough 1/12 approximation or custom
    const propVacations = this.calculateVacationPay(empleado, date, 5, basic); // Simulated 5 vacation days
    payouts.set('SAC_PROPORCIONAL', propSac);
    payouts.set('VACACIONES_NO_GOZADAS', propVacations);

    // 2. Dismissal-specific payouts (Despido sin causa)
    if (type === 'DESPIDO_SIN_CAUSA') {
      // Art. 245 LCT: 1 salary per year of service or fraction > 3 months
      const seniorityYears = context.seniorityYears;
      const indemnity245 = basic.multiply(Math.max(seniorityYears, 1));
      payouts.set('INDEMNIZACION_ART_245', indemnity245);

      // Preaviso (Notice period): 1 month salary for seniority < 5 years, 2 months for > 5 years
      const preavisoMultiplier = seniorityYears < 5 ? 1 : 2;
      const preaviso = basic.multiply(preavisoMultiplier);
      payouts.set('INDEMNIZACION_PREAVISO', preaviso);

      // Integración mes de despido (Integration of dismissal month)
      const exitDay = date.getDate();
      const remainingDays = Math.max(30 - exitDay, 0);
      const integracion = basic.divide(30).multiply(remainingDays);
      payouts.set('INTEGRACION_MES_DESPIDO', integracion);
    }

    return payouts;
  }
}
