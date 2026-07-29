import { ArgentinaPayrollProvider } from '../infrastructure/providers/ArgentinaPayrollProvider';
import { RegistrarTenantCliente } from '../application/use-cases/RegistrarTenantCliente';
import { LiquidarPeriodoMasivo } from '../application/use-cases/LiquidarPeriodoMasivo';
import { GenerarRectificativa } from '../application/use-cases/GenerarRectificativa';
import { Cuit } from '../domain/value-objects/Cuit';
import { Cuil } from '../domain/value-objects/Cuil';
import { Periodo } from '../domain/value-objects/Periodo';
import { Money } from '../domain/value-objects/Money';
import { Percentage } from '../domain/value-objects/Percentage';
import { Concepto, ConceptoVersion } from '../domain/entities/Concepto';
import { Convenio, ConvenioVersion, EscalaSalarial, Categoria } from '../domain/entities/Convenio';
import { Sindicato, SindicatoVersion } from '../domain/entities/Sindicato';
import { ObraSocial, ObraSocialVersion } from '../domain/entities/ObraSocial';
import { Empleado, NovedadMensual } from '../domain/entities/Empleado';
import { Sucursal } from '../domain/entities/Cliente';
import { Decimal } from 'decimal.js';

import {
  InMemoryTenantRepository,
  InMemoryEmpresaRepository,
  InMemoryEmpleadoRepository,
  InMemoryLiquidacionRepository,
  InMemoryConvenioRepository,
  InMemoryConceptoRepository
} from './InMemoryRepositories';

