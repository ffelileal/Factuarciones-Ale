import { Tenant } from '../entities/Tenant';

export interface ITenantRepository {
  findById(id: string): Promise<Tenant | null>;
  findBySubdomain(subdomain: string): Promise<Tenant | null>;
  save(tenant: Tenant): Promise<void>;
  delete(id: string): Promise<void>;
}
