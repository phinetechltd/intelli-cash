import type { Permission, Role } from "@intellicash/shared";
import { rolePermissions, roles } from "@intellicash/shared";

export function isRole(value: string): value is Role {
  return roles.includes(value as Role);
}

export function permissionsForRole(role: string): Permission[] {
  return isRole(role) ? rolePermissions[role] : [];
}

export function hasPermission(role: string, permission: Permission) {
  return permissionsForRole(role).includes(permission);
}

export function assertPermission(role: string, permission: Permission) {
  if (!hasPermission(role, permission)) {
    throw new Error(`Role ${role} is missing permission ${permission}`);
  }
}
