import { prisma } from '../client';
import { IConceptoRepository } from '@/domain/repositories/IConceptoRepository';
import { Concepto, ConceptoVersion } from '@/domain/entities/Concepto';

export class PrismaConceptoRepository implements IConceptoRepository {
  public async findById(id: string, tenantId: string): Promise<Concepto | null> {
    const dbConcepto = await prisma.concepto.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { versiones: true }
    });
    if (!dbConcepto) return null;
    return this.toDomain(dbConcepto);
  }

  public async findByCodigo(codigo: string, tenantId: string): Promise<Concepto | null> {
    const dbConcepto = await prisma.concepto.findFirst({
      where: { codigo, tenantId, deletedAt: null },
      include: { versiones: true }
    });
    if (!dbConcepto) return null;
    return this.toDomain(dbConcepto);
  }

  public async findAll(tenantId: string): Promise<Concepto[]> {
    const dbConceptos = await prisma.concepto.findMany({
      where: { tenantId, deletedAt: null },
      include: { versiones: true }
    });
    return dbConceptos.map(c => this.toDomain(c));
  }

  public async save(concepto: Concepto): Promise<void> {
    // 1. Save core Concepto
    await prisma.concepto.upsert({
      where: { id: concepto.id },
      update: {},
      create: {
        id: concepto.id,
        tenantId: concepto.tenantId,
        codigo: concepto.codigo,
      }
    });

    // 2. Save versions
    for (const v of concepto.getVersiones()) {
      await prisma.conceptoVersion.upsert({
        where: { id: v.id },
        update: {
          version: v.version,
          validFrom: v.validFrom,
          validTo: v.validTo,
          nombre: v.nombre,
          tipo: v.tipo as any,
          formula: v.formula,
          ordenImpresion: v.ordenImpresion,
          activo: v.activo,
          codigoAfip: v.codigoAfip,
        },
        create: {
          id: v.id,
          tenantId: concepto.tenantId,
          conceptoId: concepto.id,
          version: v.version,
          validFrom: v.validFrom,
          validTo: v.validTo,
          nombre: v.nombre,
          tipo: v.tipo as any,
          formula: v.formula,
          ordenImpresion: v.ordenImpresion,
          activo: v.activo,
          codigoAfip: v.codigoAfip,
          updatedBy: v.updatedBy,
        }
      });
    }
  }

  private toDomain(dbConcepto: any): Concepto {
    const versiones = dbConcepto.versiones.map((v: any) => new ConceptoVersion({
      conceptoId: v.conceptoId,
      version: v.version,
      validFrom: v.validFrom,
      validTo: v.validTo,
      nombre: v.nombre,
      tipo: v.tipo as any,
      formula: v.formula,
      ordenImpresion: v.ordenImpresion,
      activo: v.activo,
      codigoAfip: v.codigoAfip,
      updatedBy: v.updatedBy,
    }, v.id));

    return new Concepto(dbConcepto.id, dbConcepto.tenantId, dbConcepto.codigo, versiones);
  }
}
