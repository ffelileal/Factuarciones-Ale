import { AggregateRoot } from './AggregateRoot';
import { Cuit } from '../value-objects/Cuit';

export class ClienteVersion {
  public readonly id: string;
  public readonly version: number;
  public readonly validFrom: Date;
  public readonly validTo: Date;
  public readonly razonSocial: string;
  public readonly nombreFantasia: string | null;
  public readonly inicioActividades: Date;
  public readonly actividadesSecundarias: string | null;
  public readonly jurisdiccion: string;
  public readonly ingresosBrutos: string;
  public readonly art: string;
  public readonly cuentaBancaria: string | null;
  public readonly cbu: string | null;
  public readonly alias: string | null;
  public readonly tipoSocietario: string;
  public readonly condicionIva: string;
  public readonly actividadPrincipal: string;
  public readonly codigoAfip: string;
  public readonly legalAddress: string;
  public readonly fiscalAddress: string;
  public readonly provincia: string;
  public readonly localidad: string;
  public readonly codigoPostal: string;
  public readonly email: string;
  public readonly telefono: string | null;
  public readonly estado: string;
  public readonly updatedBy: string;
  public readonly tipoCliente: string;
  public readonly primerLegajo: number;
  public readonly digitosLegajo: number;

  public constructor(
    data: Omit<ClienteVersion, 'id' | 'isVigente' | 'tipoCliente' | 'primerLegajo' | 'digitosLegajo'> & {
      tipoCliente?: string;
      primerLegajo?: number;
      digitosLegajo?: number;
    },
    id?: string
  ) {
    this.id = id || Math.random().toString(36).substring(7);
    this.version = data.version;
    this.validFrom = data.validFrom;
    this.validTo = data.validTo;
    this.razonSocial = data.razonSocial;
    this.nombreFantasia = data.nombreFantasia;
    this.inicioActividades = data.inicioActividades;
    this.actividadesSecundarias = data.actividadesSecundarias;
    this.jurisdiccion = data.jurisdiccion;
    this.ingresosBrutos = data.ingresosBrutos;
    this.art = data.art;
    this.cuentaBancaria = data.cuentaBancaria;
    this.cbu = data.cbu;
    this.alias = data.alias;
    this.tipoSocietario = data.tipoSocietario;
    this.condicionIva = data.condicionIva;
    this.actividadPrincipal = data.actividadPrincipal;
    this.codigoAfip = data.codigoAfip;
    this.legalAddress = data.legalAddress;
    this.fiscalAddress = data.fiscalAddress;
    this.provincia = data.provincia;
    this.localidad = data.localidad;
    this.codigoPostal = data.codigoPostal;
    this.email = data.email;
    this.telefono = data.telefono;
    this.estado = data.estado;
    this.updatedBy = data.updatedBy;
    this.tipoCliente = data.tipoCliente || "Empresa";
    this.primerLegajo = data.primerLegajo !== undefined ? data.primerLegajo : 1;
    this.digitosLegajo = data.digitosLegajo !== undefined ? data.digitosLegajo : 4;

    if (this.validFrom >= this.validTo) {
      throw new Error("La fecha desde (validFrom) debe ser anterior a la fecha hasta (validTo) en la versión de cliente.");
    }
  }

  public isVigente(date: Date): boolean {
    return date >= this.validFrom && date <= this.validTo;
  }
}

export class Sucursal {
  public readonly id: string;
  public readonly nombre: string;
  public readonly domicilio: string;
  public readonly telefono: string | null;
  public readonly responsable: string | null;
  public readonly fechaApertura: Date;

  public constructor(
    id: string,
    nombre: string,
    domicilio: string,
    telefono: string | null,
    responsable: string | null,
    fechaApertura: Date
  ) {
    if (!nombre.trim()) throw new Error("El nombre de la sucursal es obligatorio.");
    this.id = id;
    this.nombre = nombre;
    this.domicilio = domicilio;
    this.telefono = telefono;
    this.responsable = responsable;
    this.fechaApertura = fechaApertura;
  }
}

export class DocumentoCliente {
  public readonly id: string;
  public readonly nombre: string;
  public readonly tipo: string; // AFIP_CONSTANCIA, CUIT_CONSTANCIA, ESTATUTO, etc.
  public readonly url: string;
  public readonly fileName: string;

