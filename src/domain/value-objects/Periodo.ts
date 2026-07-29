export class Periodo {
  private readonly value: string; // YYYY-MM

  private constructor(val: string) {
    this.value = val;
  }

  public static create(val: string): Periodo {
    if (!val) {
      throw new Error("El periodo no puede estar vacío.");
    }
    const clean = val.trim();
    const regex = /^\d{4}-(0[1-9]|1[0-2])$/;
    if (!regex.test(clean)) {
      throw new Error(`Formato de periodo inválido: '${val}'. Debe ser YYYY-MM (ej. 2026-07)`);
    }
    return new Periodo(clean);
  }

  public getValue(): string {
    return this.value;
  }

  public getYear(): number {
    return parseInt(this.value.split("-")[0], 10);
  }

  public getMonth(): number {
    return parseInt(this.value.split("-")[1], 10);
  }

  public getPreviousPeriod(): Periodo {
    let year = this.getYear();
    let month = this.getMonth() - 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
    const monthStr = month < 10 ? `0${month}` : `${month}`;
    return new Periodo(`${year}-${monthStr}`);
  }

  public getNextPeriod(): Periodo {
    let year = this.getYear();
    let month = this.getMonth() + 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
    const monthStr = month < 10 ? `0${month}` : `${month}`;
    return new Periodo(`${year}-${monthStr}`);
  }

  public isBefore(other: Periodo): boolean {
    return this.value < other.value;
  }

  public isAfter(other: Periodo): boolean {
    return this.value > other.value;
  }

  public equals(other: Periodo): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
