import { Convenio } from '../entities/Convenio';

export interface IConvenioRepository {
  findById(id: string, tenantId: string): Promise<Convenio | null>;
  findByVersionId(versionId: string, tenantId: string): Promise<Convenio | null>;
  findByNumero(numero: string, tenantId: string): Promise<Convenio | null>;
  findAll(tenantId: string): Promise<Convenio[]>;
  save(convenio: Convenio): Promise<void>;
}
