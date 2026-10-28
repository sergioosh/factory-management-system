import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, invoices, products } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { InvoiceFormClient } from "../invoice-form-client";

export const dynamic = "force-dynamic";

export default async function NewSalePage() {
  const session = await requireView("sales");
  if (!can(session, "sales", "create")) redirect("/sales");

  const [customerList, productList, invRows] = await Promise.all([
    db
      .select({ id: customers.id, name: customers.name, code: customers.code, creditLimit: customers.creditLimit })
      .from(customers)
      .where(eq(customers.archived, false))
      .orderBy(asc(customers.name)),
    db
      .select({
        id: products.id,
        code: products.code,
        name: products.name,
        sellingPrice: products.sellingPrice,
        currentStock: products.currentStock,
      })
      .from(products)
      .where(eq(products.archived, false)),
    db
      .select({
        customerId: invoices.customerId,
        invoiceDate: invoices.invoiceDate,
        total: invoices.total,
        paid: sql<number>`coalesce((select sum(pa.amount) from payment_allocations pa where pa.invoice_id = "invoices"."id"), 0)::float`,
      })
      .from(invoices),
  ]);

  const info = new Map<
    number,
    { outstanding: number; salesCount: number; lifetimeValue: number; lastSale: string | null }
  >();
  for (const r of invRows) {
    const a = info.get(r.customerId) ?? { outstanding: 0, salesCount: 0, lifetimeValue: 0, lastSale: null };
    a.outstanding += r.total - r.paid;
    a.salesCount += 1;
    a.lifetimeValue += r.total;
    if (!a.lastSale || r.invoiceDate > a.lastSale) a.lastSale = r.invoiceDate;
    info.set(r.customerId, a);
  }

  const customerInfo = customerList.map((c) => ({
    customerId: c.id,
    creditLimit: c.creditLimit,
    outstanding: info.get(c.id)?.outstanding ?? 0,
    salesCount: info.get(c.id)?.salesCount ?? 0,
    lifetimeValue: info.get(c.id)?.lifetimeValue ?? 0,
    lastSale: info.get(c.id)?.lastSale ?? null,
  }));

  return <InvoiceFormClient customers={customerList} products={productList} customerInfo={customerInfo} />;
}
