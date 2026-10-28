"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { TickCircle, ArrowRight2 } from "iconsax-reactjs";
import { fmtDate, fmtMoney, fmtQty, today } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/confirm";
import type { MaterialCheck } from "../lib";
import { setOrderStatus, createPrFromShortfall, createRunsFromOrder } from "../actions";
import { createInvoiceFromOrder } from "../../sales/actions";
import { PaymentSheet } from "../../sales/payment-sheet";

type Order = {
  id: number;
  orderNo: string;
  orderDate: string;
  status: string;
  notes: string | null;
  customerName: string;
  customerPhone: string | null;
};
type Item = {
  id: number;
  productId: number;
  qty: number;
  rate: number;
  productName: string;
  productCode: string;
  unit: string;
  fgStock: number;
};
type Pr = { id: number; prNo: string; status: string };
type Grn = { id: number; grnNo: string; receivedDate: string; prId: number | null };
type Run = {
  id: number;
  runNo: string;
  status: string;
  plannedQty: number;
  producedQty: number | null;
  productName: string;
};
type Invoice = { id: number; invoiceNo: string; invoiceDate: string; total: number; paid: number };

const STEPS = ["Order", "Materials", "Purchase", "Production", "Invoice", "Payment"] as const;

function stepIndex(order: Order, check: MaterialCheck, invoices: Invoice[]): number {
  if (order.status === "draft") return 0;
  const balance = invoices.reduce((s, i) => s + i.total - i.paid, 0);
  if (order.status === "invoiced" || order.status === "closed") {
    return invoices.length && balance <= 0 ? 6 : 5;
  }
  if (order.status === "ready") return 4;
  if (order.status === "in_production") return 3;
  // confirmed
  return check.totalShort > 0 ? 2 : 3;
}

