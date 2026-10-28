"use server";

import { z } from "zod";
import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { roles, users } from "@/db/schema";
import { requirePerm } from "@/lib/session";
import { act } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { notifyChange } from "@/lib/notify";
import { ALL_KEYS, ADMIN_ROLE } from "@/lib/permissions";

const keysSchema = z.array(z.string()).transform((ks) => ks.filter((k) => ALL_KEYS.includes(k)));

const saveSchema = z.object({
  updates: z.array(z.object({ id: z.number().int().positive(), keys: keysSchema })),
});

export async function saveRolePerms(input: z.infer<typeof saveSchema>) {
  return act(async () => {
    const s = await requirePerm("admin", "edit");
    const { updates } = saveSchema.parse(input);
    for (const u of updates) {
      const [role] = await db.select().from(roles).where(eq(roles.id, u.id));
      if (!role) continue;
      if (role.name === ADMIN_ROLE) continue; // Admin bypasses; never edit its grants
      await db.update(roles).set({ permissions: u.keys }).where(eq(roles.id, u.id));
    }
    await writeAudit({ userId: s.user.id, action: "update", entity: "role_permissions", detail: { count: updates.length } });
    await notifyChange("admin");
    revalidatePath("/roles");
  });
}

const nameSchema = z.string().trim().min(1, "Name is required").max(40);

export async function createRole(name: string) {
  return act(async () => {
    const s = await requirePerm("admin", "create");
    const n = nameSchema.parse(name);
    const [existing] = await db.select().from(roles).where(eq(roles.name, n));
    if (existing) throw new Error("A role with that name already exists");
    const [row] = await db.insert(roles).values({ name: n, permissions: [], isSystem: false }).returning();
    await writeAudit({ userId: s.user.id, action: "create", entity: "role", entityId: row.id, detail: { name: n } });
    await notifyChange("admin");
    revalidatePath("/roles");
    return row.id;
  });
}

export async function renameRole(input: { id: number; name: string }) {
  return act(async () => {
    const s = await requirePerm("admin", "edit");
    const id = z.number().int().positive().parse(input.id);
    const name = nameSchema.parse(input.name);
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    if (!role) throw new Error("Role not found");
    if (role.name === ADMIN_ROLE) throw new Error("The Admin role cannot be renamed");
    await db.update(roles).set({ name }).where(eq(roles.id, id));
    await writeAudit({ userId: s.user.id, action: "update", entity: "role", entityId: id, detail: { name } });
    await notifyChange("admin");
    revalidatePath("/roles");
  });
}

export async function deleteRole(id: number) {
  return act(async () => {
    const s = await requirePerm("admin", "edit");
    const roleId = z.number().int().positive().parse(id);
    const [role] = await db.select().from(roles).where(eq(roles.id, roleId));
    if (!role) throw new Error("Role not found");
    if (role.name === ADMIN_ROLE) throw new Error("The Admin role cannot be deleted");
    const [{ n }] = await db.select({ n: count() }).from(users).where(eq(users.roleId, roleId));
    if (n > 0) throw new Error("Role has users assigned");
    await db.delete(roles).where(eq(roles.id, roleId));
    await writeAudit({ userId: s.user.id, action: "delete", entity: "role", entityId: roleId, detail: { name: role.name } });
    await notifyChange("admin");
    revalidatePath("/roles");
  });
}
