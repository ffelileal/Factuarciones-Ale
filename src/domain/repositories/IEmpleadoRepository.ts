import { Empleado } from '../entities/Empleado';

export interface IEmpleadoRepository {
  findById(id: string, tenantId: string): Promise<Empleado | null>;
  findByCuil(cuil: string, tenantId: string): Promise<Empleado | null>;
  findByDni(dni: string, tenantId: string): Promise<Empleado | null>;
  findAllByEmpresa(clienteId: string, tenantId: string): Promise<Empleado[]>;
  findLastLegajo(clienteId: string, tenantId: string): Promise<string | null>;
  save(empleado: Empleado): Promise<void>;
}
