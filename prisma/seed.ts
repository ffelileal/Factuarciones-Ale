import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({
    url: process.env.DATABASE_URL || "file:./dev.db"
  })
} as any);

async function main() {
  console.log('--- CLEANING DATABASE ---');
  await prisma.reciboDetalle.deleteMany({});
  await prisma.reciboSueldo.deleteMany({});
  await prisma.liquidacion.deleteMany({});
  await prisma.documentoCliente.deleteMany({});
  await prisma.novedadMensual.deleteMany({});
  await prisma.vacacion.deleteMany({});
  await prisma.embargo.deleteMany({});
  await prisma.empleadoVersion.deleteMany({});
  await prisma.empleado.deleteMany({});
  await prisma.categoria.deleteMany({});
  await prisma.escalaSalarial.deleteMany({});
  await prisma.conceptoVersion.deleteMany({});
  await prisma.concepto.deleteMany({});
  await prisma.convenioVersion.deleteMany({});
  await prisma.convenio.deleteMany({});
  await prisma.obraSocialVersion.deleteMany({});
  await prisma.obraSocial.deleteMany({});
  await prisma.sindicatoVersion.deleteMany({});
  await prisma.sindicato.deleteMany({});
  await prisma.sucursal.deleteMany({});
  await prisma.clienteVersion.deleteMany({});
  await prisma.cliente.deleteMany({});
  await prisma.tenantUser.deleteMany({});
  await prisma.tenant.deleteMany({});

  console.log('--- SEEDING SYSTEM DATA ---');

  const tenantId = 'ten-001';
  const userId = 'usr-001';

  // 1. Seed Tenant
  await prisma.tenant.create({
    data: {
      id: tenantId,
      nombre: 'Estudio Contable Pérez & Asoc.',
      subdominio: 'perez-asoc',
      estado: 'ACTIVO',
      featureFlags: JSON.stringify(['afip-sync']),
    },
  });

  // 2. Seed Sindicato and Obra Social
  const syndId = 'synd-comercio';
  await prisma.sindicato.create({ data: { id: syndId, tenantId, codigo: 'SEC' } });
  await prisma.sindicatoVersion.create({
    data: {
      id: 'synd-comercio-ver-1',
      tenantId,
      sindicatoId: syndId,
      version: 1,
      validFrom: new Date('2000-01-01'),
      validTo: new Date('9999-12-31'),
      nombre: 'Sindicato Empleados de Comercio',
      porcentajeAporte: 2.0,
      porcentajeContribucion: 1.0,
      estado: 'ACTIVO',
      updatedBy: userId,
    },
  });

  const osId = 'os-comercio';
  await prisma.obraSocial.create({ data: { id: osId, tenantId, codigo: 'OSECAC' } });
  await prisma.obraSocialVersion.create({
    data: {
      id: 'os-001',
      tenantId,
      obraSocialId: osId,
      version: 1,
      validFrom: new Date('2000-01-01'),
      validTo: new Date('9999-12-31'),
      nombre: 'Obra Social de Empleados de Comercio',
      porcentajeAporte: 3.0,
      porcentajeContribucion: 6.0,
      estado: 'ACTIVO',
      updatedBy: userId,
    },
  });

  // 3. Seed Clients
  const client1Id = 'emp-001';
  await prisma.cliente.create({ data: { id: client1Id, tenantId, cuit: '20301234563' } });
  await prisma.clienteVersion.create({
    data: {
      id: 'cli-ver-1',
      tenantId,
      clienteId: client1Id,
      version: 1,
      validFrom: new Date('2026-01-01'),
      validTo: new Date('9999-12-31'),
      razonSocial: 'Sistemas Corporativos S.A.',
      nombreFantasia: 'SisCorp S.A.',
      inicioActividades: new Date('2018-03-01'),
      jurisdiccion: 'CABA',
      ingresosBrutos: '901-789012-3',
      art: 'Asociart ART',
      cuentaBancaria: 'Cta Cte $ HSBC',
      cbu: '1500001220000011223344',
      alias: 'siscorp.nomina.sueldos',
      tipoSocietario: 'S.A.',
      condicionIva: 'Responsable Inscripto',
      actividadPrincipal: 'Servicios de Consultoría Informática',
      codigoAfip: '620200',
      legalAddress: 'Av. de Mayo 650, Piso 4',
      fiscalAddress: 'Av. de Mayo 650, Piso 4',
      provincia: 'Buenos Aires',
      localidad: 'CABA',
      codigoPostal: '1084',
      email: 'rrhh@siscorp.com.ar',
      telefono: '011-5234-5678',
      estado: 'ACTIVO',
      tipoCliente: 'Empresa',
      updatedBy: userId,
    },
  });

  const client2Id = 'emp-002';
  await prisma.cliente.create({ data: { id: client2Id, tenantId, cuit: '30709876542' } });
  await prisma.clienteVersion.create({
    data: {
      id: 'cli-ver-2',
      tenantId,
      clienteId: client2Id,
      version: 1,
      validFrom: new Date('2026-01-01'),
      validTo: new Date('9999-12-31'),
      razonSocial: 'Panadería San José (Estela Maris Gómez)',
      nombreFantasia: 'Panadería San José',
      inicioActividades: new Date('2020-11-15'),
      jurisdiccion: 'Buenos Aires',
      ingresosBrutos: '902-123456-9',
      art: 'Prevención ART',
      cuentaBancaria: 'Cta Cte $ Galicia',
      cbu: '0070001220000022334455',
      alias: 'sanjose.sueldos.alias',
      tipoSocietario: 'Persona Física',
      condicionIva: 'Monotributista',
      actividadPrincipal: 'Elaboración y Venta de Panificados',
      codigoAfip: '107111',
      legalAddress: 'Calle 14 Nro 890, Pilar',
      fiscalAddress: 'Calle 14 Nro 890, Pilar',
      provincia: 'Buenos Aires',
      localidad: 'Pilar',
      codigoPostal: '1629',
      email: 'finanzas@panaderiasanjose.com.ar',
      telefono: '0230-456-7890',
      estado: 'ACTIVO',
      tipoCliente: 'Monotributista',
      updatedBy: userId,
    },
  });

  // 4. Seed Sucursal
  const sucId = 'suc-001';
  await prisma.sucursal.create({
    data: {
      id: sucId,
      tenantId,
      clienteId: client1Id,
      nombre: 'Sede Central CABA',
      domicilio: 'Av. de Mayo 650',
      fechaApertura: new Date('2018-03-01'),
    },
  });

  // 5. Seed Documents
  await prisma.documentoCliente.create({
    data: {
      id: 'doc-1',
      clienteId: client1Id,
      nombre: 'Contrato de Servicios Profesionales',
      tipo: 'Contrato',
      url: '/uploads/contrato_siscorp.pdf',
      fileName: 'contrato_siscorp.pdf',
    },
  });
  await prisma.documentoCliente.create({
    data: {
      id: 'doc-2',
      clienteId: client2Id,
      nombre: 'Certificado MiPyME Vigente',
      tipo: 'MiPyME',
      url: '/uploads/mipyme_sanjose.pdf',
      fileName: 'mipyme_sanjose.pdf',
    },
  });

  // 6. Seed Convenio Comercio 130/75
  const convId = 'conv-130';
  await prisma.convenio.create({ data: { id: convId, tenantId, numero: '130/75' } });
  await prisma.convenioVersion.create({
    data: {
      id: 'conv-ver-1',
      tenantId,
      convenioId: convId,
      version: 1,
      validFrom: new Date('2000-01-01'),
      validTo: new Date('9999-12-31'),
      nombre: 'CCT Comercio 130/75',
      sindicatoId: syndId,
      tipoLiquidacion: 'MENSUAL',
      antiguedadPorc: 1.0,
      estado: 'ACTIVO',
      updatedBy: userId,
    },
  });

  const scaleId = 'scale-2026-07';
  await prisma.escalaSalarial.create({
    data: {
      id: scaleId,
      tenantId,
      convenioId: convId,
      periodo: '2026-07',
      fechaDesde: new Date('2026-07-01'),
      fechaHasta: new Date('2026-07-31'),
      resolucion: 'Resol. ST 45/26',
      version: 1,
    },
  });

  const catId = 'cat-adm-a';
  await prisma.categoria.create({
    data: {
      id: catId,
      escalaId: scaleId,
      nombre: 'Administrativo A',
      codigo: 'ADM-A',
      valorHora: 1136.36,
      valorMensual: 250000.0,
      valorJornada: 9090.9,
    },
  });

  // 7. Seed Conceptos (AST Formulas)
  await prisma.concepto.create({ data: { id: 'c-100', tenantId, codigo: '100' } });
  await prisma.conceptoVersion.create({
    data: {
      id: 'c-100-ver-1',
      tenantId,
      conceptoId: 'c-100',
      version: 1,
      validFrom: new Date('2000-01-01'),
      validTo: new Date('9999-12-31'),
      nombre: 'Sueldo Básico Conformado',
      tipo: 'REMUNERATIVO',
      formula: 'BASIC',
      ordenImpresion: 10,
      activo: true,
      codigoAfip: '110000',
      updatedBy: userId,
    },
  });

  await prisma.concepto.create({ data: { id: 'c-150', tenantId, codigo: '150' } });
  await prisma.conceptoVersion.create({
    data: {
      id: 'c-150-ver-1',
      tenantId,
      conceptoId: 'c-150',
      version: 1,
      validFrom: new Date('2000-01-01'),
      validTo: new Date('9999-12-31'),
      nombre: 'Adicional Antigüedad Convenio',
      tipo: 'REMUNERATIVO',
      formula: 'BASIC * ANTIGUEDAD_PORC / 100',
      ordenImpresion: 20,
      activo: true,
      codigoAfip: '120000',
      updatedBy: userId,
    },
  });

  await prisma.concepto.create({ data: { id: 'c-160', tenantId, codigo: '160' } });
  await prisma.conceptoVersion.create({
    data: {
      id: 'c-160-ver-1',
      tenantId,
      conceptoId: 'c-160',
      version: 1,
      validFrom: new Date('2000-01-01'),
      validTo: new Date('9999-12-31'),
      nombre: 'Horas Extras 50%',
      tipo: 'REMUNERATIVO',
      formula: 'VALOR_HORA * HORAS_EXTRAS_50 * 1.5',
      ordenImpresion: 30,
      activo: true,
      codigoAfip: '130000',
      updatedBy: userId,
    },
  });

  await prisma.concepto.create({ data: { id: 'c-500', tenantId, codigo: '500' } });
  await prisma.conceptoVersion.create({
    data: {
      id: 'c-500-ver-1',
      tenantId,
      conceptoId: 'c-500',
      version: 1,
      validFrom: new Date('2000-01-01'),
      validTo: new Date('9999-12-31'),
      nombre: 'Jubilación Ordinaria (SIPA 11%)',
      tipo: 'DESCUENTO',
      formula: 'REMUNERATIVO_TOTAL * 0.11',
      ordenImpresion: 100,
      activo: true,
      codigoAfip: '810000',
      updatedBy: userId,
    },
  });

  // 8. Seed Employees
  const emp1Id = 'emp-maria';
  await prisma.empleado.create({ data: { id: emp1Id, tenantId, clienteId: client1Id, cuil: '27351234569', dni: '35123456' } });
  
  const fIng1 = new Date();
  fIng1.setFullYear(fIng1.getFullYear() - 8);

  await prisma.empleadoVersion.create({
    data: {
      id: 'emp-ver-1',
      tenantId,
      empleadoId: emp1Id,
      version: 1,
      validFrom: new Date('2020-01-01'),
      validTo: new Date('9999-12-31'),
      legajo: '1002',
      apellido: 'González',
      nombre: 'María Luz',
      sexo: 'F',
      fechaNacimiento: new Date('1991-06-12'),
      estadoCivil: 'Soltera',
      nacionalidad: 'Argentina',
      direccion: 'Pampa 2345',
      provincia: 'Buenos Aires',
      localidad: 'CABA',
      codigoPostal: '1428',
      email: 'maria.gonzalez@siscorp.com.ar',
      telefono: '11-9876-5432',
      fechaIngreso: fIng1,
      tipoContrato: 'EFECTIVO',
      modalidad: 'TIEMPO_COMPLETO',
      sucursalId: sucId,
      convenioVersionId: 'conv-ver-1',
      categoriaId: catId,
      centroCosto: 'Administración',
      jornada: 'COMPLETA',
      horasSemanales: 44.0,
      obraSocialVersionId: 'os-001',
      sindicatoVersionId: 'synd-comercio-ver-1',
      banco: 'Banco Santander',
      cbu: '0850001220000098765432',
      alias: 'maria.siscorp.sueldo',
      formaPago: 'TRANSFERENCIA',
      estado: 'ACTIVO',
      afipCondicion: 'SERVICIOS',
      afipSituacionRevista: 'ACTIVO',
      afipCodigoModalidad: '001',
      afipCodigoActividad: '01',
      afipCodigoPuesto: 'ADMINISTRATIVO',
      updatedBy: userId,
    },
  });

  const emp2Id = 'emp-roberto';
  await prisma.empleado.create({ data: { id: emp2Id, tenantId, clienteId: client2Id, cuil: '20281234562', dni: '28123456' } });

  const fIng2 = new Date();
  fIng2.setFullYear(fIng2.getFullYear() - 3);

  await prisma.empleadoVersion.create({
    data: {
      id: 'emp-ver-2',
      tenantId,
      empleadoId: emp2Id,
      version: 1,
      validFrom: new Date('2023-01-01'),
      validTo: new Date('9999-12-31'),
      legajo: '2001',
      apellido: 'Gómez',
      nombre: 'Roberto Carlos',
      sexo: 'M',
      fechaNacimiento: new Date('1988-02-14'),
      estadoCivil: 'Casado',
      nacionalidad: 'Argentino',
      direccion: 'Hipólito Yrigoyen 410',
      provincia: 'Buenos Aires',
      localidad: 'Pilar',
      codigoPostal: '1629',
      email: 'roberto.gomez@distriplata.com.ar',
      telefono: '11-3456-7890',
      fechaIngreso: fIng2,
      tipoContrato: 'EFECTIVO',
      modalidad: 'TIEMPO_COMPLETO',
      sucursalId: sucId,
      convenioVersionId: 'conv-ver-1',
      categoriaId: catId,
      centroCosto: 'Depósito Mayorista',
      jornada: 'COMPLETA',
      horasSemanales: 44.0,
      obraSocialVersionId: 'os-001',
      banco: 'Banco Nación',
      cbu: '0110001220000077665544',
      alias: 'roberto.distriplata.sueldo',
      formaPago: 'TRANSFERENCIA',
      estado: 'ACTIVO',
      afipCondicion: 'SERVICIOS',
      afipSituacionRevista: 'ACTIVO',
      afipCodigoModalidad: '001',
      afipCodigoActividad: '01',
      afipCodigoPuesto: 'OPERARIO',
      updatedBy: userId,
    },
  });

  console.log('--- SEED COMPLETED SUCCESSFULLY ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
