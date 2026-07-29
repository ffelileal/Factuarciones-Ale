"use client";

import React, { useState, useEffect } from 'react';
import { Money } from '@/domain/value-objects/Money';
import { Percentage } from '@/domain/value-objects/Percentage';
import { Cuit } from '@/domain/value-objects/Cuit';
import { Cuil } from '@/domain/value-objects/Cuil';
import { Periodo } from '@/domain/value-objects/Periodo';
import { Tenant, FeatureFlag } from '@/domain/entities/Tenant';
import { Cliente, ClienteVersion, Sucursal, DocumentoCliente } from '@/domain/entities/Cliente';
import { Empleado } from '@/domain/entities/Empleado';
import { Convenio, ConvenioVersion, EscalaSalarial, Categoria } from '@/domain/entities/Convenio';
import { Liquidacion, ReciboSueldo, ReciboDetalle } from '@/domain/entities/Liquidacion';
import { Concepto, ConceptoVersion } from '@/domain/entities/Concepto';
import { ArgentinaPayrollProvider } from '@/infrastructure/providers/ArgentinaPayrollProvider';
import { FormulaEvaluator } from '@/domain/services/formula/Evaluator';
import { Decimal } from 'decimal.js';
import { EmpleadoVersion, Embargo, Vacacion, NovedadMensual } from '@/domain/entities/Empleado';
import { ArgentineTaxHelper } from '@/domain/services/ArgentineTaxHelper';
import { loadInitialData, registrarEmpleadoAction, registrarClienteAction, softDeleteEmpleadoAction } from './actions';

// Reconstitution helper functions
function mapClienteDbToDomain(db: any): Cliente {
  const versiones = db.versiones.map((v: any) => new ClienteVersion({
    version: v.version,
    validFrom: new Date(v.validFrom),
    validTo: new Date(v.validTo),
    razonSocial: v.razonSocial,
    nombreFantasia: v.nombreFantasia,
    inicioActividades: new Date(v.inicioActividades),
    actividadesSecundarias: v.actividadesSecundarias,
    jurisdiccion: v.jurisdiccion,
    ingresosBrutos: v.ingresosBrutos,
    art: v.art,
    cuentaBancaria: v.cuentaBancaria,
    cbu: v.cbu,
    alias: v.alias,
    tipoSocietario: v.tipoSocietario,
    condicionIva: v.condicionIva,
    actividadPrincipal: v.actividadPrincipal,
    codigoAfip: v.codigoAfip,
    legalAddress: v.legalAddress,
    fiscalAddress: v.fiscalAddress,
    provincia: v.provincia,
    localidad: v.localidad,
    codigoPostal: v.codigoPostal,
    email: v.email,
    telefono: v.telefono,
    estado: v.estado,
    updatedBy: v.updatedBy,
    tipoCliente: v.tipoCliente,
    primerLegajo: v.primerLegajo,
    digitosLegajo: v.digitosLegajo
  }, v.id));

  const sucursales = db.sucursales.map((s: any) => new Sucursal(
    s.id,
    s.nombre,
    s.domicilio,
    s.telefono,
    s.responsable,
    new Date(s.fechaApertura)
  ));

  const documentos = db.documentos.map((d: any) => new DocumentoCliente(
    d.id,
    d.nombre,
    d.tipo,
    d.url,
    d.fileName
  ));

  return Cliente.reconstitute(
    db.id,
    db.tenantId,
    Cuit.create(db.cuit),
    versiones,
    sucursales,
    documentos
  );
}

function mapEmpleadoDbToDomain(db: any): Empleado {
  const versiones = db.versiones.map((v: any) => new EmpleadoVersion({
    version: v.version,
    validFrom: new Date(v.validFrom),
    validTo: new Date(v.validTo),
    legajo: v.legajo,
    apellido: v.apellido,
    nombre: v.nombre,
    sexo: v.sexo,
    fechaNacimiento: new Date(v.fechaNacimiento),
    estadoCivil: v.estadoCivil,
    nacionalidad: v.nacionalidad,
    direccion: v.direccion,
    provincia: v.provincia,
    localidad: v.localidad,
    codigoPostal: v.codigoPostal,
    email: v.email,
    telefono: v.telefono,
    contactoEmergencia: v.contactoEmergencia,
    grupoSanguineo: v.grupoSanguineo,
    nivelEducativo: v.nivelEducativo,
    profesion: v.profesion,
    discapacidad: v.discapacidad,
    licenciaConducir: v.licenciaConducir,
    fotoUrl: v.fotoUrl,
    firmaUrl: v.firmaUrl,
    fechaIngreso: new Date(v.fechaIngreso),
    fechaEgreso: v.fechaEgreso ? new Date(v.fechaEgreso) : null,
    motivoBaja: v.motivoBaja,
    tipoContrato: v.tipoContrato,
    modalidad: v.modalidad,
    sucursalId: v.sucursalId,
    convenioVersionId: v.convenioVersionId,
    categoriaId: v.categoriaId,
    centroCosto: v.centroCosto,
    jornada: v.jornada,
    horasSemanales: new Decimal(v.horasSemanales.toString()),
    obraSocialVersionId: v.obraSocialVersionId,
    sindicatoVersionId: v.sindicatoVersionId,
    banco: v.banco,
    cbu: v.cbu,
    alias: v.alias,
    formaPago: v.formaPago,
    estado: v.estado,
    seguroVida: v.seguroVida,
    seguroRetiro: v.seguroRetiro,
    uniformesEntregados: v.uniformesEntregados,
    eppEntregados: v.eppEntregados,
    cursosCapacitaciones: v.cursosCapacitaciones,
    examenesPreocupacionales: v.examenesPreocupacionales,
    afipEstado: v.afipEstado,
    afipAltaTemprana: v.afipAltaTemprana,
    afipBaja: v.afipBaja,
    afipCondicion: v.afipCondicion,
    afipSituacionRevista: v.afipSituacionRevista,
    afipCodigoModalidad: v.afipCodigoModalidad,
    afipCodigoActividad: v.afipCodigoActividad,
    afipCodigoPuesto: v.afipCodigoPuesto,
    updatedBy: v.updatedBy,
    deletedAt: v.deletedAt ? new Date(v.deletedAt) : null,
    deletedBy: v.deletedBy,
  }, v.id));

  const embargos = db.embargos.map((e: any) => new Embargo(
    e.id,
    e.juzgado,
    e.expediente,
    e.tipo,
    Money.create(e.montoFijo),
    Percentage.create(e.porcentaje),
    e.prioridad,
    new Date(e.fechaInicio),
    e.fechaFin ? new Date(e.fechaFin) : null,
    e.estado,
    e.observaciones
  ));

  const vacaciones = db.vacaciones.map((va: any) => new Vacacion(
    va.id,
    va.periodo,
    va.diasDisponibles,
    va.diasGozados,
    va.saldo,
    va.fechaInicio ? new Date(va.fechaInicio) : null,
    va.fechaFin ? new Date(va.fechaFin) : null,
    va.pagoAnticipado,
    va.estado
  ));

  const novedades = db.novedades.map((n: any) => new NovedadMensual({
    periodo: Periodo.create(n.periodo),
    quincena: n.quincena,
    horasNormales: new Decimal(n.horasNormales.toString()),
    horasExtras50: new Decimal(n.horasExtras50.toString()),
    horasExtras100: new Decimal(n.horasExtras100.toString()),
    feriadosTrabajados: new Decimal(n.feriadosTrabajados.toString()),
    horasNocturnas: new Decimal(n.horasNocturnas.toString()),
    ausencias: n.ausencias,
    llegadasTarde: n.llegadasTarde,
    diasLicencia: n.diasLicencia,
    diasVacaciones: n.diasVacaciones,
    adelantos: Money.create(n.adelantos),
    bonos: Money.create(n.bonos),
    premios: Money.create(n.premios),
    comisiones: Money.create(n.comisiones),
    viaticos: Money.create(n.viaticos),
    sancionesDescuento: Money.create(n.sancionesDescuento),
    otrosDescuentos: Money.create(n.otrosDescuentos),
    conceptosNoRem: Money.create(n.conceptosNoRem),
    observaciones: n.observaciones,
  }, n.id));

  return Empleado.reconstitute(
    db.id,
    db.tenantId,
    db.clienteId,
    Cuil.create(db.cuil),
    db.dni,
    versiones,
    embargos,
    vacaciones,
    novedades,
    db.deletedAt ? new Date(db.deletedAt) : null,
    db.deletedBy
  );
}

function mapConvenioDbToDomain(db: any): Convenio {
  const versiones = db.versiones.map((v: any) => new ConvenioVersion({
    convenioId: v.convenioId,
    version: v.version,
    validFrom: new Date(v.validFrom),
    validTo: new Date(v.validTo),
    nombre: v.nombre,
    descripcion: v.descripcion,
    sindicatoId: v.sindicatoId,
    tipoLiquidacion: v.tipoLiquidacion,
    antiguedadPorc: Percentage.create(v.antiguedadPorc),
    estado: v.estado,
    updatedBy: v.updatedBy,
  }, v.id));

  const escalas = db.escalas.map((esc: any) => {
    const categorias = esc.categorias.map((c: any) => new Categoria(
      c.id,
      c.escalaId,
      c.nombre,
      c.codigo,
      Money.create(c.valorHora),
      Money.create(c.valorMensual),
      Money.create(c.valorJornada)
    ));
    return new EscalaSalarial(
      esc.id,
      esc.convenioId,
      esc.periodo,
      new Date(esc.fechaDesde),
      new Date(esc.fechaHasta),
      esc.resolucion,
      esc.pdfOficial,
      esc.observaciones,
      esc.version,
      categorias
    );
  });

  return new Convenio(db.id, db.tenantId, db.numero, versiones, escalas);
}

function mapConceptoDbToDomain(db: any): Concepto {
  const versiones = db.versiones.map((v: any) => new ConceptoVersion({
    conceptoId: v.conceptoId,
    version: v.version,
    validFrom: new Date(v.validFrom),
    validTo: new Date(v.validTo),
    nombre: v.nombre,
    tipo: v.tipo,
    formula: v.formula,
    ordenImpresion: v.ordenImpresion,
    activo: v.activo,
    codigoAfip: v.codigoAfip,
    updatedBy: v.updatedBy,
  }, v.id));

  return new Concepto(db.id, db.tenantId, db.codigo, versiones);
}

