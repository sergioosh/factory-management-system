import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  customers,
  invoiceItems,
  invoices,
  payments,
  products,
  salesOrders,
  settings,
} from "@/db/schema";
import { requireView } from "@/lib/session";
import { fmtDate, fmtMoney, fmtQty } from "@/lib/format";
import { PrintActions } from "./print-actions";

export const dynamic = "force-dynamic";

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireView("sales");
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();

  const [[inv], items, settingRows] = await Promise.all([
    db
      .select({
        id: invoices.id,
        invoiceNo: invoices.invoiceNo,
        invoiceDate: invoices.invoiceDate,
        total: invoices.total,
        notes: invoices.notes,
        customerName: customers.name,
        customerPhone: customers.phone,
        customerLocation: customers.location,
        orderNo: salesOrders.orderNo,
        paid: sql<number>`coalesce((select sum(pa.amount) from payment_allocations pa where pa.invoice_id = "invoices"."id"), 0)::float`,
      })
      .from(invoices)
      .innerJoin(customers, eq(invoices.customerId, customers.id))
      .leftJoin(salesOrders, eq(invoices.salesOrderId, salesOrders.id))
      .where(eq(invoices.id, id)),
    db
      .select({
        qty: invoiceItems.qty,
        rate: invoiceItems.rate,
        name: products.name,
        unit: products.unit,
      })
      .from(invoiceItems)
      .innerJoin(products, eq(invoiceItems.productId, products.id))
      .where(eq(invoiceItems.invoiceId, id)),
    db.select().from(settings),
  ]);
  if (!inv) notFound();
  const cfg = Object.fromEntries(settingRows.map((s) => [s.key, s.value]));
  const balance = inv.total - inv.paid;

  return (
    <div className="mx-auto max-w-[420px] px-4 py-8 font-mono text-[12px] leading-5 text-black">
      <PrintActions />
      <div className="border border-black p-5">
        <div className="text-center">
          <div className="text-[15px] font-semibold uppercase tracking-wide">
            {cfg.company_name || "Factory"}
          </div>
          {cfg.company_address && <div>{cfg.company_address}</div>}
          {cfg.company_phone && <div>Tel: {cfg.company_phone}</div>}
        </div>
        <div className="my-3 border-t border-dashed border-black" />
        <div className="flex justify-between">
          <span>INVOICE</span>
          <span className="font-semibold">{inv.invoiceNo}</span>
        </div>
        <div className="flex justify-between">
          <span>Date</span>
          <span>{fmtDate(inv.invoiceDate)}</span>
        </div>
        {inv.orderNo && (
          <div className="flex justify-between">
            <span>Order</span>
            <span>{inv.orderNo}</span>
          </div>
        )}
        <div className="my-3 border-t border-dashed border-black" />
        <div>
          <div className="font-semibold">{inv.customerName}</div>
          {inv.customerLocation && <div>{inv.customerLocation}</div>}
          {inv.customerPhone && <div>{inv.customerPhone}</div>}
        </div>
        <div className="my-3 border-t border-dashed border-black" />
        <table className="w-full">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1 font-semibold">Item</th>
              <th className="py-1 text-right font-semibold">Qty</th>
              <th className="py-1 text-right font-semibold">Rate</th>
              <th className="py-1 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="align-top">
                <td className="py-1 pr-2">{it.name}</td>
                <td className="py-1 text-right whitespace-nowrap">
                  {fmtQty(it.qty)} {it.unit}
                </td>
                <td className="py-1 text-right">{fmtMoney(it.rate)}</td>
                <td className="py-1 text-right">{fmtMoney(it.qty * it.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="my-3 border-t border-dashed border-black" />
        <div className="flex justify-between text-[13px] font-semibold">
          <span>TOTAL (UGX)</span>
          <span>{fmtMoney(inv.total)}</span>
        </div>
        <div className="flex justify-between">
          <span>Paid</span>
          <span>{fmtMoney(inv.paid)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Balance due</span>
          <span>{fmtMoney(balance)}</span>
        </div>
        {inv.notes && (
          <>
            <div className="my-3 border-t border-dashed border-black" />
            <div>{inv.notes}</div>
          </>
        )}
        <div className="my-3 border-t border-dashed border-black" />
        <div className="text-center">Thank you for your business</div>
      </div>
    </div>
  );
}
