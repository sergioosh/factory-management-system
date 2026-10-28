"use server";

import { z } from "zod";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import type { Tx } from "@/db";
import {
  invoiceItems,
  invoices,
  paymentAllocations,
  payments,
  products,
  salesOrderItems,
  salesOrders,
} from "@/db/schema";
import { requirePerm } from "@/lib/session";
import { act } from "@/lib/action";
import { nextDocNo } from "@/lib/docno";
import { postStockMovement, consumeLotsFifo } from "@/lib/stock";
import { writeAudit } from "@/lib/audit";
import { notifyChange } from "@/lib/notify";

const invoiceSchema = z.object({
  customerId: z.number({ error: "Pick a customer" }),
  salesOrderId: z.number().optional(),
  invoiceDate: z.string().min(1),
  taxRate: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.number(),
        qty: z.number().positive(),
        rate: z.number().min(0),
      }),
    )
    .min(1, "Add at least one line"),
});

async function postInvoice(
  s: { user: { id: string } },
  data: z.infer<typeof invoiceSchema>,
): Promise<{ id: number; invoiceNo: string }> {
  return db.transaction(async (tx) => {
    const invoiceNo = await nextDocNo(tx, "INV");
    const taxRate = data.taxRate ?? 0;
    const subtotal = data.items.reduce((sum, i) => sum + i.qty * i.rate, 0);
    const total = subtotal * (1 + taxRate / 100);
    const [inv] = await tx
      .insert(invoices)
      .values({
        invoiceNo,
        customerId: data.customerId,
        salesOrderId: data.salesOrderId,
        invoiceDate: data.invoiceDate,
        taxRate,
        total,
        notes: data.notes,
        createdBy: s.user.id,
      })
      .returning();
    await tx.insert(invoiceItems).values(data.items.map((i) => ({ invoiceId: inv.id, ...i })));
    for (const item of data.items) {
      await postStockMovement(tx, {
        itemType: "fg",
        itemId: item.productId,
        txnType: "sale",
        qtyOut: item.qty,
        refType: "invoice",
        refId: inv.id,
        refNo: invoiceNo,
        userId: s.user.id,
      });
      await consumeLotsFifo(tx, "fg", item.productId, item.qty);
    }
    if (data.salesOrderId) {
      await tx
        .update(salesOrders)
        .set({ status: "invoiced", updatedAt: new Date() })
        .where(eq(salesOrders.id, data.salesOrderId));
    }
    await writeAudit(
      { userId: s.user.id, action: "create", entity: "invoice", entityId: inv.id, detail: { invoiceNo, total } },
      tx,
    );
    return { id: inv.id, invoiceNo };
  });
}

export async function createInvoice(input: z.infer<typeof invoiceSchema>) {
  return act(async () => {
    const s = await requirePerm("sales", "create");
    const data = invoiceSchema.parse(input);
    const result = await postInvoice(s, data);
    await notifyChange("stock", "sales", "orders");
    revalidatePath("/sales");
    revalidatePath("/payments");
    return result;
  });
}

export async function createInvoiceFromOrder(orderId: number) {
  return act(async () => {
    const s = await requirePerm("sales", "create");
    const [order] = await db.select().from(salesOrders).where(eq(salesOrders.id, orderId));
    if (!order) throw new Error("Order not found");
    if (!["ready", "confirmed", "in_production"].includes(order.status)) {
      throw new Error(`Order is ${order.status}`);
    }
    const lines = await db
      .select({
        productId: salesOrderItems.productId,
        qty: salesOrderItems.qty,
        rate: salesOrderItems.rate,
        stock: products.currentStock,
        name: products.name,
      })
      .from(salesOrderItems)
      .innerJoin(products, eq(salesOrderItems.productId, products.id))
      .where(eq(salesOrderItems.orderId, orderId));
    const short = lines.filter((l) => l.stock < l.qty);
    if (short.length) {
      throw new Error(`Not enough finished stock: ${short.map((l) => l.name).join(", ")}`);
    }
    const result = await postInvoice(s, {
      customerId: order.customerId,
      salesOrderId: orderId,
      invoiceDate: new Date().toISOString().slice(0, 10),
      taxRate: order.taxRate,
      items: lines.map((l) => ({ productId: l.productId, qty: l.qty, rate: l.rate })),
    });
    await notifyChange("stock", "sales", "orders");
    revalidatePath("/sales");
    revalidatePath(`/orders/${orderId}`);
    return result;
  });
}

/** Open invoices for a customer, oldest first, with balance — for the FIFO allocator/preview. */
export async function openInvoicesForCustomer(customerId: number) {
  return act(async () => {
    await requirePerm("sales", "view");
    const rows = await db
      .select({
        id: invoices.id,
        invoiceNo: invoices.invoiceNo,
        invoiceDate: invoices.invoiceDate,
        total: invoices.total,
        paid: sql<number>`coalesce((select sum(pa.amount) from payment_allocations pa where pa.invoice_id = "invoices"."id"), 0)::float`,
      })
      .from(invoices)
      .where(eq(invoices.customerId, customerId))
      .orderBy(asc(invoices.invoiceDate), asc(invoices.id));
    return rows
      .map((r) => ({ ...r, balance: r.total - r.paid }))
      .filter((r) => r.balance > 0.005);
  });
}

