import type pg from 'pg';
import { type ActivatedSessionContext } from '../db/pool.js';
export declare class UserService {
    registerWorkspaceUser(client: pg.PoolClient, input: {
        workspaceSlug: string;
        firstName: string;
        lastName: string;
        username: string;
        password: string;
    }): Promise<{
        user_id: string;
        username: string;
        full_name: string;
        tenant_id: string;
    }>;
    listManagedUsers(client: pg.PoolClient, ctx: ActivatedSessionContext): Promise<{
        id: string;
        username: string;
        full_name: string;
        email: string;
        status: string;
        created_at: string;
    }[]>;
    createManagedUser(client: pg.PoolClient, ctx: ActivatedSessionContext, input: {
        firstName: string;
        lastName: string;
        username: string;
        password: string;
    }): Promise<{
        user_id: string;
        username: string;
        full_name: string;
        tenant_id: string;
    }>;
    removeManagedUser(client: pg.PoolClient, ctx: ActivatedSessionContext, userId: string): Promise<{
        removed_user_id: string;
        user_status: string;
    }>;
    private assertOwner;
}
export declare const userService: UserService;
