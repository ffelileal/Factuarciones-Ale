import { Liquidacion } from '../entities/Liquidacion';
import { Periodo } from '../value-objects/Periodo';

export interface ILiquidacionRepository {
  findById(id: string, tenantId: string): Promise<Liquidacion | null>;
  findByUniqueKeys(clienteId: string, periodo: Periodo, quincena: number, tipo: string, tenantId: string): Promise<Liquidacion | null>;
  findAllByEmpresa(clienteId: string, tenantId: string): Promise<Liquidacion[]>;
  save(liquidacion: Liquidacion): Promise<void>;
}
