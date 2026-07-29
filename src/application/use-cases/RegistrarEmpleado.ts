import { IEmpleadoRepository } from '@/domain/repositories/IEmpleadoRepository';
import { IClienteRepository } from '@/domain/repositories/IClienteRepository';
import { Empleado } from '@/domain/entities/Empleado';
import { Cuil } from '@/domain/value-objects/Cuil';
import { Result } from '@/domain/utils/Result';
import { Decimal } from 'decimal.js';
import { ArgentineTaxHelper } from '@/domain/services/ArgentineTaxHelper';
import { EmpleadoRegistradoEvent } from '@/domain/events/EmpleadoRegistradoEvent';
import { prisma } from '@/infrastructure/database/client';

export interface RegistrarEmpleadoCommand {
  tenantId: string;
  clienteId: string;
  usuarioId: string;
  nombre: string;
  apellido: string;
  dni: string;
  sexo: 'M' | 'F';
  fechaNacimiento: Date;
  fechaIngreso: Date;
  convenioVersionId: string;
  categoriaId: string;
  banco?: string;
  cbu?: string;
  email?: string;
  telefono?: string;
  observaciones?: string;
}

export class RegistrarEmpleado {
  public constructor(
    private readonly empleadoRepo: IEmpleadoRepository,
    private readonly clienteRepo: IClienteRepository
  ) {}

  public async execute(command: RegistrarEmpleadoCommand): Promise<Result<Empleado>> {
    try {
      // 1. Validation: DNI unique within client
      const existingDni = await this.empleadoRepo.findByDni(command.dni, command.tenantId);
      if (existingDni && existingDni.clienteId === command.clienteId && existingDni.deletedAt === null) {
        return Result.fail(`El DNI ${command.dni} ya se encuentra registrado para otro colaborador en este cliente.`);
      }

      // 2. Compute and Validate CUIL
      const computedCuilStr = ArgentineTaxHelper.calcularCuil(command.dni, command.sexo);
      const existingCuil = await this.empleadoRepo.findByCuil(computedCuilStr, command.tenantId);
      if (existingCuil && existingCuil.deletedAt === null) {
        return Result.fail(`El CUIL ${computedCuilStr} ya se encuentra registrado en el sistema.`);
      }

      // 3. Validation: CBU format if provided
      if (command.cbu && command.cbu.trim() !== '') {
        const isValid = ArgentineTaxHelper.isValidCbu(command.cbu);
        if (!isValid) {
          return Result.fail("El CBU ingresado no es válido (falló la validación del dígito verificador).");
        }
      }

      // 4. Fetch Client configuration for Legajo sequences
      const client = await this.clienteRepo.findById(command.clienteId, command.tenantId);
      if (!client) {
        return Result.fail("No se encontró el cliente en la plataforma.");
      }
      const cv = client.getVersiones()[0];
      const startLegajoNum = cv.primerLegajo || 1;
      const digitsCount = cv.digitosLegajo || 4;

      // 5. Generate Legajo Sequence (strictly increasing, queries all records)
      const lastLegajoStr = await this.empleadoRepo.findLastLegajo(command.clienteId, command.tenantId);
      let nextLegajoNum = startLegajoNum;
      if (lastLegajoStr) {
        const lastVal = parseInt(lastLegajoStr, 10);
        if (!isNaN(lastVal)) {
          nextLegajoNum = Math.max(lastVal + 1, startLegajoNum);
        }
      }
      const nextLegajoStr = nextLegajoNum.toString().padStart(digitsCount, '0');

      // 6. Look up default sucursal and obra social from DB to automate fields
      const dbSuc = await prisma.sucursal.findFirst({ where: { clienteId: command.clienteId } });
      const sucursalId = dbSuc ? dbSuc.id : 'suc-001';

      const dbOs = await prisma.obraSocialVersion.findFirst({ where: { tenantId: command.tenantId } });
      const obraSocialVersionId = dbOs ? dbOs.id : 'os-001';

      // 7. Instantiate Empleado aggregate with automated/default parameters
      const emailVal = command.email && command.email.trim() !== '' 
        ? command.email 
        : `${command.nombre.toLowerCase().replace(/\s+/g, '')}.${command.apellido.toLowerCase().replace(/\s+/g, '')}@estudio.com.ar`;

      const cuilObj = Cuil.create(computedCuilStr);
      
      const employee = Empleado.create(
        Math.random().toString(36).substring(7),
        command.tenantId,
        command.clienteId,
        cuilObj,
        command.dni,
        {
          validFrom: new Date(),
          validTo: new Date('9999-12-31T23:59:59.999Z'),
          legajo: nextLegajoStr,
          apellido: command.apellido,
          nombre: command.nombre,
          sexo: command.sexo,
          fechaNacimiento: command.fechaNacimiento,
          estadoCivil: "Soltero/a",
          nacionalidad: "Argentina",
          direccion: "Dirección No Declarada",
          provincia: cv.provincia || "Buenos Aires",
          localidad: cv.localidad || "CABA",
          codigoPostal: cv.codigoPostal || "1000",
          email: emailVal,
          telefono: command.telefono || null,
          contactoEmergencia: null,
          grupoSanguineo: "0+",
          nivelEducativo: "Secundario Completo",
          profesion: "Empleado/a",
          discapacidad: false,
          licenciaConducir: null,
          fotoUrl: null,
          firmaUrl: null,
          fechaIngreso: command.fechaIngreso,
          fechaEgreso: null,
          motivoBaja: null,
          tipoContrato: "EFECTIVO",
          modalidad: "TIEMPO_COMPLETO",
          sucursalId,
          convenioVersionId: command.convenioVersionId,
          categoriaId: command.categoriaId,
          centroCosto: "General",
          jornada: "COMPLETA",
          horasSemanales: new Decimal(44),
          obraSocialVersionId,
          sindicatoVersionId: null,
          banco: command.banco || null,
          cbu: command.cbu || null,
          alias: command.cbu ? `${command.nombre.toLowerCase()}.${command.apellido.toLowerCase()}.alias` : null,
          formaPago: command.cbu ? "TRANSFERENCIA" : "EFECTIVO",
          estado: "ACTIVO",
          seguroVida: false,
          seguroRetiro: false,
          uniformesEntregados: null,
          eppEntregados: null,
          cursosCapacitaciones: null,
          examenesPreocupacionales: null,
          afipEstado: "ACTIVO",
          afipAltaTemprana: true,
          afipBaja: false,
          afipCondicion: "SERVICIOS",
          afipSituacionRevista: "ACTIVO",
          afipCodigoModalidad: "001",
          afipCodigoActividad: "01",
          afipCodigoPuesto: "ADMINISTRATIVO",
          updatedBy: command.usuarioId,
        }
      );

      // 8. Add EmpleadoRegistradoEvent domain event
      employee['addDomainEvent'](new EmpleadoRegistradoEvent(command.tenantId, {
        empleadoId: employee.id,
        clienteId: employee.clienteId,
        legajo: nextLegajoStr,
        cuil: computedCuilStr,
        dni: command.dni,
        nombre: command.nombre,
        apellido: command.apellido,
        registradoPor: command.usuarioId,
      }));

      // 9. Persist aggregate
      await this.empleadoRepo.save(employee);

      return Result.ok(employee);
    } catch (err: any) {
      return Result.fail(`Fallo en el registro del legajo: ${err.message}`);
    }
  }
}
