'use server';

import { prisma } from '@/infrastructure/database/client';
import { PrismaEmpleadoRepository } from '@/infrastructure/database/repositories/PrismaEmpleadoRepository';
import { PrismaClienteRepository } from '@/infrastructure/database/repositories/PrismaClienteRepository';
import { RegistrarEmpleado, RegistrarEmpleadoCommand } from '@/application/use-cases/RegistrarEmpleado';
import { RegistrarTenantCliente } from '@/application/use-cases/RegistrarTenantCliente';
import { PrismaTenantRepository } from '@/infrastructure/database/repositories/PrismaTenantRepository';

/**
 * Loads all initial database records to populate UI states.
 */
export async function loadInitialData(tenantId: string) {
  try {
    const clientes = await prisma.cliente.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        versiones: true, // No deletedAt column in versions
        sucursales: { where: { deletedAt: null } },
        documentos: { where: { deletedAt: null } },
      },
    });

    const empleados = await prisma.empleado.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        versiones: { where: { deletedAt: null } },
        embargos: { where: { deletedAt: null } },
        vacaciones: { where: { deletedAt: null } },
        novedades: true,
      },
    });

    const convenios = await prisma.convenio.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        versiones: true, // No deletedAt column in versions
        escalas: {
          where: { deletedAt: null },
          include: { categorias: true }
        }
      }
    });

    const conceptos = await prisma.concepto.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        versiones: true // No deletedAt column in versions
      }
    });

    const liquidaciones = await prisma.liquidacion.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        recibos: {
          include: { detalles: true }
        }
      }
    });

    const auditLogs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return {
      success: true,
      data: {
        clientes,
        empleados,
        convenios,
        conceptos,
        liquidaciones,
        auditLogs
      }
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Creates and registers a new employee using RegistrarEmpleado use case.
 * Runs atomically inside a transaction.
 */
export async function registrarEmpleadoAction(command: RegistrarEmpleadoCommand) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const empleadoRepo = new PrismaEmpleadoRepository(tx);
      const clienteRepo = new PrismaClienteRepository(tx);
      const useCase = new RegistrarEmpleado(empleadoRepo, clienteRepo);
      
      const res = await useCase.execute(command);
      if (!res.isSuccess) {
        throw new Error(res.error || "Fallo en el registro del legajo.");
      }

      const emp = res.value;
      const ver = emp.getVersiones()[0];

      // Save audit log inside the same transaction
      await tx.auditLog.create({
        data: {
          action: 'REGISTRAR_EMPLEADO',
          modulo: 'EMPLEADOS',
          tabla: 'Empleado',
          recordId: emp.id,
          valorNuevo: JSON.stringify({
            empleadoId: emp.id,
            clienteId: emp.clienteId,
            legajo: ver.legajo,
            cuil: emp.getCuil().getValue(),
            dni: emp.getDni(),
            nombre: ver.nombre,
            apellido: ver.apellido
          }),
          userEmail: command.usuarioId,
        }
      });

      return emp;
    });

    // Fetch the stored db representation to return a serializable DTO
    const serializedData = await prisma.empleado.findUnique({
      where: { id: result.id },
      include: {
        versiones: { where: { deletedAt: null } },
        embargos: { where: { deletedAt: null } },
        vacaciones: { where: { deletedAt: null } },
        novedades: true,
      }
    });

    return { success: true, data: serializedData };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Creates and registers a new client version.
 */
export async function registrarClienteAction(command: {
  tenantId: string;
  cuit: string;
  razonSocial: string;
  inicioActividades: Date;
  tipoSocietario: string;
  condicionIva: string;
  actividadPrincipal: string;
  codigoAfip: string;
  legalAddress: string;
  fiscalAddress: string;
  provincia: string;
  localidad: string;
  codigoPostal: string;
  email: string;
  primerLegajo?: number;
  digitosLegajo?: number;
  usuarioId: string;
}) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const tenantRepo = new PrismaTenantRepository(tx);
      const clienteRepo = new PrismaClienteRepository(tx);
      const useCase = new RegistrarTenantCliente(tenantRepo, clienteRepo);

      // Verify tenant exists
      const tenant = await tenantRepo.findById(command.tenantId);
      if (!tenant) {
        throw new Error("No se encontró el inquilino correspondiente.");
      }

      // Execute client registration
      const res = await useCase.execute({
        nombreTenant: tenant.getNombre(),
        subdominio: tenant.getSubdominio(),
        cuit: command.cuit,
        razonSocial: command.razonSocial,
        inicioActividades: command.inicioActividades,
        tipoSocietario: command.tipoSocietario,
        condicionIva: command.condicionIva,
        actividadPrincipal: command.actividadPrincipal,
        codigoAfip: command.codigoAfip,
        legalAddress: command.legalAddress,
        fiscalAddress: command.fiscalAddress,
        provincia: command.provincia,
        localidad: command.localidad,
        codigoPostal: command.codigoPostal,
        email: command.email,
      });

      if (!res.isSuccess) {
        throw new Error(res.error || "Fallo en el registro del cliente.");
      }

      const { clienteId } = res.value;

      // Update primerLegajo and digitosLegajo settings since they were added to schema
      if (command.primerLegajo !== undefined || command.digitosLegajo !== undefined) {
        const clientObj = await clienteRepo.findById(clienteId, command.tenantId);
        if (clientObj) {
          const v = clientObj.getVersiones()[0];
          await tx.clienteVersion.update({
            where: { id: v.id },
            data: {
              primerLegajo: command.primerLegajo !== undefined ? command.primerLegajo : 1,
              digitosLegajo: command.digitosLegajo !== undefined ? command.digitosLegajo : 4,
            }
          });
        }
      }

      await tx.auditLog.create({
        data: {
          action: 'CREATE_CLIENTE',
          modulo: 'CLIENTES',
          tabla: 'Cliente',
          recordId: clienteId,
          valorNuevo: JSON.stringify({ cuit: command.cuit, razonSocial: command.razonSocial }),
          userEmail: command.usuarioId,
        }
      });

      return clienteId;
    });

    const serializedData = await prisma.cliente.findUnique({
      where: { id: result },
      include: {
        versiones: true, // No deletedAt column in versions
        sucursales: { where: { deletedAt: null } },
        documentos: { where: { deletedAt: null } },
      }
    });

    return { success: true, data: serializedData };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Soft deletes an employee (soft delete tracking)
 */
export async function softDeleteEmpleadoAction(empleadoId: string, tenantId: string, usuarioId: string) {
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Soft delete core Empleado
      await tx.empleado.update({
        where: { id: empleadoId },
        data: {
          deletedAt: new Date(),
          deletedBy: usuarioId
        }
      });

      // 2. Soft delete versions
      await tx.empleadoVersion.updateMany({
        where: { empleadoId },
        data: {
          deletedAt: new Date(),
          deletedBy: usuarioId
        }
      });

      await tx.auditLog.create({
        data: {
          action: 'DELETE_EMPLEADO',
          modulo: 'EMPLEADOS',
          tabla: 'Empleado',
          recordId: empleadoId,
          valorNuevo: JSON.stringify({ empleadoId }),
          userEmail: usuarioId,
        }
      });
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
