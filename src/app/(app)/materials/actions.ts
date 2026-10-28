"use server";

import { z } from "zod";
import { eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { rawMaterials } from "@/db/schema";
import { requirePerm } from "@/lib/session";
import { act } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { notifyChange } from "@/lib/notify";
import { createLot, postStockMovement } from "@/lib/stock";

const materialSchema = z.object({
  id: z.number().optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]+$/, "Use letters, numbers and dashes only")
    .optional(),
  name: z.string().trim().min(1, "Name is required"),
  unit: z.string().trim().min(1, "Unit is required"),
  price: z.number().min(0),
  minStock: z.number().min(0),
  openingStock: z.number().min(0).optional(),
  archived: z.boolean().optional(),
});

async function nextCode() {
  const res = await db.execute(
    sql`SELECT coalesce(max(substring(code from 3)::int), 0) + 1 AS n FROM raw_materials WHERE code ~ '^RM[0-9]+$'`,
  );
  return `RM${String((res.rows[0] as { n: number }).n).padStart(3, "0")}`;
}

/** Suggested next code, shown pre-filled (and editable) on the New Material page. */
export async function suggestMaterialCode() {
  return act(async () => {
    await requirePerm("masters", "create");
    return nextCode();
  });
}

export async function saveMaterial(input: z.infer<typeof materialSchema>) {
  return act(async () => {
    const s = await requirePerm("masters", input.id ? "edit" : "create");
    const data = materialSchema.parse(input);

    const id = await db.transaction(async (tx) => {
      let id = data.id;
      if (id) {
        await tx
          .update(rawMaterials)
          .set({
            name: data.name,
            unit: data.unit,
            price: data.price,
            minStock: data.minStock,
            ...(data.archived != null ? { archived: data.archived } : {}),
          })
          .where(eq(rawMaterials.id, id));
      } else {
        const code = data.code || (await nextCode());
        const [dupe] = await tx.select({ id: rawMaterials.id }).from(rawMaterials).where(eq(rawMaterials.code, code));
        if (dupe) throw new Error(`Code ${code} is already used`);
        const [row] = await tx
          .insert(rawMaterials)
          .values({
            code,
            name: data.name,
            unit: data.unit,
            price: data.price,
            avgCost: data.price,
            minStock: data.minStock,
            archived: data.archived ?? false,
          })
          .returning();
        id = row.id;

        // Opening stock: a real day-one ledger entry + lot, so the ledger balances from creation.
        if (data.openingStock && data.openingStock > 0) {
          const lot = await createLot(tx, {
            lotNo: `OPENING-${code}`,
            itemType: "rm",
            itemId: id,
            qty: data.openingStock,
            sourceType: "opening",
          });
          await postStockMovement(tx, {
            itemType: "rm",
            itemId: id,
            txnType: "opening",
            qtyIn: data.openingStock,
            refType: "opening",
            refNo: "OPENING",
            lotId: lot.id,
            userId: s.user.id,
          });
        }
      }
      return id;
    });
    await writeAudit({
      userId: s.user.id,
      action: data.id ? "update" : "create",
      entity: "raw_material",
      entityId: id,
      detail: data,
    });
    await notifyChange("masters", "stock");
    revalidatePath("/materials");
    return id;
  });
}

export async function setMaterialArchived(id: number, archived: boolean) {
  return act(async () => {
    const s = await requirePerm("masters", "edit");
    await db.update(rawMaterials).set({ archived }).where(eq(rawMaterials.id, id));
    await writeAudit({
      userId: s.user.id,
      action: archived ? "archive" : "restore",
      entity: "raw_material",
      entityId: id,
    });
    await notifyChange("masters");
    revalidatePath("/materials");
  });
}

export async function setMaterialsArchived(ids: number[], archived: boolean) {
  return act(async () => {
    const s = await requirePerm("masters", "edit");
    if (ids.length === 0) return;
    await db.update(rawMaterials).set({ archived }).where(inArray(rawMaterials.id, ids));
    await writeAudit({
      userId: s.user.id,
      action: archived ? "archive" : "restore",
      entity: "raw_material",
      detail: { ids },
    });
    await notifyChange("masters");
    revalidatePath("/materials");
  });
}
