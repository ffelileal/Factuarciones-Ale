import { prisma } from '../client';
import { IEmpleadoRepository } from '@/domain/repositories/IEmpleadoRepository';
import { Empleado, EmpleadoVersion, Embargo, Vacacion, NovedadMensual } from '@/domain/entities/Empleado';
import { Cuil } from '@/domain/value-objects/Cuil';
import { Money } from '@/domain/value-objects/Money';
import { Percentage } from '@/domain/value-objects/Percentage';
import { Periodo } from '@/domain/value-objects/Periodo';
import { Decimal } from 'decimal.js';

export class PrismaEmpleadoRepository implements IEmpleadoRepository {
  public constructor(private readonly db: any = prisma) {}
  public async findById(id: string, tenantId: string): Promise<Empleado | null> {
    const dbEmpleado = await this.db.empleado.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        versiones: true,
        embargos: { where: { deletedAt: null } },
        vacaciones: { where: { deletedAt: null } },
        novedades: true,
      },
    });
    if (!dbEmpleado) return null;
    return this.toDomain(dbEmpleado);
  }

  public async findByCuil(cuil: string, tenantId: string): Promise<Empleado | null> {
    const dbEmpleado = await this.db.empleado.findFirst({
      where: { cuil, tenantId, deletedAt: null },
      include: {
        versiones: true,
        embargos: { where: { deletedAt: null } },
        vacaciones: { where: { deletedAt: null } },
        novedades: true,
      },
    });
    if (!dbEmpleado) return null;
    return this.toDomain(dbEmpleado);
  }

  public async findByDni(dni: string, tenantId: string): Promise<Empleado | null> {
    const dbEmpleado = await this.db.empleado.findFirst({
      where: { dni, tenantId, deletedAt: null },
      include: {
        versiones: true,
        embargos: { where: { deletedAt: null } },
        vacaciones: { where: { deletedAt: null } },
        novedades: true,
      },
    });
    if (!dbEmpleado) return null;
    return this.toDomain(dbEmpleado);
  }

  public async findAllByEmpresa(clienteId: string, tenantId: string): Promise<Empleado[]> {
    const dbEmpleados = await this.db.empleado.findMany({
      where: { clienteId, tenantId, deletedAt: null },
      include: {
        versiones: true,
        embargos: { where: { deletedAt: null } },
        vacaciones: { where: { deletedAt: null } },
        novedades: true,
      },
    });
    return dbEmpleados.map((e: any) => this.toDomain(e));
  }

  public async findLastLegajo(clienteId: string, tenantId: string): Promise<string | null> {
    const versions = await this.db.empleadoVersion.findMany({
      where: { tenantId, clienteId },
      select: { legajo: true }
    });
    if (versions.length === 0) return null;
    let maxVal = -1;
    let maxStr = "";
    for (const v of versions) {
      const val = parseInt(v.legajo, 10);
      if (!isNaN(val) && val > maxVal) {
        maxVal = val;
        maxStr = v.legajo;
      }
    }
    return maxVal === -1 ? null : maxStr;
  }

  public async save(empleado: Empleado): Promise<void> {
    // 1. Save core Empleado
    await this.db.empleado.upsert({
      where: { id: empleado.id },
      update: {
        cuil: empleado.getCuil().getValue(),
        dni: empleado.getDni(),
        deletedAt: empleado.deletedAt,
        deletedBy: empleado.deletedBy,
      },
      create: {
        id: empleado.id,
        tenantId: empleado.tenantId,
        clienteId: empleado.clienteId,
        cuil: empleado.getCuil().getValue(),
        dni: empleado.getDni(),
        deletedAt: empleado.deletedAt,
        deletedBy: empleado.deletedBy,
      },
    });

    // 2. Save versions
    for (const v of empleado.getVersiones()) {
      await this.db.empleadoVersion.upsert({
        where: { id: v.id },
        update: {
          version: v.version,
          validFrom: v.validFrom,
          validTo: v.validTo,
          legajo: v.legajo,
          apellido: v.apellido,
          nombre: v.nombre,
          sexo: v.sexo,
          fechaNacimiento: v.fechaNacimiento,
          estadoCivil: v.estadoCivil,
          nacionalidad: v.nacionalidad,
          direccion: v.direccion,
          provincia: v.provincia,
          localidad: v.localidad,
          codigoPostal: v.codigoPostal,
          email: v.email,
          telefono: v.telefono,
          contactoEmergencia: v.contactoEmergencia,
          grupoSanguineo: v.grupoSanguineo,
          nivelEducativo: v.nivelEducativo,
          profesion: v.profesion,
          discapacidad: v.discapacidad,
          licenciaConducir: v.licenciaConducir,
          fotoUrl: v.fotoUrl,
          firmaUrl: v.firmaUrl,
          fechaIngreso: v.fechaIngreso,
          fechaEgreso: v.fechaEgreso,
          motivoBaja: v.motivoBaja,
          tipoContrato: v.tipoContrato,
          modalidad: v.modalidad,
          sucursalId: v.sucursalId,
          convenioVersionId: v.convenioVersionId,
          categoriaId: v.categoriaId,
          centroCosto: v.centroCosto,
          jornada: v.jornada,
          horasSemanales: v.horasSemanales,
          obraSocialVersionId: v.obraSocialVersionId,
          sindicatoVersionId: v.sindicatoVersionId,
          banco: v.banco,
          cbu: v.cbu,
          alias: v.alias,
          formaPago: v.formaPago,
          estado: v.estado,
          seguroVida: v.seguroVida,
          seguroRetiro: v.seguroRetiro,
          uniformesEntregados: v.uniformesEntregados,
          eppEntregados: v.eppEntregados,
          cursosCapacitaciones: v.cursosCapacitaciones,
          examenesPreocupacionales: v.examenesPreocupacionales,
          afipEstado: v.afipEstado,
          afipAltaTemprana: v.afipAltaTemprana,
          afipBaja: v.afipBaja,
          afipCondicion: v.afipCondicion,
          afipSituacionRevista: v.afipSituacionRevista,
          afipCodigoModalidad: v.afipCodigoModalidad,
          afipCodigoActividad: v.afipCodigoActividad,
          afipCodigoPuesto: v.afipCodigoPuesto,
          deletedAt: v.deletedAt,
          deletedBy: v.deletedBy,
        },
        create: {
          id: v.id,
          tenantId: empleado.tenantId,
          empleadoId: empleado.id,
          version: v.version,
          validFrom: v.validFrom,
          validTo: v.validTo,
          legajo: v.legajo,
          apellido: v.apellido,
          nombre: v.nombre,
          sexo: v.sexo,
          fechaNacimiento: v.fechaNacimiento,
          estadoCivil: v.estadoCivil,
          nacionalidad: v.nacionalidad,
          direccion: v.direccion,
          provincia: v.provincia,
          localidad: v.localidad,
          codigoPostal: v.codigoPostal,
          email: v.email,
          telefono: v.telefono,
          contactoEmergencia: v.contactoEmergencia,
          grupoSanguineo: v.grupoSanguineo,
          nivelEducativo: v.nivelEducativo,
          profesion: v.profesion,
          discapacidad: v.discapacidad,
          licenciaConducir: v.licenciaConducir,
          fotoUrl: v.fotoUrl,
          firmaUrl: v.firmaUrl,
          fechaIngreso: v.fechaIngreso,
          fechaEgreso: v.fechaEgreso,
          motivoBaja: v.motivoBaja,
          tipoContrato: v.tipoContrato,
          modalidad: v.modalidad,
          sucursalId: v.sucursalId,
          convenioVersionId: v.convenioVersionId,
          categoriaId: v.categoriaId,
          centroCosto: v.centroCosto,
          jornada: v.jornada,
          horasSemanales: v.horasSemanales,
          obraSocialVersionId: v.obraSocialVersionId,
          sindicatoVersionId: v.sindicatoVersionId,
          banco: v.banco,
          cbu: v.cbu,
          alias: v.alias,
          formaPago: v.formaPago,
          estado: v.estado,
          seguroVida: v.seguroVida,
          seguroRetiro: v.seguroRetiro,
          uniformesEntregados: v.uniformesEntregados,
          eppEntregados: v.eppEntregados,
          cursosCapacitaciones: v.cursosCapacitaciones,
          examenesPreocupacionales: v.examenesPreocupacionales,
          afipEstado: v.afipEstado,
          afipAltaTemprana: v.afipAltaTemprana,
          afipBaja: v.afipBaja,
          afipCondicion: v.afipCondicion,
          afipSituacionRevista: v.afipSituacionRevista,
          afipCodigoModalidad: v.afipCodigoModalidad,
          afipCodigoActividad: v.afipCodigoActividad,
          afipCodigoPuesto: v.afipCodigoPuesto,
          updatedBy: v.updatedBy,
          deletedAt: v.deletedAt,
          deletedBy: v.deletedBy,
        },
      });
    }

    // 3. Save embargos
    for (const e of empleado.getEmbargos()) {
      await this.db.embargo.upsert({
        where: { id: e.id },
        update: {
          juzgado: e.juzgado,
          expediente: e.expediente,
          tipo: e.tipo,
          montoFijo: e.montoFijo.toDecimal(),
          porcentaje: e.porcentaje.toDecimal(),
          prioridad: e.prioridad,
          fechaInicio: e.fechaInicio,
          fechaFin: e.fechaFin,
          estado: e.getEstado(),
          observaciones: e.observaciones,
        },
        create: {
          id: e.id,
          tenantId: empleado.tenantId,
          empleadoId: empleado.id,
          juzgado: e.juzgado,
          expediente: e.expediente,
          tipo: e.tipo,
          montoFijo: e.montoFijo.toDecimal(),
          porcentaje: e.porcentaje.toDecimal(),
          prioridad: e.prioridad,
          fechaInicio: e.fechaInicio,
          fechaFin: e.fechaFin,
          estado: e.getEstado(),
          observaciones: e.observaciones,
        },
      });
    }

    // 4. Save vacaciones
    for (const va of empleado.getVacaciones()) {
      await this.db.vacacion.upsert({
        where: { id: va.id },
        update: {
          diasDisponibles: va.diasDisponibles,
          diasGozados: va.getDiasGozados(),
          saldo: va.getSaldo(),
          fechaInicio: va.fechaInicio,
          fechaFin: va.fechaFin,
          pagoAnticipado: va.pagoAnticipado,
          estado: va.getEstado(),
        },
        create: {
          id: va.id,
          tenantId: empleado.tenantId,
          empleadoId: empleado.id,
          periodo: va.periodo,
          diasDisponibles: va.diasDisponibles,
          diasGozados: va.getDiasGozados(),
          saldo: va.getSaldo(),
          fechaInicio: va.fechaInicio,
          fechaFin: va.fechaFin,
          pagoAnticipado: va.pagoAnticipado,
          estado: va.getEstado(),
        },
      });
    }

    // 5. Save novedades
    for (const n of empleado.getNovedades()) {
      await this.db.novedadMensual.upsert({
        where: { empleadoId_periodo_quincena: { empleadoId: empleado.id, periodo: n.periodo.getValue(), quincena: n.quincena } },
        update: {
          horasNormales: n.horasNormales,
          horasExtras50: n.horasExtras50,
          horasExtras100: n.horasExtras100,
          feriadosTrabajados: n.feriadosTrabajados,
          horasNocturnas: n.horasNocturnas,
          ausencias: n.ausencias,
          llegadasTarde: n.llegadasTarde,
          diasLicencia: n.diasLicencia,
          diasVacaciones: n.diasVacaciones,
          adelantos: n.adelantos.toDecimal(),
          bonos: n.bonos.toDecimal(),
          premios: n.premios.toDecimal(),
          comisiones: n.comisiones.toDecimal(),
          viaticos: n.viaticos.toDecimal(),
          sancionesDescuento: n.sancionesDescuento.toDecimal(),
          otrosDescuentos: n.otrosDescuentos.toDecimal(),
          conceptosNoRem: n.conceptosNoRem.toDecimal(),
          observaciones: n.observaciones,
        },
        create: {
          id: n.id,
          empleadoId: empleado.id,
          periodo: n.periodo.getValue(),
          quincena: n.quincena,
          horasNormales: n.horasNormales,
          horasExtras50: n.horasExtras50,
          horasExtras100: n.horasExtras100,
          feriadosTrabajados: n.feriadosTrabajados,
          horasNocturnas: n.horasNocturnas,
          ausencias: n.ausencias,
          llegadasTarde: n.llegadasTarde,
          diasLicencia: n.diasLicencia,
          diasVacaciones: n.diasVacaciones,
          adelantos: n.adelantos.toDecimal(),
          bonos: n.bonos.toDecimal(),
          premios: n.premios.toDecimal(),
          comisiones: n.comisiones.toDecimal(),
          viaticos: n.viaticos.toDecimal(),
          sancionesDescuento: n.sancionesDescuento.toDecimal(),
          otrosDescuentos: n.otrosDescuentos.toDecimal(),
          conceptosNoRem: n.conceptosNoRem.toDecimal(),
          observaciones: n.observaciones,
        },
      });
    }
  }

  private toDomain(dbEmpleado: any): Empleado {
    const versiones = dbEmpleado.versiones.map((v: any) => new EmpleadoVersion({
      version: v.version,
      validFrom: v.validFrom,
      validTo: v.validTo,
      legajo: v.legajo,
      apellido: v.apellido,
      nombre: v.nombre,
      sexo: v.sexo,
      fechaNacimiento: v.fechaNacimiento,
      estadoCivil: v.estadoCivil,
      nacionalidad: v.nacionalidad,
      direccion: v.direccion,
      provincia: v.provincia,
      localidad: v.localidad,
      codigoPostal: v.codigoPostal,
      email: v.email,
      telefono: v.telefono,
      contactoEmergencia: v.contactoEmergencia,
      grupoSanguineo: v.grupoSanguineo,
      nivelEducativo: v.nivelEducativo,
      profesion: v.profesion,
      discapacidad: v.discapacidad,
      licenciaConducir: v.licenciaConducir,
      fotoUrl: v.fotoUrl,
      firmaUrl: v.firmaUrl,
      fechaIngreso: v.fechaIngreso,
      fechaEgreso: v.fechaEgreso,
      motivoBaja: v.motivoBaja,
      tipoContrato: v.tipoContrato,
      modalidad: v.modalidad,
      sucursalId: v.sucursalId,
      convenioVersionId: v.convenioVersionId,
      categoriaId: v.categoriaId,
      centroCosto: v.centroCosto,
      jornada: v.jornada,
      horasSemanales: v.horasSemanales,
      obraSocialVersionId: v.obraSocialVersionId,
      sindicatoVersionId: v.sindicatoVersionId,
      banco: v.banco,
      cbu: v.cbu,
      alias: v.alias,
      formaPago: v.formaPago,
      estado: v.estado,
      seguroVida: v.seguroVida,
      seguroRetiro: v.seguroRetiro,
      uniformesEntregados: v.uniformesEntregados,
      eppEntregados: v.eppEntregados,
      cursosCapacitaciones: v.cursosCapacitaciones,
      examenesPreocupacionales: v.examenesPreocupacionales,
      afipEstado: v.afipEstado,
      afipAltaTemprana: v.afipAltaTemprana,
      afipBaja: v.afipBaja,
      afipCondicion: v.afipCondicion,
      afipSituacionRevista: v.afipSituacionRevista,
      afipCodigoModalidad: v.afipCodigoModalidad,
      afipCodigoActividad: v.afipCodigoActividad,
      afipCodigoPuesto: v.afipCodigoPuesto,
      updatedBy: v.updatedBy,
      deletedAt: v.deletedAt,
      deletedBy: v.deletedBy,
    }, v.id));

    const embargos = dbEmpleado.embargos.map((e: any) => new Embargo(
      e.id,
      e.juzgado,
      e.expediente,
      e.tipo as any,
      Money.create(e.montoFijo),
      Percentage.create(e.porcentaje),
      e.prioridad,
      e.fechaInicio,
      e.fechaFin,
      e.estado as any,
      e.observaciones
    ));

    const vacaciones = dbEmpleado.vacaciones.map((va: any) => new Vacacion(
      va.id,
      va.periodo,
      va.diasDisponibles,
      va.diasGozados,
      va.saldo,
      va.fechaInicio,
      va.fechaFin,
      va.pagoAnticipado,
      va.estado as any
    ));

    const novedades = dbEmpleado.novedades.map((n: any) => new NovedadMensual({
      periodo: Periodo.create(n.periodo),
      quincena: n.quincena,
      horasNormales: n.horasNormales,
      horasExtras50: n.horasExtras50,
      horasExtras100: n.horasExtras100,
      feriadosTrabajados: n.feriadosTrabajados,
      horasNocturnas: n.horasNocturnas,
      ausencias: n.ausencias,
      llegadasTarde: n.llegadasTarde,
      diasLicencia: n.diasLicencia,
      diasVacaciones: n.diasVacaciones,
      adelantos: Money.create(n.adelantos),
      bonos: Money.create(n.bonos),
      premios: Money.create(n.premios),
      comisiones: Money.create(n.comisiones),
      viaticos: Money.create(n.viaticos),
      sancionesDescuento: Money.create(n.sancionesDescuento),
      otrosDescuentos: Money.create(n.otrosDescuentos),
      conceptosNoRem: Money.create(n.conceptosNoRem),
      observaciones: n.observaciones,
    }, n.id));

    return Empleado.reconstitute(
      dbEmpleado.id,
      dbEmpleado.tenantId,
      dbEmpleado.clienteId,
      Cuil.create(dbEmpleado.cuil),
      dbEmpleado.dni,
      versiones,
      embargos,
      vacaciones,
      novedades,
      dbEmpleado.deletedAt,
      dbEmpleado.deletedBy
    );
  }
}
