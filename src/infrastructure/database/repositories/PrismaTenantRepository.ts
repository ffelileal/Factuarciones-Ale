import { prisma } from '../client';
import { ITenantRepository } from '@/domain/repositories/ITenantRepository';
import { Tenant, FeatureFlag } from '@/domain/entities/Tenant';

export class PrismaTenantRepository implements ITenantRepository {
  public constructor(private readonly db: any = prisma) {}
  public async findById(id: string): Promise<Tenant | null> {
    const dbTenant = await this.db.tenant.findUnique({
      where: { id, deletedAt: null },
    });
    if (!dbTenant) return null;
    return this.toDomain(dbTenant);
  }

  public async findBySubdomain(subdominio: string): Promise<Tenant | null> {
    const dbTenant = await this.db.tenant.findUnique({
      where: { subdominio, deletedAt: null },
    });
    if (!dbTenant) return null;
    return this.toDomain(dbTenant);
  }

  public async save(tenant: Tenant): Promise<void> {
    const featureFlagsData = tenant.getFeatureFlags().map(ff => ({
      key: ff.key,
      active: true, // We can serialize state inside a structured metadata or keep flags array
      environment: ff.environment,
      rolloutPercentage: ff.rolloutPercentage,
      expiresAt: ff.expiresAt
    }));

    // In prisma schema, featureFlags is String. Let's serialize the key names as JSON
    const flagsKeys = tenant.getFeatureFlags().map(ff => ff.key);
    const flagsJson = JSON.stringify(flagsKeys);

    await this.db.tenant.upsert({
      where: { id: tenant.id },
      update: {
        nombre: tenant.getNombre(),
        subdominio: tenant.getSubdominio(),
        estado: tenant.getEstado(),
        featureFlags: flagsJson,
      },
      create: {
        id: tenant.id,
        nombre: tenant.getNombre(),
        subdominio: tenant.getSubdominio(),
        estado: tenant.getEstado(),
        featureFlags: flagsJson,
      },
    });
  }

  public async delete(id: string): Promise<void> {
    await this.db.tenant.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private toDomain(dbTenant: any): Tenant {
    // Reconstitute FeatureFlag value objects
    let keys: string[] = [];
    try {
      keys = JSON.parse(dbTenant.featureFlags || '[]');
    } catch {
      keys = [];
    }
    const flags = keys.map((key: string) => {
      return new FeatureFlag(key, true, 'dev', 100, null);
    });
    return Tenant.create(dbTenant.id, dbTenant.nombre, dbTenant.subdominio, dbTenant.estado as any, flags);
  }
}
