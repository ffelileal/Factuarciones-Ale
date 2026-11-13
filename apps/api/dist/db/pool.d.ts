import pg from 'pg';
export declare const tenantPool: import("pg").Pool;
export declare const adminPool: import("pg").Pool;
export interface ActivatedSessionContext {
    sessionId: string;
    userId: string;
    userEmail: string;
    userFullName: string;
    activeTenantId: string | null;
    tenantName: string | null;
    tenantSlug: string | null;
    membershipId: string | null;
    roleCode: string | null;
}
export declare class AuthenticationError extends Error {
    readonly statusCode: number;
    constructor(message: string, statusCode?: number);
}
export declare class TenantContextRequiredError extends Error {
    readonly statusCode = 403;
    constructor(message?: string);
}
export declare function hashSessionToken(rawToken: string): string;
export declare function withAuthenticatedTransaction<T>(rawToken: string, requireActiveTenant: boolean, fn: (client: pg.PoolClient, ctx: ActivatedSessionContext) => Promise<T>): Promise<T>;
