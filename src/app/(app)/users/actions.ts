"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users, accounts } from "@/db/schema";
import { auth } from "@/lib/auth";
import { requirePerm } from "@/lib/session";
import { act } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { notifyChange } from "@/lib/notify";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  roleId: z.number().int().positive("Role is required"),
});

export async function createUser(input: z.infer<typeof createSchema>) {
  return act(async () => {
    const s = await requirePerm("admin", "create");
    const data = createSchema.parse(input);
    const email = data.email.toLowerCase();
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existing) throw new Error("Email already in use");
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(data.password);
    const userId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        name: data.name,
        email,
        emailVerified: true,
        roleId: data.roleId,
        active: true,
      });
      await tx.insert(accounts).values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hash,
      });
    });
    await writeAudit({
      userId: s.user.id,
      action: "create",
      entity: "user",
      entityId: userId,
      detail: { name: data.name, email, roleId: data.roleId },
    });
    await notifyChange("admin");
    revalidatePath("/users");
  });
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Name is required"),
  roleId: z.number().int().positive("Role is required"),
  active: z.boolean(),
  newPassword: z.string().min(8, "Password must be at least 8 characters").optional(),
});

export async function updateUser(input: z.infer<typeof updateSchema>) {
  return act(async () => {
    const s = await requirePerm("admin", "edit");
    const data = updateSchema.parse(input);
    if (!data.active && data.id === s.user.id) throw new Error("You cannot disable your own account");
    await db
      .update(users)
      .set({ name: data.name, roleId: data.roleId, active: data.active, updatedAt: new Date() })
      .where(eq(users.id, data.id));
    if (data.newPassword) {
      const ctx = await auth.$context;
      const hash = await ctx.password.hash(data.newPassword);
      await db
        .update(accounts)
        .set({ password: hash, updatedAt: new Date() })
        .where(and(eq(accounts.userId, data.id), eq(accounts.providerId, "credential")));
    }
    await writeAudit({
      userId: s.user.id,
      action: "update",
      entity: "user",
      entityId: data.id,
      detail: {
        name: data.name,
        roleId: data.roleId,
        active: data.active,
        passwordReset: !!data.newPassword,
      },
    });
    await notifyChange("admin");
    revalidatePath("/users");
  });
}
