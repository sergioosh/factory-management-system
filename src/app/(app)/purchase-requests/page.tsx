import { asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  customers,
  purchaseRequests,
  purchaseRequestItems,
  rawMaterials,
  salesOrders,
  users,
} from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { PurchaseRequestsClient } from "./purchase-requests-client";

export const dynamic = "force-dynamic";

export default async function PurchaseRequestsPage() {
  const session = await requireView("purchasing");
  const requester = alias(users, "requester");
  const decider = alias(users, "decider");

  const rows = await db
    .select({
      id: purchaseRequests.id,
      prNo: purchaseRequests.prNo,
      status: purchaseRequests.status,
      notes: purchaseRequests.notes,
      decisionNote: purchaseRequests.decisionNote,
      decidedAt: purchaseRequests.decidedAt,
      createdAt: purchaseRequests.createdAt,
      orderNo: salesOrders.orderNo,
      customerName: customers.name,
      requestedBy: requester.name,
      decidedBy: decider.name,
    })
    .from(purchaseRequests)
    .leftJoin(salesOrders, eq(purchaseRequests.salesOrderId, salesOrders.id))
    .leftJoin(customers, eq(salesOrders.customerId, customers.id))
    .leftJoin(requester, eq(purchaseRequests.requestedBy, requester.id))
    .leftJoin(decider, eq(purchaseRequests.decidedBy, decider.id))
    .orderBy(desc(purchaseRequests.id));

  const items = await db
    .select({
      prId: purchaseRequestItems.prId,
      materialCode: rawMaterials.code,
      materialName: rawMaterials.name,
      unit: rawMaterials.unit,
      qty: purchaseRequestItems.qty,
      price: rawMaterials.price,
      note: purchaseRequestItems.note,
    })
    .from(purchaseRequestItems)
    .innerJoin(rawMaterials, eq(purchaseRequestItems.materialId, rawMaterials.id))
    .orderBy(asc(purchaseRequestItems.id));

  return (
    <PurchaseRequestsClient
      rows={rows}
      items={items}
      canCreate={can(session, "purchasing", "create")}
      canApprove={can(session, "purchasing", "approve")}
    />
  );
}
