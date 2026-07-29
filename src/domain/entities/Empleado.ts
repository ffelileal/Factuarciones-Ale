import { Decimal } from 'decimal.js';
import { AggregateRoot } from './AggregateRoot';
import { Cuil } from '../value-objects/Cuil';
import { Money } from '../value-objects/Money';
import { Percentage } from '../value-objects/Percentage';
import { Periodo } from '../value-objects/Periodo';

export class EmpleadoVersion {
  public readonly id: string;
  public readonly version: number;
  public readonly validFrom: Date;
  public readonly validTo: Date;
  public readonly legajo: string;
  public readonly apellido: string;
  public readonly nombre: string;
  public readonly sexo: string;
  public readonly fechaNacimiento: Date;
  public readonly estadoCivil: string;
  public readonly nacionalidad: string;
  public readonly direccion: string;
  public readonly provincia: string;
  public readonly localidad: string;
  public readonly codigoPostal: string;
  public readonly email: string;
  public readonly telefono: string | null;
  public readonly contactoEmergencia: string | null;
  public readonly grupoSanguineo: string | null;
  public readonly nivelEducativo: string | null;
  public readonly profesion: string | null;
  public readonly discapacidad: boolean;
  public readonly licenciaConducir: string | null;
  public readonly fotoUrl: string | null;
  public readonly firmaUrl: string | null;
  public readonly fechaIngreso: Date;
  public readonly fechaEgreso: Date | null;
  public readonly motivoBaja: string | null;
  public readonly tipoContrato: string;
  public readonly modalidad: string;
  public readonly sucursalId: string;
  public readonly convenioVersionId: string;
  public readonly categoriaId: string;
  public readonly centroCosto: string | null;
  public readonly jornada: string;
  public readonly horasSemanales: Decimal;
  public readonly obraSocialVersionId: string;
  public readonly sindicatoVersionId: string | null;
  public readonly banco: string | null;
  public readonly cbu: string | null;
  public readonly alias: string | null;
  public readonly formaPago: string;
  public readonly estado: string;
  public readonly seguroVida: boolean;
  public readonly seguroRetiro: boolean;
  public readonly uniformesEntregados: string | null;
  public readonly eppEntregados: string | null;
  public readonly cursosCapacitaciones: string | null;
  public readonly examenesPreocupacionales: string | null;
  public readonly afipEstado: string;
  public readonly afipAltaTemprana: boolean;
  public readonly afipBaja: boolean;
  public readonly afipCondicion: string;
  public readonly afipSituacionRevista: string;
  public readonly afipCodigoModalidad: string;
  public readonly afipCodigoActividad: string;
  public readonly afipCodigoPuesto: string;
  public readonly updatedBy: string;
  public readonly deletedAt: Date | null;
  public readonly deletedBy: string | null;