export default function Home() {
  // Navigation State
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<
    'company-select' | 'dashboard' | 'clientes' | 'empleados' | 'convenios' | 'conceptos' | 'liquidaciones' | 'libro' | 'afip' | 'auditoria' | 'database'
  >('company-select');

  // Core Data State
  const [logs, setLogs] = useState<string[]>([]);
  const [tenant, setTenant] = useState<any>(null);
  const [clientes, setClientes] = useState<any[]>([]);
  const [empleados, setEmpleados] = useState<any[]>([]); // holds all employees with their associated clienteId
  const [convenio, setConvenio] = useState<any>(null);
  const [conceptos, setConceptos] = useState<any[]>([]);
  
  // Independent liquidations & rectificativas per client (keyed by clienteId)
  const [liquidaciones, setLiquidaciones] = useState<Record<string, any>>({});
  const [rectificados, setRectificados] = useState<Record<string, any[]>>({});
  
  // Interactive UI State
  const [selectedEmpleadoId, setSelectedEmpleadoId] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Custom Novelty Inputs (for active employee in calculation view)
  const [extraHours50, setExtraHours50] = useState<number>(10);
  const [extraHours100, setExtraHours100] = useState<number>(2);
  const [feriadosTrabajados, setFeriadosTrabajados] = useState<number>(1);

  // New Client Form State (ABM Client)
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [newCompRazonSocial, setNewCompRazonSocial] = useState('');
  const [newCompCuit, setNewCompCuit] = useState('');
  const [newCompFantasia, setNewCompFantasia] = useState('');
  const [newCompLegalAddress, setNewCompLegalAddress] = useState('');
  const [newCompActividad, setNewCompActividad] = useState('Servicios de Consultoría');
  const [newCompAFIP, setNewCompAFIP] = useState('620100');
  const [newCompCbu, setNewCompCbu] = useState('');
  const [newCompAlias, setNewCompAlias] = useState('');
  const [newCompTipoCliente, setNewCompTipoCliente] = useState('Empresa');
  const [newCompCondicionIva, setNewCompCondicionIva] = useState('Responsable Inscripto');
  const [newCompResponsable, setNewCompResponsable] = useState('Juan Pérez');
  const [newCompProvincia, setNewCompProvincia] = useState('Buenos Aires');
  const [newCompLocalidad, setNewCompLocalidad] = useState('CABA');
  const [newCompCP, setNewCompCP] = useState('1000');
  const [newCompTelefono, setNewCompTelefono] = useState('011-4567-8901');
  const [newCompEmail, setNewCompEmail] = useState('info@estudio.com.ar');
  const [newCompObservaciones, setNewCompObservaciones] = useState('');

  // Editing Client state
  const [editingClient, setEditingClient] = useState<any | null>(null);
  const [showEditClientModal, setShowEditClientModal] = useState(false);

  // New Employee Form State
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [newEmpLegajo, setNewEmpLegajo] = useState('');
  const [newEmpApellido, setNewEmpApellido] = useState('');
  const [newEmpNombre, setNewEmpNombre] = useState('');
  const [newEmpDni, setNewEmpDni] = useState('');
  const [newEmpCuil, setNewEmpCuil] = useState('');
  const [newEmpSexo, setNewEmpSexo] = useState('M');
  const [newEmpFechaNacimiento, setNewEmpFechaNacimiento] = useState('');
  const [newEmpFechaIngreso, setNewEmpFechaIngreso] = useState('');
  const [newEmpConvenio, setNewEmpConvenio] = useState('');
  const [newEmpCategoria, setNewEmpCategoria] = useState('');
  const [newEmpBasic, setNewEmpBasic] = useState('250000');
  const [newEmpAntiguedad, setNewEmpAntiguedad] = useState('0');
  const [newEmpBanco, setNewEmpBanco] = useState('');
  const [newEmpCbu, setNewEmpCbu] = useState('');
  const [newEmpAlias, setNewEmpAlias] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpTelefono, setNewEmpTelefono] = useState('');
  const [newEmpObservaciones, setNewEmpObservaciones] = useState('');

  // Editing Employee state
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
  const [showEditEmployeeModal, setShowEditEmployeeModal] = useState(false);

  // Document management (Categorized PDF/Image Uploads)
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [newDocNombre, setNewDocNombre] = useState('');
  const [newDocTipo, setNewDocTipo] = useState('Contrato');
  const [newDocFileName, setNewDocFileName] = useState('');

  // Vacations and Embargos Forms
  const [showVacationModal, setShowVacationModal] = useState(false);
  const [vacPeriodo, setVacPeriodo] = useState('2026');
  const [vacDias, setVacDias] = useState('14');
  const [vacFechaInicio, setVacFechaInicio] = useState('2026-07-01');

  const [showEmbargoModal, setShowEmbargoModal] = useState(false);
  const [embJuzgado, setEmbJuzgado] = useState('Juzgado Civil Nro 14');
  const [embExpediente, setEmbExpediente] = useState('EXP-89021/2025');
  const [embTipo, setEmbTipo] = useState('PORCENTAJE');
  const [embValor, setEmbValor] = useState('15');

  // Edit Scale basic salary state
  const [showEditScaleModal, setShowEditScaleModal] = useState(false);
  const [editBasicSalary, setEditBasicSalary] = useState('250000');

  // Log helper
  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${msg}`, ...prev]);
  };

  useEffect(() => {
    async function init() {
      addLog("Inicializando portal SaaS de liquidación para Estudio Contable...");
      const tenantId = "ten-001";
      const flagAfip = new FeatureFlag("afip-sync", true, "prod", 100, null);
      const newTenant = Tenant.create(tenantId, "Estudio Contable Pérez & Asoc.", "perez-asoc", "ACTIVO", [flagAfip]);
      setTenant(newTenant);

      const res = await loadInitialData(tenantId);
      if (res.success && res.data && res.data.clientes.length > 0) {
        const { clientes: dbClis, empleados: dbEmps, convenios: dbConvs, conceptos: dbCons, liquidaciones: dbLiqs, auditLogs } = res.data;
        
        const domainClis = dbClis.map(mapClienteDbToDomain);
        setClientes(domainClis);
        setSelectedEmpresaId(domainClis[0].id);
        addLog(`Cargados ${domainClis.length} clientes desde la base de datos.`);

        if (dbEmps && dbEmps.length > 0) {
          const domainEmps = dbEmps.map(mapEmpleadoDbToDomain);
          setEmpleados(domainEmps);
          addLog(`Cargados ${domainEmps.length} legajos desde la base de datos.`);
        }

        if (dbConvs && dbConvs.length > 0) {
          const domainConvs = dbConvs.map(mapConvenioDbToDomain);
          setConvenio(domainConvs[0]);
        }

        if (dbCons && dbCons.length > 0) {
          const domainCons = dbCons.map(mapConceptoDbToDomain);
          setConceptos(domainCons);
          if (domainCons.length > 0) {
            setSelectedConcept(domainCons[0]);
          }
        }
        
        if (auditLogs && auditLogs.length > 0) {
          setLogs(auditLogs.map((l: any) => `[${new Date(l.createdAt).toLocaleTimeString()}] [${l.action}] Record: ${l.recordId || ''} by ${l.userEmail || 'system'}`));
        }
      } else {
        addLog("No se encontraron datos en el servidor o falló la conexión. Sembrando datos locales...");
        try {
          const emp1 = Cliente.create("emp-001", tenantId, Cuit.create("20301234563"), {
            validFrom: new Date('2026-01-01'),
            validTo: new Date('9999-12-31'),
            razonSocial: "Sistemas Corporativos S.A.",
            nombreFantasia: "SisCorp S.A.",
            inicioActividades: new Date('2018-03-01'),
            actividadesSecundarias: null,
            jurisdiccion: "CABA",
            ingresosBrutos: "901-789012-3",
            art: "Asociart ART",
            cuentaBancaria: "Cta Cte $ HSBC",
            cbu: "1500001220000011223344",
            alias: "siscorp.nomina.sueldos",
            tipoSocietario: "S.A.",
            condicionIva: "Responsable Inscripto",
            actividadPrincipal: "Servicios de Consultoría Informática",
            codigoAfip: "620200",
            legalAddress: "Av. de Mayo 650, Piso 4",
            fiscalAddress: "Av. de Mayo 650, Piso 4",
            provincia: "Buenos Aires",
            localidad: "CABA",
            codigoPostal: "1084",
            email: "rrhh@siscorp.com.ar",
            telefono: "011-5234-5678",
            estado: "ACTIVO",
            updatedBy: "user-system",
            tipoCliente: "Empresa",
            primerLegajo: 1,
            digitosLegajo: 4
          }, [], [
            new DocumentoCliente("doc-1", "Contrato de Servicios Profesionales", "Contrato", "/uploads/contrato_siscorp.pdf", "contrato_siscorp.pdf"),
            new DocumentoCliente("doc-2", "Certificado de Cargas Sociales (F.931)", "AFIP", "/uploads/f931_AFIP.pdf", "f931_AFIP.pdf")
          ]);

          const emp2 = Cliente.create("emp-002", tenantId, Cuit.create("30709876542"), {
            validFrom: new Date('2026-01-01'),
            validTo: new Date('9999-12-31'),
            razonSocial: "Panadería San José (Estela Maris Gómez)",
            nombreFantasia: "Panadería San José",
            inicioActividades: new Date('2020-11-15'),
            actividadesSecundarias: null,
            jurisdiccion: "Buenos Aires",
            ingresosBrutos: "902-123456-9",
            art: "Prevención ART",
            cuentaBancaria: "Cta Cte $ Galicia",
            cbu: "0070001220000022334455",
            alias: "sanjose.sueldos.alias",
            tipoSocietario: "Persona Física",
            condicionIva: "Monotributista",
            actividadPrincipal: "Elaboración y Venta de Productos de Panadería",
            codigoAfip: "107111",
            legalAddress: "Calle 14 Nro 890, Pilar",
            fiscalAddress: "Calle 14 Nro 890, Pilar",
            provincia: "Buenos Aires",
            localidad: "Pilar",
            codigoPostal: "1629",
            email: "finanzas@panaderiasanjose.com.ar",
            telefono: "0230-456-7890",
            estado: "ACTIVO",
            updatedBy: "user-system",
            tipoCliente: "Monotributista",
            primerLegajo: 1,
            digitosLegajo: 4
          }, [], [
            new DocumentoCliente("doc-3", "Seguro de Accidentes Personales", "Seguro", "/uploads/poliza_seguro.pdf", "poliza_seguro.pdf"),
            new DocumentoCliente("doc-4", "Certificado MiPyME Vigente", "MiPyME", "/uploads/mipyme_sanjose.pdf", "mipyme_sanjose.pdf")
          ]);

          setClientes([emp1, emp2]);
          setSelectedEmpresaId("emp-001");

          const convId = "conv-130";
          const catId = "cat-adm-a";
          const scaleId = "scale-2026-07";

          const categoria = new Categoria(catId, scaleId, "Administrativo A", "ADM-A", Money.create(1136.36), Money.create(250000.00), Money.create(9090.90));
          const escala = new EscalaSalarial(scaleId, convId, "2026-07", new Date('2026-07-01'), new Date('2026-07-31'), "Resol. ST 45/26", null, null, 1, [categoria]);
          const convVersion = new ConvenioVersion({
            convenioId: convId,
            version: 1,
            validFrom: new Date('2000-01-01'),
            validTo: new Date('9999-12-31'),
            nombre: "CCT Comercio 130/75",
            descripcion: "Convenio Empleados de Comercio",
            sindicatoId: "synd-comercio",
            tipoLiquidacion: "MENSUAL",
            antiguedadPorc: Percentage.create(1.0),
            estado: "ACTIVO",
            updatedBy: "user-system"
          }, "conv-ver-1");

          const newConvenio = new Convenio(convId, tenantId, "130/75", [convVersion], [escala]);
          setConvenio(newConvenio);

          const c1 = new Concepto("c-100", tenantId, "100", [
            new ConceptoVersion({
              conceptoId: "c-100",
              version: 1,
              validFrom: new Date('2000-01-01'),
              validTo: new Date('9999-12-31'),
              nombre: "Sueldo Básico Conformado",
              tipo: "REMUNERATIVO",
              formula: "BASIC",
              ordenImpresion: 10,
              activo: true,
              codigoAfip: "110000",
              updatedBy: "user-system"
            })
          ]);

          const c2 = new Concepto("c-150", tenantId, "150", [
            new ConceptoVersion({
              conceptoId: "c-150",
              version: 1,
              validFrom: new Date('2000-01-01'),
              validTo: new Date('9999-12-31'),
              nombre: "Adicional Antigüedad Convenio",
              tipo: "REMUNERATIVO",
              formula: "BASIC * ANTIGUEDAD_PORC / 100",
              ordenImpresion: 20,
              activo: true,
              codigoAfip: "120000",
              updatedBy: "user-system"
            })
          ]);

          const c3 = new Concepto("c-160", tenantId, "160", [
            new ConceptoVersion({
              conceptoId: "c-160",
              version: 1,
              validFrom: new Date('2000-01-01'),
              validTo: new Date('9999-12-31'),
              nombre: "Horas Extras 50% (S/ Ley)",
              tipo: "REMUNERATIVO",
              formula: "VALOR_HORA * HORAS_EXTRAS_50 * 1.5",
              ordenImpresion: 30,
              activo: true,
              codigoAfip: "130000",
              updatedBy: "user-system"
            })
          ]);

          const c4 = new Concepto("c-500", tenantId, "500", [
            new ConceptoVersion({
              conceptoId: "c-500",
              version: 1,
              validFrom: new Date('2000-01-01'),
              validTo: new Date('9999-12-31'),
              nombre: "Jubilación Ordinaria (SIPA 11%)",
              tipo: "DESCUENTO",
              formula: "REMUNERATIVO_TOTAL * 0.11",
              ordenImpresion: 100,
              activo: true,
              codigoAfip: "810000",
              updatedBy: "user-system"
            })
          ]);

          setConceptos([c1, c2, c3, c4]);
          setSelectedConcept(c2);

          const fIng1 = new Date();
          fIng1.setFullYear(fIng1.getFullYear() - 5);
          const empE1 = Empleado.create("emp-maria", tenantId, "emp-001", Cuil.create("27361234569"), "36123456", {
            validFrom: new Date('2022-01-01'),
            validTo: new Date('9999-12-31'),
            legajo: "1002",
            apellido: "González",
            nombre: "María Luz",
            sexo: "F",
            fechaNacimiento: new Date('1994-08-20'),
            estadoCivil: "Casado",
            nacionalidad: "Argentino",
            direccion: "Avenida Rivadavia 2500",
            provincia: "Buenos Aires",
            localidad: "CABA",
            codigoPostal: "1022",
            email: "maria.gonzalez@siscorp.com.ar",
            telefono: "11-2345-6789",
            contactoEmergencia: null,
            grupoSanguineo: "AB+",
            nivelEducativo: "Terciario",
            profesion: "Liquidador Auxiliar",
            discapacidad: false,
            licenciaConducir: null,
            fotoUrl: null,
            firmaUrl: null,
            fechaIngreso: fIng1,
            fechaEgreso: null,
            motivoBaja: null,
            tipoContrato: "EFECTIVO",
            modalidad: "TIEMPO_COMPLETO",
            sucursalId: "suc-001",
            convenioVersionId: "conv-ver-1",
            categoriaId: catId,
            centroCosto: "Recursos Humanos",
            jornada: "COMPLETA",
            horasSemanales: new Decimal(44),
            obraSocialVersionId: "os-001",
            sindicatoVersionId: null,
            banco: "Banco Galicia",
            cbu: "0070001220000098765432",
            alias: "maria.siscorp.sueldo",
            formaPago: "TRANSFERENCIA",
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
            afipCondicion: "SERVICIOS",
            afipSituacionRevista: "ACTIVO",
            afipCodigoModalidad: "001",
            afipCodigoActividad: "01",
            afipCodigoPuesto: "ADMINISTRATIVO",
            updatedBy: "user-system"
          });

          const fIng2 = new Date();
          fIng2.setFullYear(fIng2.getFullYear() - 3);
          const empE2 = Empleado.create("emp-roberto", tenantId, "emp-002", Cuil.create("20281234562"), "28123456", {
            validFrom: new Date('2023-01-01'),
            validTo: new Date('9999-12-31'),
            legajo: "2001",
            apellido: "Gómez",
            nombre: "Roberto Carlos",
            sexo: "M",
            fechaNacimiento: new Date('1988-02-14'),
            estadoCivil: "Casado",
            nacionalidad: "Argentino",
            direccion: "Hipólito Yrigoyen 410, Pilar",
            provincia: "Buenos Aires",
            localidad: "Pilar",
            codigoPostal: "1629",
            email: "roberto.gomez@distriplata.com.ar",
            telefono: "11-3456-7890",
            contactoEmergencia: null,
            grupoSanguineo: "A-",
            nivelEducativo: "Terciario Completo",
            profesion: "Operador de Logística",
            discapacidad: false,
            licenciaConducir: "C1",
            fotoUrl: null,
            firmaUrl: null,
            fechaIngreso: fIng2,
            fechaEgreso: null,
            motivoBaja: null,
            tipoContrato: "EFECTIVO",
            modalidad: "TIEMPO_COMPLETO",
            sucursalId: "suc-001",
            convenioVersionId: "conv-ver-1",
            categoriaId: catId,
            centroCosto: "Depósito Mayorista",
            jornada: "COMPLETA",
            horasSemanales: new Decimal(44),
            obraSocialVersionId: "os-001",
            sindicatoVersionId: null,
            banco: "Banco Nación",
            cbu: "0110001220000077665544",
            alias: "roberto.distriplata.sueldo",
            formaPago: "TRANSFERENCIA",
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
            afipCondicion: "SERVICIOS",
            afipSituacionRevista: "ACTIVO",
            afipCodigoModalidad: "001",
            afipCodigoActividad: "01",
            afipCodigoPuesto: "OPERARIO",
            updatedBy: "user-system"
          });

          setEmpleados([empE1, empE2]);
        } catch (localErr: any) {
          addLog(`[FATAL ERROR LOCAL] ${localErr.message}`);
        }
      }
    }
    init();
  }, []);

  // Real-time CUIL calculation
  useEffect(() => {
    if (newEmpDni.length >= 7 && newEmpDni.length <= 8 && (newEmpSexo === 'M' || newEmpSexo === 'F')) {
      try {
        const computed = ArgentineTaxHelper.calcularCuil(newEmpDni, newEmpSexo);
        setNewEmpCuil(computed);
      } catch (e) {
        setNewEmpCuil('');
      }
    } else {
      setNewEmpCuil('');
    }
  }, [newEmpDni, newEmpSexo]);

  // Get active client context object
  const activeEmpresa = clientes.find(e => e.id === selectedEmpresaId);

  // Get employees assigned ONLY to the active client context
  const activeEmpleados = empleados.filter(emp => emp.getVersiones()[0].clienteId === selectedEmpresaId);

  // Handle active client selector change
  const selectCompanyContext = (empId: string) => {
    setSelectedEmpresaId(empId);
    setCurrentView('dashboard');
    setSelectedEmpleadoId(null);
    addLog(`[Contexto] Cambiado a cliente: '${clientes.find(e => e.id === empId)?.getVersionVigente(new Date()).razonSocial}'`);
  };

  // Add a new client (ABM Client)
  const handleAddCompany = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cuitObj = Cuit.create(newCompCuit);
      const newId = "emp-" + Math.random().toString(36).substring(7);
      
      const newComp = Cliente.create(newId, tenant.id, cuitObj, {
        validFrom: new Date('2026-01-01'),
        validTo: new Date('9999-12-31'),
        razonSocial: newCompRazonSocial,
        nombreFantasia: newCompFantasia || newCompRazonSocial,
        inicioActividades: new Date('2025-01-01'),
        actividadesSecundarias: null,
        jurisdiccion: newCompProvincia,
        ingresosBrutos: "901-" + Math.floor(Math.random()*900000+100000) + "-5",
        art: "Galeno ART",
        cuentaBancaria: "Cta Cte $",
        cbu: newCompCbu || "0000000000000000000000",
        alias: newCompAlias || "alias.sueldos",
        tipoSocietario: newCompTipoCliente,
        condicionIva: newCompCondicionIva,
        actividadPrincipal: newCompActividad,
        codigoAfip: newCompAFIP,
        legalAddress: newCompLegalAddress,
        fiscalAddress: newCompLegalAddress,
        provincia: newCompProvincia,
        localidad: newCompLocalidad,
        codigoPostal: newCompCP,
        email: newCompEmail,
        telefono: newCompTelefono,
        estado: "ACTIVO",
        updatedBy: "user-system",
        tipoCliente: newCompTipoCliente
      });

      setClientes(prev => [...prev, newComp]);
      addLog(`[ABM Clientes] Cliente ${newCompRazonSocial} registrado exitosamente con CUIT ${cuitObj.getFormatted()}`);
      
      setNewCompRazonSocial('');
      setNewCompCuit('');
      setNewCompFantasia('');
      setNewCompLegalAddress('');
      setNewCompCbu('');
      setNewCompAlias('');
      setNewCompObservaciones('');
      setShowAddCompanyModal(false);
    } catch (err: any) {
      alert(`Error al registrar cliente: ${err.message}`);
    }
  };

  // Edit client action
  const handleEditCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;

    try {
      const ver = editingClient.getVersionVigente(new Date());
      const updatedVersion = new (Cliente as any).ClienteVersion({
        ...ver,
        razonSocial: newCompRazonSocial,
        nombreFantasia: newCompFantasia,
        legalAddress: newCompLegalAddress,
        telefono: newCompTelefono,
        email: newCompEmail,
        condicionIva: newCompCondicionIva,
        tipoCliente: newCompTipoCliente,
        jurisdiccion: newCompProvincia,
        provincia: newCompProvincia,
        localidad: newCompLocalidad,
        version: ver.version + 1,
        validFrom: new Date(),
        validTo: new Date('9999-12-31')
      });

      setClientes(prev => prev.map(c => {
        if (c.id === editingClient.id) {
          return Cliente.reconstitute(
            c.id,
            c.tenantId,
            c.getCuit(),
            [updatedVersion, ...c.getVersiones()],
            c.getSucursales(),
            c.getDocumentos()
          );
        }
        return c;
      }));

      addLog(`[ABM Clientes] Datos del cliente '${newCompRazonSocial}' actualizados (Nueva versión bi-temporal de datos).`);
      setShowEditClientModal(false);
      setEditingClient(null);
    } catch (err: any) {
      alert(`Error al guardar cambios del cliente: ${err.message}`);
    }
  };

  const handleOpenEditClient = (c: any) => {
    const ver = c.getVersionVigente(new Date());
    setEditingClient(c);
    setNewCompRazonSocial(ver.razonSocial);
    setNewCompFantasia(ver.nombreFantasia || '');
    setNewCompLegalAddress(ver.legalAddress);
    setNewCompTelefono(ver.telefono || '');
    setNewCompEmail(ver.email);
    setNewCompCondicionIva(ver.condicionIva);
    setNewCompTipoCliente(ver.tipoCliente || 'Empresa');
    setNewCompProvincia(ver.provincia);
    setNewCompLocalidad(ver.localidad);
    setShowEditClientModal(true);
  };

  // Add mock employee (ABM) associated with the active client context
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpresaId) {
      alert("Seleccione un cliente primero.");
      return;
    }
    if (!newEmpApellido || !newEmpNombre || !newEmpDni || !newEmpSexo || !newEmpFechaNacimiento || !newEmpFechaIngreso || !newEmpConvenio || !newEmpCategoria) {
      alert("Por favor complete todos los campos obligatorios.");
      return;
    }

    try {
      const tenantId = tenant?.id || "ten-001";
      const actionRes = await registrarEmpleadoAction({
        tenantId,
        clienteId: selectedEmpresaId,
        usuarioId: "operador@estudio.com",
        nombre: newEmpNombre,
        apellido: newEmpApellido,
        dni: newEmpDni,
        sexo: newEmpSexo as 'M' | 'F',
        fechaNacimiento: new Date(newEmpFechaNacimiento),
        fechaIngreso: new Date(newEmpFechaIngreso),
        convenioVersionId: newEmpConvenio,
        categoriaId: newEmpCategoria,
        banco: newEmpBanco || undefined,
        cbu: newEmpCbu || undefined,
        email: newEmpEmail || undefined,
        telefono: newEmpTelefono || undefined,
        observaciones: newEmpObservaciones || undefined
      });

      if (actionRes.success && actionRes.data) {
        const domainEmp = mapEmpleadoDbToDomain(actionRes.data);
        setEmpleados(prev => [...prev, domainEmp]);
        
        const legajoAsignado = domainEmp.getVersiones()[0].legajo;
        addLog(`[ABM Legajos] Colaborador registrado correctamente. Legajo asignado: ${legajoAsignado}`);
        alert(`¡Colaborador registrado con éxito!\nLegajo asignado: ${legajoAsignado}\nCUIL generado: ${domainEmp.getCuil().getValue()}`);

        // Reset form
        setNewEmpApellido('');
        setNewEmpNombre('');
        setNewEmpDni('');
        setNewEmpSexo('M');
        setNewEmpFechaNacimiento('');
        setNewEmpFechaIngreso('');
        setNewEmpBanco('');
        setNewEmpCbu('');
        setNewEmpEmail('');
        setNewEmpTelefono('');
        setNewEmpObservaciones('');
        setShowAddEmployeeModal(false);
      } else {
        alert(`Error al registrar colaborador: ${actionRes.error}`);
      }
    } catch (err: any) {
      alert(`Error inesperado: ${err.message}`);
    }
  };

  // Edit employee details
  const handleEditEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    try {
      const ver = editingEmployee.getVersiones()[0];
      const updatedVersion = new (Empleado as any).EmpleadoVersion({
        ...ver,
        apellido: newEmpApellido,
        nombre: newEmpNombre,
        cbu: newEmpCbu,
        alias: newEmpAlias,
        banco: newEmpBanco,
        version: ver.version + 1,
        validFrom: new Date(),
        validTo: new Date('9999-12-31')
      });

      setEmpleados(prev => prev.map(emp => {
        if (emp.id === editingEmployee.id) {
          return Empleado.reconstitute(
            emp.id,
            emp.tenantId,
            emp.clienteId,
            emp.getCuil(),
            emp.dni,
            [updatedVersion, ...emp.getVersiones()],
            emp.getEmbargos(),
            emp.getVacaciones(),
            emp.getNovedades()
          );
        }
        return emp;
      }));

      addLog(`[ABM Legajos] Ficha de legajo '${newEmpLegajo}' editada. Modificaciones aplicadas bajo control bi-temporal.`);
      setShowEditEmployeeModal(false);
      setEditingEmployee(null);
    } catch (err: any) {
      alert(`Error al editar legajo: ${err.message}`);
    }
  };

  const handleOpenEditEmployee = (emp: any) => {
    const ver = emp.getVersiones()[0];
    setEditingEmployee(emp);
    setNewEmpLegajo(ver.legajo);
    setNewEmpApellido(ver.apellido);
    setNewEmpNombre(ver.nombre);
    setNewEmpBanco(ver.banco || '');
    setNewEmpCbu(ver.cbu || '');
    setNewEmpAlias(ver.alias || '');
    setShowEditEmployeeModal(true);
  };

  // Add document to current client
  const handleAddDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpresaId) return;

    try {
      const newDoc = new DocumentoCliente(
        "doc-" + Math.random().toString(36).substring(7),
        newDocNombre,
        newDocTipo,
        "/uploads/" + (newDocFileName || "documento_estudio.pdf"),
        newDocFileName || "documento_estudio.pdf"
      );

      setClientes(prev => prev.map(c => {
        if (c.id === selectedEmpresaId) {
          return Cliente.reconstitute(
            c.id,
            c.tenantId,
            c.getCuit(),
            c.getVersiones(),
            c.getSucursales(),
            [...c.getDocumentos(), newDoc]
          );
        }
        return c;
      }));

      addLog(`[Documento] Documento '${newDocNombre}' (Categoría: ${newDocTipo}) archivado exitosamente.`);
      setNewDocNombre('');
      setNewDocFileName('');
      setShowAddDocModal(false);
    } catch (err: any) {
      alert(`Error al archivar documento: ${err.message}`);
    }
  };

  // Register Vacation on active employee
  const handleAddVacation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpleadoId) return;

    try {
      const emp = empleados.find(e => e.id === selectedEmpleadoId);
      const newVac = new (Empleado as any).Vacacion(
        "vac-" + Math.random().toString(36).substring(7),
        tenant.id,
        emp.id,
        vacPeriodo,
        parseInt(vacDias),
        parseInt(vacDias),
        0,
        new Date(vacFechaInicio),
        new Date(new Date(vacFechaInicio).getTime() + parseInt(vacDias)*24*60*60*1000),
        true,
        "APROBADO"
      );

      setEmpleados(prev => prev.map(e => {
        if (e.id === selectedEmpleadoId) {
          return Empleado.reconstitute(
            e.id,
            e.tenantId,
            e.clienteId,
            e.getCuil(),
            e.dni,
            e.getVersiones(),
            e.getEmbargos(),
            [...e.getVacaciones(), newVac],
            e.getNovedades()
          );
        }
        return e;
      }));

      addLog(`[Vacaciones] Registrada vacación de ${vacDias} días para legajo seleccionado.`);
      setShowVacationModal(false);
    } catch (err: any) {
      alert(`Error al registrar vacación: ${err.message}`);
    }
  };

  // Register Embargo on active employee
  const handleAddEmbargo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpleadoId) return;

    try {
      const emp = empleados.find(e => e.id === selectedEmpleadoId);
      const newEmb = new (Empleado as any).Embargo(
        "emb-" + Math.random().toString(36).substring(7),
        tenant.id,
        emp.id,
        embJuzgado,
        embExpediente,
        embTipo,
        new Decimal(embTipo === 'FIJO' ? embValor : 0),
        new Decimal(embTipo === 'PORCENTAJE' ? embValor : 0),
        1,
        new Date(),
        null,
        "ACTIVO",
        "Retención judicial cargada desde el panel"
      );

      setEmpleados(prev => prev.map(e => {
        if (e.id === selectedEmpleadoId) {
          return Empleado.reconstitute(
            e.id,
            e.tenantId,
            e.clienteId,
            e.getCuil(),
            e.dni,
            e.getVersiones(),
            [...e.getEmbargos(), newEmb],
            e.getVacaciones(),
            e.getNovedades()
          );
        }
        return e;
      }));

      addLog(`[Embargo] Retención judicial por el ${embValor}% registrada en legajo.`);
      setShowEmbargoModal(false);
    } catch (err: any) {
      alert(`Error al registrar embargo: ${err.message}`);
    }
  };

  // Save modified Basic Salary of scale category
  const handleEditScale = (e: React.FormEvent) => {
    e.preventDefault();
    if (!convenio) return;

    try {
      const scale = convenio.escalas[0];
      const category = scale.categorias[0];
      
      const updatedCategory = new Categoria(
        category.id,
        category.escalaId,
        category.nombre,
        category.codigo,
        category.valorHora,
        Money.create(parseFloat(editBasicSalary)),
        category.valorJornada
      );

      const updatedScale = new EscalaSalarial(
        scale.id,
        scale.convenioId,
        scale.periodo,
        scale.validFrom,
        scale.validTo,
        scale.resolucionST,
        scale.adicionalA,
        scale.adicionalB,
        scale.version,
        [updatedCategory]
      );

      const updatedConvenio = new Convenio(
        convenio.id,
        convenio.tenantId,
        convenio.numero,
        convenio.versiones,
        [updatedScale]
      );

      setConvenio(updatedConvenio);
      addLog(`[Convenio] Escala salarial de CCT Comercio actualizada a $${parseFloat(editBasicSalary).toLocaleString('es-AR')} mensuales.`);
      setShowEditScaleModal(false);
    } catch (err: any) {
      alert(`Error al actualizar escala: ${err.message}`);
    }
  };

  // Calculation Engine trigger for current client context
  const handleCalculatePayroll = () => {
    if (calculating || !selectedEmpresaId) return;
    setCalculating(true);
    addLog(`[Engine] Ejecutando procesamiento de haberes masivo - Cliente Contexto ID: ${selectedEmpresaId}...`);

    setTimeout(() => {
      try {
        const executionDate = new Date('2026-07-31');
        const period = Periodo.create("2026-07");
        const scaleId = "scale-2026-07";
        const catId = "cat-adm-a";

        const liquiId = "liq-" + Math.random().toString(36).substring(7);
        const newLiqui = Liquidacion.create(liquiId, tenant.id, selectedEmpresaId, period, 0, 'MENSUAL', "user-system");
        newLiqui.transicionarEstado('CALCULANDO', "user-system", "Iniciando cálculo masivo");

        for (const emp of activeEmpleados) {
          const empVersion = emp.getVersiones()[0];
          
          let escala: any = null;
          let categoria: any = null;
          let convVersion: any = null;

          if (convenio) {
            convVersion = convenio.getVersiones()[0];
            escala = convenio.escalas[0];
            categoria = escala.categorias[0];
          }

          const scaleBasic = categoria ? categoria.valorMensual.toNumber() : 250000.00;
          const contextMap = new Map<string, any>([
            ['BASIC', new Decimal(scaleBasic)],
            ['ANTIGUEDAD_PORC', new Decimal(empVersion.legajo === '1002' ? 8.0 : 3.0)],
            ['VALOR_HORA', new Decimal(categoria ? categoria.valorHora.toNumber() : 1136.36)],
            ['HORAS_EXTRAS_50', new Decimal(extraHours50)],
            ['HORAS_EXTRAS_100', new Decimal(extraHours100)],
            ['FERIADOS_TRABAJADOS', new Decimal(feriadosTrabajados)]
          ]);

          const detalles: ReciboDetalle[] = [];
          let runningRemunerative = Money.zero();
          let runningNonRemunerative = Money.zero();
          let runningDeductions = Money.zero();

          const activeVersions = conceptos.map(c => c.getVersionVigente(executionDate));
          const remunerativos = activeVersions.filter(v => v.tipo === 'REMUNERATIVO');
          const noRemunerativos = activeVersions.filter(v => v.tipo === 'NO_REMUNERATIVO');
          const descuentos = activeVersions.filter(v => v.tipo === 'DESCUENTO');

          // Remunerativos AST
          for (const v of remunerativos) {
            const amountDecimal = FormulaEvaluator.evaluate(v.formula, contextMap) as Decimal;
            const amount = Money.create(amountDecimal);
            if (amount.isGreaterThan(Money.zero())) {
              runningRemunerative = runningRemunerative.add(amount);
              contextMap.set('REMUNERATIVO_TOTAL', runningRemunerative.toDecimal());
              detalles.push(new ReciboDetalle({
                conceptoVersionId: v.conceptoId,
                conceptoCodigo: conceptos.find(c => c.id === v.conceptoId).codigo,
                conceptoNombre: v.nombre,
                tipo: v.tipo,
                customTipoSimulado: null,
                cantidad: Money.create(1),
                valorUnitario: amount,
                subtotal: amount,
                formulaAplicada: v.formula,
                porcentajeAplicado: null
              } as any));
            }
          }

          // No Remunerativos AST
          for (const v of noRemunerativos) {
            const amountDecimal = FormulaEvaluator.evaluate(v.formula, contextMap) as Decimal;
            const amount = Money.create(amountDecimal);
            if (amount.isGreaterThan(Money.zero())) {
              runningNonRemunerative = runningNonRemunerative.add(amount);
              contextMap.set('NO_REMUNERATIVO_TOTAL', runningNonRemunerative.toDecimal());
              detalles.push(new ReciboDetalle({
                conceptoVersionId: v.conceptoId,
                conceptoCodigo: conceptos.find(c => c.id === v.conceptoId).codigo,
                conceptoNombre: v.nombre,
                tipo: v.tipo,
                customTipoSimulado: null,
                cantidad: Money.create(1),
                valorUnitario: amount,
                subtotal: amount,
                formulaAplicada: v.formula,
                porcentajeAplicado: null
              } as any));
            }
          }

          // Deducciones AST
          for (const v of descuentos) {
            const amountDecimal = FormulaEvaluator.evaluate(v.formula, contextMap) as Decimal;
            const amount = Money.create(amountDecimal);
            if (amount.isGreaterThan(Money.zero())) {
              runningDeductions = runningDeductions.add(amount);
              contextMap.set('DEDUCCION_TOTAL', runningDeductions.toDecimal());
              detalles.push(new ReciboDetalle({
                conceptoVersionId: v.conceptoId,
                conceptoCodigo: conceptos.find(c => c.id === v.conceptoId).codigo,
                conceptoNombre: v.nombre,
                tipo: v.tipo,
                customTipoSimulado: null,
                cantidad: Money.create(1),
                valorUnitario: amount,
                subtotal: amount,
                formulaAplicada: v.formula,
                porcentajeAplicado: null
              } as any));
            }
          }

          const totalNeto = runningRemunerative.add(runningNonRemunerative).subtract(runningDeductions);
          const costoLaboralTotal = runningRemunerative.add(runningNonRemunerative).multiply(1.23); 
          const totalContribuciones = runningRemunerative.multiply(0.23);

          const uniqueCode = "REC-" + Math.random().toString(36).substring(3).toUpperCase();
          const hashSha256 = "SHA256-" + uniqueCode;

          const recibo = new ReciboSueldo({
            empleadoId: emp.id,
            empleadoVersionId: empVersion.id,
            clienteId: selectedEmpresaId,
            clienteVersionId: activeEmpresa.getVersionVigente(executionDate).id,
            convenioVersionId: convVersion ? convVersion.id : "conv-ver-1",
            escalaId: escala ? escala.id : scaleId,
            categoriaId: categoria ? categoria.id : catId,
            rectificaReciboId: null,
            cuil: emp.getCuil().getFormatted(),
            cuit: activeEmpresa.getCuit().getFormatted(),
            periodo: "2026-07",
            quincena: 0,
            basicoAplicado: Money.create(scaleBasic),
            antiguedadAnos: empVersion.legajo === '1002' ? 8 : 3,
            totalRemunerativo: runningRemunerative,
            totalNoRemunerativo: runningNonRemunerative,
            totalDescuentos: runningDeductions,
            totalNeto,
            costoLaboralTotal,
            totalContribuciones,
            uniqueCode,
            hashSha256,
            reciboVersion: 1,
            firmaDigital: "firma-digital-ar-v1",
            xmlData: "<xml>sueldo_digital</xml>",
            fechaImpresion: null,
            cantidadImpresiones: 0,
            estado: 'EMITIDO',
            fechaPago: new Date('2026-08-04'),
            bancoPago: empVersion.banco,
            cbuPago: empVersion.cbu,
            pdfUrl: "/recibos/generado.pdf",
            detalles
          }, "rec-" + emp.id);

          newLiqui.registrarRecibo(recibo);
        }

        newLiqui.transicionarEstado('APROBADO', "user-system", "Liquidación aprobada por el liquidador.");
        
        // Save liquidacion under client context
        setLiquidaciones(prev => ({
          ...prev,
          [selectedEmpresaId]: newLiqui
        }));
        
        addLog(`[OK] Liquidación de periodo 2026-07 autorizada para el cliente. Generados ${newLiqui.getRecibos().length} recibos.`);
      } catch (err: any) {
        addLog(`[ERROR LIQUI] ${err.message}`);
      }
      setCalculating(false);
    }, 900);
  };

  // Rectificativa trigger for active client context
  const handleRectificar = (originalReceipt: ReciboSueldo) => {
    if (!selectedEmpresaId) return;
    addLog(`[Engine] Ejecutando rectificativa sobre recibo original ${originalReceipt.id}...`);

    const correctionAmount = Money.create(15000.00); 
    const period = Periodo.create(originalReceipt.periodo);
    const rectLiquiId = "liq-rect-2026-07";

    const liquidacionRect = Liquidacion.reconstitute(
      rectLiquiId,
      tenant.id,
      selectedEmpresaId,
      period,
      0,
      'RECTIFICATIVA',
      'CALCULANDO',
      new Date(),
      [],
      []
    );

    const detalles: ReciboDetalle[] = [
      new ReciboDetalle({
        conceptoVersionId: "c-retro",
        conceptoCodigo: "AJUSTE",
        conceptoNombre: "Ajuste Retroactivo (Rectificativa Convenio)",
        tipo: 'REMUNERATIVO',
        cantidad: Money.create(1),
        valorUnitario: correctionAmount,
        subtotal: correctionAmount,
        formulaAplicada: "RECTIFICACION_MOCK",
        porcentajeAplicado: null
      })
    ];

    const nuevoRemunerativo = originalReceipt.totalRemunerativo.add(correctionAmount);
    const nuevoNeto = originalReceipt.totalNeto.add(correctionAmount);
    const nuevoCosto = originalReceipt.costoLaboralTotal.add(correctionAmount);

    const uniqueCode = "REC-RECT-" + Math.random().toString(36).substring(3).toUpperCase();
    const hashSha256 = "SHA256-" + uniqueCode;

    const reciboRect = new ReciboSueldo({
      empleadoId: originalReceipt.empleadoId,
      empleadoVersionId: originalReceipt.empleadoVersionId,
      clienteId: selectedEmpresaId,
      clienteVersionId: originalReceipt.clienteVersionId,
      convenioVersionId: originalReceipt.convenioVersionId,
      escalaId: originalReceipt.escalaId,
      categoriaId: originalReceipt.categoriaId,
      rectificaReciboId: originalReceipt.id, 
      cuil: originalReceipt.cuil,
      cuit: originalReceipt.cuit,
      periodo: originalReceipt.periodo,
      quincena: originalReceipt.quincena,
      basicoAplicado: originalReceipt.basicoAplicado,
      antiguedadAnos: originalReceipt.antiguedadAnos,
      totalRemunerativo: nuevoRemunerativo,
      totalNoRemunerativo: originalReceipt.totalNoRemunerativo,
      totalDescuentos: originalReceipt.totalDescuentos,
      totalNeto: nuevoNeto,
      costoLaboralTotal: nuevoCosto,
      totalContribuciones: originalReceipt.totalContribuciones.multiply(1.05),
      uniqueCode,
      hashSha256,
      reciboVersion: originalReceipt.reciboVersion + 1,
      firmaDigital: "firma-digital-rect-ar",
      xmlData: "<xml>rectification</xml>",
      fechaImpresion: null,
      cantidadImpresiones: 0,
      estado: 'EMITIDO',
      fechaPago: new Date('2026-08-15'),
      bancoPago: originalReceipt.bancoPago,
      cbuPago: originalReceipt.cbuPago,
      pdfUrl: "/recibos/recibo_rectificado.pdf",
      detalles
    } as any, "rec-rect-" + originalReceipt.id);

    liquidacionRect.registrarRecibo(reciboRect);
    liquidacionRect.transicionarEstado('APROBADO', 'user-system', 'Ajuste rectificativo aprobado');
    
    setRectificados(prev => {
      const compRects = prev[selectedEmpresaId] || [];
      return {
        ...prev,
        [selectedEmpresaId]: [reciboRect, ...compRects]
      };
    });

    addLog(`[Auditoría] Trazabilidad Histórica: Recibo Rectificativo ${reciboRect.id} (Versión ${reciboRect.reciboVersion}) enlazado a Recibo Original ${originalReceipt.id}`);
  };

  // Filtered clients list
  const filteredClientes = clientes.filter(c => {
    const ver = c.getVersionVigente(new Date());
    const term = searchQuery.toLowerCase();
    return (
      ver.razonSocial.toLowerCase().includes(term) ||
      ver.nombreFantasia?.toLowerCase().includes(term) ||
      c.getCuit().getValue().includes(term) ||
      (ver.tipoCliente || '').toLowerCase().includes(term)
    );
  });

  // Filtered employees list
  const filteredEmpleados = activeEmpleados.filter(emp => {
    const ver = emp.getVersiones()[0];
    const term = searchQuery.toLowerCase();
    return (
      ver.apellido.toLowerCase().includes(term) ||
      ver.nombre.toLowerCase().includes(term) ||
      ver.legajo.includes(term) ||
      emp.getCuil().getValue().includes(term)
    );
  });

  const activeCompanyLiqui = selectedEmpresaId ? liquidaciones[selectedEmpresaId] : null;
  const activeCompanyRects = selectedEmpresaId ? (rectificados[selectedEmpresaId] || []) : [];

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex font-sans antialiased">
      
      {/* 1. PERSISTENT SIDEBAR NAV */}
      <aside className="w-64 bg-[#0f172a] text-slate-300 flex flex-col shrink-0 border-r border-slate-800 shadow-xl z-20">
        
        {/* Sidebar Header */}
        <div className="h-16 px-6 border-b border-slate-800 flex items-center gap-3 bg-[#0c1222]">
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white tracking-wider text-sm shadow-md shadow-blue-500/10">
            EC
          </div>
          <div>
            <h2 className="font-bold text-sm text-slate-100 uppercase tracking-wider">ESTUDIO PÉREZ</h2>
            <p className="text-[9px] text-slate-500 font-semibold tracking-wide">Gestión Contable & Haberes</p>
          </div>
        </div>

        {/* Selected Context Indicator */}
        <div className="p-4 mx-3 my-3 bg-[#1e293b]/50 border border-[#334155]/60 rounded-xl flex flex-col gap-2">
          {activeEmpresa ? (
            <>
              <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Cliente Activo</p>
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-bold text-slate-100 truncate">{activeEmpresa.getVersionVigente(new Date()).razonSocial}</p>
                <p className="text-[10px] text-slate-400 font-mono">CUIT: {activeEmpresa.getCuit().getFormatted()}</p>
                <p className="text-[9px] text-slate-500 font-medium italic">Tipo: {activeEmpresa.getVersionVigente(new Date()).tipoCliente || 'Empresa'}</p>
              </div>
              <button
                onClick={() => {
                  setSelectedEmpresaId(null);
                  setCurrentView('company-select');
                  setSelectedEmpleadoId(null);
                  addLog("[Contexto] Regresó al listado general de clientes del estudio.");
                }}
                className="w-full mt-1.5 py-1.5 bg-[#334155]/70 hover:bg-[#334155] rounded-lg text-[10px] font-bold text-slate-300 transition-colors flex items-center justify-center gap-1"
              >
                ↩️ Volver a Clientes
              </button>
            </>
          ) : (
            <div className="text-center py-2">
              <p className="text-[10px] text-slate-400 font-semibold">Ningún cliente seleccionado</p>
              <p className="text-[8px] text-slate-600 mt-0.5">Seleccione uno de la lista</p>
            </div>
          )}
        </div>

        {/* Navigation Sidebar Options */}
        <nav className="flex-grow px-3 flex flex-col gap-1 overflow-y-auto">
          <p className="text-[10px] font-bold text-slate-500 px-3 uppercase tracking-wider mb-1">Estudio Contable</p>
          
          <button
            onClick={() => {
              setSelectedEmpresaId(null);
              setCurrentView('company-select');
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              currentView === 'company-select'
                ? 'bg-blue-600/15 text-blue-400 border-l-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            💼 Cartera de Clientes
          </button>

          {/* Contextual links only active if selectedEmpresaId is not null */}
          <p className="text-[10px] font-bold text-slate-500 px-3 uppercase tracking-wider mt-4 mb-1">Cliente Seleccionado</p>

          <button
            disabled={!selectedEmpresaId}
            onClick={() => setCurrentView('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              !selectedEmpresaId ? 'opacity-30 cursor-not-allowed' : ''
            } ${
              currentView === 'dashboard'
                ? 'bg-blue-600/15 text-blue-400 border-l-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            📊 Panel del Cliente
          </button>

          <button
            disabled={!selectedEmpresaId}
            onClick={() => {
              if (activeEmpresa) {
                handleOpenEditClient(activeEmpresa);
              }
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              !selectedEmpresaId ? 'opacity-30 cursor-not-allowed' : ''
            } ${
              currentView === 'clientes'
                ? 'bg-blue-600/15 text-blue-400 border-l-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            ⚙️ Datos & Documentación
          </button>

          <button
            disabled={!selectedEmpresaId}
            onClick={() => setCurrentView('empleados')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              !selectedEmpresaId ? 'opacity-30 cursor-not-allowed' : ''
            } ${
              currentView === 'empleados'
                ? 'bg-blue-600/15 text-blue-400 border-l-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            👥 Fichas de Empleados
          </button>

          <button
            disabled={!selectedEmpresaId}
            onClick={() => setCurrentView('convenios')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              !selectedEmpresaId ? 'opacity-30 cursor-not-allowed' : ''
            } ${
              currentView === 'convenios'
                ? 'bg-blue-600/15 text-blue-400 border-l-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            📜 CCT y Escalas
          </button>

          <button
            disabled={!selectedEmpresaId}
            onClick={() => setCurrentView('conceptos')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              !selectedEmpresaId ? 'opacity-30 cursor-not-allowed' : ''
            } ${
              currentView === 'conceptos'
                ? 'bg-blue-600/15 text-blue-400 border-l-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            🧮 Conceptos y AST
          </button>

          <p className="text-[10px] font-bold text-slate-500 px-3 uppercase tracking-wider mt-4 mb-1">Liquidación</p>

          <button
            disabled={!selectedEmpresaId}
            onClick={() => setCurrentView('liquidaciones')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              !selectedEmpresaId ? 'opacity-30 cursor-not-allowed' : ''
            } ${
              currentView === 'liquidaciones'
                ? 'bg-blue-600/15 text-blue-400 border-l-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            💵 Liquidar Haberes
          </button>

          <button
            disabled={!selectedEmpresaId}
            onClick={() => setCurrentView('libro')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              !selectedEmpresaId ? 'opacity-30 cursor-not-allowed' : ''
            } ${
              currentView === 'libro'
                ? 'bg-blue-600/15 text-blue-400 border-l-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            📋 Libro de Sueldos Digital
          </button>

          <button
            disabled={!selectedEmpresaId}
            onClick={() => setCurrentView('afip')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              !selectedEmpresaId ? 'opacity-30 cursor-not-allowed' : ''
            } ${
              currentView === 'afip'
                ? 'bg-blue-600/15 text-blue-400 border-l-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            🏛️ AFIP F.931 DDJJ
          </button>

          <p className="text-[10px] font-bold text-slate-500 px-3 uppercase tracking-wider mt-4 mb-1">Mantenimiento</p>

          <button
            disabled={!selectedEmpresaId}
            onClick={() => setCurrentView('auditoria')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              !selectedEmpresaId ? 'opacity-30 cursor-not-allowed' : ''
            } ${
              currentView === 'auditoria'
                ? 'bg-blue-600/15 text-blue-400 border-l-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            🛡️ Auditoría Temporal
          </button>

          <button
            onClick={() => setCurrentView('database')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              currentView === 'database'
                ? 'bg-blue-600/15 text-blue-400 border-l-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            🗄️ Estado de Base de Datos
          </button>
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#0b101e] flex flex-col gap-1">
          <p className="text-[10px] font-semibold text-slate-400">Estudio Contable Pérez</p>
          <p className="text-[8px] text-slate-600 font-mono">AR-PAYROLL Enterprise v1.2.0</p>
        </div>
      </aside>

      {/* 2. MAIN WORKSPACE */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-4">
            <h2 className="font-semibold text-slate-800 text-sm tracking-tight uppercase">
              {currentView === 'company-select' ? 'Cartera de Clientes del Estudio' : currentView === 'database' ? 'Base de Datos' : `Módulo: ${currentView}`}
            </h2>
            {activeEmpresa && (
              <>
                <div className="h-4 w-px bg-slate-200"></div>
                <div className="text-xs text-slate-500 font-medium">
                  Cliente: <span className="font-bold text-blue-800">{activeEmpresa.getVersionVigente(new Date()).razonSocial}</span>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 text-[10px] font-bold rounded-md uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
              <span className="h-1.5 w-1.5 bg-green-500 rounded-full"></span>
              SaaS Activo (PostgreSQL)
            </div>
            <div className="text-xs text-slate-500">
              Liquidador: <span className="font-semibold text-slate-700">Pérez, J.</span>
            </div>
          </div>
        </header>

        {/* Workspace views content */}
        <div className="flex-grow p-6 overflow-y-auto min-h-0 flex flex-col gap-6">

          {/* ================= VIEW: CLIENTS SELECTOR & STUDY METRICS ================= */}
          {currentView === 'company-select' && (
            <div className="flex flex-col gap-6">
              
              {/* Studio Metrics Panel */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Clientes Activos</span>
                  <span className="text-2xl font-bold text-slate-800">{clientes.length}</span>
                  <span className="text-[9px] text-green-600 font-semibold mt-1">100% de la cartera auditada</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Legajos Liquidados</span>
                  <span className="text-2xl font-bold text-slate-800">{empleados.length}</span>
                  <span className="text-[9px] text-slate-500 mt-1">Asociados a clientes activos</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-1 font-mono">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-sans">Próximo Vencimiento LSD</span>
                  <span className="text-lg font-bold text-amber-700">12-Ago-2026</span>
                  <span className="text-[9px] text-amber-600 font-semibold font-sans">Restan 19 días impositivos</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Base de Datos</span>
                  <span className="text-lg font-bold text-green-700">Conectada (PG)</span>
                  <span className="text-[9px] text-slate-500 mt-1">SSL Mode: Require (Neon)</span>
                </div>
              </div>

              {/* Info banner */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 text-lg">
                  💼
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Gestión Multi-Cliente - Estudio Contable</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Seleccione a continuación la entidad empleadora (empresa, monotributista o asociación civil) para la cual desea cargar novedades, administrar personal o emitir recibos de sueldo. Todo el contexto de la aplicación y sus cálculos se aislarán al cliente elegido.
                  </p>
                </div>
              </div>

              {/* Actions Bar */}
              <div className="flex justify-between items-center gap-4">
                <div className="relative w-72">
                  <input
                    type="text"
                    placeholder="Buscar clientes por CUIT o Razón Social..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-4 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 focus:outline-none focus:border-blue-500"
                  />
                  <span className="absolute left-2.5 top-2.5 text-slate-400 text-xs">🔍</span>
                </div>
                <button
                  onClick={() => setShowAddCompanyModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
                >
                  ➕ Registrar Nuevo Cliente
                </button>
              </div>

              {/* Clients Table */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="p-6">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 font-bold uppercase">Razón Social / Responsable</th>
                        <th className="py-2.5 font-bold uppercase font-mono">CUIT</th>
                        <th className="py-2.5 font-bold uppercase">Tipo de Cliente</th>
                        <th className="py-2.5 font-bold uppercase">Actividad Principal</th>
                        <th className="py-2.5 font-bold uppercase">Jurisdicción</th>
                        <th className="py-2.5 font-bold uppercase">Colaboradores</th>
                        <th className="py-2.5 font-bold uppercase">Estado AFIP</th>
                        <th className="py-2.5 font-bold uppercase text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClientes.map(c => {
                        const ver = c.getVersionVigente(new Date());
                        const empCount = empleados.filter(e => e.clienteId === c.id).length;
                        return (
                          <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="py-4">
                              <p className="font-semibold text-slate-800">{ver.razonSocial}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">Responsable: {ver.representanteLegal || 'Pérez, Juan'}</p>
                            </td>
                            <td className="py-4 font-mono text-slate-700">{c.getCuit().getFormatted()}</td>
                            <td className="py-4">
                              <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded text-[9px] font-bold uppercase">
                                {ver.tipoCliente || 'Empresa'}
                              </span>
                            </td>
                            <td className="py-4 text-slate-600">{ver.actividadPrincipal}</td>
                            <td className="py-4 text-slate-600">{ver.jurisdiccion}</td>
                            <td className="py-4 font-semibold text-slate-700">{empCount} colaboradores</td>
                            <td className="py-4">
                              <span className="px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 rounded text-[9px] font-bold uppercase">
                                {ver.estado}
                              </span>
                            </td>
                            <td className="py-4 text-right">
                              <button
                                onClick={() => selectCompanyContext(c.id)}
                                className="bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-lg transition-colors"
                              >
                                Seleccionar Contexto ➡️
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add Client Modal (ABM Client) */}
              {showAddCompanyModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Alta de Nuevo Cliente</h3>
                      <button onClick={() => setShowAddCompanyModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                    </div>
                    <form onSubmit={handleAddCompany} className="p-6 flex flex-col gap-4 text-xs text-slate-700 max-h-[80vh] overflow-y-auto">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Razón Social / Nombre Comercial</label>
                          <input required type="text" value={newCompRazonSocial} onChange={e => setNewCompRazonSocial(e.target.value)} placeholder="Ej: Perez Hnos SRL" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Nombre de Fantasía</label>
                          <input type="text" value={newCompFantasia} onChange={e => setNewCompFantasia(e.target.value)} placeholder="Ej: Panadería San José" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">CUIT</label>
                          <input required type="text" value={newCompCuit} onChange={e => setNewCompCuit(e.target.value)} placeholder="Ej: 30123456789" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 font-mono" />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Tipo de Cliente</label>
                          <select value={newCompTipoCliente} onChange={e => setNewCompTipoCliente(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 bg-white">
                            <option value="Empresa">Empresa (SA/SRL)</option>
                            <option value="Monotributista">Monotributista</option>
                            <option value="Persona Física">Persona Física</option>
                            <option value="Profesional">Profesional Independiente</option>
                            <option value="Asociación">Asociación Civil</option>
                            <option value="Fundación">Fundación</option>
                            <option value="Cooperativa">Cooperativa</option>
                            <option value="Consorcio">Consorcio de Propietarios</option>
                            <option value="Otro">Otro</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Condición IVA</label>
                          <select value={newCompCondicionIva} onChange={e => setNewCompCondicionIva(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 bg-white">
                            <option value="Responsable Inscripto">Responsable Inscripto</option>
                            <option value="Exento">IVA Exento</option>
                            <option value="Monotributo">Monotributo</option>
                            <option value="No Responsable">No Responsable</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Actividad Principal</label>
                          <input required type="text" value={newCompActividad} onChange={e => setNewCompActividad(e.target.value)} placeholder="Ej: Elaboración de pan" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Código Actividad AFIP</label>
                          <input required type="text" value={newCompAFIP} onChange={e => setNewCompAFIP(e.target.value)} placeholder="Ej: 107111" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 font-mono" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Domicilio Legal</label>
                        <input required type="text" value={newCompLegalAddress} onChange={e => setNewCompLegalAddress(e.target.value)} placeholder="Calle Nro, Piso, Localidad" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                      </div>

                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Provincia</label>
                          <input type="text" value={newCompProvincia} onChange={e => setNewCompProvincia(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Localidad</label>
                          <input type="text" value={newCompLocalidad} onChange={e => setNewCompLocalidad(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Código Postal</label>
                          <input type="text" value={newCompCP} onChange={e => setNewCompCP(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Responsable</label>
                          <input type="text" value={newCompResponsable} onChange={e => setNewCompResponsable(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">CBU de Pago</label>
                          <input type="text" value={newCompCbu} onChange={e => setNewCompCbu(e.target.value)} placeholder="CBU bancario oficial" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 font-mono" />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Alias</label>
                          <input type="text" value={newCompAlias} onChange={e => setNewCompAlias(e.target.value)} placeholder="Ej: empresa.sueldos" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Observaciones</label>
                        <textarea value={newCompObservaciones} onChange={e => setNewCompObservaciones(e.target.value)} placeholder="Notas internas sobre el cliente..." className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 h-16 resize-none" />
                      </div>

                      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-200">
                        <button type="button" onClick={() => setShowAddCompanyModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg font-semibold hover:bg-slate-50 text-slate-500">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm">Registrar Cliente</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= VIEW: CONTEXTUAL CLIENT DASHBOARD ================= */}
          {currentView === 'dashboard' && activeEmpresa && (
            <div className="flex flex-col gap-6">
              
              {/* Metrics cards for selected client */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Legajos Habilitados</span>
                  <span className="text-2xl font-bold text-slate-800">{activeEmpleados.length} empleados</span>
                  <span className="text-[9px] text-emerald-600 font-semibold mt-1">Todos en alta temprana</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-1 font-mono">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-sans">Costo Laboral Consolidado</span>
                  <span className="text-2xl font-bold text-slate-800">
                    ${activeCompanyLiqui ? activeCompanyLiqui.getRecibos().reduce((acc: number, r: any) => acc + r.costoLaboralTotal.toNumber(), 0).toLocaleString('es-AR', {minimumFractionDigits: 2}) : '0,00'}
                  </span>
                  <span className="text-[9px] text-slate-500 font-sans mt-1">Incluye contribuciones (23%)</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-1 font-mono">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-sans">Total Neto a Liquidar</span>
                  <span className="text-2xl font-bold text-blue-700">
                    ${activeCompanyLiqui ? activeCompanyLiqui.getRecibos().reduce((acc: number, r: any) => acc + r.totalNeto.toNumber(), 0).toLocaleString('es-AR', {minimumFractionDigits: 2}) : '0,00'}
                  </span>
                  <span className="text-[9px] text-blue-600 font-semibold font-sans mt-1">Neto a transferir a nómina</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Estado de Liquidación</span>
                  <span className="text-lg font-bold text-indigo-700">
                    {activeCompanyLiqui ? activeCompanyLiqui.getEstado() : 'SIN LIQUIDAR'}
                  </span>
                  <span className="text-[9px] text-slate-500 mt-1">Periodo actual: 2026-07</span>
                </div>
              </div>

              {/* Main contextual row layout splits */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Left side: Checklist & Recientes */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                  
                  {/* Procedimiento de Trabajo */}
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Procedimiento Operativo de Liquidación</h3>
                    </div>
                    <div className="p-5 flex flex-col gap-3 text-xs">
                      
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-3">
                          <input type="checkbox" checked={activeEmpleados.length > 0} readOnly />
                          <div>
                            <p className="font-semibold text-slate-700">1. Cargar y Verificar Fichas de Empleados</p>
                            <p className="text-slate-500 mt-0.5">Control de CUIL, CBU y categoría del CCT aplicable.</p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 rounded text-[10px] font-bold">COMPLETADO</span>
                      </div>

                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-3">
                          <input type="checkbox" checked={!!activeCompanyLiqui} readOnly />
                          <div>
                            <p className="font-semibold text-slate-700">2. Ejecutar Liquidación Masiva Periodo Julio</p>
                            <p className="text-slate-500 mt-0.5">Evaluación automática de fórmulas de antigüedad y retención SIPA.</p>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                          activeCompanyLiqui ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-slate-100 border border-slate-200 text-slate-500'
                        }`}>
                          {activeCompanyLiqui ? 'REALIZADO' : 'PENDIENTE'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <input type="checkbox" checked={!!activeCompanyLiqui} readOnly />
                          <div>
                            <p className="font-semibold text-slate-700">3. Generar Libro de Sueldos Digital AFIP</p>
                            <p className="text-slate-500 mt-0.5">Exportación del archivo de homologación de conceptos impositivos.</p>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                          activeCompanyLiqui ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-slate-100 border border-slate-200 text-slate-500'
                        }`}>
                          {activeCompanyLiqui ? 'LISTO EXPORTAR' : 'BLOQUEADO'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Recent Activity logs for this client */}
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Historial Reciente de Liquidaciones</h3>
                    </div>
                    <div className="p-5 text-xs">
                      {activeCompanyLiqui ? (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase">
                              <th className="py-2">ID Proceso</th>
                              <th className="py-2">Periodo</th>
                              <th className="py-2 text-right">Recibos Emitidos</th>
                              <th className="py-2 text-right">Total Neto</th>
                              <th className="py-2">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                              <td className="py-3 font-mono font-semibold text-blue-600">{activeCompanyLiqui.id}</td>
                              <td className="py-3">2026-07 (Julio)</td>
                              <td className="py-3 text-right font-mono">{activeCompanyLiqui.getRecibos().length} recibos</td>
                              <td className="py-3 text-right font-mono font-bold text-slate-700">
                                ${activeCompanyLiqui.getRecibos().reduce((acc: number, r: any) => acc + r.totalNeto.toNumber(), 0).toLocaleString('es-AR', {minimumFractionDigits: 2})}
                              </td>
                              <td className="py-3">
                                <span className="px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 rounded text-[9px] font-bold uppercase">
                                  {activeCompanyLiqui.getEstado()}
                                </span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      ) : (
                        <p className="text-slate-500 text-center py-6">No se ha corrido ninguna liquidación para este cliente en el periodo actual.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side: Vencimientos y AFIP */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Próximos Vencimientos del Cliente</h3>
                    </div>
                    <div className="p-5 flex flex-col gap-4 text-xs text-slate-700">
                      <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                        <div>
                          <p className="font-semibold text-slate-800">Presentación Libro Sueldos Digital</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Vence: 12-Ago-2026</p>
                        </div>
                        <span className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded text-[9px] font-bold uppercase">Próximo</span>
                      </div>
                      <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                        <div>
                          <p className="font-semibold text-slate-800">Presentación Declaración F.931</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Vence: 13-Ago-2026</p>
                        </div>
                        <span className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded text-[9px] font-bold uppercase">Próximo</span>
                      </div>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-slate-800">Pago Cargas Sociales</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Vence: 13-Ago-2026</p>
                        </div>
                        <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-500 rounded text-[9px] font-bold uppercase">Planificado</span>
                      </div>
                    </div>
                  </div>

                  {/* Audit Event console */}
                  <div className="bg-[#0f172a] text-slate-400 border border-slate-900 rounded-xl shadow-sm overflow-hidden flex flex-col h-[230px]">
                    <div className="px-5 py-4 border-b border-slate-800 bg-[#090d18] flex items-center justify-between shrink-0">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Registro de Auditoría Temporal</h3>
                      <span className="text-[8px] font-mono text-slate-600">EventBus</span>
                    </div>
                    <div className="flex-grow p-4 font-mono text-[10px] overflow-y-auto flex flex-col-reverse gap-1.5 select-all">
                      {logs.map((log, idx) => (
                        <div key={idx} className="leading-relaxed">
                          {log.includes('[OK]') && <span className="text-green-400">{log}</span>}
                          {log.includes('[ERROR') && <span className="text-red-400">{log}</span>}
                          {log.includes('[Documento') && <span className="text-blue-400">{log}</span>}
                          {!log.includes('[OK]') && !log.includes('[ERROR') && !log.includes('[Documento') && <span>{log}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* ================= VIEW: CLIENTS DATOS & DOCUMENTOS ================= */}
          {currentView === 'clientes' && activeEmpresa && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Client Technical Form Card (ABM Read-Edit) */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Ficha de Datos del Cliente</h3>
                  <button
                    onClick={() => handleOpenEditClient(activeEmpresa)}
                    className="text-xs bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 font-bold px-3 py-1 rounded-lg transition-colors"
                  >
                    ✏️ Editar Información
                  </button>
                </div>
                
                <div className="p-6 text-xs text-slate-700 flex flex-col gap-6">
                  <div className="grid grid-cols-2 gap-6 border-b border-slate-100 pb-6">
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Razón Social</p>
                      <p className="text-sm font-bold text-slate-800">{activeEmpresa.getVersionVigente(new Date()).razonSocial}</p>
                      <p className="text-[11px] text-slate-500 mt-1">Nombre Comercial: {activeEmpresa.getVersionVigente(new Date()).nombreFantasia || '-'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">CUIT Impositivo</p>
                      <p className="text-sm font-mono font-bold text-slate-800">{activeEmpresa.getCuit().getFormatted()}</p>
                      <p className="text-[11px] text-slate-500 mt-1">Tipo: <span className="font-semibold">{activeEmpresa.getVersionVigente(new Date()).tipoCliente || 'Empresa'}</span></p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <p className="font-semibold text-slate-800 mb-2">Detalles AFIP</p>
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-2 leading-relaxed">
                        <p><span className="text-slate-400">Condición IVA:</span> {activeEmpresa.getVersionVigente(new Date()).condicionIva}</p>
                        <p><span className="text-slate-400">Actividad:</span> {activeEmpresa.getVersionVigente(new Date()).actividadPrincipal}</p>
                        <p><span className="text-slate-400">Código AFIP:</span> {activeEmpresa.getVersionVigente(new Date()).codigoAfip}</p>
                      </div>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 mb-2">Datos Bancarios</p>
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-2 font-mono leading-relaxed">
                        <p><span className="text-slate-400 font-sans">Banco:</span> {activeEmpresa.getVersionVigente(new Date()).cuentaBancaria || 'Banco Galicia'}</p>
                        <p className="text-[10px]"><span className="text-slate-400 font-sans">CBU:</span> {activeEmpresa.getVersionVigente(new Date()).cbu}</p>
                        <p><span className="text-slate-400 font-sans">Alias:</span> {activeEmpresa.getVersionVigente(new Date()).alias}</p>
                      </div>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 mb-2">Contacto & Legal</p>
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-2 leading-relaxed">
                        <p><span className="text-slate-400">Dirección:</span> {activeEmpresa.getVersionVigente(new Date()).legalAddress}</p>
                        <p><span className="text-slate-400">Email:</span> {activeEmpresa.getVersionVigente(new Date()).email}</p>
                        <p><span className="text-slate-400">Tel:</span> {activeEmpresa.getVersionVigente(new Date()).telefono || '-'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Document Repository Panel (ABM Documents categorized) */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Archivo de Documentación</h3>
                  <button
                    onClick={() => setShowAddDocModal(true)}
                    className="text-xs bg-blue-600 text-white hover:bg-blue-700 font-semibold px-3 py-1 rounded-lg transition-colors shadow-sm"
                  >
                    ➕ Archivar PDF
                  </button>
                </div>
                
                <div className="p-6 flex flex-col gap-4 text-xs">
                  <p className="text-slate-500">Documentos fiscales, legales y de seguros asociados al cliente actual:</p>
                  
                  <div className="flex flex-col gap-3 max-h-[350px] overflow-y-auto pr-1">
                    {activeEmpresa.getDocumentos().length > 0 ? (
                      activeEmpresa.getDocumentos().map((doc: any) => (
                        <div key={doc.id} className="p-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <span className="text-lg">📄</span>
                            <div>
                              <p className="font-semibold text-slate-800">{doc.nombre}</p>
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">{doc.fileName}</p>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 rounded text-[9px] font-bold uppercase">
                            {doc.tipo}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400 text-center py-6">No hay documentos archivados para este cliente.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Edit Client Modal */}
              {showEditClientModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Modificar Datos del Cliente</h3>
                      <button onClick={() => setShowEditClientModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                    </div>
                    <form onSubmit={handleEditCompany} className="p-6 flex flex-col gap-4 text-xs text-slate-700">
                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Razón Social</label>
                        <input required type="text" value={newCompRazonSocial} onChange={e => setNewCompRazonSocial(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Tipo de Cliente</label>
                          <select value={newCompTipoCliente} onChange={e => setNewCompTipoCliente(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 bg-white">
                            <option value="Empresa">Empresa (SA/SRL)</option>
                            <option value="Monotributista">Monotributista</option>
                            <option value="Persona Física">Persona Física</option>
                            <option value="Profesional">Profesional Independiente</option>
                            <option value="Asociación">Asociación Civil</option>
                            <option value="Fundación">Fundación</option>
                            <option value="Cooperativa">Cooperativa</option>
                            <option value="Consorcio">Consorcio de Propietarios</option>
                            <option value="Otro">Otro</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Condición IVA</label>
                          <select value={newCompCondicionIva} onChange={e => setNewCompCondicionIva(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 bg-white">
                            <option value="Responsable Inscripto">Responsable Inscripto</option>
                            <option value="Exento">IVA Exento</option>
                            <option value="Monotributo">Monotributo</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Domicilio Legal</label>
                        <input required type="text" value={newCompLegalAddress} onChange={e => setNewCompLegalAddress(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Email</label>
                          <input required type="email" value={newCompEmail} onChange={e => setNewCompEmail(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Teléfono</label>
                          <input type="text" value={newCompTelefono} onChange={e => setNewCompTelefono(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-200">
                        <button type="button" onClick={() => setShowEditClientModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg font-semibold hover:bg-slate-50 text-slate-500">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm">Guardar Cambios</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Add Document Modal */}
              {showAddDocModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Archivar Documentación PDF/Imagen</h3>
                      <button onClick={() => setShowAddDocModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                    </div>
                    <form onSubmit={handleAddDocument} className="p-6 flex flex-col gap-4 text-xs text-slate-700">
                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Nombre Descriptivo</label>
                        <input required type="text" value={newDocNombre} onChange={e => setNewDocNombre(e.target.value)} placeholder="Ej: Póliza de ART 2026" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Categoría del Archivo</label>
                          <select value={newDocTipo} onChange={e => setNewDocTipo(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 bg-white">
                            <option value="Contrato">Contrato</option>
                            <option value="ART">ART</option>
                            <option value="Seguro">Seguro de Vida/Retiro</option>
                            <option value="MiPyME">Certificado MiPyME</option>
                            <option value="Estatutos">Estatutos/Poderes</option>
                            <option value="AFIP">AFIP / F.931</option>
                            <option value="Otro">Otro PDF</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Nombre de Archivo</label>
                          <input required type="text" value={newDocFileName} onChange={e => setNewDocFileName(e.target.value)} placeholder="Ej: art_prevencion_2026.pdf" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 font-mono" />
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-200">
                        <button type="button" onClick={() => setShowAddDocModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg font-semibold hover:bg-slate-50 text-slate-500">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm">Archivar Documento</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= VIEW: EMPLOYEES LEGADOS (ABM + FICHA + VACATIONS + EMBARGOS) ================= */}
          {currentView === 'empleados' && activeEmpresa && (
            <div className="flex flex-col gap-6">
              
              {/* Search & Actions Bar */}
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="Buscar legajo, apellido, nombre o CUIL..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-4 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:border-blue-500 text-slate-700 shadow-sm"
                  />
                  <span className="absolute left-2.5 top-2.5 text-slate-400 text-xs">🔍</span>
                </div>
                
                <button
                  onClick={() => setShowAddEmployeeModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
                >
                  ➕ Registrar Nuevo Colaborador
                </button>
              </div>

              {/* Main row grid split */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* List Table */}
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Fichas de Legajo del Cliente ({filteredEmpleados.length})</h3>
                  </div>
                  <div className="p-6">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase">
                          <th className="py-2.5 font-mono">Legajo</th>
                          <th className="py-2.5">Colaborador</th>
                          <th className="py-2.5">Fecha Ingreso</th>
                          <th className="py-2.5">Estado</th>
                          <th className="py-2.5 text-right">Ficha / Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEmpleados.length > 0 ? (
                          filteredEmpleados.map(emp => {
                            const ver = emp.getVersiones()[0];
                            return (
                              <tr key={emp.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${selectedEmpleadoId === emp.id ? 'bg-blue-50/40' : ''}`}>
                                <td className="py-3 font-mono font-semibold text-slate-800">{ver.legajo}</td>
                                <td className="py-3 font-semibold text-slate-800">{ver.apellido}, {ver.nombre}</td>
                                <td className="py-3 text-slate-600">{ver.fechaIngreso.toLocaleDateString()}</td>
                                <td className="py-3">
                                  <span className={`px-2 py-0.5 border text-[9px] font-bold rounded uppercase ${
                                    ver.estado === 'ACTIVO' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-100 border-slate-200 text-slate-500'
                                  }`}>
                                    {ver.estado}
                                  </span>
                                </td>
                                <td className="py-3 text-right flex justify-end gap-2">
                                  <button
                                    onClick={() => handleOpenEditEmployee(emp)}
                                    className="text-slate-600 hover:text-slate-900 font-bold px-2 py-1 rounded border border-slate-200 bg-white shadow-sm"
                                  >
                                    ✏️ Editar
                                  </button>
                                  <button
                                    onClick={() => setSelectedEmpleadoId(emp.id)}
                                    className="text-blue-700 hover:text-blue-900 font-bold px-2 py-1 rounded border border-blue-200 bg-blue-50 shadow-sm"
                                  >
                                    Ficha 👁️
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-500">Ningún empleado registrado en esta cliente todavía.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Legajo Card Sheet Details + Vacations & Embargos Registry */}
                <div className="lg:col-span-5 flex flex-col gap-6">
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-grow flex flex-col">
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Ficha Completa de Legajo</h3>
                      {selectedEmpleadoId && (
                        <div className="flex gap-2">
                          <button onClick={() => setShowVacationModal(true)} className="text-[10px] bg-slate-100 hover:bg-slate-200 font-bold px-2 py-1 rounded border border-slate-300 text-slate-700">🏖️ Vacaciones</button>
                          <button onClick={() => setShowEmbargoModal(true)} className="text-[10px] bg-red-50 hover:bg-red-100 font-bold px-2 py-1 rounded border border-red-200 text-red-700">⚖️ Embargos</button>
                        </div>
                      )}
                    </div>
                    {selectedEmpleadoId ? (() => {
                      const emp = empleados.find(e => e.id === selectedEmpleadoId);
                      const ver = emp.getVersiones()[0];
                      return (
                        <div className="p-6 flex flex-col gap-5 text-xs text-slate-700 flex-grow">
                          {/* Header name */}
                          <div className="flex items-center gap-3.5 border-b border-slate-100 pb-4">
                            <div className="h-10 w-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-inner">
                              {ver.nombre[0]}{ver.apellido[0]}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">{ver.apellido}, {ver.nombre}</p>
                              <p className="text-[10px] text-slate-500 font-mono">Legajo: {ver.legajo} | CUIL: {emp.getCuil().getFormatted()}</p>
                            </div>
                          </div>

                          {/* Ficha details */}
                          <div className="flex flex-col gap-4">
                            <div>
                              <p className="font-bold text-slate-800 mb-1.5 uppercase text-[9px] tracking-wider">Datos Personales</p>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-slate-50 border border-slate-200/60 rounded-xl p-3 leading-relaxed">
                                <p><span className="text-slate-400">DNI:</span> {ver.dni}</p>
                                <p><span className="text-slate-400">Sexo:</span> {ver.sexo}</p>
                                <p><span className="text-slate-400">Email:</span> {ver.email}</p>
                                <p><span className="text-slate-400">Teléfono:</span> {ver.telefono || '-'}</p>
                              </div>
                            </div>

                            <div>
                              <p className="font-bold text-slate-800 mb-1.5 uppercase text-[9px] tracking-wider">Detalles Laborales & Salariales</p>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-slate-50 border border-slate-200/60 rounded-xl p-3 leading-relaxed">
                                <p><span className="text-slate-400">Fecha Ingreso:</span> {ver.fechaIngreso.toLocaleDateString()}</p>
                                <p><span className="text-slate-400">Banco:</span> {ver.banco || '-'}</p>
                                <p className="col-span-2 text-[10px] font-mono"><span className="text-slate-400 font-sans">CBU:</span> {ver.cbu}</p>
                                <p className="col-span-2 font-mono"><span className="text-slate-400 font-sans">Alias:</span> {ver.alias}</p>
                              </div>
                            </div>

                            {/* Vacaciones Registradas */}
                            <div>
                              <p className="font-bold text-slate-800 mb-1.5 uppercase text-[9px] tracking-wider">Historial de Vacaciones Gozadas ({emp.getVacaciones().length})</p>
                              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 flex flex-col gap-2">
                                {emp.getVacaciones().map((v: any) => (
                                  <div key={v.id} className="flex justify-between items-center text-[11px]">
                                    <span className="text-slate-600">Periodo {v.periodo} ({v.diasDisponibles} días)</span>
                                    <span className="font-mono text-slate-700 font-semibold">Desde: {v.fechaInicio.toLocaleDateString()}</span>
                                  </div>
                                ))}
                                {emp.getVacaciones().length === 0 && <p className="text-slate-400 text-center py-2">No hay vacaciones gozadas registradas.</p>}
                              </div>
                            </div>

                            {/* Embargos Activos */}
                            <div>
                              <p className="font-bold text-red-800 mb-1.5 uppercase text-[9px] tracking-wider">Retenciones Judiciales y Embargos ({emp.getEmbargos().length})</p>
                              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 flex flex-col gap-2">
                                {emp.getEmbargos().map((e: any) => (
                                  <div key={e.id} className="flex justify-between items-start text-[11px] border-b border-slate-200/40 pb-1.5 last:border-0 last:pb-0">
                                    <div>
                                      <p className="font-semibold text-slate-700">{e.juzgado}</p>
                                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">{e.expediente}</p>
                                    </div>
                                    <span className="font-mono font-bold text-red-600">-{e.porcentaje.toString()}%</span>
                                  </div>
                                ))}
                                {emp.getEmbargos().length === 0 && <p className="text-slate-400 text-center py-2">Sin retenciones judiciales activas.</p>}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })() : (
                      <div className="m-auto text-center p-12 text-slate-400">
                        <p className="text-sm">Selecciona un colaborador en la tabla de legajos para auditar su ficha completa de RR.HH.</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Add Employee Modal (ABM) */}
              {showAddEmployeeModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Alta de Legajo - {activeEmpresa.getVersionVigente(new Date()).razonSocial}</h3>
                      <button onClick={() => setShowAddEmployeeModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                    </div>
                    <form onSubmit={handleAddEmployee} className="p-6 flex flex-col gap-4 text-xs text-slate-700 max-h-[78vh] overflow-y-auto">
                      <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-3 text-[11px] leading-relaxed">
                        ℹ️ <strong>Legajo automático:</strong> El número de legajo correlativo se asignará en el servidor al registrar el colaborador.
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">DNI (Obligatorio)</label>
                          <input required type="text" value={newEmpDni} onChange={e => setNewEmpDni(e.target.value.replace(/\D/g, ''))} placeholder="Ej: 36123456" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Sexo (Obligatorio)</label>
                          <select required value={newEmpSexo} onChange={e => setNewEmpSexo(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 bg-white">
                            <option value="M">Masculino</option>
                            <option value="F">Femenino</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Apellido (Obligatorio)</label>
                          <input required type="text" value={newEmpApellido} onChange={e => setNewEmpApellido(e.target.value)} placeholder="Ej: Pérez" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Nombre Completo (Obligatorio)</label>
                          <input required type="text" value={newEmpNombre} onChange={e => setNewEmpNombre(e.target.value)} placeholder="Ej: Juan Román" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">CUIL (Cálculo Automático)</label>
                          <input readOnly type="text" value={newEmpCuil} placeholder="Ej: 20-36123456-9" className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500 font-mono font-semibold" />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Fecha Nacimiento (Obligatorio)</label>
                          <input required type="date" value={newEmpFechaNacimiento} onChange={e => setNewEmpFechaNacimiento(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 font-mono" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Fecha Ingreso (Obligatorio)</label>
                          <input required type="date" value={newEmpFechaIngreso} onChange={e => setNewEmpFechaIngreso(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 font-mono" />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Convenio (Obligatorio)</label>
                          <select required value={newEmpConvenio} onChange={e => {
                            setNewEmpConvenio(e.target.value);
                            if (convenio && convenio.id === e.target.value) {
                              const activeScale = convenio.getEscalas()[0];
                              if (activeScale && activeScale.getCategorias().length > 0) {
                                setNewEmpCategoria(activeScale.getCategorias()[0].id);
                                setNewEmpBasic(activeScale.getCategorias()[0].valorMensual.toString());
                              }
                            }
                          }} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 bg-white">
                            <option value="">Seleccione convenio...</option>
                            {convenio && (
                              <option value={convenio.getVersiones()[0].convenioId}>{convenio.getVersiones()[0].nombre}</option>
                            )}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Categoría (Obligatorio)</label>
                          <select required value={newEmpCategoria} onChange={e => {
                            setNewEmpCategoria(e.target.value);
                            if (convenio) {
                              const activeScale = convenio.getEscalas()[0];
                              const catObj = activeScale?.getCategorias().find((c: any) => c.id === e.target.value);
                              if (catObj) {
                                setNewEmpBasic(catObj.valorMensual.toString());
                              }
                            }
                          }} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 bg-white">
                            <option value="">Seleccione categoría...</option>
                            {convenio && convenio.getEscalas()[0]?.getCategorias().map((c: any) => (
                              <option key={c.id} value={c.id}>{c.nombre} ({c.codigo})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Sueldo Básico de la Categoría</label>
                          <input readOnly type="text" value={`$ ${parseFloat(newEmpBasic).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`} className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500 font-mono font-bold" />
                        </div>
                      </div>

                      <div className="border-t border-slate-200/60 pt-3 mt-1">
                        <p className="font-bold text-slate-800 mb-2 uppercase text-[9px] tracking-wider">Información Bancaria y Contacto (Opcional)</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-slate-500 font-semibold mb-1">Banco</label>
                            <input type="text" value={newEmpBanco} onChange={e => setNewEmpBanco(e.target.value)} placeholder="Ej: Banco Galicia" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                          </div>
                          <div>
                            <label className="block text-slate-500 font-semibold mb-1">CBU Acreditación</label>
                            <input type="text" value={newEmpCbu} onChange={e => setNewEmpCbu(e.target.value.replace(/\D/g, ''))} placeholder="22 dígitos" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 font-mono" />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-3">
                          <div>
                            <label className="block text-slate-500 font-semibold mb-1">Email de Contacto</label>
                            <input type="email" value={newEmpEmail} onChange={e => setNewEmpEmail(e.target.value)} placeholder="Ej: colaborador@mail.com" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                          </div>
                          <div>
                            <label className="block text-slate-500 font-semibold mb-1">Teléfono</label>
                            <input type="text" value={newEmpTelefono} onChange={e => setNewEmpTelefono(e.target.value)} placeholder="Ej: 11-2345-6789" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 font-mono" />
                          </div>
                        </div>

                        <div className="mt-3">
                          <label className="block text-slate-500 font-semibold mb-1">Observaciones</label>
                          <textarea value={newEmpObservaciones} onChange={e => setNewEmpObservaciones(e.target.value)} placeholder="Notas internas..." rows={2} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-200">
                        <button type="button" onClick={() => setShowAddEmployeeModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg font-semibold hover:bg-slate-50 text-slate-500">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm">Registrar Colaborador</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Edit Employee Modal */}
              {showEditEmployeeModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Modificar Legajo - {newEmpLegajo}</h3>
                      <button onClick={() => setShowEditEmployeeModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                    </div>
                    <form onSubmit={handleEditEmployee} className="p-6 flex flex-col gap-4 text-xs text-slate-700">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Apellido</label>
                          <input required type="text" value={newEmpApellido} onChange={e => setNewEmpApellido(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Nombre Completo</label>
                          <input required type="text" value={newEmpNombre} onChange={e => setNewEmpNombre(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Banco</label>
                          <input type="text" value={newEmpBanco} onChange={e => setNewEmpBanco(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-slate-500 font-semibold mb-1">CBU</label>
                          <input type="text" value={newEmpCbu} onChange={e => setNewEmpCbu(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 font-mono" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Alias Bancario</label>
                        <input type="text" value={newEmpAlias} onChange={e => setNewEmpAlias(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 font-mono" />
                      </div>

                      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-200">
                        <button type="button" onClick={() => setShowEditEmployeeModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg font-semibold hover:bg-slate-50 text-slate-500">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm">Guardar Legajo</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Vacation Modal */}
              {showVacationModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Registrar Licencia por Vacaciones</h3>
                      <button onClick={() => setShowVacationModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                    </div>
                    <form onSubmit={handleAddVacation} className="p-6 flex flex-col gap-4 text-xs text-slate-700">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Periodo Anual</label>
                          <input required type="text" value={vacPeriodo} onChange={e => setVacPeriodo(e.target.value)} placeholder="Ej: 2026" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 font-mono" />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Días Corridos</label>
                          <input required type="number" value={vacDias} onChange={e => setVacDias(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 font-mono" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Fecha de Inicio de Goce</label>
                        <input required type="date" value={vacFechaInicio} onChange={e => setVacFechaInicio(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 font-mono" />
                      </div>
                      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-200">
                        <button type="button" onClick={() => setShowVacationModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg font-semibold hover:bg-slate-50 text-slate-500">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm">Autorizar Licencia</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Embargo Modal */}
              {showEmbargoModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-red-800">Registrar Retención Judicial / Embargo</h3>
                      <button onClick={() => setShowEmbargoModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                    </div>
                    <form onSubmit={handleAddEmbargo} className="p-6 flex flex-col gap-4 text-xs text-slate-700">
                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Juzgado Solicitante</label>
                        <input required type="text" value={embJuzgado} onChange={e => setEmbJuzgado(e.target.value)} placeholder="Ej: Juzgado de Trabajo Nro 2" className="w-full p-2 border border-slate-200 rounded-lg text-slate-700" />
                      </div>
                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Número de Expediente</label>
                        <input required type="text" value={embExpediente} onChange={e => setEmbExpediente(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 font-mono" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Tipo de Retención</label>
                          <select value={embTipo} onChange={e => setEmbTipo(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 bg-white">
                            <option value="PORCENTAJE">Porcentaje (%)</option>
                            <option value="FIJO">Monto Fijo ($)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Porcentaje / Monto</label>
                          <input required type="number" value={embValor} onChange={e => setEmbValor(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 font-mono" />
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-200">
                        <button type="button" onClick={() => setShowEmbargoModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg font-semibold hover:bg-slate-50 text-slate-500">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-sm">Aplicar Retención</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ================= VIEW: CONVENIOS & ESCALAS ================= */}
          {currentView === 'convenios' && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Convenio Colectivo y Escalas Salariales</h3>
                <button
                  onClick={() => {
                    if (convenio) {
                      setEditBasicSalary(convenio.escalas[0].categorias[0].valorMensual.toNumber().toString());
                      setShowEditScaleModal(true);
                    }
                  }}
                  className="text-xs bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 font-bold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                >
                  ✏️ Ajustar Escala Básicos
                </button>
              </div>
              <div className="p-6 flex flex-col gap-6 text-xs text-slate-700">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800 mb-1">Convenio 130/75 - Empleados de Comercio</h4>
                  <p className="text-slate-500">Escalas aplicadas a la nómina comercial del periodo actual.</p>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">Escala de Salarios Básicos Oficiales</div>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase bg-slate-50/50">
                        <th className="p-3">Categoría</th>
                        <th className="p-3 text-right">Valor Hora</th>
                        <th className="p-3 text-right">Valor Jornada</th>
                        <th className="p-3 text-right">Básico Mensual Oficial</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-semibold">Administrativo A (Auxiliar de cuentas)</td>
                        <td className="p-3 text-right font-mono">$1.136,36</td>
                        <td className="p-3 text-right font-mono">$9.090,90</td>
                        <td className="p-3 text-right font-mono font-semibold text-slate-700">
                          ${convenio ? convenio.escalas[0].categorias[0].valorMensual.toNumber().toLocaleString('es-AR', {minimumFractionDigits: 2}) : '250.000,00'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Edit Scale Modal */}
              {showEditScaleModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Ajustar Escala Salario Básico</h3>
                      <button onClick={() => setShowEditScaleModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                    </div>
                    <form onSubmit={handleEditScale} className="p-6 flex flex-col gap-4 text-xs text-slate-700">
                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Monto Básico Mensual Oficial (ARS)</label>
                        <input required type="number" value={editBasicSalary} onChange={e => setEditBasicSalary(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 font-mono" />
                      </div>
                      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-200">
                        <button type="button" onClick={() => setShowEditScaleModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg font-semibold hover:bg-slate-50 text-slate-500">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm">Aplicar Aumento</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= VIEW: CONCEPTOS & AST PLAYGROUND ================= */}
          {currentView === 'conceptos' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Conceptos Salariales Habilitados</h3>
                </div>
                <div className="p-6">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase">
                        <th className="py-2">Código</th>
                        <th className="py-2">Concepto</th>
                        <th className="py-2">Tipo</th>
                        <th className="py-2 font-mono">Código AFIP</th>
                        <th className="py-2 text-right">Auditoría</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conceptos.map(c => {
                        const ver = c.getVersiones()[0];
                        return (
                          <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="py-3 font-mono font-semibold text-slate-800">{c.codigo}</td>
                            <td className="py-3">
                              <div className="font-semibold text-slate-800">{ver.nombre}</div>
                              <div className="text-[9px] text-slate-400 font-mono mt-0.5">{ver.formula}</div>
                            </td>
                            <td className="py-3">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                ver.tipo === 'REMUNERATIVO'
                                  ? 'bg-blue-50 border border-blue-200 text-blue-700'
                                  : ver.tipo === 'DESCUENTO'
                                  ? 'bg-red-50 border border-red-200 text-red-700'
                                  : 'bg-slate-50 border border-slate-200 text-slate-700'
                              }`}>
                                {ver.tipo}
                              </span>
                            </td>
                            <td className="py-3 font-mono text-slate-600">{ver.codigoAfip}</td>
                            <td className="py-3 text-right">
                              <button
                                onClick={() => setSelectedConcept(c)}
                                className="text-blue-600 hover:text-blue-800 font-semibold"
                              >
                                Inspeccionar AST ⚙️
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* AST Evaluator Playground Panel */}
              <div className="lg:col-span-5 flex flex-col gap-6">
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col">
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Evaluación de Reglas AST</h3>
                  </div>
                  {selectedConcept ? (
                    <div className="p-6 flex-grow flex flex-col gap-4 text-xs text-slate-700">
                      <div>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Concepto Seleccionado:</p>
                        <p className="text-sm font-semibold text-slate-800 mt-0.5">{selectedConcept.getVersiones()[0].nombre}</p>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="font-semibold text-slate-600">Expresión Matemática (Fórmula):</label>
                        <div className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs shadow-inner">
                          {selectedConcept.getVersiones()[0].formula}
                        </div>
                      </div>

                      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex flex-col gap-3">
                        <h4 className="font-bold text-slate-700 border-b border-slate-200 pb-2">Simulador de Evaluación AST</h4>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500">Variable: <span className="font-mono text-slate-700 font-bold">BASIC</span></span>
                          <span className="font-mono font-bold">
                            ${convenio ? convenio.escalas[0].categorias[0].valorMensual.toNumber().toLocaleString('es-AR') : '250.000,00'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500">Variable: <span className="font-mono text-slate-700 font-bold">ANTIGUEDAD_PORC</span></span>
                          <span className="font-mono font-bold">8.00 %</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500">Variable: <span className="font-mono text-slate-700 font-bold">REMUNERATIVO_TOTAL</span></span>
                          <span className="font-mono font-bold">$270.000,00</span>
                        </div>

                        <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                          <span className="font-bold text-slate-800">Resultado AST Evaluado:</span>
                          <span className="font-mono text-blue-600 font-bold text-sm">
                            ${(() => {
                              try {
                                const formula = selectedConcept.getVersiones()[0].formula;
                                const basicSal = convenio ? convenio.escalas[0].categorias[0].valorMensual.toNumber() : 250000.00;
                                const context = new Map<string, any>([
                                  ['BASIC', new Decimal(basicSal)],
                                  ['ANTIGUEDAD_PORC', new Decimal(8)],
                                  ['REMUNERATIVO_TOTAL', new Decimal(basicSal + basicSal*0.08)]
                                ]);
                                const res = FormulaEvaluator.evaluate(formula, context);
                                return parseFloat(res.toString()).toLocaleString('es-AR', {minimumFractionDigits: 2});
                              } catch {
                                return '0,00';
                              }
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="m-auto text-center p-12 text-slate-400">
                      <p className="text-sm">Seleccione un concepto para auditar su AST y evaluar sus dependencias salariales.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= VIEW: LIQUIDACIONES & RECIBOS ================= */}
          {currentView === 'liquidaciones' && activeEmpresa && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Calculation Panel */}
              <div className="lg:col-span-5 flex flex-col gap-6">
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Cockpit de Liquidación</h3>
                  </div>
                  <div className="p-6 flex flex-col gap-4 text-xs">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Periodo Impositivo</label>
                        <select className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 bg-white">
                          <option>2026-07 (Julio)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Quincena</label>
                        <select className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 bg-white">
                          <option>0 - Mensual Completo</option>
                        </select>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-4 flex flex-col gap-3">
                      <h4 className="font-bold text-slate-700 mb-1">Cargar Novedades de Horas Extras de la Nómina</h4>
                      <p className="text-slate-400 text-[10px]">Carga interactiva de novedades del periodo actual:</p>
                      
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Horas Extras al 50%</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setExtraHours50(prev => Math.max(0, prev - 1))} className="h-6 w-6 rounded bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-500 hover:bg-slate-200">-</button>
                          <span className="w-6 text-center font-mono font-bold">{extraHours50}</span>
                          <button onClick={() => setExtraHours50(prev => prev + 1)} className="h-6 w-6 rounded bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-500 hover:bg-slate-200">+</button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-slate-600">
                        <span>Horas Extras al 100%</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setExtraHours100(prev => Math.max(0, prev - 1))} className="h-6 w-6 rounded bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-500 hover:bg-slate-200">-</button>
                          <span className="w-6 text-center font-mono font-bold">{extraHours100}</span>
                          <button onClick={() => setExtraHours100(prev => prev + 1)} className="h-6 w-6 rounded bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-500 hover:bg-slate-200">+</button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-slate-600">
                        <span>Feriados Nacionales Trabajados</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setFeriadosTrabajados(prev => Math.max(0, prev - 1))} className="h-6 w-6 rounded bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-500 hover:bg-slate-200">-</button>
                          <span className="w-6 text-center font-mono font-bold">{feriadosTrabajados}</span>
                          <button onClick={() => setFeriadosTrabajados(prev => prev + 1)} className="h-6 w-6 rounded bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-500 hover:bg-slate-200">+</button>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleCalculatePayroll}
                      disabled={calculating}
                      className="w-full mt-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md transition-all active:scale-[0.99] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                    >
                      {calculating ? 'Procesando AST en Lote...' : '⚙️ Ejecutar Proceso de Liquidación'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Calculations Outputs */}
              <div className="lg:col-span-7 flex flex-col gap-6">
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Recibos Emitidos del Cliente ({activeCompanyLiqui ? activeCompanyLiqui.getRecibos().length : 0})</h3>
                    <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold uppercase">2026-07</span>
                  </div>
                  <div className="p-6">
                    {activeCompanyLiqui ? (
                      <div className="flex flex-col gap-4">
                        {activeCompanyLiqui.getRecibos().map((r: any) => {
                          const eObj = empleados.find(emp => emp.id === r.empleadoId);
                          const eVer = eObj.getVersiones()[0];
                          return (
                            <div key={r.id} className="p-5 border border-slate-200 rounded-xl flex flex-col gap-3.5 bg-slate-50/40">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-bold text-slate-800 text-xs">RECIBO DE HABERES • LEGAJO {eVer.legajo}</p>
                                  <p className="text-sm font-semibold text-slate-700 mt-0.5">{eVer.apellido}, {eVer.nombre}</p>
                                  <p className="text-[9px] text-slate-400 font-mono mt-1">SHA256: {r.hashSha256}</p>
                                </div>
                                <span className="px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 text-[9px] font-bold rounded uppercase tracking-wider">
                                  {r.estado}
                                </span>
                              </div>

                              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white text-xs">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase text-[9px]">
                                      <th className="p-2 font-mono">Cod</th>
                                      <th className="p-2">Concepto</th>
                                      <th className="p-2 text-right">Haberes</th>
                                      <th className="p-2 text-right">Deducciones</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.getDetalles().map((d: any, idx: number) => (
                                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                        <td className="p-2 font-mono text-slate-500">{d.conceptoCodigo}</td>
                                        <td className="p-2 text-slate-700">{d.conceptoNombre}</td>
                                        <td className="p-2 text-right font-mono text-slate-700">
                                          {d.tipo === 'REMUNERATIVO' ? `$${d.subtotal.toNumber().toLocaleString('es-AR', {minimumFractionDigits: 2})}` : '-'}
                                        </td>
                                        <td className="p-2 text-right font-mono text-red-600">
                                          {d.tipo === 'DESCUENTO' ? `$${d.subtotal.toNumber().toLocaleString('es-AR', {minimumFractionDigits: 2})}` : '-'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              <div className="flex flex-col gap-1.5 text-xs text-slate-600 font-mono">
                                <div className="flex justify-between">
                                  <span>Total Remunerativo:</span>
                                  <span className="font-bold text-slate-700">${r.totalRemunerativo.toNumber().toLocaleString('es-AR', {minimumFractionDigits: 2})}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Total Descuentos:</span>
                                  <span className="font-bold text-red-600">-${r.totalDescuentos.toNumber().toLocaleString('es-AR', {minimumFractionDigits: 2})}</span>
                                </div>
                                <div className="flex justify-between text-sm font-bold border-t border-slate-200 pt-2 text-blue-700">
                                  <span>Neto a Cobrar:</span>
                                  <span>${r.totalNeto.toNumber().toLocaleString('es-AR', {minimumFractionDigits: 2})}</span>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3 mt-1 border-t border-slate-100 pt-3">
                                <button
                                  onClick={() => handleRectificar(r)}
                                  className="w-full py-2 bg-white border border-slate-200 hover:bg-slate-50 text-[11px] font-bold text-slate-700 rounded-lg transition-colors shadow-sm"
                                >
                                  ⛓️ Generar Rectificativa
                                </button>
                                <button
                                  onClick={() => addLog(`[Impresora] Recibo del colaborador ${eVer.legajo} enviado a cola de impresión.`)}
                                  className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-[11px] font-bold text-blue-700 rounded-lg transition-colors border border-blue-200 text-center shadow-sm"
                                >
                                  🖨️ Imprimir Recibo
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-slate-400">
                        <p className="text-sm">Aún no se han liquidado haberes para este periodo.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= VIEW: LIBRO DE SUELDOS ================= */}
          {currentView === 'libro' && activeEmpresa && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Libro de Sueldos Digital AFIP</h3>
                <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold uppercase">Exportador F.931</span>
              </div>
              <div className="p-6 flex flex-col gap-4 text-xs text-slate-700">
                <p>Genera el archivo consolidado con formato de columnas de ancho fijo para importar en Simplificación Registral / AFIP.</p>
                
                {activeCompanyLiqui ? (
                  <div className="flex flex-col gap-4 flex-grow">
                    <div className="p-4 bg-slate-900 text-slate-300 font-mono text-xs rounded-xl shadow-inner select-all leading-relaxed whitespace-pre h-40 overflow-y-auto">
{`1203012345630000202607100235123456000025000000000020000000000029700000024030000
2003012345630000202607200128123456000022000000000008800000000025168000020363200`}
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => addLog("[LSD AFIP] Archivo TXT de Libro de Sueldos Digital descargado con éxito.")}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm"
                      >
                        📥 Descargar TXT de Homologación
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 text-center py-6">Debes ejecutar la liquidación de haberes antes de exportar el libro digital.</p>
                )}
              </div>
            </div>
          )}

          {/* ================= VIEW: AFIP F.931 ================= */}
          {currentView === 'afip' && activeEmpresa && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Declaración Jurada Mensual AFIP F.931</h3>
              </div>
              <div className="p-6">
                {activeCompanyLiqui ? (
                  <div className="flex flex-col gap-6 text-xs text-slate-700">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      <div className="p-4 border border-slate-200 rounded-lg bg-slate-50">
                        <p className="font-bold text-slate-500 uppercase text-[9px] mb-1">Aportes Retenidos SIPA</p>
                        <p className="text-lg font-bold text-slate-800">$29.700,00</p>
                      </div>
                      <div className="p-4 border border-slate-200 rounded-lg bg-slate-50">
                        <p className="font-bold text-slate-500 uppercase text-[9px] mb-1">Contribuciones Patronales Totales (23%)</p>
                        <p className="text-lg font-bold text-slate-800">$62.100,00</p>
                      </div>
                      <div className="p-4 border border-slate-200 rounded-lg bg-blue-50 border-blue-200">
                        <p className="font-bold text-blue-500 uppercase text-[9px] mb-1">Total DDJJ a Depositar AFIP</p>
                        <p className="text-lg font-bold text-blue-700 font-mono">$70.200,00</p>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">Obligaciones Consolidadas de Seguridad Social</div>
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase bg-slate-50/50">
                            <th className="p-3">Código Subsistema</th>
                            <th className="p-3">Descripción</th>
                            <th className="p-3 text-right">Aportes</th>
                            <th className="p-3 text-right">Contribuciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="p-3 font-mono text-slate-500">301</td>
                            <td className="p-3">Jubilación Ordinaria (SIPA)</td>
                            <td className="p-3 text-right font-mono">$29.700,00</td>
                            <td className="p-3 text-right font-mono">$43.200,00</td>
                          </tr>
                          <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="p-3 font-mono text-slate-500">310</td>
                            <td className="p-3">Obra Social (L.23660)</td>
                            <td className="p-3 text-right font-mono">$8.100,00</td>
                            <td className="p-3 text-right font-mono">$16.200,00</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 text-xs text-center py-6">Calcula el periodo para proyectar la declaración jurada AFIP F.931.</p>
                )}
              </div>
            </div>
          )}

          {/* ================= VIEW: AUDITORIA TEMPORAL ================= */}
          {currentView === 'auditoria' && activeEmpresa && (
            <div className="flex flex-col gap-6">
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Trazabilidad Bitemporal & Ajustes Históricos</h3>
                </div>
                <div className="p-6">
                  {activeCompanyRects.length > 0 ? (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase">
                          <th className="py-2.5">Recibo Rectificativo</th>
                          <th className="py-2.5 font-mono">Original UUID Vinculado</th>
                          <th className="py-2.5">Periodo Ajustado</th>
                          <th className="py-2.5">Fecha de Pago Ajuste</th>
                          <th className="py-2.5 text-right">Neto Consolidado</th>
                          <th className="py-2.5 text-right">Variación Neta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeCompanyRects.map(r => (
                          <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="py-3 font-semibold text-slate-800">
                              {r.id}
                              <span className="ml-2 px-1.5 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded text-[9px] font-bold">
                                V{r.reciboVersion}
                              </span>
                            </td>
                            <td className="py-3 font-mono text-indigo-600 font-semibold">{r.rectificaReciboId}</td>
                            <td className="py-3 text-slate-600">{r.periodo}</td>
                            <td className="py-3 text-slate-600">{r.fechaPago.toLocaleDateString()}</td>
                            <td className="py-3 font-mono font-bold text-slate-700 text-right">${r.totalNeto.toNumber().toLocaleString('es-AR', {minimumFractionDigits: 2})}</td>
                            <td className="py-3 font-mono font-bold text-emerald-600 text-right">+$15.000,00</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center py-8 text-slate-400">
                      <p className="text-sm">No hay registros bitemporales emitidos para este cliente.</p>
                      <p className="text-xs text-slate-500 mt-1">Dirígete a la pestaña "Calcular Haberes" y haz clic en "Generar Rectificativa" para auditar.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= VIEW: DATABASE STATUS ================= */}
          {currentView === 'database' && (
            <div className="flex flex-col gap-6">
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Motor RDBMS</span>
                  <span className="text-xl font-bold text-slate-800">PostgreSQL v16.3</span>
                  <span className="text-[9px] text-green-600 font-bold uppercase">🟢 Conectado (SSL Require)</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-1.5 font-mono">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-sans">Host Alojamiento</span>
                  <span className="text-sm font-bold text-slate-800 truncate">ep-cool-snowflake-a5n95.aws.neon.tech</span>
                  <span className="text-[9px] text-slate-500 font-sans">Neon Serverless Database Cloud</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col gap-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Última Migración</span>
                  <span className="text-sm font-semibold text-slate-800 font-mono">20260723_init_schema</span>
                  <span className="text-[9px] text-slate-500">Prisma Client v7.9.0</span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Live Count Statistics */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Cantidades de Registros en Base de Datos</h3>
                  </div>
                  <div className="p-5 flex flex-col gap-3 text-xs">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                      <span className="font-semibold text-slate-700">Clientes del Estudio</span>
                      <span className="font-mono bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-800">{clientes.length}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                      <span className="font-semibold text-slate-700">Colaboradores (Legajos)</span>
                      <span className="font-mono bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-800">{empleados.length}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                      <span className="font-semibold text-slate-700">Procesos de Liquidaciones</span>
                      <span className="font-mono bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-800">{Object.keys(liquidaciones).length}</span>
                    </div>
                    <div className="flex justify-between items-center pb-2">
                      <span className="font-semibold text-slate-700">Recibos de Sueldo Emitidos</span>
                      <span className="font-mono bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-800">
                        {Object.values(liquidaciones).reduce((acc: number, liq: any) => acc + liq.getRecibos().length, 0)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Backup & Restore Console */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Consola de Copias de Seguridad (Backup & Restore)</h3>
                  </div>
                  <div className="p-5 flex flex-col gap-4 text-xs text-slate-700">
                    <p className="text-slate-500 leading-relaxed">
                      El estudio contable puede automatizar y ejecutar volcados SQL periódicos de la base de datos PostgreSQL desde la línea de comandos usando las siguientes herramientas estándar:
                    </p>
                    
                    <div className="flex flex-col gap-2">
                      <p className="font-bold text-slate-800">1. Generar Respaldo Completo (pg_dump):</p>
                      <div className="p-3 bg-slate-900 text-slate-300 font-mono text-[10px] rounded-lg select-all leading-normal">
                        pg_dump "postgresql://neondb_owner:***@ep-cool-snowflake-a5n95.us-east-2.aws.neon.tech/ar_payroll?sslmode=require" &gt; backup_estudio_perez.sql
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <p className="font-bold text-slate-800">2. Restaurar Copia de Seguridad (psql):</p>
                      <div className="p-3 bg-slate-900 text-slate-300 font-mono text-[10px] rounded-lg select-all leading-normal">
                        psql "postgresql://neondb_owner:***@ep-cool-snowflake-a5n95.us-east-2.aws.neon.tech/ar_payroll?sslmode=require" -f backup_estudio_perez.sql
                      </div>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
