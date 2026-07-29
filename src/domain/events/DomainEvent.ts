export interface DomainEvent {
  eventId: string;
  occurredOn: Date;
  tenantId: string;
  eventName: string;
  payload: any;
}
