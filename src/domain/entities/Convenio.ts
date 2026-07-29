import { Money } from '../value-objects/Money';
import { Percentage } from '../value-objects/Percentage';

export class Categoria {
  public readonly id: string;
  public readonly escalaId: string;
  public readonly nombre: string;
  public readonly codigo: string;
  public readonly valorHora: Money;
  public readonly valorMensual: Money;
  public readonly valorJornada: Money;

  public constructor(
    id: string,
    escalaId: string,
    nombre: string,
    codigo: string,
    valorHora: Money,
    valorMensual: Money,
    valorJornada: Money
  ) {
    this.id = id;
    this.escalaId = escalaId;
    this.nombre = nombre;
    this.codigo = codigo;
    this.valorHora = valorHora;
    this.valorMensual = valorMensual;
    this.valorJornada = valorJornada;
  }
}

export class EscalaSalarial {
  public readonly id: string;
  public readonly convenioId: string;
  public readonly periodo: string;
  public readonly fechaDesde: Date;
  public readonly fechaHasta: Date;
  public readonly resolucion: string | null;
  public readonly pdfOficial: string | null;
  public readonly observaciones: string | null;
  public readonly version: number;
  private categorias: Categoria[] = [];

  public constructor(
    id: string,
    convenioId: string,
    periodo: string,
    fechaDesde: Date,
    fechaHasta: Date,
    resolucion: string | null,
    pdfOficial: string | null,
    observaciones: string | null,
    version: number,
    categorias: Categoria[]
  ) {
    this.id = id;
    this.convenioId = convenioId;
    this.periodo = periodo;
    this.fechaDesde = fechaDesde;
    this.fechaHasta = fechaHasta;
    this.resolucion = resolucion;
    this.pdfOficial = pdfOficial;
    this.observaciones = observaciones;
    this.version = version;
    this.categorias = categorias;
  }

  public getCategorias(): Categoria[] {
    return [...this.categorias];
  }
}

export class ConvenioVersion {
  public readonly id: string;
  public readonly convenioId: string;
  public readonly version: number;
  public readonly validFrom: Date;
  public readonly validTo: Date;
  public readonly nombre: string;
  public readonly descripcion: string | null;
  public readonly sindicatoId: string;
  public readonly tipoLiquidacion: 'MENSUAL' | 'QUINCENAL' | 'JORNAL' | 'HORA';
  public readonly antiguedadPorc: Percentage;
  public readonly estado: string;
  public readonly updatedBy: string;

  public constructor(data: Omit<ConvenioVersion, 'id' | 'isVigente'>, id?: string) {
    this.id = id || Math.random().toString(36).substring(7);
    this.convenioId = data.convenioId;
    this.version = data.version;
    this.validFrom = data.validFrom;
    this.validTo = data.validTo;
    this.nombre = data.nombre;
    this.descripcion = data.descripcion;
    this.sindicatoId = data.sindicatoId;
    this.tipoLiquidacion = data.tipoLiquidacion;
    this.antiguedadPorc = data.antiguedadPorc;
    this.estado = data.estado;
    this.updatedBy = data.updatedBy;
  }

  public isVigente(date: Date): boolean {
    return date >= this.validFrom && date <= this.validTo;
  }
}

export class Convenio {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly numero: string;
  private versiones: ConvenioVersion[] = [];
  private escalas: EscalaSalarial[] = [];

  public constructor(
    id: string,
    tenantId: string,
    numero: string,
    versiones: ConvenioVersion[],
    escalas: EscalaSalarial[]
  ) {
    this.id = id;
    this.tenantId = tenantId;
    this.numero = numero;
    this.versiones = versiones.sort((a, b) => b.version - a.version);
    this.escalas = escalas;
  }

  public getVersiones(): ConvenioVersion[] { return [...this.versiones]; }
  public getEscalas(): EscalaSalarial[] { return [...this.escalas]; }

  public getVersionVigente(date: Date): ConvenioVersion {
    const vigente = this.versiones.find(v => v.isVigente(date));
    if (!vigente) {
      throw new Error(`No se encontró una versión vigente del convenio para la fecha: ${date.toISOString()}`);
    }
    return vigente;
  }

  public getEscalaPeriodo(periodo: string): EscalaSalarial | null {
    return this.escalas.find(e => e.periodo === periodo) || null;
  }
}
