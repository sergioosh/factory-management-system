import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  purchaseRequests,
  salesOrders,
  stockCounts,
  users,
} from "@/db/schema";
import { requireSession, can } from "@/lib/session";
import { ApprovalsClient } from "./approvals-client";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const session = await requireSession();
  const canPurchasing = can(session, "purchasing", "approve");
  const canInventory = can(session, "inventory", "approve");
  if (!canPurchasing && !canInventory) redirect("/");

  const requester = alias(users, "requester");

  const prs = canPurchasing
    ? await db
        .select({
          id: purchaseRequests.id,
          prNo: purchaseRequests.prNo,
          createdAt: purchaseRequests.createdAt,
          notes: purchaseRequests.notes,
          orderNo: salesOrders.orderNo,
          requestedBy: requester.name,
          lines: sql<number>`(select count(*) from purchase_request_items pri where pri.pr_id = "purchase_requests"."id")::int`,
        })
        .from(purchaseRequests)
        .leftJoin(salesOrders, eq(purchaseRequests.salesOrderId, salesOrders.id))
        .leftJoin(requester, eq(purchaseRequests.requestedBy, requester.id))
        .where(eq(purchaseRequests.status, "pending"))
        .orderBy(asc(purchaseRequests.id))
    : [];

  const counts = canInventory
    ? await db
        .select({
          id: stockCounts.id,
          countNo: stockCounts.countNo,
          countDate: stockCounts.countDate,
          scope: stockCounts.scope,
          createdBy: requester.name,
          variances: sql<number>`(select count(*) from stock_count_items sci where sci.count_id = "stock_counts"."id" and sci.counted_qty is not null and sci.counted_qty <> sci.system_qty)::int`,
        })
        .from(stockCounts)
        .leftJoin(requester, eq(stockCounts.createdBy, requester.id))
        .where(eq(stockCounts.status, "submitted"))
        .orderBy(asc(stockCounts.id))
    : [];

  return <ApprovalsClient prs={prs} counts={counts} />;
}
