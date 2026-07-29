import { EventEmitter } from 'events';
import { IDomainEventBus } from '@/domain/events/IDomainEventBus';
import { DomainEvent } from '@/domain/events/DomainEvent';

export class InMemoryEventBus implements IDomainEventBus {
  private static instance: InMemoryEventBus;
  private emitter: EventEmitter;

  private constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
  }

  public static getInstance(): InMemoryEventBus {
    if (!InMemoryEventBus.instance) {
      InMemoryEventBus.instance = new InMemoryEventBus();
    }
    return InMemoryEventBus.instance;
  }

  public async publish(event: DomainEvent): Promise<void> {
    console.log(`[EventBus] Emitiendo evento: ${event.eventName} para Tenant: ${event.tenantId}`);
    this.emitter.emit(event.eventName, event);
  }

  public subscribe(eventName: string, handler: (event: DomainEvent) => Promise<void>): void {
    this.emitter.on(eventName, async (event: DomainEvent) => {
      try {
        await handler(event);
      } catch (err: any) {
        console.error(`[EventBus Error] Fallo al procesar manejador de evento '${eventName}':`, err.message);
      }
    });
  }
}
