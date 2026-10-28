import { notFound } from "next/navigation";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  customers,
  goodsReceived,
  invoices,
  payments,
  productionRuns,
  products,
  purchaseRequests,
  purchases,
  salesOrderItems,
  salesOrders,
  suppliers,
} from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { computeMaterialCheck } from "../lib";
import { OrderDetailClient } from "./order-detail-client";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireView("orders");
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();

  // Everything here only depends on `id` from params, except grns (which
  // needs the PR ids first) — so the rest fire together instead of stacking
  // up one round trip after another.
  const [[order], items, check, prs, runs, invs] = await Promise.all([
    db
      .select({
        id: salesOrders.id,
        orderNo: salesOrders.orderNo,
        orderDate: salesOrders.orderDate,
        status: salesOrders.status,
        notes: salesOrders.notes,
        customerId: salesOrders.customerId,
        customerName: customers.name,
        customerPhone: customers.phone,
      })
      .from(salesOrders)
      .innerJoin(customers, eq(salesOrders.customerId, customers.id))
      .where(eq(salesOrders.id, id)),
    db
      .select({
        id: salesOrderItems.id,
        productId: salesOrderItems.productId,
        qty: salesOrderItems.qty,
        rate: salesOrderItems.rate,
        productName: products.name,
        productCode: products.code,
        unit: products.unit,
        fgStock: products.currentStock,
      })
      .from(salesOrderItems)
      .innerJoin(products, eq(salesOrderItems.productId, products.id))
      .where(eq(salesOrderItems.orderId, id)),
    computeMaterialCheck(id),
    db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.salesOrderId, id))
      .orderBy(desc(purchaseRequests.id)),
    db
      .select({
        id: productionRuns.id,
        runNo: productionRuns.runNo,
        status: productionRuns.status,
        plannedQty: productionRuns.plannedQty,
        producedQty: productionRuns.producedQty,
        productName: products.name,
      })
      .from(productionRuns)
      .innerJoin(products, eq(productionRuns.productId, products.id))
      .where(eq(productionRuns.salesOrderId, id))
      .orderBy(desc(productionRuns.id)),
    db
      .select({
        id: invoices.id,
        invoiceNo: invoices.invoiceNo,
        invoiceDate: invoices.invoiceDate,
        total: invoices.total,
        paid: sql<number>`coalesce((select sum(pa.amount) from payment_allocations pa where pa.invoice_id = "invoices"."id"), 0)::float`,
      })
      .from(invoices)
      .where(eq(invoices.salesOrderId, id)),
  ]);
  if (!order) notFound();

  const prIds = prs.map((p) => p.id);
  const grns = prIds.length
    ? await db
        .select({
          id: goodsReceived.id,
          grnNo: goodsReceived.grnNo,
          receivedDate: goodsReceived.receivedDate,
          prId: goodsReceived.prId,
        })
        .from(goodsReceived)
        .where(inArray(goodsReceived.prId, prIds))
    : [];

  return (
    <OrderDetailClient
      order={order}
      items={items}
      check={check}
      prs={prs.map((p) => ({ id: p.id, prNo: p.prNo, status: p.status }))}
      grns={grns}
      runs={runs}
      invoices={invs}
      perms={{
        editOrder: can(session, "orders", "edit"),
        createPr: can(session, "purchasing", "create"),
        createRun: can(session, "production", "create"),
        createInvoice: can(session, "sales", "create"),
        addPayment: can(session, "sales", "create"),
      }}
    />
  );
}
