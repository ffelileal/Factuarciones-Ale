import assert from 'assert';
import { InMemoryEmpresaRepository, InMemoryEmpleadoRepository } from './InMemoryRepositories';
import { RegistrarEmpleado } from '../application/use-cases/RegistrarEmpleado';
import { Cliente } from '../domain/entities/Cliente';
import { Cuit } from '../domain/value-objects/Cuit';
import { ArgentineTaxHelper } from '../domain/services/ArgentineTaxHelper';

async function runTests() {
  console.log("=== Iniciando Verificación de Unidad y Helpers ===");

  const empleadoRepo = new InMemoryEmpleadoRepository();
  const clienteRepo = new InMemoryEmpresaRepository();
  const useCase = new RegistrarEmpleado(empleadoRepo, clienteRepo);

  const tenantId = 'ten-test';
  const clienteId = 'cli-test';

  // 1. CUIL Calculations
  console.log("[Test] Calculando CUIL Masculino...");
  const cuilM = ArgentineTaxHelper.calcularCuil('36123456', 'M');
  assert.strictEqual(cuilM, '20-36123456-2');

  console.log("[Test] Calculando CUIL Femenino...");
  const cuilF = ArgentineTaxHelper.calcularCuil('36123456', 'F');
  assert.strictEqual(cuilF, '27-36123456-7');

  console.log("[Test] Buscando un DNI que requiera corrección de CUIL (dígito 10)...");
  let correctionDni = "";
  let expectedCuil = "";
  for (let i = 30000000; i < 30000500; i++) {
    const dniStr = i.toString();
    try {
      const cuil = ArgentineTaxHelper.calcularCuil(dniStr, 'M');
      if (cuil.startsWith('23-')) {
        correctionDni = dniStr;
        expectedCuil = cuil;
        break;
      }
    } catch {}
  }
  console.log(`[Test] DNI encontrado para corrección: ${correctionDni} -> CUIL: ${expectedCuil}`);
  assert.ok(expectedCuil.startsWith('23-'));

  // 2. CBU Validation
  console.log("[Test] Validando CBU correcto...");
  const validCbu = '0170099228400001100024';
  assert.strictEqual(ArgentineTaxHelper.isValidCbu(validCbu), true);

  console.log("[Test] Validando CBU incorrecto...");
  const invalidCbu = '0070001220000098765431';
  assert.strictEqual(ArgentineTaxHelper.isValidCbu(invalidCbu), false);

  // 3. RegistrarEmpleado execution
  console.log("[Test] Creando cliente con secuencia de legajo configurada...");
  const client = Cliente.create(clienteId, tenantId, Cuit.create('30709876542'), {
    validFrom: new Date('2026-01-01'),
    validTo: new Date('9999-12-31'),
    razonSocial: 'Estudio de Prueba S.A.',
    nombreFantasia: 'Estudio Prueba',
    inicioActividades: new Date('2020-01-01'),
    actividadesSecundarias: null,
    jurisdiccion: 'Buenos Aires',
    ingresosBrutos: '901-123456-9',
    art: 'Prevención ART',
    cuentaBancaria: 'Cta Cte',
    cbu: '0070001220000022334455',
    alias: 'prueba.alias',
    tipoSocietario: 'S.A.',
    condicionIva: 'Responsable Inscripto',
    actividadPrincipal: 'Servicios',
    codigoAfip: '620200',
    legalAddress: 'Address',
    fiscalAddress: 'Address',
    provincia: 'Buenos Aires',
    localidad: 'CABA',
    codigoPostal: '1000',
    email: 'info@test.com.ar',
    telefono: '123',
    estado: 'ACTIVO',
    updatedBy: 'system',
    tipoCliente: 'Empresa',
    primerLegajo: 15,
    digitosLegajo: 4
  });
  await clienteRepo.save(client);

  console.log("[Test] Registrando primer legajo (secuencia inicial)...");
  const res1 = await useCase.execute({
    tenantId,
    clienteId,
    usuarioId: 'user-op',
    nombre: 'Juan',
    apellido: 'Perez',
    dni: '36123456',
    sexo: 'M',
    fechaNacimiento: new Date('1994-08-20'),
    fechaIngreso: new Date('2025-01-01'),
    convenioVersionId: 'conv-ver-1',
    categoriaId: 'cat-adm-a',
    cbu: '0170099228400001100024'
  });

  assert.strictEqual(res1.isSuccess, true);
  const emp1 = res1.value!;
  assert.strictEqual(emp1.getDni(), '36123456');
  assert.strictEqual(emp1.getCuil().getValue(), '20361234562');
  assert.strictEqual(emp1.getVersiones()[0].legajo, '0015');

  console.log("[Test] Registrando segundo legajo (secuencia incremental)...");
  const res2 = await useCase.execute({
    tenantId,
    clienteId,
    usuarioId: 'user-op',
    nombre: 'Maria',
    apellido: 'Gomez',
    dni: '28123456',
    sexo: 'F',
    fechaNacimiento: new Date('1988-02-14'),
    fechaIngreso: new Date('2025-01-01'),
    convenioVersionId: 'conv-ver-1',
    categoriaId: 'cat-adm-a'
  });

  assert.strictEqual(res2.isSuccess, true);
  assert.strictEqual(res2.value!.getVersiones()[0].legajo, '0016');

  console.log("[Test] Validando unicidad de DNI...");
  const res3 = await useCase.execute({
    tenantId,
    clienteId,
    usuarioId: 'user-op',
    nombre: 'Juan Duplicate',
    apellido: 'Perez',
    dni: '36123456',
    sexo: 'M',
    fechaNacimiento: new Date('1994-08-20'),
    fechaIngreso: new Date('2025-01-01'),
    convenioVersionId: 'conv-ver-1',
    categoriaId: 'cat-adm-a'
  });

  assert.strictEqual(res3.isSuccess, false);
  assert.ok(res3.error?.includes('ya se encuentra registrado'));

  console.log("=== TESTS DE UNIDAD COMPLETADOS CON ÉXITO ===");
}

runTests().catch(err => {
  console.error("Fallo de aserciones en test de unidad:", err);
  process.exit(1);
});
