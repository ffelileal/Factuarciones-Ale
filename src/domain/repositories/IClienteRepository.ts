import { Cliente } from '../entities/Cliente';

export interface IClienteRepository {
  findById(id: string, tenantId: string): Promise<Cliente | null>;
  findByCuit(cuit: string, tenantId: string): Promise<Cliente | null>;
  findAll(tenantId: string): Promise<Cliente[]>;
  save(cliente: Cliente): Promise<void>;
}
