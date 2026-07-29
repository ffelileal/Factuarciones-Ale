import { prisma } from '../client';
import { IConvenioRepository } from '@/domain/repositories/IConvenioRepository';
import { Convenio, ConvenioVersion, EscalaSalarial, Categoria } from '@/domain/entities/Convenio';
import { Percentage } from '@/domain/value-objects/Percentage';
import { Money } from '@/domain/value-objects/Money';

export class PrismaConvenioRepository implements IConvenioRepository {
  public async findById(id: string, tenantId: string): Promise<Convenio | null> {
    const dbConvenio = await prisma.convenio.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        versiones: true,
        escalas: {
          where: { deletedAt: null },
          include: { categorias: { where: { deletedAt: null } } }
        }
      }
    });
    if (!dbConvenio) return null;
    return this.toDomain(dbConvenio);
  }

  public async findByVersionId(versionId: string, tenantId: string): Promise<Convenio | null> {
    const dbConvenio = await prisma.convenio.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        versiones: {
          some: { id: versionId }
        }
      },
      include: {
        versiones: true,
        escalas: {
          where: { deletedAt: null },
          include: { categorias: { where: { deletedAt: null } } }
        }
      }
    });
    if (!dbConvenio) return null;
    return this.toDomain(dbConvenio);
  }

  public async findByNumero(numero: string, tenantId: string): Promise<Convenio | null> {
    const dbConvenio = await prisma.convenio.findFirst({
      where: { numero, tenantId, deletedAt: null },
      include: {
        versiones: true,
        escalas: {
          where: { deletedAt: null },
          include: { categorias: { where: { deletedAt: null } } }
        }
      }
    });
    if (!dbConvenio) return null;
    return this.toDomain(dbConvenio);
  }

  public async findAll(tenantId: string): Promise<Convenio[]> {
    const dbConvenios = await prisma.convenio.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        versiones: true,
        escalas: {
          where: { deletedAt: null },
          include: { categorias: { where: { deletedAt: null } } }
        }
      }
    });
    return dbConvenios.map(c => this.toDomain(c));
  }

  public async save(convenio: Convenio): Promise<void> {
    // 1. Save core Convenio
    await prisma.convenio.upsert({
      where: { id: convenio.id },
      update: {},
      create: {
        id: convenio.id,
        tenantId: convenio.tenantId,
        numero: convenio.numero,
      }
    });

    // 2. Save versions
    for (const v of convenio.getVersiones()) {
      await prisma.convenioVersion.upsert({
        where: { id: v.id },
        update: {
          version: v.version,
          validFrom: v.validFrom,
          validTo: v.validTo,
          nombre: v.nombre,
          descripcion: v.descripcion,
          tipoLiquidacion: v.tipoLiquidacion,
          antiguedadPorc: v.antiguedadPorc.toDecimal(),
          estado: v.estado,
        },
        create: {
          id: v.id,
          tenantId: convenio.tenantId,
          convenioId: convenio.id,
          version: v.version,
          validFrom: v.validFrom,
          validTo: v.validTo,
          nombre: v.nombre,
          descripcion: v.descripcion,
          sindicatoId: v.sindicatoId,
          tipoLiquidacion: v.tipoLiquidacion,
          antiguedadPorc: v.antiguedadPorc.toDecimal(),
          estado: v.estado,
          updatedBy: v.updatedBy,
        }
      });
    }

    // 3. Save scales and categories
    for (const e of convenio.getEscalas()) {
      await prisma.escalaSalarial.upsert({
        where: { id: e.id },
        update: {
          fechaDesde: e.fechaDesde,
          fechaHasta: e.fechaHasta,
          resolucion: e.resolucion,
          pdfOficial: e.pdfOficial,
          observaciones: e.observaciones,
          version: e.version,
        },
        create: {
          id: e.id,
          tenantId: convenio.tenantId,
          convenioId: convenio.id,
          periodo: e.periodo,
          fechaDesde: e.fechaDesde,
          fechaHasta: e.fechaHasta,
          resolucion: e.resolucion,
          pdfOficial: e.pdfOficial,
          observaciones: e.observaciones,
          version: e.version,
        }
      });

      for (const c of e.getCategorias()) {
        await prisma.categoria.upsert({
          where: { id: c.id },
          update: {
            nombre: c.nombre,
            valorHora: c.valorHora.toDecimal(),
            valorMensual: c.valorMensual.toDecimal(),
            valorJornada: c.valorJornada.toDecimal(),
          },
          create: {
            id: c.id,
            escalaId: e.id,
            nombre: c.nombre,
            codigo: c.codigo,
            valorHora: c.valorHora.toDecimal(),
            valorMensual: c.valorMensual.toDecimal(),
            valorJornada: c.valorJornada.toDecimal(),
          }
        });
      }
    }
  }

  private toDomain(dbConvenio: any): Convenio {
    const versiones = dbConvenio.versiones.map((v: any) => new ConvenioVersion({
      convenioId: v.convenioId,
      version: v.version,
      validFrom: v.validFrom,
      validTo: v.validTo,
      nombre: v.nombre,
      descripcion: v.descripcion,
      sindicatoId: v.sindicatoId,
      tipoLiquidacion: v.tipoLiquidacion as any,
      antiguedadPorc: Percentage.create(v.antiguedadPorc),
      estado: v.estado,
      updatedBy: v.updatedBy,
    }, v.id));

    const escalas = dbConvenio.escalas.map((e: any) => {
      const categorias = e.categorias.map((c: any) => new Categoria(
        c.id,
        c.escalaId,
        c.nombre,
        c.codigo,
        Money.create(c.valorHora),
        Money.create(c.valorMensual),
        Money.create(c.valorJornada)
      ));

      return new EscalaSalarial(
        e.id,
        e.convenioId,
        e.periodo,
        e.fechaDesde,
        e.fechaHasta,
        e.resolucion,
        e.pdfOficial,
        e.observaciones,
        e.version,
        categorias
      );
    });

    return new Convenio(dbConvenio.id, dbConvenio.tenantId, dbConvenio.numero, versiones, escalas);
  }
}
