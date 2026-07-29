export class NumeroLegajo {
  private readonly value: string;

  private constructor(val: string) {
    this.value = val.trim();
  }

  public static create(val: string): NumeroLegajo {
    if (!val) {
      throw new Error("El número de legajo no puede estar vacío.");
    }
    const clean = val.trim();
    if (clean.length < 1 || clean.length > 50) {
      throw new Error("El número de legajo debe tener entre 1 y 50 caracteres.");
    }
    return new NumeroLegajo(clean);
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: NumeroLegajo): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
