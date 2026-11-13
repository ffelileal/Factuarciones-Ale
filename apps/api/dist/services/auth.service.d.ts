import type { LoginResponseDto } from '@ar-payroll/contracts';
export declare function hashPassword(plainPassword: string): string;
export declare function verifyPassword(plainPassword: string, storedHash: string): boolean;
export declare class AuthService {
    login(params: {
        email: string;
        password: string;
        deviceName?: string;
        ipAddress?: string;
    }): Promise<LoginResponseDto>;
    selectWorkspace(rawToken: string, targetTenantId: string): Promise<{
        activeTenantId: string;
        roleCode: string;
    }>;
    getMe(rawToken: string): Promise<{
        user: {
            id: string;
            email: string;
            fullName: string;
        };
        activeTenantId: string | null;
        roleCode: string | null;
        requiresTenantSelection: boolean;
        memberships: {
            membershipId: string;
            tenantId: string;
            tenantSlug: string;
            tenantDisplayName: string;
            roleCode: "OWNER" | "ADMIN" | "LIQUIDATOR" | "VIEWER";
            roleName: string;
        }[];
        rlsContext: {
            current_db_user: string;
            verified_tenant_id: string | null;
            verified_user_id: string | null;
        };
    }>;
    logout(rawToken: string): Promise<void>;
}
export declare const authService: AuthService;
