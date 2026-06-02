import { permissions, rolePermissions, roles, type Permission, type Role } from "@intellicash/shared";
import { isRole } from "../domain/authorization";
import { prisma } from "../lib/prisma";

const permissionSet = new Set<string>(permissions);
const protectedAdminPermissions: Permission[] = ["users:read", "users:write"];
const apiKeyPermissions = new Set<Permission>(["api-keys:read", "api-keys:write"]);
let rolePermissionTemplateBootstrap: Promise<void> | null = null;

function readPermissionValues(value: string | null | undefined) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((permission): permission is Permission => permissionSet.has(permission)) : null;
  } catch {
    return null;
  }
}

function parsePermissions(value: string | null | undefined, role: Role): Permission[] {
  if (!value) return rolePermissions[role];

  const parsed = readPermissionValues(value);
  return parsed ?? rolePermissions[role];
}

export function normalizePermissionList(values: Permission[]) {
  return Array.from(new Set(values.filter((permission) => permissionSet.has(permission))));
}

export function validateRolePermissionUpdate(role: Role, values: Permission[]) {
  const normalized = normalizePermissionList(values);

  if (role === "IWL_ADMIN") {
    const missing = protectedAdminPermissions.filter((permission) => !normalized.includes(permission));
    if (missing.length > 0) {
      throw new Error(`IWL admin must keep ${missing.join(", ")} so access control remains recoverable.`);
    }
  }

  return normalized;
}

export async function ensureRolePermissionTemplates() {
  rolePermissionTemplateBootstrap ??= ensureRolePermissionTemplatesOnce();
  await rolePermissionTemplateBootstrap;
}

async function ensureRolePermissionTemplatesOnce() {
  const existingRows = await prisma.rolePermissionTemplate.findMany();
  const existingRowsHadApiKeyPermissions = existingRows.some((row) =>
    (readPermissionValues(row.permissionsJson) ?? []).some((permission) => apiKeyPermissions.has(permission))
  );

  await Promise.all(
    roles.map((role) =>
      prisma.rolePermissionTemplate.upsert({
        where: { role },
        create: {
          role,
          permissionsJson: JSON.stringify(rolePermissions[role])
        },
        update: {}
      })
    )
  );

  if (existingRows.length === 0 || existingRowsHadApiKeyPermissions) return;

  const rows = await prisma.rolePermissionTemplate.findMany();
  await Promise.all(
    rows.map((row) => {
      if (!isRole(row.role)) return null;
      const defaultsToAdd = rolePermissions[row.role].filter((permission) => apiKeyPermissions.has(permission));
      if (defaultsToAdd.length === 0) return null;

      const merged = normalizePermissionList([...(readPermissionValues(row.permissionsJson) ?? []), ...defaultsToAdd]);
      return prisma.rolePermissionTemplate.update({
        where: { role: row.role },
        data: {
          permissionsJson: JSON.stringify(merged)
        }
      });
    })
  );
}

export async function getRolePermissionMap(): Promise<Record<Role, Permission[]>> {
  await ensureRolePermissionTemplates();
  const rows = await prisma.rolePermissionTemplate.findMany();
  const rowMap = new Map(rows.map((row) => [row.role, row.permissionsJson]));

  const result = Object.fromEntries(
    roles.map((role) => [role, parsePermissions(rowMap.get(role), role)])
  ) as Record<Role, Permission[]>;

  return result;
}

export async function permissionsForRoleFromStore(role: string): Promise<Permission[]> {
  if (!isRole(role)) return [];
  await ensureRolePermissionTemplates();

  const row = await prisma.rolePermissionTemplate.findUnique({
    where: { role }
  });

  if (!row) {
    await prisma.rolePermissionTemplate.upsert({
      where: { role },
      create: {
        role,
        permissionsJson: JSON.stringify(rolePermissions[role])
      },
      update: {}
    });
    return rolePermissions[role];
  }

  return parsePermissions(row.permissionsJson, role);
}

export async function hasStoredPermission(role: string, permission: Permission) {
  const rolePermissionList = await permissionsForRoleFromStore(role);
  return rolePermissionList.includes(permission);
}

export async function updateRolePermissionTemplate(role: Role, values: Permission[]) {
  const normalized = validateRolePermissionUpdate(role, values);

  return prisma.rolePermissionTemplate.upsert({
    where: { role },
    create: {
      role,
      permissionsJson: JSON.stringify(normalized)
    },
    update: {
      permissionsJson: JSON.stringify(normalized)
    }
  });
}
