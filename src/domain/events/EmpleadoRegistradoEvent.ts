import { DomainEvent } from './DomainEvent';

export class EmpleadoRegistradoEvent implements DomainEvent {
  public readonly eventId: string;
  public readonly occurredOn: Date;
  public readonly eventName = 'EmpleadoRegistrado';

  public constructor(
    public readonly tenantId: string,
    public readonly payload: {
      empleadoId: string;
      clienteId: string;
      legajo: string;
      cuil: string;
      dni: string;
      nombre: string;
      apellido: string;
      registradoPor: string;
    }
  ) {
    this.eventId = Math.random().toString(36).substring(7);
    this.occurredOn = new Date();
  }
}
