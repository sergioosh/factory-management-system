import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, payments } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { PaymentsClient } from "./payments-client";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const session = await requireView("sales");

  const rows = await db
    .select({
      id: payments.id,
      payNo: payments.payNo,
      paymentDate: payments.paymentDate,
      method: payments.method,
      reference: payments.reference,
      currency: payments.currency,
      amount: payments.amount,
      customerName: customers.name,
      allocs: sql<number>`(select count(*) from payment_allocations pa where pa.payment_id = "payments"."id")::int`,
      allocated: sql<number>`coalesce((select sum(pa.amount) from payment_allocations pa where pa.payment_id = "payments"."id"), 0)::float`,
    })
    .from(payments)
    .leftJoin(customers, eq(payments.customerId, customers.id))
    .orderBy(desc(payments.id));

  return <PaymentsClient rows={rows} canCreate={can(session, "sales", "create")} />;
}
