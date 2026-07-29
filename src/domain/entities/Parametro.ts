import { Decimal } from 'decimal.js';

export class ParametroVersion {
  public readonly id: string;
  public readonly parametroId: string;
  public readonly version: number;
  public readonly validFrom: Date;
  public readonly validTo: Date;
  public readonly valor: Decimal;
  public readonly descripcion: string | null;
  public readonly updatedBy: string;

  public constructor(data: Omit<ParametroVersion, 'id' | 'isVigente'>, id?: string) {
    this.id = id || Math.random().toString(36).substring(7);
    this.parametroId = data.parametroId;
    this.version = data.version;
    this.validFrom = data.validFrom;
    this.validTo = data.validTo;
    this.valor = data.valor;
    this.descripcion = data.descripcion;
    this.updatedBy = data.updatedBy;

    if (this.validFrom >= this.validTo) {
      throw new Error("validFrom debe ser anterior a validTo en la versión del parámetro.");
    }
  }

  public isVigente(date: Date): boolean {
    return date >= this.validFrom && date <= this.validTo;
  }
}

export class Parametro {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly clave: string;
  private versiones: ParametroVersion[] = [];

  public constructor(id: string, tenantId: string, clave: string, versiones: ParametroVersion[]) {
    this.id = id;
    this.tenantId = tenantId;
    this.clave = clave;
    this.versiones = versiones.sort((a, b) => b.version - a.version);
  }

  public getVersiones(): ParametroVersion[] {
    return [...this.versiones];
  }

  public getVersionVigente(date: Date): ParametroVersion {
    const vigente = this.versiones.find(v => v.isVigente(date));
    if (!vigente) {
      throw new Error(`No se encontró una versión vigente del parámetro '${this.clave}' para la fecha: ${date.toISOString()}`);
    }
    return vigente;
  }
}
