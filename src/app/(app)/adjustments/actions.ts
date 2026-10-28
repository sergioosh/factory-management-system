"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { adjustmentItems, adjustments, products, rawMaterials } from "@/db/schema";
import { requirePerm } from "@/lib/session";
import { act } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { notifyChange } from "@/lib/notify";
import { nextDocNo } from "@/lib/docno";
import { postStockMovement, createLot, consumeLotsFifo, type ItemType } from "@/lib/stock";

const createSchema = z.object({
  itemType: z.enum(["rm", "fg"]),
  itemId: z.number().int().positive("Pick an item"),
  qtyDelta: z.number().refine((v) => v !== 0, "Qty change cannot be zero"),
  reason: z.string().trim().min(1, "Reason is required"),
});

// Single-item adjustment that posts to stock immediately (no approval step).
export async function createAdjustment(input: z.infer<typeof createSchema>) {
  return act(async () => {
    const s = await requirePerm("inventory", "create");
    const data = createSchema.parse(input);
    const itemType = data.itemType as ItemType;

    const result = await db.transaction(async (tx) => {
      const master =
        itemType === "rm"
          ? (await tx.select({ code: rawMaterials.code }).from(rawMaterials).where(eq(rawMaterials.id, data.itemId)))[0]
          : (await tx.select({ code: products.code }).from(products).where(eq(products.id, data.itemId)))[0];
      if (!master) throw new Error("Item not found");

      const adjNo = await nextDocNo(tx, "ADJ");
      const [adj] = await tx
        .insert(adjustments)
        .values({
          adjNo,
          reason: data.reason,
          status: "posted",
          requestedBy: s.user.id,
          decidedBy: s.user.id,
          decidedAt: new Date(),
        })
        .returning();
      await tx.insert(adjustmentItems).values({
        adjId: adj.id,
        itemType: data.itemType,
        itemId: data.itemId,
        qtyDelta: data.qtyDelta,
      });

      if (data.qtyDelta > 0) {
        const lot = await createLot(tx, {
          lotNo: `${adjNo}-${master.code}`,
          itemType,
          itemId: data.itemId,
          qty: data.qtyDelta,
          sourceType: "adjustment",
          sourceId: adj.id,
        });
        await postStockMovement(tx, {
          itemType,
          itemId: data.itemId,
          txnType: "adjustment",
          qtyIn: data.qtyDelta,
          refType: "adjustment",
          refId: adj.id,
          refNo: adjNo,
          lotId: lot.id,
          userId: s.user.id,
        });
      } else {
        await postStockMovement(tx, {
          itemType,
          itemId: data.itemId,
          txnType: "adjustment",
          qtyOut: -data.qtyDelta,
          refType: "adjustment",
          refId: adj.id,
          refNo: adjNo,
          userId: s.user.id,
        });
        await consumeLotsFifo(tx, itemType, data.itemId, -data.qtyDelta);
      }
      return { id: adj.id, adjNo };
    });

    await writeAudit({
      userId: s.user.id,
      action: "create",
      entity: "adjustment",
      entityId: result.id,
      detail: data,
    });
    await notifyChange("stock", "adjustments");
    revalidatePath("/adjustments");
    revalidatePath("/stock/materials");
    revalidatePath("/stock/products");
    return result;
  });
}
