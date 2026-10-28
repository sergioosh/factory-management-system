"use server";

import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import type { Tx } from "@/db";
import {
  bomItems,
  productionConsumption,
  productionRuns,
  purchaseRequestItems,
  purchaseRequests,
  salesOrderItems,
  salesOrders,
} from "@/db/schema";
import { requirePerm } from "@/lib/session";
import { act } from "@/lib/action";
import { nextDocNo } from "@/lib/docno";
import { writeAudit } from "@/lib/audit";
import { notifyChange } from "@/lib/notify";
import { computeMaterialCheck } from "./lib";

/** Date-based order number: SO-YYYYMMDD-NNN, sequential within the order date. */
async function nextOrderNo(tx: Tx, orderDate: string): Promise<string> {
  const compact = orderDate.replaceAll("-", "");
  const res = await tx.execute(
    sql`SELECT count(*)::int AS n FROM sales_orders WHERE order_date = ${orderDate}`,
  );
  const n = (res.rows[0] as { n: number }).n + 1;
  return `SO-${compact}-${String(n).padStart(3, "0")}`;
}

const orderSchema = z.object({
  id: z.number().optional(),
  customerId: z.number({ error: "Pick a customer" }),
  orderDate: z.string().min(1),
  targetDate: z.string().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.number({ error: "Pick a product" }),
        qty: z.number().positive("Qty must be positive"),
        rate: z.number().min(0),
      }),
    )
    .min(1, "Add at least one line"),
});

export async function saveOrder(input: z.infer<typeof orderSchema>) {
  return act(async () => {
    const s = await requirePerm("orders", input.id ? "edit" : "create");
    const data = orderSchema.parse(input);
    return db.transaction(async (tx) => {
      let id = data.id;
      if (id) {
        const [existing] = await tx.select().from(salesOrders).where(eq(salesOrders.id, id));
        if (!existing) throw new Error("Order not found");
        if (existing.status !== "draft") throw new Error("Only draft orders can be edited");
        await tx
          .update(salesOrders)
          .set({
            customerId: data.customerId,
            orderDate: data.orderDate,
            targetDate: data.targetDate || null,
            taxRate: data.taxRate ?? 0,
            notes: data.notes,
            updatedAt: new Date(),
          })
          .where(eq(salesOrders.id, id));
        await tx.delete(salesOrderItems).where(eq(salesOrderItems.orderId, id));
      } else {
        const orderNo = await nextOrderNo(tx, data.orderDate);
        const [row] = await tx
          .insert(salesOrders)
          .values({
            orderNo,
            customerId: data.customerId,
            orderDate: data.orderDate,
            targetDate: data.targetDate || null,
            taxRate: data.taxRate ?? 0,
            notes: data.notes,
            status: "draft",
            createdBy: s.user.id,
          })
          .returning();
        id = row.id;
      }
      await tx
        .insert(salesOrderItems)
        .values(data.items.map((i) => ({ orderId: id!, ...i })));
      await writeAudit(
        { userId: s.user.id, action: data.id ? "update" : "create", entity: "sales_order", entityId: id },
        tx,
      );
      await notifyChange("orders");
      revalidatePath("/orders");
      return id!;
    });
  });
}

const TRANSITIONS: Record<string, string[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["in_production", "cancelled", "ready"],
  in_production: ["ready", "cancelled"],
  ready: ["invoiced", "cancelled"],
  invoiced: ["closed"],
};

export async function setOrderStatus(orderId: number, status: string) {
  return act(async () => {
    const s = await requirePerm("orders", "edit");
    const [order] = await db.select().from(salesOrders).where(eq(salesOrders.id, orderId));
    if (!order) throw new Error("Order not found");
    if (!TRANSITIONS[order.status]?.includes(status)) {
      throw new Error(`Cannot move ${order.status} order to ${status}`);
    }
    await db
      .update(salesOrders)
      .set({ status, updatedAt: new Date() })
      .where(eq(salesOrders.id, orderId));
    await writeAudit({
      userId: s.user.id,
      action: `status:${status}`,
      entity: "sales_order",
      entityId: orderId,
    });
    await notifyChange("orders");
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
  });
}

