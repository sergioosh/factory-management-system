"use server";

import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { goodsReceived, grnItems, purchases } from "@/db/schema";
import { requirePerm } from "@/lib/session";
import { act } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { notifyChange } from "@/lib/notify";
import { nextDocNo } from "@/lib/docno";

const createSchema = z.object({
  supplierId: z.number().int().positive({ message: "Pick a supplier" }),
  invoiceDate: z.string().min(1, "Date is required"),
  invoiceNo: z.string().trim().min(1, "Invoice # is required"),
  currency: z.string().trim().optional(),
  fxRate: z.number().positive().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  notes: z.string().trim().optional(),
  grnIds: z.array(z.number().int().positive()).min(1, "Select at least one GRN to match"),
});

/**
 * Purchase invoice — the supplier bill. Matches goods already received via GRNs
 * (stock was posted then); this just records the amount owed. No stock movement.
 */
export async function createPurchaseInvoice(input: z.infer<typeof createSchema>) {
  return act(async () => {
    const s = await requirePerm("purchasing", "create");
    const data = createSchema.parse(input);
    const taxRate = data.taxRate ?? 0;

    const inv = await db.transaction(async (tx) => {
      // lock and validate the selected GRNs belong to the supplier and are unmatched
      const grns = await tx
        .select({ id: goodsReceived.id, supplierId: goodsReceived.supplierId, status: goodsReceived.status })
        .from(goodsReceived)
        .where(inArray(goodsReceived.id, data.grnIds))
        .for("update");
      if (grns.length !== data.grnIds.length) throw new Error("Some GRNs no longer exist");
      for (const g of grns) {
        if (g.supplierId !== data.supplierId) throw new Error("A selected GRN is from another supplier");
        if (g.status === "invoiced") throw new Error("A selected GRN is already invoiced");
      }

      const [{ subtotal }] = await tx
        .select({
          subtotal: sql<number>`coalesce(sum(${grnItems.qty} * ${grnItems.rate}), 0)::float`,
        })
        .from(grnItems)
        .where(inArray(grnItems.grnId, data.grnIds));
      const total = subtotal * (1 + taxRate / 100);

      const poNo = await nextDocNo(tx, "PO");
      const [header] = await tx
        .insert(purchases)
        .values({
          poNo,
          supplierId: data.supplierId,
          orderDate: data.invoiceDate,
          status: "posted",
          invoiceNo: data.invoiceNo,
          currency: data.currency || null,
          fxRate: data.fxRate ?? 1,
          taxRate,
          total,
          notes: data.notes || null,
          createdBy: s.user.id,
        })
        .returning();

      await tx
        .update(goodsReceived)
        .set({ status: "invoiced", purchaseId: header.id })
        .where(inArray(goodsReceived.id, data.grnIds));

      return header;
    });

    await writeAudit({
      userId: s.user.id,
      action: "create",
      entity: "purchase_invoice",
      entityId: inv.id,
      detail: { docNo: inv.poNo, invoiceNo: data.invoiceNo, grnIds: data.grnIds },
    });
    await notifyChange("purchases", "purchasing", "grn");
    revalidatePath("/purchases");
    revalidatePath("/purchases/new");
    revalidatePath("/grn");
    return inv.id;
  });
}

/** Open (received, not yet invoiced) GRNs for a supplier, with their computed value. */
export async function openGrnsForSupplier(supplierId: number) {
  return act(async () => {
    await requirePerm("purchasing", "create");
    const rows = await db
      .select({
        id: goodsReceived.id,
        grnNo: goodsReceived.grnNo,
        receivedDate: goodsReceived.receivedDate,
        value: sql<number>`coalesce((select sum(gi.qty * gi.rate) from grn_items gi where gi.grn_id = "goods_received"."id"), 0)::float`,
      })
      .from(goodsReceived)
      .where(and(eq(goodsReceived.supplierId, supplierId), eq(goodsReceived.status, "received")));
    return rows;
  });
}
