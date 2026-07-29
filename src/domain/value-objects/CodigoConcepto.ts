export class CodigoConcepto {
  private readonly value: string;

  private constructor(val: string) {
    this.value = val.trim();
  }

  public static create(val: string): CodigoConcepto {
    if (!val) {
      throw new Error("El código de concepto no puede estar vacío.");
    }
    const clean = val.trim();
    if (clean.length < 1 || clean.length > 20) {
      throw new Error("El código de concepto debe tener entre 1 y 20 caracteres.");
    }
    const regex = /^[A-Z0-9_-]+$/i;
    if (!regex.test(clean)) {
      throw new Error("El código de concepto solo puede contener caracteres alfanuméricos, guiones y guiones bajos.");
    }
    return new CodigoConcepto(clean.toUpperCase());
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: CodigoConcepto): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
