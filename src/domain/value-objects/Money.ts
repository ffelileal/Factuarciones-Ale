import { Decimal } from 'decimal.js';

export class Money {
  private readonly value: Decimal;

  private constructor(val: Decimal) {
    this.value = val.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  }

  public static create(val: number | string | Decimal | Money): Money {
    if (val instanceof Money) {
      return val;
    }
    try {
      const parsed = new Decimal(val);
      if (parsed.isNaN()) {
        throw new Error("El valor monetario no es un número válido.");
      }
      return new Money(parsed);
    } catch {
      throw new Error(`Monto monetario inválido: ${val}`);
    }
  }

  public static zero(): Money {
    return new Money(new Decimal(0));
  }

  public add(other: Money): Money {
    return new Money(this.value.plus(other.value));
  }

  public subtract(other: Money): Money {
    return new Money(this.value.minus(other.value));
  }

  public multiply(factor: number | Decimal | Money): Money {
    const factorValue = factor instanceof Money ? factor.value : new Decimal(factor);
    return new Money(this.value.times(factorValue));
  }

  public divide(divisor: number | Decimal | Money): Money {
    const divisorValue = divisor instanceof Money ? divisor.value : new Decimal(divisor);
    if (divisorValue.isZero()) {
      throw new Error("División por cero en operación monetaria.");
    }
    return new Money(this.value.dividedBy(divisorValue));
  }

  public round(decimals: number = 2): Money {
    return new Money(this.value.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP));
  }

  public equals(other: Money): boolean {
    return this.value.equals(other.value);
  }

  public isGreaterThan(other: Money): boolean {
    return this.value.greaterThan(other.value);
  }

  public isLessThan(other: Money): boolean {
    return this.value.lessThan(other.value);
  }

  public isGreaterThanOrEqual(other: Money): boolean {
    return this.value.greaterThanOrEqualTo(other.value);
  }

  public isLessThanOrEqual(other: Money): boolean {
    return this.value.lessThanOrEqualTo(other.value);
  }

  public isZero(): boolean {
    return this.value.isZero();
  }

  public isNegative(): boolean {
    return this.value.isNegative();
  }

  public abs(): Money {
    return new Money(this.value.abs());
  }

  public toDecimal(): Decimal {
    return this.value;
  }

  public toNumber(): number {
    return this.value.toNumber();
  }

  public toString(): string {
    return this.value.toFixed(6);
  }
}