async function executeE2EFlow(
  tenantRepo: any,
  empresaRepo: any,
  empleadoRepo: any,
  liquidacionRepo: any,
  convenioRepo: any,
  conceptoRepo: any,
  isDbRun: boolean,
  prismaClient: any
) {
  const provider = new ArgentinaPayrollProvider();

  // 1. Execute Tenant and Cliente Registration Use Case
  const registrarUseCase = new RegistrarTenantCliente(tenantRepo, empresaRepo);
  const registrarRes = await registrarUseCase.execute({
    nombreTenant: "Estudio Contable Pérez",
    subdominio: "perez",
    cuit: "20301234563", 
    razonSocial: "Cliente Cliente de Prueba S.A.",
    inicioActividades: new Date('2020-01-01T00:00:00.000Z'),
    tipoSocietario: "S.A.",
    condicionIva: "Responsable Inscripto",
    actividadPrincipal: "Servicios Generales",
    codigoAfip: "91000",
    legalAddress: "Av. Cabildo 123",
    fiscalAddress: "Av. Cabildo 123",
    provincia: "CABA",
    localidad: "CABA",
    codigoPostal: "1426",
    email: "perez@estudio.com"
  });

  if (!registrarRes.isSuccess) {
    throw new Error(`Error al registrar tenant/cliente: ${registrarRes.error}`);
  }

  const { tenantId, clienteId } = registrarRes.value;
  console.log(`[OK] Tenant '${tenantId}' y Cliente '${clienteId}' creados.`);

  // 2. Setup Sindicato and ObraSocial
  const syndId = Math.random().toString(36).substring(7);
  const syndVer = new SindicatoVersion({
    sindicatoId: syndId,
    version: 1,
    validFrom: new Date('2000-01-01'),
    validTo: new Date('9999-12-31'),
    nombre: "Sindicato de Comercio",
    porcentajeAporte: Percentage.create(2.0),
    porcentajeContribucion: Percentage.create(1.0),
    cbu: null,
    alias: null,
    estado: "ACTIVO",
    updatedBy: "user-test"
  });
  const sindicato = new Sindicato(syndId, tenantId, "SEC", [syndVer]);
  
  if (isDbRun && prismaClient) {
    await prismaClient.sindicato.create({ data: { id: syndId, tenantId, codigo: "SEC" } });
    await prismaClient.sindicatoVersion.create({
      data: {
        id: syndVer.id,
        tenantId,
        sindicatoId: syndId,
        version: 1,
        validFrom: syndVer.validFrom,
        validTo: syndVer.validTo,
        nombre: syndVer.nombre,
        porcentajeAporte: syndVer.porcentajeAporte.toDecimal(),
        porcentajeContribucion: syndVer.porcentajeContribucion.toDecimal(),
        estado: syndVer.estado,
        updatedBy: tenantId
      }
    });
  }

  const osId = Math.random().toString(36).substring(7);
  const osVer = new ObraSocialVersion({
    obraSocialId: osId,
    version: 1,
    validFrom: new Date('2000-01-01'),
    validTo: new Date('9999-12-31'),
    nombre: "OSECAC",
    porcentajeAporte: Percentage.create(3.0),
    porcentajeContribucion: Percentage.create(6.0),
    estado: "ACTIVO",
    updatedBy: "user-test"
  });
  const obraSocial = new ObraSocial(osId, tenantId, "400800", [osVer]);

  if (isDbRun && prismaClient) {
    await prismaClient.obraSocial.create({ data: { id: osId, tenantId, codigo: "400800" } });
    await prismaClient.obraSocialVersion.create({
      data: {
        id: osVer.id,
        tenantId,
        obraSocialId: osId,
        version: 1,
        validFrom: osVer.validFrom,
        validTo: osVer.validTo,
        nombre: osVer.nombre,
        porcentajeAporte: osVer.porcentajeAporte.toDecimal(),
        porcentajeContribucion: osVer.porcentajeContribucion.toDecimal(),
        estado: osVer.estado,
        updatedBy: tenantId
      }
    });
  }

  // 3. Setup Convenio with scale and categories
  const convId = Math.random().toString(36).substring(7);
  const convVerId = Math.random().toString(36).substring(7);
  const scaleId = Math.random().toString(36).substring(7);
  const catId = Math.random().toString(36).substring(7);

  const categoria = new Categoria(catId, scaleId, "Administrativo A", "ADM-A", Money.create(1136.36), Money.create(250000.00), Money.create(9090.90));
  const escala = new EscalaSalarial(scaleId, convId, "2026-07", new Date('2026-07-01'), new Date('2026-07-31'), "Resol. 123", null, null, 1, [categoria]);
  const convVer = new ConvenioVersion({
    convenioId: convId,
    version: 1,
    validFrom: new Date('2000-01-01'),
    validTo: new Date('9999-12-31'),
    nombre: "CCT Comercio 130/75",
    descripcion: "CCT Empleados de Comercio",
    sindicatoId: syndId,
    tipoLiquidacion: "MENSUAL",
    antiguedadPorc: Percentage.create(1.0), 
    estado: "ACTIVO",
    updatedBy: tenantId
  }, convVerId);

  const convenio = new Convenio(convId, tenantId, "130/75", [convVer], [escala]);
  console.log(`[TEST DEBUG] Instantiated category: ${categoria.id}, valorMensual: ${categoria.valorMensual.toString()}`);
  console.log(`[TEST DEBUG] Instantiated convVer: ${convVer.id}, antiguedadPorc: ${convVer.antiguedadPorc.toString()}`);
  await convenioRepo.save(convenio);
  console.log(`[OK] Convenio '130/75' y categoría 'Administrativo A' guardados.`);

  // 4. Setup Concepts (Basic, Antiguedad, Jubilacion)
  const basicId = Math.random().toString(36).substring(7);
  const basicVer = new ConceptoVersion({
    conceptoId: basicId,
    version: 1,
    validFrom: new Date('2000-01-01'),
    validTo: new Date('9999-12-31'),
    nombre: "Sueldo Básico",
    tipo: "REMUNERATIVO",
    formula: "BASIC",
    ordenImpresion: 10,
    activo: true,
    codigoAfip: "110000",
    updatedBy: tenantId
  });
  const basicConcept = new Concepto(basicId, tenantId, "100", [basicVer]);
  await conceptoRepo.save(basicConcept);

  const antId = Math.random().toString(36).substring(7);
  const antVer = new ConceptoVersion({
    conceptoId: antId,
    version: 1,
    validFrom: new Date('2000-01-01'),
    validTo: new Date('9999-12-31'),
    nombre: "Adicional Antigüedad",
    tipo: "REMUNERATIVO",
    formula: "BASIC * ANTIGUEDAD_PORC / 100",
    ordenImpresion: 20,
    activo: true,
    codigoAfip: "120000",
    updatedBy: tenantId
  });
  const antConcept = new Concepto(antId, tenantId, "150", [antVer]);
  await conceptoRepo.save(antConcept);

  const jubId = Math.random().toString(36).substring(7);
  const jubVer = new ConceptoVersion({
    conceptoId: jubId,
    version: 1,
    validFrom: new Date('2000-01-01'),
    validTo: new Date('9999-12-31'),
    nombre: "Jubilación 11%",
    tipo: "DESCUENTO",
    formula: "REMUNERATIVO_TOTAL * 0.11",
    ordenImpresion: 100,
    activo: true,
    codigoAfip: "810000",
    updatedBy: tenantId
  });
  const jubConcept = new Concepto(jubId, tenantId, "500", [jubVer]);
  await conceptoRepo.save(jubConcept);
  console.log(`[OK] Conceptos 100, 150 y 500 inicializados.`);

  // 5. Setup Employee with 8 years of seniority
  const empId = Math.random().toString(36).substring(7);
  const entryDate = new Date('2018-07-23T00:00:00.000Z');
  
  const sucursalId = Math.random().toString(36).substring(7);
  const empresaObj = await empresaRepo.findById(clienteId, tenantId);
  empresaObj.agregarSucursal(new Sucursal(sucursalId, "Central", "Av. Cabildo 123", null, null, new Date()));
  await empresaRepo.save(empresaObj);

  const empleado = Empleado.create(empId, tenantId, clienteId, Cuil.create("27351234569"), "35123456", {
    validFrom: new Date('2000-01-01'),
    validTo: new Date('9999-12-31'),
    legajo: "0001",
    apellido: "González",
    nombre: "María",
    sexo: "F",
    fechaNacimiento: new Date('1990-05-15'),
    estadoCivil: "Soltera",
    nacionalidad: "Argentina",
    direccion: "Av. Santa Fe 2345",
    provincia: "CABA",
    localidad: "CABA",
    codigoPostal: "1425",
    email: "maria@gonzalez.com",
    telefono: null,
    contactoEmergencia: null,
    grupoSanguineo: null,
    nivelEducativo: "Universitario",
    profesion: "Administrativa",
    discapacidad: false,
    licenciaConducir: null,
    fotoUrl: null,
    firmaUrl: null,
    fechaIngreso: entryDate,
    fechaEgreso: null,
    motivoBaja: null,
    tipoContrato: "Tiempo Indeterminado",
    modalidad: "Jornada Completa",
    sucursalId,
    convenioVersionId: convVerId,
    categoriaId: catId,
    centroCosto: "Administración",
    jornada: "Completa",
    horasSemanales: new Decimal(44),
    obraSocialVersionId: osVer.id,
    sindicatoVersionId: syndVer.id,
    banco: "Banco Galicia",
    cbu: "0070123456789012345678",
    alias: "maria.galicia",
    formaPago: "Transferencia",
    estado: "ACTIVO",
    seguroVida: false,
    seguroRetiro: false,
    uniformesEntregados: null,
    eppEntregados: null,
    cursosCapacitaciones: null,
    examenesPreocupacionales: null,
    afipEstado: "ACTIVO",
    afipAltaTemprana: true,
    afipBaja: false,
    afipCondicion: "1",
    afipSituacionRevista: "1",
    afipCodigoModalidad: "1",
    afipCodigoActividad: "1",
    afipCodigoPuesto: "1",
    updatedBy: tenantId
  });

  await empleadoRepo.save(empleado);

  const novelty = new NovedadMensual({
    periodo: Periodo.create("2026-07"),
    quincena: 0,
    horasNormales: new Decimal(176),
    horasExtras50: new Decimal(0),
    horasExtras100: new Decimal(0),
    feriadosTrabajados: new Decimal(0),
    horasNocturnas: new Decimal(0),
    ausencias: 0,
    llegadasTarde: 0,
    diasLicencia: 0,
    diasVacaciones: 0,
    adelantos: Money.zero(),
    bonos: Money.zero(),
    premios: Money.zero(),
    comisiones: Money.zero(),
    viaticos: Money.zero(),
    sancionesDescuento: Money.zero(),
    otrosDescuentos: Money.zero(),
    conceptosNoRem: Money.zero(),
    observaciones: null
  });

  empleado.cargarNovedadMensual(novelty);
  await empleadoRepo.save(empleado);
  console.log(`[OK] Empleada María González con legajo 0001 guardada.`);

  // 6. Execute Mass Payroll Run Use Case
  const engine = new LiquidarPeriodoMasivo(
    empresaRepo,
    empleadoRepo,
    liquidacionRepo,
    convenioRepo,
    conceptoRepo,
    provider
  );

  const calcRes = await engine.execute({
    tenantId,
    clienteId,
    periodoStr: "2026-07",
    quincena: 0,
    tipo: "MENSUAL",
    userId: tenantId,
    fechaPago: new Date('2026-08-04')
  });

  if (!calcRes.isSuccess) {
    throw new Error(`Error al calcular liquidación: ${calcRes.error}`);
  }

  console.log(`[OK] Liquidación masiva terminada. Recibos procesados: ${calcRes.value.recibosGenerados}`);

  // 7. Load and Assert Receipts values
  const liquidacion = await liquidacionRepo.findById(calcRes.value.liquidacionId, tenantId);
  if (!liquidacion) {
    throw new Error("No se encontró la liquidación persistida.");
  }

  const recibo = liquidacion.getRecibos()[0];
  if (!recibo) {
    throw new Error("No se generó el recibo de sueldo.");
  }

  console.log("\n--- Valores del Recibo Calculados ---");
  console.log(`Básico Categoría: $${recibo.basicoAplicado.toString()}`);
  console.log(`Años de Antigüedad: ${recibo.antiguedadAnos} años`);
  console.log(`Total Remunerativo: $${recibo.totalRemunerativo.toString()}`);
  console.log(`Total Descuentos: $${recibo.totalDescuentos.toString()}`);
  console.log(`Neto a Cobrar: $${recibo.totalNeto.toString()}`);

  // Assertions
  const expectedRem = Money.create(270000.00); 
  const expectedDesc = Money.create(29700.00); 
  const expectedNet = Money.create(240300.00); 

  if (!recibo.totalRemunerativo.equals(expectedRem)) {
    throw new Error(`Aporte remunerativo incorrecto. Esperado: ${expectedRem.toString()}, Obtenido: ${recibo.totalRemunerativo.toString()}`);
  }

  if (!recibo.totalDescuentos.equals(expectedDesc)) {
    throw new Error(`Descuentos incorrectos. Esperado: ${expectedDesc.toString()}, Obtenido: ${recibo.totalDescuentos.toString()}`);
  }

  if (!recibo.totalNeto.equals(expectedNet)) {
    throw new Error(`Neto incorrecto. Esperado: ${expectedNet.toString()}, Obtenido: ${recibo.totalNeto.toString()}`);
  }

  console.log("[PASS] Las aserciones de cálculo coinciden de forma exacta.");

  // 8. Test Rectificativas
  const rectificadora = new GenerarRectificativa(liquidacionRepo, empleadoRepo);
  const rectRes = await rectificadora.execute({
    tenantId,
    clienteId,
    reciboOriginalId: recibo.id,
    userId: tenantId,
    nuevasNovedadesPatch: {},
    fechaPago: new Date('2026-08-10')
  });

  if (!rectRes.isSuccess) {
    throw new Error(`Error al generar rectificación de recibo: ${rectRes.error}`);
  }

  console.log(`[OK] Recibo rectificativo generado correctly, id: ${rectRes.value.reciboRectificativoId}`);

  const rectLiq = await liquidacionRepo.findByUniqueKeys(clienteId, Periodo.create("2026-07"), 0, 'RECTIFICATIVA', tenantId);
  const rectRecibo = rectLiq?.getRecibos()[0];

  if (!rectRecibo) {
    throw new Error("No se guardó el recibo rectificado en persistencia.");
  }

  if (rectRecibo.rectificaReciboId !== recibo.id) {
    throw new Error(`El recibo rectificativo no posee la clave del original. Esperado: ${recibo.id}, Obtenido: ${rectRecibo.rectificaReciboId}`);
  }

  console.log(`[PASS] Trazabilidad histórica verificada: El recibo de ajuste apunta correctamente al original.`);
}

