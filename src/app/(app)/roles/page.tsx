import { asc, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { roles, users } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { normalizeKeys } from "@/lib/permissions";
import { RolesClient } from "./roles-client";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const session = await requireView("admin");
  const rows = await db
    .select({
      id: roles.id,
      name: roles.name,
      permissions: roles.permissions,
      isSystem: roles.isSystem,
      usersCount: count(users.id),
    })
    .from(roles)
    .leftJoin(users, eq(users.roleId, roles.id))
    .groupBy(roles.id)
    .orderBy(desc(roles.isSystem), asc(roles.id));

  return (
    <RolesClient
      roles={rows.map((r) => ({ ...r, permissions: normalizeKeys(r.permissions) }))}
      canManage={can(session, "admin", "edit")}
      canCreate={can(session, "admin", "create")}
    />
  );
}
