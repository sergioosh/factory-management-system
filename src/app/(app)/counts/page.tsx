import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { stockCountItems, stockCounts, users } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { CountsClient } from "./counts-client";

export const dynamic = "force-dynamic";

export default async function CountsPage() {
  const session = await requireView("inventory");
  const rows = await db
    .select({
      id: stockCounts.id,
      countNo: stockCounts.countNo,
      countDate: stockCounts.countDate,
      scope: stockCounts.scope,
      status: stockCounts.status,
      totalItems: count(stockCountItems.id),
      countedItems: count(stockCountItems.countedQty),
      createdBy: users.name,
    })
    .from(stockCounts)
    .leftJoin(stockCountItems, eq(stockCountItems.countId, stockCounts.id))
    .leftJoin(users, eq(users.id, stockCounts.createdBy))
    .groupBy(stockCounts.id, users.name)
    .orderBy(desc(stockCounts.id));
  return <CountsClient rows={rows} canCreate={can(session, "inventory", "create")} />;
}
