import { ITenantRepository } from '@/domain/repositories/ITenantRepository';
import { IClienteRepository } from '@/domain/repositories/IClienteRepository';
import { IEmpleadoRepository } from '@/domain/repositories/IEmpleadoRepository';
import { ILiquidacionRepository } from '@/domain/repositories/ILiquidacionRepository';
import { IConvenioRepository } from '@/domain/repositories/IConvenioRepository';
import { IConceptoRepository } from '@/domain/repositories/IConceptoRepository';

import { Tenant } from '@/domain/entities/Tenant';
import { Cliente } from '@/domain/entities/Cliente';
import { Empleado } from '@/domain/entities/Empleado';
import { Liquidacion } from '@/domain/entities/Liquidacion';
import { Convenio } from '@/domain/entities/Convenio';
import { Concepto } from '@/domain/entities/Concepto';
import { Periodo } from '@/domain/value-objects/Periodo';

export class InMemoryTenantRepository implements ITenantRepository {
  private tenants = new Map<string, Tenant>();

  public async findById(id: string): Promise<Tenant | null> {
    return this.tenants.get(id) || null;
  }

  public async findBySubdomain(subdomain: string): Promise<Tenant | null> {
    for (const tenant of this.tenants.values()) {
      if (tenant.getSubdominio() === subdomain) return tenant;
    }
    return null;
  }

  public async save(tenant: Tenant): Promise<void> {
    this.tenants.set(tenant.id, tenant);
  }

  public async delete(id: string): Promise<void> {
    this.tenants.delete(id);
  }
}

export class InMemoryEmpresaRepository implements IClienteRepository {
  private clientes = new Map<string, Cliente>();

  public async findById(id: string, tenantId: string): Promise<Cliente | null> {
    const cliente = this.clientes.get(id);
    if (cliente && cliente.tenantId === tenantId) return cliente;
    return null;
  }

  public async findByCuit(cuit: string, tenantId: string): Promise<Cliente | null> {
    for (const cliente of this.clientes.values()) {
      if (cliente.getCuit().getValue() === cuit && cliente.tenantId === tenantId) {
        return cliente;
      }
    }
    return null;
  }

  public async findAll(tenantId: string): Promise<Cliente[]> {
    return Array.from(this.clientes.values()).filter(e => e.tenantId === tenantId);
  }

  public async save(cliente: Cliente): Promise<void> {
    this.clientes.set(cliente.id, cliente);
  }
}

export class InMemoryEmpleadoRepository implements IEmpleadoRepository {
  private empleados = new Map<string, Empleado>();

  public async findById(id: string, tenantId: string): Promise<Empleado | null> {
    const emp = this.empleados.get(id);
    if (emp && emp.tenantId === tenantId) return emp;
    return null;
  }

  public async findByCuil(cuil: string, tenantId: string): Promise<Empleado | null> {
    for (const emp of this.empleados.values()) {
      if (emp.getCuil().getValue() === cuil && emp.tenantId === tenantId) {
        return emp;
      }
    }
    return null;
  }

  public async findByDni(dni: string, tenantId: string): Promise<Empleado | null> {
    for (const emp of this.empleados.values()) {
      if (emp.getDni() === dni && emp.tenantId === tenantId) {
        return emp;
      }
    }
    return null;
  }

  public async findAllByEmpresa(clienteId: string, tenantId: string): Promise<Empleado[]> {
    return Array.from(this.empleados.values()).filter(
      e => e.clienteId === clienteId && e.tenantId === tenantId
    );
  }

  public async findLastLegajo(clienteId: string, tenantId: string): Promise<string | null> {
    const list = Array.from(this.empleados.values()).filter(
      e => e.clienteId === clienteId && e.tenantId === tenantId
    );
    if (list.length === 0) return null;
    let maxVal = -1;
    let maxStr = "";
    for (const emp of list) {
      const legajo = emp.getVersiones()[0].legajo;
      const val = parseInt(legajo, 10);
      if (!isNaN(val) && val > maxVal) {
        maxVal = val;
        maxStr = legajo;
      }
    }
    return maxVal === -1 ? null : maxStr;
  }

  public async save(empleado: Empleado): Promise<void> {
    this.empleados.set(empleado.id, empleado);
  }
}

export class InMemoryLiquidacionRepository implements ILiquidacionRepository {
  private liquidaciones = new Map<string, Liquidacion>();

  public async findById(id: string, tenantId: string): Promise<Liquidacion | null> {
    const liq = this.liquidaciones.get(id);
    if (liq && liq.tenantId === tenantId) return liq;
    return null;
  }

  public async findByUniqueKeys(
    clienteId: string,
    periodo: Periodo,
    quincena: number,
    tipo: string,
    tenantId: string
  ): Promise<Liquidacion | null> {
    for (const liq of this.liquidaciones.values()) {
      if (
        liq.clienteId === clienteId &&
        liq.getPeriodo().equals(periodo) &&
        liq.quincena === quincena &&
        liq.tipo === tipo &&
        liq.tenantId === tenantId
      ) {
        return liq;
      }
    }
    return null;
  }

  public async findAllByEmpresa(clienteId: string, tenantId: string): Promise<Liquidacion[]> {
    return Array.from(this.liquidaciones.values()).filter(
      l => l.clienteId === clienteId && l.tenantId === tenantId
    );
  }

  public async save(liquidacion: Liquidacion): Promise<void> {
    this.liquidaciones.set(liquidacion.id, liquidacion);
  }
}

export class InMemoryConvenioRepository implements IConvenioRepository {
  private convenios = new Map<string, Convenio>();

  public async findById(id: string, tenantId: string): Promise<Convenio | null> {
    const conv = this.convenios.get(id);
    if (conv && conv.tenantId === tenantId) return conv;
    return null;
  }

  public async findByVersionId(versionId: string, tenantId: string): Promise<Convenio | null> {
    for (const conv of this.convenios.values()) {
      if (conv.tenantId === tenantId && conv.getVersiones().some(v => v.id === versionId)) {
        return conv;
      }
    }
    return null;
  }

  public async findByNumero(numero: string, tenantId: string): Promise<Convenio | null> {
    for (const conv of this.convenios.values()) {
      if (conv.numero === numero && conv.tenantId === tenantId) return conv;
    }
    return null;
  }

  public async findAll(tenantId: string): Promise<Convenio[]> {
    return Array.from(this.convenios.values()).filter(c => c.tenantId === tenantId);
  }

  public async save(convenio: Convenio): Promise<void> {
    this.convenios.set(convenio.id, convenio);
  }
}

export class InMemoryConceptoRepository implements IConceptoRepository {
  private conceptos = new Map<string, Concepto>();

  public async findById(id: string, tenantId: string): Promise<Concepto | null> {
    const conc = this.conceptos.get(id);
    if (conc && conc.tenantId === tenantId) return conc;
    return null;
  }

  public async findByCodigo(codigo: string, tenantId: string): Promise<Concepto | null> {
    for (const conc of this.conceptos.values()) {
      if (conc.codigo === codigo && conc.tenantId === tenantId) return conc;
    }
    return null;
  }

  public async findAll(tenantId: string): Promise<Concepto[]> {
    return Array.from(this.conceptos.values()).filter(c => c.tenantId === tenantId);
  }

  public async save(concepto: Concepto): Promise<void> {
    this.conceptos.set(concepto.id, concepto);
  }
}