  public constructor(id: string, nombre: string, tipo: string, url: string, fileName: string) {
    if (!nombre.trim()) throw new Error("El nombre del documento es obligatorio.");
    if (!url.trim()) throw new Error("La URL del documento es obligatoria.");
    this.id = id;
    this.nombre = nombre;
    this.tipo = tipo;
    this.url = url;
    this.fileName = fileName;
  }
}

export class Cliente extends AggregateRoot {
  public readonly id: string;
  public readonly tenantId: string;
  private cuit: Cuit;
  private versiones: ClienteVersion[] = [];
  private sucursales: Sucursal[] = [];
  private documentos: DocumentoCliente[] = [];

  private constructor(
    id: string,
    tenantId: string,
    cuit: Cuit,
    versiones: ClienteVersion[],
    sucursales: Sucursal[],
    documentos: DocumentoCliente[]
  ) {
    super();
    this.id = id;
    this.tenantId = tenantId;
    this.cuit = cuit;
    this.versiones = versiones.sort((a, b) => b.version - a.version); // De más reciente a más antigua
    this.sucursales = sucursales;
    this.documentos = documentos;
  }

  public static create(
    id: string,
    tenantId: string,
    cuit: Cuit,
    primerVersion: Omit<ClienteVersion, 'id' | 'version' | 'isVigente' | 'tipoCliente' | 'primerLegajo' | 'digitosLegajo'> & {
      tipoCliente?: string;
      primerLegajo?: number;
      digitosLegajo?: number;
    },
    sucursales?: Sucursal[],
    documentos?: DocumentoCliente[]
  ): Cliente {
    const versionInicial = new ClienteVersion({
      ...primerVersion,
      version: 1
    });
    return new Cliente(id, tenantId, cuit, [versionInicial], sucursales || [], documentos || []);
  }

  public static reconstitute(
    id: string,
    tenantId: string,
    cuit: Cuit,
    versiones: ClienteVersion[],
    sucursales: Sucursal[],
    documentos: DocumentoCliente[]
  ): Cliente {
    return new Cliente(id, tenantId, cuit, versiones, sucursales, documentos);
  }

  public getCuit(): Cuit {
    return this.cuit;
  }

  public getVersiones(): ClienteVersion[] {
    return [...this.versiones];
  }

  public getSucursales(): Sucursal[] {
    return [...this.sucursales];
  }

  public getDocumentos(): DocumentoCliente[] {
    return [...this.documentos];
  }

  public getVersionVigente(date: Date): ClienteVersion {
    const vigente = this.versiones.find(v => v.isVigente(date));
    if (!vigente) {
      throw new Error(`No se encontró una versión vigente de la cliente para la fecha: ${date.toISOString()}`);
    }
    return vigente;
  }

  public agregarNuevaVersion(nuevaData: Omit<ClienteVersion, 'id' | 'version' | 'isVigente'>): void {
    const ultimaVersion = this.versiones[0];
    const nuevaVersionNro = ultimaVersion ? ultimaVersion.version + 1 : 1;

    // Validar solapamiento temporal
    const versionNueva = new ClienteVersion({
      ...nuevaData,
      version: nuevaVersionNro
    });

    // Validaciones de intervalos
    for (const v of this.versiones) {
      if (
        (versionNueva.validFrom >= v.validFrom && versionNueva.validFrom <= v.validTo) ||
        (versionNueva.validTo >= v.validFrom && versionNueva.validTo <= v.validTo)
      ) {
        throw new Error(`La nueva versión se solapa con una versión existente (Versión ${v.version})`);
      }
    }

    this.versiones.unshift(versionNueva);
  }

  public agregarSucursal(suc: Sucursal): void {
    if (this.sucursales.some(s => s.id === suc.id)) {
      throw new Error("Ya existe una sucursal con ese ID en la cliente.");
    }
    this.sucursales.push(suc);
  }

  public agregarDocumento(doc: DocumentoCliente): void {
    if (this.documentos.some(d => d.id === doc.id)) {
      throw new Error("Ya existe un documento con ese ID en la cliente.");
    }
    this.documentos.push(doc);
  }
}
