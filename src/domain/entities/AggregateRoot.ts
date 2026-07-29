import { DomainEvent } from '../events/DomainEvent';

export abstract class AggregateRoot {
  private _domainEvents: DomainEvent[] = [];

  public getDomainEvents(): DomainEvent[] {
    return [...this._domainEvents];
  }

  public clearDomainEvents(): void {
    this._domainEvents = [];
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }
}
