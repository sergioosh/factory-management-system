import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, salesOrderItems, salesOrders } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { OrdersClient } from "./orders-client";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await requireView("orders");
  const rows = await db
    .select({
      id: salesOrders.id,
      orderNo: salesOrders.orderNo,
      orderDate: salesOrders.orderDate,
      targetDate: salesOrders.targetDate,
      status: salesOrders.status,
      customerName: customers.name,
      lines: sql<number>`count(${salesOrderItems.id})::int`,
      value: sql<number>`coalesce(sum(${salesOrderItems.qty} * ${salesOrderItems.rate}), 0)::float * (1 + ${salesOrders.taxRate} / 100.0)`,
    })
    .from(salesOrders)
    .innerJoin(customers, eq(salesOrders.customerId, customers.id))
    .leftJoin(salesOrderItems, eq(salesOrderItems.orderId, salesOrders.id))
    .groupBy(salesOrders.id, customers.name)
    .orderBy(desc(salesOrders.id));

  return <OrdersClient rows={rows} canCreate={can(session, "orders", "create")} />;
}
