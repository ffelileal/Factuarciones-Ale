import { AggregateRoot } from './AggregateRoot';
import { Periodo } from '../value-objects/Periodo';
import { Money } from '../value-objects/Money';

export type EstadoWorkflow =
  | 'BORRADOR'
  | 'VALIDANDO'
  | 'CALCULANDO'
  | 'GENERADO'
  | 'REVISADO'
  | 'APROBADO'
  | 'PAGADO'
  | 'EXPORTADO_AFIP'
  | 'CERRADO';

export class WorkflowLog {
  public readonly id: string;
  public readonly estadoOrigen: EstadoWorkflow;
  public readonly estadoDestino: EstadoWorkflow;
  public readonly comentario: string | null;
  public readonly userId: string;
  public readonly createdAt: Date;

  public constructor(
    id: string,
    estadoOrigen: EstadoWorkflow,
    estadoDestino: EstadoWorkflow,
    comentario: string | null,
    userId: string,
    createdAt: Date
  ) {
    this.id = id;
    this.estadoOrigen = estadoOrigen;
    this.estadoDestino = estadoDestino;
    this.comentario = comentario;
    this.userId = userId;
    this.createdAt = createdAt;
  }
}

export class ReciboDetalle {
  public readonly id: string;
  public readonly conceptoVersionId: string;
  public readonly conceptoCodigo: string;
  public readonly conceptoNombre: string;
  public readonly tipo: 'REMUNERATIVO' | 'NO_REMUNERATIVO' | 'DESCUENTO' | 'APORTE_PATRONAL' | 'CONTRIBUCION';
  public readonly cantidad: Money; // represented as Money for precision
  public readonly valorUnitario: Money;
  public readonly subtotal: Money;
  public readonly formulaAplicada: string | null;
  public readonly porcentajeAplicado: Money | null;

  public constructor(data: Omit<ReciboDetalle, 'id'>, id?: string) {
    this.id = id || Math.random().toString(36).substring(7);
    this.conceptoVersionId = data.conceptoVersionId;
    this.conceptoCodigo = data.conceptoCodigo;
    this.conceptoNombre = data.conceptoNombre;
    this.tipo = data.tipo;
    this.cantidad = data.cantidad;
    this.valorUnitario = data.valorUnitario;
    this.subtotal = data.subtotal;
    this.formulaAplicada = data.formulaAplicada;
    this.porcentajeAplicado = data.porcentajeAplicado;
  }
}

export class ReciboSueldo {
  public readonly id: string;
  public readonly empleadoId: string;
  public readonly empleadoVersionId: string;
  public readonly clienteId: string;
  public readonly clienteVersionId: string;
  public readonly convenioVersionId: string;
  public readonly escalaId: string;
  public readonly categoriaId: string;
  public readonly rectificaReciboId: string | null;
  public readonly cuil: string;
  public readonly cuit: string;
  public readonly periodo: string;
  public readonly quincena: number;
  public readonly basicoAplicado: Money;
  public readonly antiguedadAnos: number;
  public readonly totalRemunerativo: Money;
  public readonly totalNoRemunerativo: Money;
  public readonly totalDescuentos: Money;
  public readonly totalNeto: Money;
  public readonly costoLaboralTotal: Money;
  public readonly totalContribuciones: Money;
  public readonly uniqueCode: string;
  public readonly hashSha256: string;
  public readonly reciboVersion: number;
  public readonly firmaDigital: string | null;
  public readonly xmlData: string | null;
  public readonly fechaImpresion: Date | null;
  public readonly cantidadImpresiones: number;
  public readonly estado: 'EMITIDO' | 'FIRMADO' | 'ANULADO';
  public readonly fechaPago: Date;
  public readonly bancoPago: string | null;
  public readonly cbuPago: string | null;
  public readonly pdfUrl: string | null;
  private detalles: ReciboDetalle[] = [];

