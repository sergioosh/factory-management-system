"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { goodsReceived, grnItems, purchaseRequests, rawMaterials } from "@/db/schema";
import { requirePerm } from "@/lib/session";
import { act } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { notifyChange } from "@/lib/notify";
import { nextDocNo } from "@/lib/docno";
import { createLot, postStockMovement } from "@/lib/stock";

const createSchema = z.object({
  supplierId: z.number().int().positive({ message: "Pick a supplier" }),
  prId: z.number().int().positive().optional(),
  receivedDate: z.string().min(1, "Date is required"),
  notes: z.string().trim().optional(),
  lines: z
    .array(
      z.object({
        materialId: z.number().int().positive("Pick a material"),
        qty: z.number().positive("Qty must be above 0"),
        rate: z.number().min(0),
        batch: z.string().trim().max(40).optional(),
      }),
    )
    .min(1, "Add at least one line"),
});

/** Standalone GRN: records a supplier receipt and posts stock IN immediately. No PO required. */
export async function createGrn(input: z.infer<typeof createSchema>) {
  return act(async () => {
    const s = await requirePerm("purchasing", "create");
    const data = createSchema.parse(input);

    const grn = await db.transaction(async (tx) => {
      const grnNo = await nextDocNo(tx, "GRN");
      const [header] = await tx
        .insert(goodsReceived)
        .values({
          grnNo,
          supplierId: data.supplierId,
          prId: data.prId ?? null,
          receivedDate: data.receivedDate,
          status: "received",
          notes: data.notes || null,
          createdBy: s.user.id,
        })
        .returning();

      for (const line of data.lines) {
        // moving average: recompute BEFORE stock moves, weighted by qty on hand
        const [mat] = await tx
          .select({ code: rawMaterials.code, stock: rawMaterials.currentStock, avg: rawMaterials.avgCost })
          .from(rawMaterials)
          .where(eq(rawMaterials.id, line.materialId))
          .for("update");
        const code = mat?.code ?? String(line.materialId);
        const onHand = mat?.stock ?? 0;
        const prevAvg = mat?.avg ?? 0;
        const newAvg =
          onHand + line.qty > 0
            ? (onHand * prevAvg + line.qty * line.rate) / (onHand + line.qty)
            : line.rate;
        await tx
          .update(rawMaterials)
          .set({ avgCost: Math.round(newAvg * 100) / 100 })
          .where(eq(rawMaterials.id, line.materialId));
        const lot = await createLot(tx, {
          lotNo: line.batch ? `${grnNo}-${line.batch}` : `${grnNo}-${code}`,
          itemType: "rm",
          itemId: line.materialId,
          qty: line.qty,
          sourceType: "grn",
          sourceId: header.id,
        });
        await postStockMovement(tx, {
          itemType: "rm",
          itemId: line.materialId,
          txnType: "grn",
          qtyIn: line.qty,
          refType: "grn",
          refId: header.id,
          refNo: grnNo,
          lotId: lot.id,
          userId: s.user.id,
        });
        await tx.insert(grnItems).values({
          grnId: header.id,
          materialId: line.materialId,
          qty: line.qty,
          rate: line.rate,
          lotId: lot.id,
        });
      }

      // mark an originating purchase request as fulfilled
      if (data.prId) {
        await tx
          .update(purchaseRequests)
          .set({ status: "ordered" })
          .where(eq(purchaseRequests.id, data.prId));
      }
      return header;
    });

    await writeAudit({
      userId: s.user.id,
      action: "create",
      entity: "grn",
      entityId: grn.id,
      detail: { grnNo: grn.grnNo, supplierId: data.supplierId },
    });
    await notifyChange("stock", "purchases", "grn");
    revalidatePath("/grn");
    revalidatePath("/grn/new");
    revalidatePath("/purchases");
    revalidatePath("/purchase-requests");
    revalidatePath("/materials");
    return grn.id;
  });
}
