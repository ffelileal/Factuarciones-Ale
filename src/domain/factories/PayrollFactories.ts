import { Empleado, EmpleadoVersion } from '../entities/Empleado';
import { Cliente, ClienteVersion } from '../entities/Cliente';
import { Liquidacion, ReciboSueldo, ReciboDetalle } from '../entities/Liquidacion';
import { Cuit } from '../value-objects/Cuit';
import { Cuil } from '../value-objects/Cuil';
import { Periodo } from '../value-objects/Periodo';
import { Money } from '../value-objects/Money';
import { Decimal } from 'decimal.js';

export class PayrollFactories {
  public static createEmpresa(
    tenantId: string,
    cuitVal: string,
    razonSocial: string,
    inicioActividades: Date,
    tipoSocietario: string,
    condicionIva: string,
    actividadPrincipal: string,
    codigoAfip: string,
    legalAddress: string,
    fiscalAddress: string,
    provincia: string,
    localidad: string,
    codigoPostal: string,
    email: string
  ): Cliente {
    const id = Math.random().toString(36).substring(7);
    const cuit = Cuit.create(cuitVal);
    const validFrom = new Date();
    const validTo = new Date('9999-12-31T23:59:59.999Z');
    
    return Cliente.create(id, tenantId, cuit, {
      validFrom,
      validTo,
      razonSocial,
      nombreFantasia: null,
      inicioActividades,
      actividadesSecundarias: null,
      jurisdiccion: provincia,
      ingresosBrutos: "",
      art: "",
      cuentaBancaria: null,
      cbu: null,
      alias: null,
      tipoSocietario,
      condicionIva,
      actividadPrincipal,
      codigoAfip,
      legalAddress,
      fiscalAddress,
      provincia,
      localidad,
      codigoPostal,
      email,
      telefono: null,
      estado: 'ACTIVO',
      updatedBy: id
    });
  }

  public static createEmpleado(
    tenantId: string,
    clienteId: string,
    cuilVal: string,
    dni: string,
    legajo: string,
    apellido: string,
    nombre: string,
    sexo: string,
    fechaNacimiento: Date,
    estadoCivil: string,
    nacionalidad: string,
    direccion: string,
    provincia: string,
    localidad: string,
    codigoPostal: string,
    email: string,
    fechaIngreso: Date,
    tipoContrato: string,
    modalidad: string,
    sucursalId: string,
    convenioVersionId: string,
    categoriaId: string,
    obraSocialVersionId: string,
    jornada: string,
    formaPago: string,
    afipCondicion: string,
    afipSituacionRevista: string,
    afipCodigoModalidad: string,
    afipCodigoActividad: string,
    afipCodigoPuesto: string
  ): Empleado {
    const id = Math.random().toString(36).substring(7);
    const cuil = Cuil.create(cuilVal);
    const validFrom = new Date();
    const validTo = new Date('9999-12-31T23:59:59.999Z');

    return Empleado.create(id, tenantId, clienteId, cuil, dni, {
      validFrom,
      validTo,
      legajo,
      apellido,
      nombre,
      sexo,
      fechaNacimiento,
      estadoCivil,
      nacionalidad,
      direccion,
      provincia,
      localidad,
      codigoPostal,
      email,
      telefono: null,
      contactoEmergencia: null,
      grupoSanguineo: null,
      nivelEducativo: null,
      profesion: null,
      discapacidad: false,
      licenciaConducir: null,
      fotoUrl: null,
      firmaUrl: null,
      fechaIngreso,
      fechaEgreso: null,
      motivoBaja: null,
      tipoContrato,
      modalidad,
      sucursalId,
      convenioVersionId,
      categoriaId,
      centroCosto: null,
      jornada,
      horasSemanales: new Decimal(44),
      obraSocialVersionId,
      sindicatoVersionId: null,
      banco: null,
      cbu: null,
      alias: null,
      formaPago,
      estado: 'ACTIVO',
      seguroVida: false,
      seguroRetiro: false,
      uniformesEntregados: null,
      eppEntregados: null,
      cursosCapacitaciones: null,
      examenesPreocupacionales: null,
      afipEstado: 'ACTIVO',
      afipAltaTemprana: true,
      afipBaja: false,
      afipCondicion,
      afipSituacionRevista,
      afipCodigoModalidad,
      afipCodigoActividad,
      afipCodigoPuesto,
      updatedBy: id
    });
  }

  public static createLiquidacion(
    tenantId: string,
    clienteId: string,
    periodoVal: string,
    quincena: number,
    tipo: string,
    userId: string
  ): Liquidacion {
    const id = Math.random().toString(36).substring(7);
    const periodo = Periodo.create(periodoVal);
    return Liquidacion.create(id, tenantId, clienteId, periodo, quincena, tipo, userId);
  }

  public static createRecibo(
    liquidacionId: string,
    empleadoId: string,
    empleadoVersionId: string,
    clienteId: string,
    clienteVersionId: string,
    convenioVersionId: string,
    escalaId: string,
    categoriaId: string,
    rectificaReciboId: string | null,
    cuil: string,
    cuit: string,
    periodo: string,
    quincena: number,
    basicoAplicado: Money,
    antiguedadAnos: number,
    totalRemunerativo: Money,
    totalNoRemunerativo: Money,
    totalDescuentos: Money,
    totalNeto: Money,
    costoLaboralTotal: Money,
    totalContribuciones: Money,
    detalles: ReciboDetalle[],
    fechaPago: Date
  ): ReciboSueldo {
    const id = Math.random().toString(36).substring(7);
    const uniqueCode = Math.random().toString(36).substring(2) + "-" + Date.now();
    const hashSha256 = "HASH-" + uniqueCode; // Mock hash generator representation
    
    return new ReciboSueldo({
      empleadoId,
      empleadoVersionId,
      clienteId,
      clienteVersionId,
      convenioVersionId,
      escalaId,
      categoriaId,
      rectificaReciboId,
      cuil,
      cuit,
      periodo,
      quincena,
      basicoAplicado,
      antiguedadAnos,
      totalRemunerativo,
      totalNoRemunerativo,
      totalDescuentos,
      totalNeto,
      costoLaboralTotal,
      totalContribuciones,
      uniqueCode,
      hashSha256,
      reciboVersion: 1,
      firmaDigital: null,
      xmlData: null,
      fechaImpresion: null,
      cantidadImpresiones: 0,
      estado: 'EMITIDO',
      fechaPago,
      bancoPago: null,
      cbuPago: null,
      pdfUrl: null,
      detalles
    }, id);
  }
}
