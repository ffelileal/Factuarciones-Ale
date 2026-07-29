import { Percentage } from '../value-objects/Percentage';

export class ObraSocialVersion {
  public readonly id: string;
  public readonly obraSocialId: string;
  public readonly version: number;
  public readonly validFrom: Date;
  public readonly validTo: Date;
  public readonly nombre: string;
  public readonly porcentajeAporte: Percentage;
  public readonly porcentajeContribucion: Percentage;
  public readonly estado: string;
  public readonly updatedBy: string;

  public constructor(data: Omit<ObraSocialVersion, 'id' | 'isVigente'>, id?: string) {
    this.id = id || Math.random().toString(36).substring(7);
    this.obraSocialId = data.obraSocialId;
    this.version = data.version;
    this.validFrom = data.validFrom;
    this.validTo = data.validTo;
    this.nombre = data.nombre;
    this.porcentajeAporte = data.porcentajeAporte;
    this.porcentajeContribucion = data.porcentajeContribucion;
    this.estado = data.estado;
    this.updatedBy = data.updatedBy;
  }

  public isVigente(date: Date): boolean {
    return date >= this.validFrom && date <= this.validTo;
  }
}

export class ObraSocial {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly codigo: string;
  private versiones: ObraSocialVersion[] = [];

  public constructor(id: string, tenantId: string, codigo: string, versiones: ObraSocialVersion[]) {
    this.id = id;
    this.tenantId = tenantId;
    this.codigo = codigo;
    this.versiones = versiones.sort((a, b) => b.version - a.version);
  }

  public getVersiones(): ObraSocialVersion[] {
    return [...this.versiones];
  }

  public getVersionVigente(date: Date): ObraSocialVersion {
    const vigente = this.versiones.find(v => v.isVigente(date));
    if (!vigente) {
      throw new Error(`No se encontró una versión vigente de la obra social para la fecha: ${date.toISOString()}`);
    }
    return vigente;
  }
}
