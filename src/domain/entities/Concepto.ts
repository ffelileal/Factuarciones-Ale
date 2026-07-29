export class ConceptoVersion {
  public readonly id: string;
  public readonly conceptoId: string;
  public readonly version: number;
  public readonly validFrom: Date;
  public readonly validTo: Date;
  public readonly nombre: string;
  public readonly tipo: 'REMUNERATIVO' | 'NO_REMUNERATIVO' | 'DESCUENTO' | 'APORTE_PATRONAL' | 'CONTRIBUCION';
  public readonly formula: string;
  public readonly ordenImpresion: number;
  public readonly activo: boolean;
  public readonly codigoAfip: string | null;
  public readonly updatedBy: string;

  public constructor(data: Omit<ConceptoVersion, 'id' | 'isVigente'>, id?: string) {
    this.id = id || Math.random().toString(36).substring(7);
    this.conceptoId = data.conceptoId;
    this.version = data.version;
    this.validFrom = data.validFrom;
    this.validTo = data.validTo;
    this.nombre = data.nombre;
    this.tipo = data.tipo;
    this.formula = data.formula;
    this.ordenImpresion = data.ordenImpresion;
    this.activo = data.activo;
    this.codigoAfip = data.codigoAfip;
    this.updatedBy = data.updatedBy;

    if (this.validFrom >= this.validTo) {
      throw new Error("validFrom debe ser anterior a validTo en la versión de concepto.");
    }
  }

  public isVigente(date: Date): boolean {
    return date >= this.validFrom && date <= this.validTo;
  }
}

export class Concepto {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly codigo: string;
  private versiones: ConceptoVersion[] = [];

  public constructor(id: string, tenantId: string, codigo: string, versiones: ConceptoVersion[]) {
    this.id = id;
    this.tenantId = tenantId;
    this.codigo = codigo;
    this.versiones = versiones.sort((a, b) => b.version - a.version);
  }

  public getVersiones(): ConceptoVersion[] {
    return [...this.versiones];
  }

  public getVersionVigente(date: Date): ConceptoVersion {
    const vigente = this.versiones.find(v => v.isVigente(date));
    if (!vigente) {
      throw new Error(`No se encontró una versión vigente del concepto '${this.codigo}' para la fecha: ${date.toISOString()}`);
    }
    return vigente;
  }
}
