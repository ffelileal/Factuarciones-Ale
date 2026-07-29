import { Concepto } from '../entities/Concepto';

export interface IConceptoRepository {
  findById(id: string, tenantId: string): Promise<Concepto | null>;
  findByCodigo(codigo: string, tenantId: string): Promise<Concepto | null>;
  findAll(tenantId: string): Promise<Concepto[]>;
  save(concepto: Concepto): Promise<void>;
}