  public constructor(data: Omit<ReciboSueldo, 'id' | 'detalles' | 'getDetalles'> & { detalles: ReciboDetalle[] }, id?: string) {
    this.id = id || Math.random().toString(36).substring(7);
    this.empleadoId = data.empleadoId;
    this.empleadoVersionId = data.empleadoVersionId;
    this.clienteId = data.clienteId;
    this.clienteVersionId = data.clienteVersionId;
    this.convenioVersionId = data.convenioVersionId;
    this.escalaId = data.escalaId;
    this.categoriaId = data.categoriaId;
    this.rectificaReciboId = data.rectificaReciboId;
    this.cuil = data.cuil;
    this.cuit = data.cuit;
    this.periodo = data.periodo;
    this.quincena = data.quincena;
    this.basicoAplicado = data.basicoAplicado;
    this.antiguedadAnos = data.antiguedadAnos;
    this.totalRemunerativo = data.totalRemunerativo;
    this.totalNoRemunerativo = data.totalNoRemunerativo;
    this.totalDescuentos = data.totalDescuentos;
    this.totalNeto = data.totalNeto;
    this.costoLaboralTotal = data.costoLaboralTotal;
    this.totalContribuciones = data.totalContribuciones;
    this.uniqueCode = data.uniqueCode;
    this.hashSha256 = data.hashSha256;
    this.reciboVersion = data.reciboVersion;
    this.firmaDigital = data.firmaDigital;
    this.xmlData = data.xmlData;
    this.fechaImpresion = data.fechaImpresion;
    this.cantidadImpresiones = data.cantidadImpresiones;
    this.estado = data.estado;
    this.fechaPago = data.fechaPago;
    this.bancoPago = data.bancoPago;
    this.cbuPago = data.cbuPago;
    this.pdfUrl = data.pdfUrl;
    this.detalles = data.detalles;
  }

  public getDetalles(): ReciboDetalle[] {
    return [...this.detalles];
  }
}

export class Liquidacion extends AggregateRoot {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly clienteId: string;
  private periodo: Periodo;
  public readonly quincena: number;
  public readonly tipo: string; // MENSUAL, QUINCENAL, SAC, etc.
  private estado: EstadoWorkflow;
  public readonly fechaLiquidacion: Date;
  private recibos: ReciboSueldo[] = [];
  private workflowLogs: WorkflowLog[] = [];

  private constructor(
    id: string,
    tenantId: string,
    clienteId: string,
    periodo: Periodo,
    quincena: number,
    tipo: string,
    estado: EstadoWorkflow,
    fechaLiquidacion: Date,
    recibos: ReciboSueldo[],
    workflowLogs: WorkflowLog[]
  ) {
    super();
    this.id = id;
    this.tenantId = tenantId;
    this.clienteId = clienteId;
    this.periodo = periodo;
    this.quincena = quincena;
    this.tipo = tipo;
    this.estado = estado;
    this.fechaLiquidacion = fechaLiquidacion;
    this.recibos = recibos;
    this.workflowLogs = workflowLogs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  public static create(
    id: string,
    tenantId: string,
    clienteId: string,
    periodo: Periodo,
    quincena: number,
    tipo: string,
    userId: string
  ): Liquidacion {
    const logInicial = new WorkflowLog(
      Math.random().toString(36).substring(7),
      'BORRADOR',
      'BORRADOR',
      'Creación de liquidación',
      userId,
      new Date()
    );
    return new Liquidacion(id, tenantId, clienteId, periodo, quincena, tipo, 'BORRADOR', new Date(), [], [logInicial]);
  }

  public static reconstitute(
    id: string,
    tenantId: string,
    clienteId: string,
    periodo: Periodo,
    quincena: number,
    tipo: string,
    estado: EstadoWorkflow,
    fechaLiquidacion: Date,
    recibos: ReciboSueldo[],
    workflowLogs: WorkflowLog[]
  ): Liquidacion {
    return new Liquidacion(id, tenantId, clienteId, periodo, quincena, tipo, estado, fechaLiquidacion, recibos, workflowLogs);
  }

  public getPeriodo(): Periodo { return this.periodo; }
  public getEstado(): EstadoWorkflow { return this.estado; }
  public getRecibos(): ReciboSueldo[] { return [...this.recibos]; }
  public getWorkflowLogs(): WorkflowLog[] { return [...this.workflowLogs]; }

  public transicionarEstado(nuevoEstado: EstadoWorkflow, userId: string, comentario: string | null): void {
    if (this.estado === 'CERRADO') {
      throw new Error("No se pueden realizar transiciones en una liquidación cerrada.");
    }
    const log = new WorkflowLog(
      Math.random().toString(36).substring(7),
      this.estado,
      nuevoEstado,
      comentario,
      userId,
      new Date()
    );
    this.estado = nuevoEstado;
    this.workflowLogs.push(log);
  }

  public registrarRecibo(recibo: ReciboSueldo): void {
    if (this.estado !== 'CALCULANDO' && this.estado !== 'BORRADOR') {
      throw new Error("Solo se pueden registrar recibos en estado BORRADOR o CALCULANDO.");
    }
    const index = this.recibos.findIndex(r => r.empleadoId === recibo.empleadoId);
    if (index !== -1) {
      this.recibos[index] = recibo;
    } else {
      this.recibos.push(recibo);
    }
  }

  public eliminarRecibo(reciboId: string): void {
    if (this.estado !== 'CALCULANDO' && this.estado !== 'BORRADOR') {
      throw new Error("Solo se pueden eliminar recibos en estado BORRADOR o CALCULANDO.");
    }
    this.recibos = this.recibos.filter(r => r.id !== reciboId);
  }
}
