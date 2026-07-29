import { Money } from '../value-objects/Money';
import { Percentage } from '../value-objects/Percentage';
import { Empleado } from '../entities/Empleado';
import { Cliente } from '../entities/Cliente';
import { NovedadMensual } from '../entities/Empleado';

export interface CalculationContext {
  basicSalary: Money;
  seniorityYears: number;
  seniorityPercentage: Percentage;
  workedDays: number;
  overtime50: Money;
  overtime100: Money;
  holidaysWorked: number;
  isUnionMember: boolean;
  totalRemunerative: Money;
  totalNonRemunerative: Money;
  totalDeductions: Money;
  parameters: Map<string, string | number | boolean>;
}

export interface IPayrollProvider {
  readonly countryCode: string; // e.g. "AR", "UY", "CL"
  calculateSeniority(
    empleado: Empleado,
    date: Date,
    basePct: Percentage,
    basicSalary: Money
  ): { years: number; allowance: Money; percentage: Percentage };
  calculateVacationPay(
    empleado: Empleado,
    date: Date,
    days: number,
    basicSalary: Money
  ): Money;
  calculateSAC(
    empleado: Empleado,
    period: string,
    historicReceipts: any[]
  ): Money;
  calculateTermination(
    type: 'RENUNCIA' | 'DESPIDO_SIN_CAUSA' | 'DESPIDO_CON_CAUSA' | 'JUBILACION' | 'FALLECIMIENTO',
    empleado: Empleado,
    date: Date,
    context: CalculationContext
  ): Map<string, Money>;
}