async function runTests() {
  console.log("=== Iniciando Verificación de Integración ===");

  let runWithDatabase = false;
  let dbPrisma: any = null;

  try {
    // Attempt dynamic database connection check
    const clientModule = await import('../infrastructure/database/client');
    dbPrisma = clientModule.default;
    await dbPrisma.$connect();
    runWithDatabase = true;
    console.log("[DATABASE] Conexión establecida con PostgreSQL. Corriendo test sobre Base de Datos Real.");
  } catch (err: any) {
    console.log(`[DATABASE] No se pudo inicializar o conectar a la base de datos:`);
    console.log(`           ${err.message.split('\n')[0]}`);
    console.log("[FALLBACK] Utilizando Repositorios InMemory en Memoria para validar la capa de negocio.");
  }

  if (runWithDatabase && dbPrisma) {
    try {
      await dbPrisma.reciboDetalle.deleteMany({});
      await dbPrisma.reciboSueldo.deleteMany({});
      await dbPrisma.liquidacion.deleteMany({});
      await dbPrisma.documentoCliente.deleteMany({});
      await dbPrisma.novedadMensual.deleteMany({});
      await dbPrisma.vacacion.deleteMany({});
      await dbPrisma.embargo.deleteMany({});
      await dbPrisma.empleadoVersion.deleteMany({});
      await dbPrisma.empleado.deleteMany({});
      await dbPrisma.categoria.deleteMany({});
      await dbPrisma.escalaSalarial.deleteMany({});
      await dbPrisma.conceptoVersion.deleteMany({});
      await dbPrisma.concepto.deleteMany({});
      await dbPrisma.convenioVersion.deleteMany({});
      await dbPrisma.convenio.deleteMany({});
      await dbPrisma.obraSocialVersion.deleteMany({});
      await dbPrisma.obraSocial.deleteMany({});
      await dbPrisma.sindicatoVersion.deleteMany({});
      await dbPrisma.sindicato.deleteMany({});
      await dbPrisma.sucursal.deleteMany({});
      await dbPrisma.clienteVersion.deleteMany({});
      await dbPrisma.cliente.deleteMany({});
      await dbPrisma.tenantUser.deleteMany({});
      await dbPrisma.tenant.deleteMany({});
      
      const tenantModule = await import('../infrastructure/database/repositories/PrismaTenantRepository');
      const empresaModule = await import('../infrastructure/database/repositories/PrismaClienteRepository');
      const empleadoModule = await import('../infrastructure/database/repositories/PrismaEmpleadoRepository');
      const liquidacionModule = await import('../infrastructure/database/repositories/PrismaLiquidacionRepository');
      const convenioModule = await import('../infrastructure/database/repositories/PrismaConvenioRepository');
      const conceptoModule = await import('../infrastructure/database/repositories/PrismaConceptoRepository');

      const tenantRepo = new tenantModule.PrismaTenantRepository();
      const empresaRepo = new empresaModule.PrismaClienteRepository();
      const empleadoRepo = new empleadoModule.PrismaEmpleadoRepository();
      const liquidacionRepo = new liquidacionModule.PrismaLiquidacionRepository();
      const convenioRepo = new convenioModule.PrismaConvenioRepository();
      const conceptoRepo = new conceptoModule.PrismaConceptoRepository();

      await executeE2EFlow(tenantRepo, empresaRepo, empleadoRepo, liquidacionRepo, convenioRepo, conceptoRepo, true, dbPrisma);
      console.log("\n=== TEST DE INTEGRACIÓN CON BASE DE DATOS FINALIZADO EXITOSAMENTE ===");
    } catch (e: any) {
      console.error("\n[FAIL] El test de integración en base de datos falló:", e.message);
      process.exit(1);
    }
  } else {
    // In Memory Run
    try {
      const tenantRepo = new InMemoryTenantRepository();
      const empresaRepo = new InMemoryEmpresaRepository();
      const empleadoRepo = new InMemoryEmpleadoRepository();
      const liquidacionRepo = new InMemoryLiquidacionRepository();
      const convenioRepo = new InMemoryConvenioRepository();
      const conceptoRepo = new InMemoryConceptoRepository();

      await executeE2EFlow(tenantRepo, empresaRepo, empleadoRepo, liquidacionRepo, convenioRepo, conceptoRepo, false, null);
      console.log("\n=== TEST DE INTEGRACIÓN IN-MEMORY FINALIZADO EXITOSAMENTE ===");
    } catch (e: any) {
      console.error("\n[FAIL] El test in-memory falló:", e.message);
      process.exit(1);
    }
  }
}

runTests();