/** Raise a PR for exactly what the material check says is short. */
export async function createPrFromShortfall(orderId: number) {
  return act(async () => {
    const s = await requirePerm("purchasing", "create");
    const [order] = await db.select().from(salesOrders).where(eq(salesOrders.id, orderId));
    if (!order) throw new Error("Order not found");
    const check = await computeMaterialCheck(orderId);
    const short = check.rows.filter((r) => r.short > 0);
    if (short.length === 0) throw new Error("No shortfall — materials are covered");

    const existing = await db
      .select()
      .from(purchaseRequests)
      .where(
        and(
          eq(purchaseRequests.salesOrderId, orderId),
          inArray(purchaseRequests.status, ["pending", "approved"]),
        ),
      );
    if (existing.length > 0) throw new Error(`${existing[0].prNo} is already open for this order`);

    return db.transaction(async (tx) => {
      const prNo = await nextDocNo(tx, "PR");
      const [pr] = await tx
        .insert(purchaseRequests)
        .values({
          prNo,
          salesOrderId: orderId,
          status: "pending",
          notes: `Shortfall for ${order.orderNo}`,
          requestedBy: s.user.id,
        })
        .returning();
      await tx.insert(purchaseRequestItems).values(
        short.map((r) => ({
          prId: pr.id,
          materialId: r.materialId,
          qty: Math.ceil(r.short * 1000) / 1000,
        })),
      );
      await writeAudit(
        { userId: s.user.id, action: "create", entity: "purchase_request", entityId: pr.id, detail: { from: order.orderNo } },
        tx,
      );
      await notifyChange("purchases", "orders");
      revalidatePath(`/orders/${orderId}`);
      revalidatePath("/purchase-requests");
      return pr.prNo;
    });
  });
}

/** One planned production run per order line that doesn't have one yet. */
export async function createRunsFromOrder(orderId: number) {
  return act(async () => {
    const s = await requirePerm("production", "create");
    const [order] = await db.select().from(salesOrders).where(eq(salesOrders.id, orderId));
    if (!order) throw new Error("Order not found");
    if (!["confirmed", "in_production"].includes(order.status)) {
      throw new Error("Confirm the order first");
    }
    const items = await db
      .select()
      .from(salesOrderItems)
      .where(eq(salesOrderItems.orderId, orderId));
    const existingRuns = await db
      .select()
      .from(productionRuns)
      .where(eq(productionRuns.salesOrderId, orderId));
    const covered = new Set(
      existingRuns.filter((r) => r.status !== "cancelled").map((r) => r.productId),
    );
    const toCreate = items.filter((i) => !covered.has(i.productId));
    if (toCreate.length === 0) throw new Error("All order lines already have production runs");

    const bom = await db.select().from(bomItems);
    return db.transaction(async (tx) => {
      for (const item of toCreate) {
        const runNo = await nextDocNo(tx, "PRD");
        const [run] = await tx
          .insert(productionRuns)
          .values({
            runNo,
            productId: item.productId,
            salesOrderId: orderId,
            plannedQty: item.qty,
            status: "in_progress",
            runDate: new Date().toISOString().slice(0, 10),
            createdBy: s.user.id,
          })
          .returning();
        const lines = bom.filter((b) => b.productId === item.productId);
        if (lines.length) {
          await tx.insert(productionConsumption).values(
            lines.map((b) => ({
              runId: run.id,
              materialId: b.materialId,
              standardQty: b.qtyPerUnit * item.qty,
            })),
          );
        }
      }
      if (order.status === "confirmed") {
        await tx
          .update(salesOrders)
          .set({ status: "in_production", updatedAt: new Date() })
          .where(eq(salesOrders.id, orderId));
      }
      await writeAudit(
        { userId: s.user.id, action: "create_runs", entity: "sales_order", entityId: orderId, detail: { runs: toCreate.length } },
        tx,
      );
      await notifyChange("production", "orders");
      revalidatePath(`/orders/${orderId}`);
      revalidatePath("/production");
      return toCreate.length;
    });
  });
}
