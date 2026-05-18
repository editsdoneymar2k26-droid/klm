// -----------------------------------------
// HYPERCUT STORE BOT -- Sistema de Cargos e Permissoes
// -----------------------------------------

export type UserRole = 'user' | 'admin' | 'owner';

export type Permission =
  | 'manage_stock'
  | 'manage_users'
  | 'manage_gifts'
  | 'manage_broadcast'
  | 'manage_admins'
  | 'manage_logs'
  | 'bypass_stock'
  | 'add_balance'
  | 'fake_purchase'
  | 'view_admin_panel';

// Permissoes por cargo
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  user: [],

  admin: [
    'manage_stock',
    'manage_users',
    'manage_gifts',
    'manage_broadcast',
    'manage_logs',
    'view_admin_panel',
  ],

  owner: [
    'manage_stock',
    'manage_users',
    'manage_gifts',
    'manage_broadcast',
    'manage_admins',
    'manage_logs',
    'bypass_stock',
    'add_balance',
    'fake_purchase',
    'view_admin_panel',
  ],
};

export interface RoleUser {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string;
  role: UserRole;
}
