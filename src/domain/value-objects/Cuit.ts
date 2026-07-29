export class Cuit {
  private readonly value: string;

  private constructor(val: string) {
    this.value = val;
  }

  public static create(val: string): Cuit {
    if (!val) {
      throw new Error("El CUIT no puede estar vacío.");
    }
    const clean = val.replace(/[-_]/g, "");
    if (clean.length !== 11 || !/^\d+$/.test(clean)) {
      throw new Error("El CUIT debe contener exactamente 11 dígitos numéricos.");
    }

    if (!this.isValidCuit(clean)) {
      throw new Error(`El CUIT '${val}' no es válido según el algoritmo verificador.`);
    }

    return new Cuit(clean);
  }

  private static isValidCuit(cuit: string): boolean {
    const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cuit[i], 10) * multipliers[i];
    }
    const remainder = sum % 11;
    let checkDigit = 11 - remainder;
    if (checkDigit === 11) {
      checkDigit = 0;
    } else if (checkDigit === 10) {
      checkDigit = 9;
    }
    return checkDigit === parseInt(cuit[10], 10);
  }

  public getValue(): string {
    return this.value;
  }

  public getFormatted(): string {
    return `${this.value.substring(0, 2)}-${this.value.substring(2, 10)}-${this.value.substring(10)}`;
  }

  public equals(other: Cuit): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
