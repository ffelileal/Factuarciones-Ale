import { ITenantRepository } from '@/domain/repositories/ITenantRepository';
import { IClienteRepository } from '@/domain/repositories/IClienteRepository';
import { Tenant } from '@/domain/entities/Tenant';
import { PayrollFactories } from '@/domain/factories/PayrollFactories';
import { Result } from '@/domain/utils/Result';

export interface RegistrarTenantEmpresaCommand {
  nombreTenant: string;
  subdominio: string;
  cuit: string;
  razonSocial: string;
  inicioActividades: Date;
  tipoSocietario: string;
  condicionIva: string;
  actividadPrincipal: string;
  codigoAfip: string;
  legalAddress: string;
  fiscalAddress: string;
  provincia: string;
  localidad: string;
  codigoPostal: string;
  email: string;
}

export class RegistrarTenantCliente {
  public constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly empresaRepo: IClienteRepository
  ) {}

  public async execute(command: RegistrarTenantEmpresaCommand): Promise<Result<{ tenantId: string; clienteId: string }>> {
    try {
      // 1. Verify subdomain uniqueness
      const existingTenant = await this.tenantRepo.findBySubdomain(command.subdominio.toLowerCase());
      if (existingTenant) {
        return Result.fail("El subdominio ya está registrado en la plataforma.");
      }

      // 2. Create Tenant aggregate
      const tenantId = Math.random().toString(36).substring(7);
      const tenant = Tenant.create(tenantId, command.nombreTenant, command.subdominio);

      // 3. Create Cliente aggregate linked to Tenant
      const cliente = PayrollFactories.createEmpresa(
        tenant.id,
        command.cuit,
        command.razonSocial,
        command.inicioActividades,
        command.tipoSocietario,
        command.condicionIva,
        command.actividadPrincipal,
        command.codigoAfip,
        command.legalAddress,
        command.fiscalAddress,
        command.provincia,
        command.localidad,
        command.codigoPostal,
        command.email
      );

      // 4. Persist aggregates (Transaction mock or sequential execution)
      await this.tenantRepo.save(tenant);
      await this.empresaRepo.save(cliente);

      console.log(`[Use Case] Registro de Tenant '${command.nombreTenant}' y Cliente '${command.razonSocial}' completado con éxito.`);
      
      return Result.ok({ tenantId: tenant.id, clienteId: cliente.id });
    } catch (err: any) {
      return Result.fail(`Error al registrar el inquilino y la cliente: ${err.message}`);
    }
  }
}
