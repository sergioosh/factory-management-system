import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, invoices } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { PaymentFormClient } from "../payment-form-client";

export const dynamic = "force-dynamic";

export default async function NewPaymentPage() {
  const session = await requireView("sales");
  if (!can(session, "sales", "create")) redirect("/payments");

  const customerList = await db
    .select({ id: customers.id, name: customers.name, code: customers.code, creditLimit: customers.creditLimit })
    .from(customers)
    .where(eq(customers.archived, false))
    .orderBy(asc(customers.name));

  const invRows = await db
    .select({
      id: invoices.id,
      customerId: invoices.customerId,
      invoiceNo: invoices.invoiceNo,
      invoiceDate: invoices.invoiceDate,
      total: invoices.total,
      paid: sql<number>`coalesce((select sum(pa.amount) from payment_allocations pa where pa.invoice_id = "invoices"."id"), 0)::float`,
    })
    .from(invoices)
    .orderBy(asc(invoices.invoiceDate), asc(invoices.id));

  const openInvoices = invRows
    .map((r) => ({
      id: r.id,
      customerId: r.customerId,
      invoiceNo: r.invoiceNo,
      invoiceDate: r.invoiceDate,
      balance: r.total - r.paid,
    }))
    .filter((r) => r.balance > 0.005);

  return <PaymentFormClient customers={customerList} openInvoices={openInvoices} />;
}
