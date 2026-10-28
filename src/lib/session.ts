import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { roles, type ModuleKey, type PermissionMap } from "@/db/schema";
import { deriveModulePerms, normalizeKeys, ALL_TRUE_PERMS, ALL_KEYS, ADMIN_ROLE } from "@/lib/permissions";

const NO_PERMS = deriveModulePerms([]);

export type AppSession = {
  user: { id: string; name: string; email: string; roleId: number | null; roleName: string };
  perms: PermissionMap;
  permKeys: Set<string>;
  isAdmin: boolean;
};

export const getSession = cache(async (): Promise<AppSession | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = session.user as typeof session.user & { roleId?: number | null; active?: boolean };
  if (u.active === false) return null;
  let perms = NO_PERMS;
  let permKeys = new Set<string>();
  let roleName = "";
  let isAdmin = false;
  if (u.roleId != null) {
    const [role] = await db.select().from(roles).where(eq(roles.id, u.roleId));
    if (role) {
      roleName = role.name;
      isAdmin = role.name === ADMIN_ROLE;
      const keys = normalizeKeys(role.permissions);
      permKeys = new Set(isAdmin ? ALL_KEYS : keys);
      perms = isAdmin ? ALL_TRUE_PERMS : deriveModulePerms(keys);
    }
  }
  return {
    user: { id: u.id, name: u.name, email: u.email, roleId: u.roleId ?? null, roleName },
    perms,
    permKeys,
    isAdmin,
  };
});

export async function requireSession(): Promise<AppSession> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export function can(
  s: AppSession,
  module: ModuleKey,
  action: "view" | "create" | "edit" | "approve" = "view",
): boolean {
  if (s.isAdmin) return true;
  return s.perms[module]?.[action] ?? false;
}

/** Granular check against a specific permission key (e.g. "report.financial.view"). */
export function hasPerm(s: AppSession, key: string): boolean {
  return s.isAdmin || s.permKeys.has(key);
}

/** For server actions: throws instead of redirecting. */
export async function requirePerm(
  module: ModuleKey,
  action: "view" | "create" | "edit" | "approve",
): Promise<AppSession> {
  const s = await getSession();
  if (!s) throw new Error("Not signed in");
  if (!can(s, module, action)) throw new Error("Not permitted");
  return s;
}

/** For pages: redirects home if the role lacks view access. */
export async function requireView(module: ModuleKey): Promise<AppSession> {
  const s = await requireSession();
  if (!can(s, module, "view")) redirect("/");
  return s;
}
