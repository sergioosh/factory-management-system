import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, invoices, payments, salesOrders } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { SalesClient } from "./sales-client";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const session = await requireView("sales");

  const rows = await db
    .select({
      id: invoices.id,
      invoiceNo: invoices.invoiceNo,
      invoiceDate: invoices.invoiceDate,
      total: invoices.total,
      customerName: customers.name,
      orderNo: salesOrders.orderNo,
      lines: sql<number>`(select count(*) from invoice_items ii where ii.invoice_id = "invoices"."id")::int`,
      paid: sql<number>`coalesce((select sum(pa.amount) from payment_allocations pa where pa.invoice_id = "invoices"."id"), 0)::float`,
    })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .leftJoin(salesOrders, eq(invoices.salesOrderId, salesOrders.id))
    .orderBy(desc(invoices.id));

  return <SalesClient rows={rows} canCreate={can(session, "sales", "create")} />;
}
