"use server";

import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { products, rawMaterials, stockCountItems, stockCounts } from "@/db/schema";
import { requirePerm } from "@/lib/session";
import { act } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { notifyChange } from "@/lib/notify";
import { nextDocNo } from "@/lib/docno";
import { postStockMovement, createLot, consumeLotsFifo, type ItemType } from "@/lib/stock";

const createSchema = z.object({
  countDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  scope: z.enum(["rm", "fg", "all"]),
  notes: z.string().trim().optional(),
});

export async function createCount(input: z.infer<typeof createSchema>) {
  return act(async () => {
    const s = await requirePerm("inventory", "create");
    const data = createSchema.parse(input);
    const countId = await db.transaction(async (tx) => {
      const countNo = await nextDocNo(tx, "SC");
      const [c] = await tx
        .insert(stockCounts)
        .values({
          countNo,
          countDate: data.countDate,
          scope: data.scope,
          notes: data.notes || null,
          createdBy: s.user.id,
        })
        .returning();
      const values: (typeof stockCountItems.$inferInsert)[] = [];
      if (data.scope !== "fg") {
        const rms = await tx
          .select({ id: rawMaterials.id, currentStock: rawMaterials.currentStock })
          .from(rawMaterials)
          .where(eq(rawMaterials.archived, false));
        for (const m of rms)
          values.push({ countId: c.id, itemType: "rm", itemId: m.id, systemQty: m.currentStock });
      }
      if (data.scope !== "rm") {
        const fgs = await tx
          .select({ id: products.id, currentStock: products.currentStock })
          .from(products)
          .where(eq(products.archived, false));
        for (const p of fgs)
          values.push({ countId: c.id, itemType: "fg", itemId: p.id, systemQty: p.currentStock });
      }
      if (values.length) await tx.insert(stockCountItems).values(values);
      return c.id;
    });
    await writeAudit({
      userId: s.user.id,
      action: "create",
      entity: "stock_count",
      entityId: countId,
      detail: data,
    });
    await notifyChange("counts");
    revalidatePath("/counts");
    return countId;
  });
}

const saveSchema = z.object({
  countId: z.number().int().positive(),
  items: z
    .array(
      z.object({
        id: z.number().int().positive(),
        countedQty: z.number().min(0).nullable(),
      }),
    )
    .min(1),
});

export async function saveCountItems(input: z.infer<typeof saveSchema>) {
  return act(async () => {
    const s = await requirePerm("inventory", "edit");
    const data = saveSchema.parse(input);
    await db.transaction(async (tx) => {
      const [c] = await tx
        .select()
        .from(stockCounts)
        .where(eq(stockCounts.id, data.countId))
        .for("update");
      if (!c) throw new Error("Count not found");
      if (c.status !== "draft") throw new Error("Count is not editable");
      for (const it of data.items) {
        await tx
          .update(stockCountItems)
          .set({ countedQty: it.countedQty })
          .where(and(eq(stockCountItems.id, it.id), eq(stockCountItems.countId, data.countId)));
      }
    });
    await writeAudit({
      userId: s.user.id,
      action: "update",
      entity: "stock_count",
      entityId: data.countId,
    });
    await notifyChange("counts");
    revalidatePath("/counts");
    revalidatePath(`/counts/${data.countId}`);
  });
}

export async function submitCount(id: number) {
  return act(async () => {
    const s = await requirePerm("inventory", "edit");
    const countId = z.number().int().positive().parse(id);
    await db.transaction(async (tx) => {
      const [c] = await tx.select().from(stockCounts).where(eq(stockCounts.id, countId)).for("update");
      if (!c) throw new Error("Count not found");
      if (c.status !== "draft") throw new Error("Only draft counts can be submitted");
      const missing = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(stockCountItems)
        .where(and(eq(stockCountItems.countId, countId), isNull(stockCountItems.countedQty)));
      if (missing[0].n > 0) throw new Error(`${missing[0].n} items not counted yet`);
      await tx.update(stockCounts).set({ status: "submitted" }).where(eq(stockCounts.id, countId));
    });
    await writeAudit({ userId: s.user.id, action: "submit", entity: "stock_count", entityId: countId });
    await notifyChange("counts");
    revalidatePath("/counts");
    revalidatePath(`/counts/${countId}`);
  });
}

const decideSchema = z.object({
  id: z.number().int().positive(),
  approve: z.boolean(),
});

export async function decideCount(input: z.infer<typeof decideSchema>) {
  return act(async () => {
    const s = await requirePerm("inventory", "approve");
    const { id, approve } = decideSchema.parse(input);
    await db.transaction(async (tx) => {
      const [c] = await tx.select().from(stockCounts).where(eq(stockCounts.id, id)).for("update");
      if (!c) throw new Error("Count not found");
      if (c.status !== "submitted") throw new Error("Only submitted counts can be decided");
      if (approve) {
        const items = await tx
          .select({
            itemType: stockCountItems.itemType,
            itemId: stockCountItems.itemId,
            systemQty: stockCountItems.systemQty,
            countedQty: stockCountItems.countedQty,
            itemCode: sql<string>`coalesce(${rawMaterials.code}, ${products.code}, '')`,
          })
          .from(stockCountItems)
          .leftJoin(
            rawMaterials,
            and(eq(stockCountItems.itemType, "rm"), eq(stockCountItems.itemId, rawMaterials.id)),
          )
          .leftJoin(
            products,
            and(eq(stockCountItems.itemType, "fg"), eq(stockCountItems.itemId, products.id)),
          )
          .where(eq(stockCountItems.countId, id));
        for (const it of items) {
          if (it.countedQty == null) throw new Error("Count has uncounted items");
          const variance = it.countedQty - it.systemQty;
          if (variance === 0) continue;
          const itemType = it.itemType as ItemType;
          if (variance > 0) {
            const lot = await createLot(tx, {
              lotNo: `${c.countNo}-${it.itemCode}`,
              itemType,
              itemId: it.itemId,
              qty: variance,
              sourceType: "adjustment",
              sourceId: c.id,
            });
            await postStockMovement(tx, {
              itemType,
              itemId: it.itemId,
              txnType: "count",
              qtyIn: variance,
              refType: "stock_count",
              refId: c.id,
              refNo: c.countNo,
              lotId: lot.id,
              userId: s.user.id,
            });
          } else {
            await postStockMovement(tx, {
              itemType,
              itemId: it.itemId,
              txnType: "count",
              qtyOut: -variance,
              refType: "stock_count",
              refId: c.id,
              refNo: c.countNo,
              userId: s.user.id,
            });
            await consumeLotsFifo(tx, itemType, it.itemId, -variance);
          }
        }
      }
      await tx
        .update(stockCounts)
        .set({
          status: approve ? "approved" : "rejected",
          decidedBy: s.user.id,
          decidedAt: new Date(),
        })
        .where(eq(stockCounts.id, id));
    });
    await writeAudit({
      userId: s.user.id,
      action: approve ? "approve" : "reject",
      entity: "stock_count",
      entityId: id,
    });
    await notifyChange("stock", "counts");
    revalidatePath("/counts");
    revalidatePath(`/counts/${id}`);
  });
}
