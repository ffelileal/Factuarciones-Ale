export class Email {
  private readonly value: string;

  private constructor(val: string) {
    this.value = val.toLowerCase().trim();
  }

  public static create(val: string): Email {
    if (!val) {
      throw new Error("El email no puede estar vacío.");
    }
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(val)) {
      throw new Error(`El formato del correo electrónico '${val}' es inválido.`);
    }
    return new Email(val);
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: Email): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
