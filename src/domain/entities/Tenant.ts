import { AggregateRoot } from './AggregateRoot';

export class FeatureFlag {
  public readonly key: string;
  private active: boolean;
  public readonly environment: 'dev' | 'staging' | 'prod';
  public readonly rolloutPercentage: number; // 0 to 100
  public readonly expiresAt: Date | null;

  public constructor(
    key: string,
    active: boolean,
    environment: 'dev' | 'staging' | 'prod',
    rolloutPercentage: number,
    expiresAt: Date | null
  ) {
    if (rolloutPercentage < 0 || rolloutPercentage > 100) {
      throw new Error("El porcentaje de rollout debe estar entre 0 y 100.");
    }
    this.key = key;
    this.active = active;
    this.environment = environment;
    this.rolloutPercentage = rolloutPercentage;
    this.expiresAt = expiresAt;
  }

  public isActive(currentEnv: 'dev' | 'staging' | 'prod', userHashId?: string): boolean {
    if (!this.active) return false;
    if (this.environment !== currentEnv) return false;
    if (this.expiresAt && this.expiresAt < new Date()) return false;
    
    if (this.rolloutPercentage < 100 && userHashId) {
      // Deterministic rollout check using a simple hash modulo
      let hash = 0;
      for (let i = 0; i < userHashId.length; i++) {
        hash = (hash << 5) - hash + userHashId.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
      }
      const score = Math.abs(hash) % 100;
      return score < this.rolloutPercentage;
    }

    return true;
  }

  public toggle(state: boolean): void {
    this.active = state;
  }
}

export class Tenant extends AggregateRoot {
  public readonly id: string;
  private nombre: string;
  private subdominio: string;
  private estado: 'ACTIVO' | 'SUSPENDIDO';
  private featureFlags: Map<string, FeatureFlag>;

  private constructor(
    id: string,
    nombre: string,
    subdominio: string,
    estado: 'ACTIVO' | 'SUSPENDIDO',
    featureFlags: FeatureFlag[]
  ) {
    super();
    this.id = id;
    this.nombre = nombre;
    this.subdominio = subdominio;
    this.estado = estado;
    this.featureFlags = new Map(featureFlags.map(ff => [ff.key, ff]));
  }

  public static create(
    id: string,
    nombre: string,
    subdominio: string,
    estado?: 'ACTIVO' | 'SUSPENDIDO',
    featureFlags?: FeatureFlag[]
  ): Tenant {
    if (!nombre.trim()) throw new Error("El nombre del inquilino (Tenant) es obligatorio.");
    if (!subdominio.trim()) throw new Error("El subdominio es obligatorio.");
    return new Tenant(
      id,
      nombre.trim(),
      subdominio.trim().toLowerCase(),
      estado || 'ACTIVO',
      featureFlags || []
    );
  }

  public getNombre(): string { return this.nombre; }
  public getSubdominio(): string { return this.subdominio; }
  public getEstado(): string { return this.estado; }
  public getFeatureFlags(): FeatureFlag[] { return Array.from(this.featureFlags.values()); }

  public updateNombre(nombre: string): void {
    if (!nombre.trim()) throw new Error("El nombre no puede estar vacío.");
    this.nombre = nombre.trim();
  }

  public suspend(): void {
    this.estado = 'SUSPENDIDO';
  }

  public activate(): void {
    this.estado = 'ACTIVO';
  }

  public defineFeatureFlag(ff: FeatureFlag): void {
    this.featureFlags.set(ff.key, ff);
  }

  public isFeatureEnabled(key: string, env: 'dev' | 'staging' | 'prod', userId?: string): boolean {
    const ff = this.featureFlags.get(key);
    if (!ff) return false;
    return ff.isActive(env, userId);
  }
}