  public constructor(
    data: Omit<EmpleadoVersion, 'id' | 'isVigente' | 'deletedAt' | 'deletedBy'> & {
      deletedAt?: Date | null;
      deletedBy?: string | null;
    },
    id?: string
  ) {
    this.id = id || Math.random().toString(36).substring(7);
    this.version = data.version;
    this.validFrom = data.validFrom;
    this.validTo = data.validTo;
    this.legajo = data.legajo;
    this.apellido = data.apellido;
    this.nombre = data.nombre;
    this.sexo = data.sexo;
    this.fechaNacimiento = data.fechaNacimiento;
    this.estadoCivil = data.estadoCivil;
    this.nacionalidad = data.nacionalidad;
    this.direccion = data.direccion;
    this.provincia = data.provincia;
    this.localidad = data.localidad;
    this.codigoPostal = data.codigoPostal;
    this.email = data.email;
    this.telefono = data.telefono;
    this.contactoEmergencia = data.contactoEmergencia;
    this.grupoSanguineo = data.grupoSanguineo;
    this.nivelEducativo = data.nivelEducativo;
    this.profesion = data.profesion;
    this.discapacidad = data.discapacidad;
    this.licenciaConducir = data.licenciaConducir;
    this.fotoUrl = data.fotoUrl;
    this.firmaUrl = data.firmaUrl;
    this.fechaIngreso = data.fechaIngreso;
    this.fechaEgreso = data.fechaEgreso;
    this.motivoBaja = data.motivoBaja;
    this.tipoContrato = data.tipoContrato;
    this.modalidad = data.modalidad;
    this.sucursalId = data.sucursalId;
    this.convenioVersionId = data.convenioVersionId;
    this.categoriaId = data.categoriaId;
    this.centroCosto = data.centroCosto;
    this.jornada = data.jornada;
    this.horasSemanales = data.horasSemanales;
    this.obraSocialVersionId = data.obraSocialVersionId;
    this.sindicatoVersionId = data.sindicatoVersionId;
    this.banco = data.banco;
    this.cbu = data.cbu;
    this.alias = data.alias;
    this.formaPago = data.formaPago;
    this.estado = data.estado;
    this.seguroVida = data.seguroVida;
    this.seguroRetiro = data.seguroRetiro;
    this.uniformesEntregados = data.uniformesEntregados;
    this.eppEntregados = data.eppEntregados;
    this.cursosCapacitaciones = data.cursosCapacitaciones;
    this.examenesPreocupacionales = data.examenesPreocupacionales;
    this.afipEstado = data.afipEstado;
    this.afipAltaTemprana = data.afipAltaTemprana;
    this.afipBaja = data.afipBaja;
    this.afipCondicion = data.afipCondicion;
    this.afipSituacionRevista = data.afipSituacionRevista;
    this.afipCodigoModalidad = data.afipCodigoModalidad;
    this.afipCodigoActividad = data.afipCodigoActividad;
    this.afipCodigoPuesto = data.afipCodigoPuesto;
    this.updatedBy = data.updatedBy;
    this.deletedAt = data.deletedAt || null;
    this.deletedBy = data.deletedBy || null;

    if (this.validFrom >= this.validTo) {
      throw new Error("validFrom debe ser anterior a validTo en la versión del empleado.");
    }
  }

  public isVigente(date: Date): boolean {
    return date >= this.validFrom && date <= this.validTo;
  }
}

export class Embargo {
  public readonly id: string;
  public readonly juzgado: string;
  public readonly expediente: string;
  public readonly tipo: 'FIJO' | 'PORCENTAJE';
  public readonly montoFijo: Money;
  public readonly porcentaje: Percentage;
  public readonly prioridad: number;
  public readonly fechaInicio: Date;
  public readonly fechaFin: Date | null;
  private estado: 'ACTIVO' | 'INACTIVO' | 'SALDADO';
  public readonly observaciones: string | null;

  public constructor(
    id: string,
    juzgado: string,
    expediente: string,
    tipo: 'FIJO' | 'PORCENTAJE',
    montoFijo: Money,
    porcentaje: Percentage,
    prioridad: number,
    fechaInicio: Date,
    fechaFin: Date | null,
    estado: 'ACTIVO' | 'INACTIVO' | 'SALDADO',
    observaciones: string | null
  ) {
    if (!juzgado.trim()) throw new Error("El juzgado es obligatorio.");
    if (!expediente.trim()) throw new Error("El expediente es obligatorio.");
    this.id = id;
    this.juzgado = juzgado;
    this.expediente = expediente;
    this.tipo = tipo;
    this.montoFijo = montoFijo;
    this.porcentaje = porcentaje;
    this.prioridad = prioridad;
    this.fechaInicio = fechaInicio;
    this.fechaFin = fechaFin;
    this.estado = estado;
    this.observaciones = observaciones;
  }

  public getEstado(): string {
    return this.estado;
  }

  public saldar(): void {
    this.estado = 'SALDADO';
  }

  public inactivar(): void {
    this.estado = 'INACTIVO';
  }
}

export class Vacacion {
  public readonly id: string;
  public readonly periodo: string;
  public readonly diasDisponibles: number;
  private diasGozados: number;
  private saldo: number;
  public readonly fechaInicio: Date | null;
  public readonly fechaFin: Date | null;
  public readonly pagoAnticipado: boolean;
  private estado: 'PENDIENTE' | 'GOZADA' | 'CANCELADA';