const recordSchema = z.object({
  customerId: z.number({ error: "Pick a customer" }),
  amount: z.number().positive("Amount must be positive"),
  paymentDate: z.string().min(1),
  method: z.enum(["cash", "mobile_money", "bank"]),
  currency: z.string().optional(),
  fxRate: z.number().positive().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  allocations: z.array(z.object({ invoiceId: z.number(), amount: z.number().positive() })).default([]),
});

async function postPayment(tx: Tx, userId: string, data: z.infer<typeof recordSchema>) {
  // validate allocations against live invoice balances
  const allocSum = data.allocations.reduce((s, a) => s + a.amount, 0);
  if (allocSum > data.amount + 0.01) throw new Error("Allocated more than the amount received");
  if (data.allocations.length) {
    const ids = data.allocations.map((a) => a.invoiceId);
    const invs = await tx
      .select({
        id: invoices.id,
        total: invoices.total,
        paid: sql<number>`coalesce((select sum(pa.amount) from payment_allocations pa where pa.invoice_id = "invoices"."id"), 0)::float`,
      })
      .from(invoices)
      .where(inArray(invoices.id, ids))
      .for("update");
    const byId = new Map(invs.map((i) => [i.id, i.total - i.paid]));
    for (const a of data.allocations) {
      const bal = byId.get(a.invoiceId);
      if (bal == null) throw new Error("Invoice not found");
      if (a.amount > bal + 0.01) throw new Error(`Allocation exceeds invoice balance (${bal})`);
    }
  }

  const payNo = await nextDocNo(tx, "PAY");
  const [pay] = await tx
    .insert(payments)
    .values({
      payNo,
      customerId: data.customerId,
      amount: data.amount,
      paymentDate: data.paymentDate,
      method: data.method,
      currency: data.currency || null,
      fxRate: data.fxRate ?? 1,
      reference: data.reference || null,
      notes: data.notes || null,
      createdBy: userId,
    })
    .returning();
  if (data.allocations.length) {
    await tx.insert(paymentAllocations).values(
      data.allocations.map((a) => ({ paymentId: pay.id, invoiceId: a.invoiceId, amount: a.amount })),
    );
  }
  return pay;
}

/** Customer-level payment. Explicit allocations, or auto-allocate FIFO across open invoices. */
export async function recordPayment(input: z.infer<typeof recordSchema> & { autoFifo?: boolean }) {
  return act(async () => {
    const s = await requirePerm("sales", "create");
    const data = recordSchema.parse(input);

    const pay = await db.transaction(async (tx) => {
      let allocations = data.allocations;
      if (input.autoFifo && allocations.length === 0) {
        const open = await tx
          .select({
            id: invoices.id,
            total: invoices.total,
            paid: sql<number>`coalesce((select sum(pa.amount) from payment_allocations pa where pa.invoice_id = "invoices"."id"), 0)::float`,
          })
          .from(invoices)
          .where(eq(invoices.customerId, data.customerId))
          .orderBy(asc(invoices.invoiceDate), asc(invoices.id))
          .for("update");
        let remaining = data.amount;
        allocations = [];
        for (const inv of open) {
          if (remaining <= 0.005) break;
          const bal = inv.total - inv.paid;
          if (bal <= 0.005) continue;
          const take = Math.min(bal, remaining);
          allocations.push({ invoiceId: inv.id, amount: Math.round(take * 100) / 100 });
          remaining -= take;
        }
      }
      return postPayment(tx, s.user.id, { ...data, allocations });
    });

    await writeAudit({
      userId: s.user.id,
      action: "payment",
      entity: "customer",
      entityId: data.customerId,
      detail: { payNo: pay.payNo, amount: data.amount, method: data.method },
    });
    await notifyChange("sales");
    revalidatePath("/sales");
    revalidatePath("/payments");
    revalidatePath("/");
    return pay.id;
  });
}

const paymentSchema = z.object({
  invoiceId: z.number(),
  amount: z.number().positive("Amount must be positive"),
  paymentDate: z.string().min(1),
  method: z.enum(["cash", "mobile_money", "bank"]),
  reference: z.string().optional(),
});

/** Single-invoice payment (from the order hub / invoice sheet): a customer payment fully allocated to one invoice. */
export async function addPayment(input: z.infer<typeof paymentSchema>) {
  return act(async () => {
    const s = await requirePerm("sales", "create");
    const data = paymentSchema.parse(input);
    await db.transaction(async (tx) => {
      const [inv] = await tx.select().from(invoices).where(eq(invoices.id, data.invoiceId)).for("update");
      if (!inv) throw new Error("Invoice not found");
      const [{ paid }] = await tx
        .select({ paid: sql<number>`coalesce(sum(${paymentAllocations.amount}), 0)::float` })
        .from(paymentAllocations)
        .where(eq(paymentAllocations.invoiceId, data.invoiceId));
      const balance = inv.total - paid;
      if (data.amount > balance + 0.01) throw new Error(`Amount exceeds balance (${balance})`);
      await postPayment(tx, s.user.id, {
        customerId: inv.customerId,
        amount: data.amount,
        paymentDate: data.paymentDate,
        method: data.method,
        reference: data.reference,
        allocations: [{ invoiceId: data.invoiceId, amount: data.amount }],
      });
    });
    await writeAudit({
      userId: s.user.id,
      action: "payment",
      entity: "invoice",
      entityId: data.invoiceId,
      detail: { amount: data.amount, method: data.method },
    });
    await notifyChange("sales");
    revalidatePath("/sales");
    revalidatePath("/payments");
  });
}
