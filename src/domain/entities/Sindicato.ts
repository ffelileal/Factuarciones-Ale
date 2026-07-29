import { Percentage } from '../value-objects/Percentage';

export class SindicatoVersion {
  public readonly id: string;
  public readonly sindicatoId: string;
  public readonly version: number;
  public readonly validFrom: Date;
  public readonly validTo: Date;
  public readonly nombre: string;
  public readonly porcentajeAporte: Percentage;
  public readonly porcentajeContribucion: Percentage;
  public readonly cbu: string | null;
  public readonly alias: string | null;
  public readonly estado: string;
  public readonly updatedBy: string;

  public constructor(data: Omit<SindicatoVersion, 'id' | 'isVigente'>, id?: string) {
    this.id = id || Math.random().toString(36).substring(7);
    this.sindicatoId = data.sindicatoId;
    this.version = data.version;
    this.validFrom = data.validFrom;
    this.validTo = data.validTo;
    this.nombre = data.nombre;
    this.porcentajeAporte = data.porcentajeAporte;
    this.porcentajeContribucion = data.porcentajeContribucion;
    this.cbu = data.cbu;
    this.alias = data.alias;
    this.estado = data.estado;
    this.updatedBy = data.updatedBy;
  }

  public isVigente(date: Date): boolean {
    return date >= this.validFrom && date <= this.validTo;
  }
}

export class Sindicato {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly codigo: string;
  private versiones: SindicatoVersion[] = [];

  public constructor(id: string, tenantId: string, codigo: string, versiones: SindicatoVersion[]) {
    this.id = id;
    this.tenantId = tenantId;
    this.codigo = codigo;
    this.versiones = versiones.sort((a, b) => b.version - a.version);
  }

  public getVersiones(): SindicatoVersion[] {
    return [...this.versiones];
  }

  public getVersionVigente(date: Date): SindicatoVersion {
    const vigente = this.versiones.find(v => v.isVigente(date));
    if (!vigente) {
      throw new Error(`No se encontró una versión vigente del sindicato para la fecha: ${date.toISOString()}`);
    }
    return vigente;
  }
}
