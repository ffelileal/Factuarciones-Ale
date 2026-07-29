import { Decimal } from 'decimal.js';
import { Money } from './Money';

export class Percentage {
  private readonly value: Decimal; // e.g. 11 for 11%

  private constructor(val: Decimal) {
    this.value = val.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  }

  public static create(val: number | string | Decimal | Percentage): Percentage {
    if (val instanceof Percentage) {
      return val;
    }
    try {
      const parsed = new Decimal(val);
      if (parsed.isNaN()) {
        throw new Error("El porcentaje no es un número válido.");
      }
      if (parsed.isNegative()) {
        throw new Error("El porcentaje no puede ser negativo.");
      }
      return new Percentage(parsed);
    } catch {
      throw new Error(`Porcentaje inválido: ${val}`);
    }
  }

  public static zero(): Percentage {
    return new Percentage(new Decimal(0));
  }

  public toFactor(): Decimal {
    return this.value.dividedBy(100);
  }

  public applyTo(money: Money): Money {
    return Money.create(money.toDecimal().times(this.toFactor()));
  }

  public add(other: Percentage): Percentage {
    return new Percentage(this.value.plus(other.value));
  }

  public subtract(other: Percentage): Percentage {
    const res = this.value.minus(other.value);
    return new Percentage(res.isNegative() ? new Decimal(0) : res);
  }

  public equals(other: Percentage): boolean {
    return this.value.equals(other.value);
  }

  public toDecimal(): Decimal {
    return this.value;
  }

  public toNumber(): number {
    return this.value.toNumber();
  }

  public toString(): string {
    return `${this.value.toFixed(4)}%`;
  }
}
