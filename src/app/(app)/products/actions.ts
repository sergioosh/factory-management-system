"use server";

import { z } from "zod";
import { eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { products, bomItems, bomVersions } from "@/db/schema";
import { requirePerm } from "@/lib/session";
import { act } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { notifyChange } from "@/lib/notify";
import { today } from "@/lib/format";

const productSchema = z.object({
  id: z.number().optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]+$/, "Use letters, numbers and dashes only")
    .optional(),
  name: z.string().trim().min(1, "Name is required"),
  unit: z.string().trim().min(1, "Unit is required"),
  piecesPerCarton: z.number().int().positive().optional(),
  sellingPrice: z.number().min(0),
  archived: z.boolean().optional(),
  // Only sent when creating a product (its first recipe). Once a product exists, its
  // BOM is edited exclusively through the versioned editor at /bom/[productId] — this
  // action must never overwrite bom_items on an edit save, or version history goes stale.
  bom: z
    .array(
      z.object({
        materialId: z.number().int().positive("Pick a material"),
        qtyPerUnit: z.number().positive("Qty must be above 0"),
      }),
    )
    .refine(
      (lines) => new Set(lines.map((l) => l.materialId)).size === lines.length,
      "Duplicate material in BOM",
    )
    .optional(),
});

async function nextCode() {
  const res = await db.execute(
    sql`SELECT coalesce(max(substring(code from 3)::int), 0) + 1 AS n FROM products WHERE code ~ '^FG[0-9]+$'`,
  );
  return `FG${String((res.rows[0] as { n: number }).n).padStart(3, "0")}`;
}

/** Suggested next code, shown pre-filled (and editable) on the New Product page. */
export async function suggestProductCode() {
  return act(async () => {
    await requirePerm("masters", "create");
    return nextCode();
  });
}

export async function saveProduct(input: z.infer<typeof productSchema>) {
  return act(async () => {
    const s = await requirePerm("masters", input.id ? "edit" : "create");
    const data = productSchema.parse(input);

    const id = await db.transaction(async (tx) => {
      let id = data.id;
      const isCreate = !id;
      if (id) {
        await tx
          .update(products)
          .set({
            name: data.name,
            unit: data.unit,
            piecesPerCarton: data.piecesPerCarton ?? null,
            sellingPrice: data.sellingPrice,
            ...(data.archived != null ? { archived: data.archived } : {}),
          })
          .where(eq(products.id, id));
      } else {
        const code = data.code || (await nextCode());
        const [dupe] = await tx.select({ id: products.id }).from(products).where(eq(products.code, code));
        if (dupe) throw new Error(`Code ${code} is already used`);
        const [row] = await tx
          .insert(products)
          .values({
            code,
            name: data.name,
            unit: data.unit,
            piecesPerCarton: data.piecesPerCarton ?? null,
            sellingPrice: data.sellingPrice,
            archived: data.archived ?? false,
          })
          .returning();
        id = row.id;
      }
      // `bom` is only present on create (the product's initial recipe). On an edit save
      // it's undefined, so an existing recipe — and its version history — is left alone;
      // changing it after creation goes through saveBomVersion on the dedicated BOM page.
      if (data.bom !== undefined) {
        await tx.delete(bomItems).where(eq(bomItems.productId, id));
        if (data.bom.length) {
          await tx.insert(bomItems).values(data.bom.map((l) => ({ ...l, productId: id! })));
        }
        if (isCreate && data.bom.length) {
          await tx.insert(bomVersions).values({
            productId: id!,
            version: 1,
            effectiveDate: today(),
            materials: data.bom.length,
            notes: "Initial recipe set at product creation",
            createdBy: s.user.id,
          });
        }
      }
      return id;
    });
    await writeAudit({
      userId: s.user.id,
      action: data.id ? "update" : "create",
      entity: "product",
      entityId: id,
      detail: data,
    });
    await notifyChange("masters");
    revalidatePath("/products");
    revalidatePath("/bom");
    return id;
  });
}

export async function setProductArchived(id: number, archived: boolean) {
  return act(async () => {
    const s = await requirePerm("masters", "edit");
    await db.update(products).set({ archived }).where(eq(products.id, id));
    await writeAudit({
      userId: s.user.id,
      action: archived ? "archive" : "restore",
      entity: "product",
      entityId: id,
    });
    await notifyChange("masters");
    revalidatePath("/products");
    revalidatePath("/bom");
  });
}

export async function setProductsArchived(ids: number[], archived: boolean) {
  return act(async () => {
    const s = await requirePerm("masters", "edit");
    if (ids.length === 0) return;
    await db.update(products).set({ archived }).where(inArray(products.id, ids));
    await writeAudit({
      userId: s.user.id,
      action: archived ? "archive" : "restore",
      entity: "product",
      detail: { ids },
    });
    await notifyChange("masters");
    revalidatePath("/products");
    revalidatePath("/bom");
  });
}