  public constructor(
    id: string,
    periodo: string,
    diasDisponibles: number,
    diasGozados: number,
    saldo: number,
    fechaInicio: Date | null,
    fechaFin: Date | null,
    pagoAnticipado: boolean,
    estado: 'PENDIENTE' | 'GOZADA' | 'CANCELADA'
  ) {
    this.id = id;
    this.periodo = periodo;
    this.diasDisponibles = diasDisponibles;
    this.diasGozados = diasGozados;
    this.saldo = saldo;
    this.fechaInicio = fechaInicio;
    this.fechaFin = fechaFin;
    this.pagoAnticipado = pagoAnticipado;
    this.estado = estado;
  }

  public getEstado(): string { return this.estado; }
  public getDiasGozados(): number { return this.diasGozados; }
  public getSaldo(): number { return this.saldo; }

  public gozar(dias: number): void {
    if (dias > this.saldo) {
      throw new Error(`No se pueden gozar ${dias} días. El saldo disponible es de ${this.saldo} días.`);
    }
    this.diasGozados += dias;
    this.saldo -= dias;
    if (this.saldo === 0) {
      this.estado = 'GOZADA';
    }
  }

  public cancelar(): void {
    this.estado = 'CANCELADA';
  }
}

export class NovedadMensual {
  public readonly id: string;
  public readonly periodo: Periodo;
  public readonly quincena: number;
  public readonly horasNormales: Decimal;
  public readonly horasExtras50: Decimal;
  public readonly horasExtras100: Decimal;
  public readonly feriadosTrabajados: Decimal;
  public readonly horasNocturnas: Decimal;
  public readonly ausencias: number;
  public readonly llegadasTarde: number;
  public readonly diasLicencia: number;
  public readonly diasVacaciones: number;
  public readonly adelantos: Money;
  public readonly bonos: Money;
  public readonly premios: Money;
  public readonly comisiones: Money;
  public readonly viaticos: Money;
  public readonly sancionesDescuento: Money;
  public readonly otrosDescuentos: Money;
  public readonly conceptosNoRem: Money;
  public readonly observaciones: string | null;

  public constructor(data: Omit<NovedadMensual, 'id'>, id?: string) {
    this.id = id || Math.random().toString(36).substring(7);
    this.periodo = data.periodo;
    this.quincena = data.quincena;
    this.horasNormales = data.horasNormales;
    this.horasExtras50 = data.horasExtras50;
    this.horasExtras100 = data.horasExtras100;
    this.feriadosTrabajados = data.feriadosTrabajados;
    this.horasNocturnas = data.horasNocturnas;
    this.ausencias = data.ausencias;
    this.llegadasTarde = data.llegadasTarde;
    this.diasLicencia = data.diasLicencia;
    this.diasVacaciones = data.diasVacaciones;
    this.adelantos = data.adelantos;
    this.bonos = data.bonos;
    this.premios = data.premios;
    this.comisiones = data.comisiones;
    this.viaticos = data.viaticos;
    this.sancionesDescuento = data.sancionesDescuento;
    this.otrosDescuentos = data.otrosDescuentos;
    this.conceptosNoRem = data.conceptosNoRem;
    this.observaciones = data.observaciones;

    if (this.quincena < 0 || this.quincena > 2) {
      throw new Error("La quincena debe ser 0 (Mensual completo), 1 (Primera quincena) o 2 (Segunda quincena).");
    }
  }
}

export class Empleado extends AggregateRoot {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly clienteId: string;
  private cuil: Cuil;
  private dni: string;
  private versiones: EmpleadoVersion[] = [];
  private embargos: Embargo[] = [];
  private vacaciones: Vacacion[] = [];
  private novedades: NovedadMensual[] = [];
  public readonly deletedAt: Date | null;
  public readonly deletedBy: string | null;

