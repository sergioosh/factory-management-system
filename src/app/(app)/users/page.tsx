import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, roles } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await requireView("admin");
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      roleId: users.roleId,
      roleName: roles.name,
      active: users.active,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .orderBy(asc(users.name));
  const roleOptions = await db
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .orderBy(asc(roles.name));
  return (
    <UsersClient
      rows={rows}
      roleOptions={roleOptions}
      currentUserId={session.user.id}
      canCreate={can(session, "admin", "create")}
      canEdit={can(session, "admin", "edit")}
    />
  );
}
