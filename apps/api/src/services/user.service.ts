import type pg from 'pg';
import { AuthenticationError, type ActivatedSessionContext } from '../db/pool.js';
import { hashPassword } from './auth.service.js';

export class UserService {
  async registerWorkspaceUser(
    client: pg.PoolClient,
    input: { workspaceSlug: string; firstName: string; lastName: string; username: string; password: string },
  ) {
    try {
      const result = await client.query<{
        user_id: string;
        username: string;
        full_name: string;
        tenant_id: string;
      }>('SELECT * FROM auth_internal.register_user_for_tenant($1, $2, $3, $4, $5)', [
        input.workspaceSlug,
        input.firstName,
        input.lastName,
        input.username,
        hashPassword(input.password),
      ]);
      return result.rows[0];
    } catch (error) {
      if (error instanceof Error && error.message.includes('USERNAME_ALREADY_EXISTS')) {
        throw new AuthenticationError('El nombre de usuario ya está registrado.', 409);
      }
      throw error;
    }
  }

  async listManagedUsers(client: pg.PoolClient, ctx: ActivatedSessionContext) {
    this.assertOwner(ctx);
    const result = await client.query<{
      user_id: string;
      username: string;
      full_name: string;
      email: string;
      status: string;
      created_at: string;
    }>('SELECT * FROM auth_internal.list_managed_users()');
    return result.rows.map((row) => ({
      id: row.user_id,
      username: row.username,
      full_name: row.full_name,
      email: row.email,
      status: row.status,
      created_at: row.created_at,
    }));
  }

  async createManagedUser(
    client: pg.PoolClient,
    ctx: ActivatedSessionContext,
    input: { firstName: string; lastName: string; username: string; password: string },
  ) {
    this.assertOwner(ctx);
    if (!ctx.activeTenantId) {
      throw new AuthenticationError('Seleccioná un espacio de trabajo antes de dar de alta un usuario.', 400);
    }

    try {
      const result = await client.query<{
        user_id: string;
        username: string;
        full_name: string;
        tenant_id: string;
      }>('SELECT * FROM auth_internal.create_managed_user($1, $2, $3, $4)', [
        input.firstName,
        input.lastName,
        input.username,
        hashPassword(input.password),
      ]);
      return result.rows[0];
    } catch (error) {
      if (error instanceof Error && error.message.includes('USERNAME_ALREADY_EXISTS')) {
        throw new AuthenticationError('El nombre de usuario ya está registrado.', 409);
      }
      throw error;
    }
  }

  async removeManagedUser(
    client: pg.PoolClient,
    ctx: ActivatedSessionContext,
    userId: string,
  ) {
    this.assertOwner(ctx);
    try {
      const result = await client.query<{ removed_user_id: string; user_status: string }>(
        'SELECT * FROM auth_internal.remove_managed_user($1)',
        [userId],
      );
      return result.rows[0];
    } catch (error) {
      if (error instanceof Error && error.message.includes('CANNOT_REMOVE_SELF')) {
        throw new AuthenticationError('No podés eliminar tu propia cuenta OWNER.', 400);
      }
      if (error instanceof Error && error.message.includes('CANNOT_REMOVE_OWNER')) {
        throw new AuthenticationError('La cuenta OWNER no se puede eliminar.', 403);
      }
      throw error;
    }
  }

  private assertOwner(ctx: ActivatedSessionContext): void {
    if (ctx.roleCode !== 'OWNER') {
      throw new AuthenticationError('Solo el usuario OWNER puede administrar usuarios.', 403);
    }
  }
}

export const userService = new UserService();
