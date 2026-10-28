"use server";

import { z } from "zod";
import { eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { requirePerm } from "@/lib/session";
import { act } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { notifyChange } from "@/lib/notify";

const customerSchema = z.object({
  id: z.number().optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]+$/, "Use letters, numbers and dashes only")
    .optional(),
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim(),
  contactPerson: z.string().trim(),
  email: z.string().trim(),
  location: z.string().trim(),
  creditLimit: z.number().min(0),
  notes: z.string().trim(),
  archived: z.boolean().optional(),
});

async function nextCode() {
  const res = await db.execute(
    sql`SELECT coalesce(max(substring(code from 4)::int), 0) + 1 AS n FROM customers WHERE code ~ '^CUS[0-9]+$'`,
  );
  return `CUS${String((res.rows[0] as { n: number }).n).padStart(3, "0")}`;
}

export async function suggestCustomerCode() {
  return act(async () => {
    await requirePerm("masters", "create");
    return nextCode();
  });
}

export async function saveCustomer(input: z.infer<typeof customerSchema>) {
  return act(async () => {
    const s = await requirePerm("masters", input.id ? "edit" : "create");
    const data = customerSchema.parse(input);
    const values = {
      name: data.name,
      phone: data.phone || null,
      contactPerson: data.contactPerson || null,
      email: data.email || null,
      location: data.location || null,
      creditLimit: data.creditLimit,
      notes: data.notes || null,
    };
    let id = data.id;
    if (id) {
      await db
        .update(customers)
        .set({ ...values, ...(data.archived != null ? { archived: data.archived } : {}) })
        .where(eq(customers.id, id));
    } else {
      const code = data.code || (await nextCode());
      const [dupe] = await db.select({ id: customers.id }).from(customers).where(eq(customers.code, code));
      if (dupe) throw new Error(`Code ${code} is already used`);
      const [row] = await db
        .insert(customers)
        .values({ ...values, code, archived: data.archived ?? false })
        .returning();
      id = row.id;
    }
    await writeAudit({
      userId: s.user.id,
      action: data.id ? "update" : "create",
      entity: "customer",
      entityId: id,
      detail: data,
    });
    await notifyChange("masters");
    revalidatePath("/customers");
    return id;
  });
}

export async function setCustomerArchived(id: number, archived: boolean) {
  return act(async () => {
    const s = await requirePerm("masters", "edit");
    await db.update(customers).set({ archived }).where(eq(customers.id, id));
    await writeAudit({
      userId: s.user.id,
      action: archived ? "archive" : "restore",
      entity: "customer",
      entityId: id,
    });
    await notifyChange("masters");
    revalidatePath("/customers");
  });
}

export async function setCustomersArchived(ids: number[], archived: boolean) {
  return act(async () => {
    const s = await requirePerm("masters", "edit");
    if (ids.length === 0) return;
    await db.update(customers).set({ archived }).where(inArray(customers.id, ids));
    await writeAudit({
      userId: s.user.id,
      action: archived ? "archive" : "restore",
      entity: "customer",
      detail: { ids },
    });
    await notifyChange("masters");
    revalidatePath("/customers");
  });
}
