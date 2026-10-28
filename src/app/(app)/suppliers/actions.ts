"use server";

import { z } from "zod";
import { eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { requirePerm } from "@/lib/session";
import { act } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { notifyChange } from "@/lib/notify";

const supplierSchema = z.object({
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
  currency: z.string().trim(),
  notes: z.string().trim(),
  archived: z.boolean().optional(),
});

async function nextCode() {
  const res = await db.execute(
    sql`SELECT coalesce(max(substring(code from 4)::int), 0) + 1 AS n FROM suppliers WHERE code ~ '^SUP[0-9]+$'`,
  );
  return `SUP${String((res.rows[0] as { n: number }).n).padStart(3, "0")}`;
}

export async function suggestSupplierCode() {
  return act(async () => {
    await requirePerm("masters", "create");
    return nextCode();
  });
}

export async function saveSupplier(input: z.infer<typeof supplierSchema>) {
  return act(async () => {
    const s = await requirePerm("masters", input.id ? "edit" : "create");
    const data = supplierSchema.parse(input);
    const values = {
      name: data.name,
      phone: data.phone || null,
      contactPerson: data.contactPerson || null,
      email: data.email || null,
      location: data.location || null,
      currency: data.currency || null,
      notes: data.notes || null,
    };
    let id = data.id;
    if (id) {
      await db
        .update(suppliers)
        .set({ ...values, ...(data.archived != null ? { archived: data.archived } : {}) })
        .where(eq(suppliers.id, id));
    } else {
      const code = data.code || (await nextCode());
      const [dupe] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.code, code));
      if (dupe) throw new Error(`Code ${code} is already used`);
      const [row] = await db
        .insert(suppliers)
        .values({ ...values, code, archived: data.archived ?? false })
        .returning();
      id = row.id;
    }
    await writeAudit({
      userId: s.user.id,
      action: data.id ? "update" : "create",
      entity: "supplier",
      entityId: id,
      detail: data,
    });
    await notifyChange("masters");
    revalidatePath("/suppliers");
    return id;
  });
}

export async function setSupplierArchived(id: number, archived: boolean) {
  return act(async () => {
    const s = await requirePerm("masters", "edit");
    await db.update(suppliers).set({ archived }).where(eq(suppliers.id, id));
    await writeAudit({
      userId: s.user.id,
      action: archived ? "archive" : "restore",
      entity: "supplier",
      entityId: id,
    });
    await notifyChange("masters");
    revalidatePath("/suppliers");
  });
}

export async function setSuppliersArchived(ids: number[], archived: boolean) {
  return act(async () => {
    const s = await requirePerm("masters", "edit");
    if (ids.length === 0) return;
    await db.update(suppliers).set({ archived }).where(inArray(suppliers.id, ids));
    await writeAudit({
      userId: s.user.id,
      action: archived ? "archive" : "restore",
      entity: "supplier",
      detail: { ids },
    });
    await notifyChange("masters");
    revalidatePath("/suppliers");
  });
}
