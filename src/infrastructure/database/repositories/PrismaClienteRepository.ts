import { prisma } from '../client';
import { IClienteRepository } from '@/domain/repositories/IClienteRepository';
import { Cliente, ClienteVersion, Sucursal, DocumentoCliente } from '@/domain/entities/Cliente';
import { Cuit } from '@/domain/value-objects/Cuit';

export class PrismaClienteRepository implements IClienteRepository {
  public constructor(private readonly db: any = prisma) {}
  public async findById(id: string, tenantId: string): Promise<Cliente | null> {
    const dbEmpresa = await this.db.cliente.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        versiones: true,
        sucursales: { where: { deletedAt: null } },
        documentos: { where: { deletedAt: null } },
      },
    });
    if (!dbEmpresa) return null;
    return this.toDomain(dbEmpresa);
  }

  public async findByCuit(cuit: string, tenantId: string): Promise<Cliente | null> {
    const dbEmpresa = await this.db.cliente.findFirst({
      where: { cuit, tenantId, deletedAt: null },
      include: {
        versiones: true,
        sucursales: { where: { deletedAt: null } },
        documentos: { where: { deletedAt: null } },
      },
    });
    if (!dbEmpresa) return null;
    return this.toDomain(dbEmpresa);
  }

  public async findAll(tenantId: string): Promise<Cliente[]> {
    const dbEmpresas = await this.db.cliente.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        versiones: true,
        sucursales: { where: { deletedAt: null } },
        documentos: { where: { deletedAt: null } },
      },
    });
    return dbEmpresas.map((e: any) => this.toDomain(e));
  }

  public async save(cliente: Cliente): Promise<void> {
    // 1. Save core Cliente
    await this.db.cliente.upsert({
      where: { id: cliente.id },
      update: {
        cuit: cliente.getCuit().getValue(),
      },
      create: {
        id: cliente.id,
        tenantId: cliente.tenantId,
        cuit: cliente.getCuit().getValue(),
      },
    });

    // 2. Save versions (upsert all versions)
    for (const v of cliente.getVersiones()) {
      await this.db.clienteVersion.upsert({
        where: { id: v.id },
        update: {
          version: v.version,
          validFrom: v.validFrom,
          validTo: v.validTo,
          razonSocial: v.razonSocial,
          nombreFantasia: v.nombreFantasia,
          inicioActividades: v.inicioActividades,
          actividadesSecundarias: v.actividadesSecundarias,
          jurisdiccion: v.jurisdiccion,
          ingresosBrutos: v.ingresosBrutos,
          art: v.art,
          cuentaBancaria: v.cuentaBancaria,
          cbu: v.cbu,
          alias: v.alias,
          tipoSocietario: v.tipoSocietario,
          condicionIva: v.condicionIva,
          actividadPrincipal: v.actividadPrincipal,
          codigoAfip: v.codigoAfip,
          legalAddress: v.legalAddress,
          fiscalAddress: v.fiscalAddress,
          provincia: v.provincia,
          localidad: v.localidad,
          codigoPostal: v.codigoPostal,
          email: v.email,
          telefono: v.telefono,
          estado: v.estado,
          primerLegajo: v.primerLegajo,
          digitosLegajo: v.digitosLegajo,
        },
        create: {
          id: v.id,
          tenantId: cliente.tenantId,
          clienteId: cliente.id,
          version: v.version,
          validFrom: v.validFrom,
          validTo: v.validTo,
          razonSocial: v.razonSocial,
          nombreFantasia: v.nombreFantasia,
          inicioActividades: v.inicioActividades,
          actividadesSecundarias: v.actividadesSecundarias,
          jurisdiccion: v.jurisdiccion,
          ingresosBrutos: v.ingresosBrutos,
          art: v.art,
          cuentaBancaria: v.cuentaBancaria,
          cbu: v.cbu,
          alias: v.alias,
          tipoSocietario: v.tipoSocietario,
          condicionIva: v.condicionIva,
          actividadPrincipal: v.actividadPrincipal,
          codigoAfip: v.codigoAfip,
          legalAddress: v.legalAddress,
          fiscalAddress: v.fiscalAddress,
          provincia: v.provincia,
          localidad: v.localidad,
          codigoPostal: v.codigoPostal,
          email: v.email,
          telefono: v.telefono,
          estado: v.estado,
          updatedBy: v.updatedBy,
          primerLegajo: v.primerLegajo,
          digitosLegajo: v.digitosLegajo,
        },
      });
    }

    // 3. Save sucursales
    for (const s of cliente.getSucursales()) {
      await this.db.sucursal.upsert({
        where: { id: s.id },
        update: {
          nombre: s.nombre,
          domicilio: s.domicilio,
          telefono: s.telefono,
          responsable: s.responsable,
        },
        create: {
          id: s.id,
          tenantId: cliente.tenantId,
          clienteId: cliente.id,
          nombre: s.nombre,
          domicilio: s.domicilio,
          telefono: s.telefono,
          responsable: s.responsable,
          fechaApertura: s.fechaApertura,
        },
      });
    }

    // 4. Save documentos
    for (const d of cliente.getDocumentos()) {
      await this.db.documentoCliente.upsert({
        where: { id: d.id },
        update: {
          nombre: d.nombre,
          tipo: d.tipo,
          url: d.url,
          fileName: d.fileName,
        },
        create: {
          id: d.id,
          clienteId: cliente.id,
          nombre: d.nombre,
          tipo: d.tipo,
          url: d.url,
          fileName: d.fileName,
        },
      });
    }
  }

  private toDomain(dbEmpresa: any): Cliente {
    const versiones = dbEmpresa.versiones.map((v: any) => new ClienteVersion({
      version: v.version,
      validFrom: v.validFrom,
      validTo: v.validTo,
      razonSocial: v.razonSocial,
      nombreFantasia: v.nombreFantasia,
      inicioActividades: v.inicioActividades,
      actividadesSecundarias: v.actividadesSecundarias,
      jurisdiccion: v.jurisdiccion,
      ingresosBrutos: v.ingresosBrutos,
      art: v.art,
      cuentaBancaria: v.cuentaBancaria,
      cbu: v.cbu,
      alias: v.alias,
      tipoSocietario: v.tipoSocietario,
      condicionIva: v.condicionIva,
      actividadPrincipal: v.actividadPrincipal,
      codigoAfip: v.codigoAfip,
      legalAddress: v.legalAddress,
      fiscalAddress: v.fiscalAddress,
      provincia: v.provincia,
      localidad: v.localidad,
      codigoPostal: v.codigoPostal,
      email: v.email,
      telefono: v.telefono,
      estado: v.estado,
      updatedBy: v.updatedBy,
      tipoCliente: v.tipoCliente,
      primerLegajo: v.primerLegajo,
      digitosLegajo: v.digitosLegajo,
    }, v.id));

    const sucursales = dbEmpresa.sucursales.map((s: any) => new Sucursal(
      s.id,
      s.nombre,
      s.domicilio,
      s.telefono,
      s.responsable,
      s.fechaApertura
    ));

    const documentos = dbEmpresa.documentos.map((d: any) => new DocumentoCliente(
      d.id,
      d.nombre,
      d.tipo,
      d.url,
      d.fileName
    ));

    return Cliente.reconstitute(
      dbEmpresa.id,
      dbEmpresa.tenantId,
      Cuit.create(dbEmpresa.cuit),
      versiones,
      sucursales,
      documentos
    );
  }
}