  private constructor(
    id: string,
    tenantId: string,
    clienteId: string,
    cuil: Cuil,
    dni: string,
    versiones: EmpleadoVersion[],
    embargos: Embargo[],
    vacaciones: Vacacion[],
    novedades: NovedadMensual[],
    deletedAt?: Date | null,
    deletedBy?: string | null
  ) {
    super();
    this.id = id;
    this.tenantId = tenantId;
    this.clienteId = clienteId;
    this.cuil = cuil;
    this.dni = dni;
    this.versiones = versiones.sort((a, b) => b.version - a.version);
    this.embargos = embargos;
    this.vacaciones = vacaciones;
    this.novedades = novedades;
    this.deletedAt = deletedAt || null;
    this.deletedBy = deletedBy || null;
  }

  public static create(
    id: string,
    tenantId: string,
    clienteId: string,
    cuil: Cuil,
    dni: string,
    primerVersion: Omit<EmpleadoVersion, 'id' | 'version' | 'isVigente' | 'deletedAt' | 'deletedBy'> & {
      deletedAt?: Date | null;
      deletedBy?: string | null;
    },
    embargos?: Embargo[],
    vacaciones?: Vacacion[],
    novedades?: NovedadMensual[]
  ): Empleado {
    const versionInicial = new EmpleadoVersion({
      ...primerVersion,
      version: 1
    });
    return new Empleado(
      id,
      tenantId,
      clienteId,
      cuil,
      dni,
      [versionInicial],
      embargos || [],
      vacaciones || [],
      novedades || [],
      primerVersion.deletedAt,
      primerVersion.deletedBy
    );
  }

  public static reconstitute(
    id: string,
    tenantId: string,
    clienteId: string,
    cuil: Cuil,
    dni: string,
    versiones: EmpleadoVersion[],
    embargos: Embargo[],
    vacaciones: Vacacion[],
    novedades: NovedadMensual[],
    deletedAt?: Date | null,
    deletedBy?: string | null
  ): Empleado {
    return new Empleado(id, tenantId, clienteId, cuil, dni, versiones, embargos, vacaciones, novedades, deletedAt, deletedBy);
  }

  public getCuil(): Cuil { return this.cuil; }
  public getDni(): string { return this.dni; }
  public getVersiones(): EmpleadoVersion[] { return [...this.versiones]; }
  public getEmbargos(): Embargo[] { return [...this.embargos]; }
  public getVacaciones(): Vacacion[] { return [...this.vacaciones]; }
  public getNovedades(): NovedadMensual[] { return [...this.novedades]; }

  public getVersionVigente(date: Date): EmpleadoVersion {
    const vigente = this.versiones.find(v => v.isVigente(date));
    if (!vigente) {
      throw new Error(`No se encontró una versión vigente de empleado para la fecha: ${date.toISOString()}`);
    }
    return vigente;
  }

  public agregarNuevaVersion(nuevaData: Omit<EmpleadoVersion, 'id' | 'version' | 'isVigente'>): void {
    const ultimaVersion = this.versiones[0];
    const nuevaVersionNro = ultimaVersion ? ultimaVersion.version + 1 : 1;

    const versionNueva = new EmpleadoVersion({
      ...nuevaData,
      version: nuevaVersionNro
    });

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

  public registrarEmbargo(embargo: Embargo): void {
    if (this.embargos.some(e => e.id === embargo.id)) {
      throw new Error("El embargo ya está registrado.");
    }
    this.embargos.push(embargo);
  }

  public registrarVacaciones(vac: Vacacion): void {
    if (this.vacaciones.some(v => v.periodo === vac.periodo && v.getEstado() !== 'CANCELADA')) {
      throw new Error(`Ya hay vacaciones cargadas para el periodo ${vac.periodo}.`);
    }
    this.vacaciones.push(vac);
  }

  public cargarNovedadMensual(nov: NovedadMensual): void {
    const index = this.novedades.findIndex(
      n => n.periodo.equals(nov.periodo) && n.quincena === nov.quincena
    );
    if (index !== -1) {
      // Reemplazar la novedad si ya existía para el periodo/quincena (Invariante del agregado)
      this.novedades[index] = nov;
    } else {
      this.novedades.push(nov);
    }
  }

  public getNovedad(periodo: Periodo, quincena: number): NovedadMensual | null {
    return this.novedades.find(n => n.periodo.equals(periodo) && n.quincena === quincena) || null;
  }
}