export function OrderDetailClient({
  order,
  items,
  check,
  prs,
  grns,
  runs,
  invoices,
  perms,
}: {
  order: Order;
  items: Item[];
  check: MaterialCheck;
  prs: Pr[];
  grns: Grn[];
  runs: Run[];
  invoices: Invoice[];
  perms: {
    editOrder: boolean;
    createPr: boolean;
    createRun: boolean;
    createInvoice: boolean;
    addPayment: boolean;
  };
}) {
  const [busy, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<null | { title: string; body: string; action: () => Promise<{ ok: boolean; error?: string }>; label: string; danger?: boolean }>(null);
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);

  const active = stepIndex(order, check, invoices);
  const orderValue = items.reduce((s, i) => s + i.qty * i.rate, 0);
  const totalBalance = invoices.reduce((s, i) => s + i.total - i.paid, 0);
  const openRuns = runs.filter((r) => !["completed", "cancelled"].includes(r.status));
  const cancelled = order.status === "cancelled";

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) return void toast.error(res.error ?? "Failed");
      toast.success(success);
      setConfirming(null);
    });
  }

  return (
    <>
      <PageHeader
        title={order.orderNo}
        sub={
          <span className="flex items-center gap-2">
            {order.customerName}
            {order.customerPhone && <span className="text-ink-faint">· {order.customerPhone}</span>}
            <span className="text-ink-faint">· {fmtDate(order.orderDate)}</span>
            <StatusBadge status={order.status} />
          </span>
        }
        actions={
          <>
            {perms.editOrder && order.status === "draft" && (
              <Button
                onClick={() =>
                  setConfirming({
                    title: `Confirm ${order.orderNo}?`,
                    body: "Locks the lines and starts the material check.",
                    label: "Confirm order",
                    action: () => setOrderStatus(order.id, "confirmed"),
                  })
                }
              >
                Confirm order
              </Button>
            )}
            {perms.editOrder && order.status === "invoiced" && totalBalance <= 0 && (
              <Button onClick={() => run(() => setOrderStatus(order.id, "closed"), "Order closed")}>
                Close order
              </Button>
            )}
            {perms.editOrder && !["closed", "cancelled", "invoiced"].includes(order.status) && (
              <Button
                variant="ghost"
                onClick={() =>
                  setConfirming({
                    title: `Cancel ${order.orderNo}?`,
                    body: "The order is cancelled. Stock already produced stays in inventory.",
                    label: "Cancel order",
                    danger: true,
                    action: () => setOrderStatus(order.id, "cancelled"),
                  })
                }
              >
                Cancel
              </Button>
            )}
          </>
        }
      />

      {/* stepper */}
      {!cancelled && (
        <div className="mb-5 flex items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface px-4 py-3">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-1">
              {i > 0 && <ArrowRight2 size={12} className="mx-1 text-ink-faint" />}
              <div
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[12.5px]",
                  i < active && "text-ok",
                  i === active && "bg-accent-soft font-medium text-accent",
                  i > active && "text-ink-faint",
                )}
              >
                {i < active ? (
                  <TickCircle size={14} variant="Bold" />
                ) : (
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full border text-[10px]",
                      i === active ? "border-accent" : "border-line-strong",
                    )}
                  >
                    {i + 1}
                  </span>
                )}
                {step}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* order lines */}
        <section className="rounded-xl border border-line bg-surface">
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Order lines</h2>
            <span className="num text-[12.5px] text-ink-soft">UGX {fmtMoney(orderValue)}</span>
          </header>
          <table className="w-full">
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2 text-[13px]">
                    {i.productName}
                    <span className="num ml-2 text-[11px] text-ink-faint">{i.productCode}</span>
                  </td>
                  <td className="num px-3 py-2 text-right">
                    {fmtQty(i.qty)} {i.unit}
                  </td>
                  <td className="num px-4 py-2 text-right text-ink-soft">{fmtMoney(i.qty * i.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {order.notes && <p className="border-t border-line px-4 py-2 text-[12.5px] text-ink-soft">{order.notes}</p>}
        </section>

        {/* material check */}
        <section className="rounded-xl border border-line bg-surface">
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Material check</h2>
            {["confirmed", "in_production"].includes(order.status) &&
              (check.totalShort > 0 ? (
                <StatusBadge status="pending" />
              ) : (
                <span className="flex items-center gap-1 text-[12.5px] font-medium text-ok">
                  <TickCircle size={14} variant="Bold" /> Covered
                </span>
              ))}
          </header>
          {order.status === "draft" ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-ink-faint">Confirm the order to run the check</p>
          ) : (
            <>
              {check.productsWithoutBom.length > 0 && (
                <p className="border-b border-line bg-warn-soft px-4 py-2 text-[12px] text-warn">
                  No BOM: {check.productsWithoutBom.join(", ")}
                </p>
              )}
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                      <th className="px-4 py-1.5 text-left">Material</th>
                      <th className="px-2 py-1.5 text-right">Required</th>
                      <th className="px-2 py-1.5 text-right">Free</th>
                      <th className="px-4 py-1.5 text-right">Short</th>
                    </tr>
                  </thead>
                  <tbody>
                    {check.rows.map((r) => (
                      <tr key={r.materialId} className="border-b border-line last:border-0">
                        <td className="px-4 py-1.5 text-[12.5px]">{r.name}</td>
                        <td className="num px-2 py-1.5 text-right">{fmtQty(r.required)}</td>
                        <td className="num px-2 py-1.5 text-right text-ink-soft">{fmtQty(r.free)}</td>
                        <td className={cn("num px-4 py-1.5 text-right", r.short > 0 && "font-semibold text-danger")}>
                          {r.short > 0 ? fmtQty(r.short) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {check.totalShort > 0 &&
                perms.createPr &&
                ["confirmed", "in_production"].includes(order.status) && (
                <div className="border-t border-line px-4 py-2.5">
                  <Button
                    size="sm"
                    disabled={busy || prs.some((p) => ["pending", "approved"].includes(p.status))}
                    onClick={() => run(() => createPrFromShortfall(order.id), "Purchase request raised")}
                  >
                    Raise purchase request for shortfall
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        {/* purchase chain */}
        <section className="rounded-xl border border-line bg-surface">
          <header className="border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Purchasing</h2>
          </header>
          {prs.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-ink-faint">
              {check.totalShort > 0 ? "Shortfall not yet requested" : "No purchases needed"}
            </p>
          ) : (
            <div className="divide-y divide-(--color-line)">
              {prs.map((pr) => {
                const linkedGrns = grns.filter((g) => g.prId === pr.id);
                return (
                  <div key={pr.id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between">
                      <Link href="/purchase-requests" className="num text-[12.5px] text-accent hover:underline">
                        {pr.prNo}
                      </Link>
                      <StatusBadge status={pr.status} />
                    </div>
                    {linkedGrns.map((g) => (
                      <div key={g.id} className="mt-1.5 flex items-center justify-between pl-4 text-[12.5px]">
                        <Link href="/grn" className="num text-accent hover:underline">
                          {g.grnNo}
                        </Link>
                        <span className="text-[11.5px] text-ink-faint">received</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* production */}
        <section className="rounded-xl border border-line bg-surface">
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Production</h2>
            {perms.createRun &&
              ["confirmed", "in_production"].includes(order.status) &&
              items.some((i) => !runs.some((r) => r.status !== "cancelled" && r.productName === i.productName)) && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => run(() => createRunsFromOrder(order.id), "Production runs created")}
                >
                  Create runs
                </Button>
              )}
          </header>
          {runs.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-ink-faint">No runs yet</p>
          ) : (
            <div className="divide-y divide-(--color-line)">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-2.5 text-[12.5px]">
                  <span>
                    <Link href="/production" className="num text-accent hover:underline">{r.runNo}</Link>
                    <span className="ml-2">{r.productName}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="num text-ink-soft">
                      {r.producedQty != null ? `${fmtQty(r.producedQty)} / ` : ""}
                      {fmtQty(r.plannedQty)}
                    </span>
                    <StatusBadge status={r.status} />
                  </span>
                </div>
              ))}
            </div>
          )}
          {openRuns.length > 0 && (
            <p className="border-t border-line px-4 py-2 text-[12px] text-ink-faint">
              Complete runs on the <Link href="/production" className="text-accent hover:underline">Production</Link> page
            </p>
          )}
        </section>

        {/* invoice + payment */}
        <section className="rounded-xl border border-line bg-surface lg:col-span-2">
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Invoice & payment</h2>
            {perms.createInvoice && order.status === "ready" && (
              <Button
                size="sm"
                disabled={busy || items.some((i) => i.fgStock < i.qty)}
                onClick={() =>
                  setConfirming({
                    title: `Invoice ${order.orderNo}?`,
                    body: `Creates the invoice (UGX ${fmtMoney(orderValue)}) and deducts finished goods stock.`,
                    label: "Create invoice",
                    action: () => createInvoiceFromOrder(order.id),
                  })
                }
              >
                Create invoice
              </Button>
            )}
          </header>
          {order.status === "ready" && items.some((i) => i.fgStock < i.qty) && (
            <p className="border-b border-line bg-warn-soft px-4 py-2 text-[12px] text-warn">
              Not enough finished stock:{" "}
              {items.filter((i) => i.fgStock < i.qty).map((i) => `${i.productName} (${fmtQty(i.fgStock)}/${fmtQty(i.qty)})`).join(", ")}
            </p>
          )}
          {invoices.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-ink-faint">Not invoiced yet</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-1.5 text-left">Invoice</th>
                  <th className="px-2 py-1.5 text-left">Date</th>
                  <th className="px-2 py-1.5 text-right">Total</th>
                  <th className="px-2 py-1.5 text-right">Paid</th>
                  <th className="px-2 py-1.5 text-right">Balance</th>
                  <th className="px-4 py-1.5 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const balance = inv.total - inv.paid;
                  return (
                    <tr key={inv.id} className="border-b border-line last:border-0">
                      <td className="num px-4 py-2">
                        <Link href={`/sales/${inv.id}/print`} className="text-accent hover:underline">
                          {inv.invoiceNo}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-[12.5px] text-ink-soft">{fmtDate(inv.invoiceDate)}</td>
                      <td className="num px-2 py-2 text-right">{fmtMoney(inv.total)}</td>
                      <td className="num px-2 py-2 text-right text-ok">{fmtMoney(inv.paid)}</td>
                      <td className={cn("num px-2 py-2 text-right", balance > 0 && "font-semibold text-danger")}>
                        {fmtMoney(balance)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {balance > 0 && perms.addPayment && (
                          <Button size="sm" variant="secondary" onClick={() => setPayingInvoice(inv)}>
                            Record payment
                          </Button>
                        )}
                        {balance <= 0 && <StatusBadge status="paid" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {confirming && (
        <ConfirmDialog
          open={!!confirming}
          onOpenChange={(o) => !o && setConfirming(null)}
          title={confirming.title}
          body={confirming.body}
          confirmLabel={confirming.label}
          danger={confirming.danger}
          busy={busy}
          onConfirm={() => run(confirming.action, "Done")}
        />
      )}

      {payingInvoice && (
        <PaymentSheet invoice={payingInvoice} onClose={() => setPayingInvoice(null)} />
      )}
    </>
  );
}
