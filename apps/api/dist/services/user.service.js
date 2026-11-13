import { AuthenticationError } from '../db/pool.js';
import { hashPassword } from './auth.service.js';
export class UserService {
    async registerWorkspaceUser(client, input) {
        try {
            const result = await client.query('SELECT * FROM auth_internal.register_user_for_tenant($1, $2, $3, $4, $5)', [
                input.workspaceSlug,
                input.firstName,
                input.lastName,
                input.username,
                hashPassword(input.password),
            ]);
            return result.rows[0];
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('USERNAME_ALREADY_EXISTS')) {
                throw new AuthenticationError('El nombre de usuario ya está registrado.', 409);
            }
            throw error;
        }
    }
    async listManagedUsers(client, ctx) {
        this.assertOwner(ctx);
        const result = await client.query('SELECT * FROM auth_internal.list_managed_users()');
        return result.rows.map((row) => ({
            id: row.user_id,
            username: row.username,
            full_name: row.full_name,
            email: row.email,
            status: row.status,
            created_at: row.created_at,
        }));
    }
    async createManagedUser(client, ctx, input) {
        this.assertOwner(ctx);
        if (!ctx.activeTenantId) {
            throw new AuthenticationError('Seleccioná un espacio de trabajo antes de dar de alta un usuario.', 400);
        }
        try {
            const result = await client.query('SELECT * FROM auth_internal.create_managed_user($1, $2, $3, $4)', [
                input.firstName,
                input.lastName,
                input.username,
                hashPassword(input.password),
            ]);
            return result.rows[0];
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('USERNAME_ALREADY_EXISTS')) {
                throw new AuthenticationError('El nombre de usuario ya está registrado.', 409);
            }
            throw error;
        }
    }
    async removeManagedUser(client, ctx, userId) {
        this.assertOwner(ctx);
        try {
            const result = await client.query('SELECT * FROM auth_internal.remove_managed_user($1)', [userId]);
            return result.rows[0];
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('CANNOT_REMOVE_SELF')) {
                throw new AuthenticationError('No podés eliminar tu propia cuenta OWNER.', 400);
            }
            if (error instanceof Error && error.message.includes('CANNOT_REMOVE_OWNER')) {
                throw new AuthenticationError('La cuenta OWNER no se puede eliminar.', 403);
            }
            throw error;
        }
    }
    assertOwner(ctx) {
        if (ctx.roleCode !== 'OWNER') {
            throw new AuthenticationError('Solo el usuario OWNER puede administrar usuarios.', 403);
        }
    }
}
export const userService = new UserService();
