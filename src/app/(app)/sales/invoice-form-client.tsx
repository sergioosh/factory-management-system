"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Add, ArrowLeft2, Trash } from "iconsax-reactjs";
import { fmtDate, fmtMoney, fmtQty, today } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input, NumberInput, Field, Textarea } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchSelect } from "@/components/ui/search-select";
import { createInvoice } from "./actions";

export type CustomerOpt = { id: number; name: string; code: string | null; creditLimit: number };
export type ProductOpt = { id: number; code: string; name: string; sellingPrice: number; currentStock: number };
export type CustomerInfo = {
  customerId: number;
  creditLimit: number;
  outstanding: number;
  salesCount: number;
  lifetimeValue: number;
  lastSale: string | null;
};
type Line = { productId: number | null; qty: number; rate: number };

export function InvoiceFormClient({
  customers,
  products,
  customerInfo,
}: {
  customers: CustomerOpt[];
  products: ProductOpt[];
  customerInfo: CustomerInfo[];
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [taxRate, setTaxRate] = useState(18);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: null, qty: 0, rate: 0 }]);
  const [busy, startTransition] = useTransition();

  const info = useMemo(
    () => customerInfo.find((c) => c.customerId === customerId),
    [customerInfo, customerId],
  );

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.qty * l.rate, 0), [lines]);
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  function submit() {
    if (!customerId) return void toast.error("Pick a customer");
    const items = lines.filter((l) => l.productId && l.qty > 0);
    if (!items.length) return void toast.error("Add at least one line");
    startTransition(async () => {
      const res = await createInvoice({
        customerId,
        invoiceDate,
        taxRate,
        notes: notes.trim() || undefined,
        items: items.map((l) => ({ productId: l.productId!, qty: l.qty, rate: l.rate })),
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${res.data.invoiceNo} created — stock deducted`);
      router.push("/sales");
    });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/sales"
        className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-ink-soft hover:text-ink"
      >
        <ArrowLeft2 size={14} /> Back to sales
      </Link>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="rounded-xl border border-line bg-surface p-6">
          <h1 className="text-[15px] font-semibold">Sale</h1>
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Customer" required>
                <SearchSelect
                  options={customers.map((c) => ({ value: c.id, label: c.code ? `${c.code} — ${c.name}` : c.name }))}
                  value={customerId}
                  onChange={(v) => setCustomerId(v as number)}
                  placeholder="— pick customer —"
                />
              </Field>
              <Field label="Sale date" required>
                <DatePicker value={invoiceDate} onChange={setInvoiceDate} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Tax rate %" required hint="Applied to the sale subtotal.">
                <NumberInput
                  className="num"
                  value={taxRate}
                  onChange={setTaxRate}
                />
              </Field>
            </div>

            <Field label="Notes" hint="Optional.">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-medium text-ink-soft">Line items</span>
                <span className="text-[11.5px] text-ink-faint">
                  Unit price defaults to the product master; qty over stock is outlined red.
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-line text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
                      <th className="px-3 py-2 text-left">Product</th>
                      <th className="px-2 py-2 text-right">Qty</th>
                      <th className="px-2 py-2 text-right">Unit price</th>
                      <th className="px-3 py-2 text-right">Line subtotal</th>
                      <th className="w-9" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, i) => {
                      const p = products.find((x) => x.id === line.productId);
                      const over = p ? line.qty > p.currentStock : false;
                      return (
                        <tr key={i} className="border-b border-line last:border-0">
                          <td className="px-3 py-1.5">
                            <SearchSelect
                              options={products.map((pr) => ({
                                value: pr.id,
                                label: pr.name,
                                hint: `${fmtQty(pr.currentStock)} in stock`,
                              }))}
                              value={line.productId}
                              onChange={(v) => {
                                const prod = products.find((x) => x.id === v);
                                setLine(i, { productId: v as number, rate: line.rate || prod?.sellingPrice || 0 });
                              }}
                              placeholder="— pick product —"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <NumberInput
                              placeholder="Qty"
                              className={cn("num w-20 text-right", over && "border-danger")}
                              value={line.qty}
                              onChange={(n) => setLine(i, { qty: n })}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <NumberInput
                              placeholder="Price"
                              className="num w-28 text-right"
                              value={line.rate}
                              onChange={(n) => setLine(i, { rate: n })}
                            />
                          </td>
                          <td className="num px-3 py-1.5 text-right font-medium">
                            {fmtMoney(line.qty * line.rate)}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                              className="rounded-md p-1 text-ink-faint hover:text-danger cursor-pointer disabled:opacity-40"
                              disabled={lines.length === 1}
                            >
                              <Trash size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => setLines((ls) => [...ls, { productId: null, qty: 0, rate: 0 }])}
              >
                <Add size={14} /> Add line
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-4">
            <h2 className="text-[14px] font-semibold">Totals</h2>
            <div className="mt-3 space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-ink-soft">Subtotal</span>
                <span className="num">{fmtMoney(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-soft">Tax ({taxRate}%)</span>
                <span className="num">{fmtMoney(tax)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-2 text-[14px] font-semibold">
                <span>Total</span>
                <span className="num">{fmtMoney(total)}</span>
              </div>
            </div>
            <Button className="mt-4 w-full" onClick={submit} disabled={busy}>
              {busy ? "Posting…" : "Post sale"}
            </Button>
            <p className="mt-2 text-[11.5px] text-ink-faint">
              Posting checks finished-goods stock. A sale that would push FG below zero is blocked.
            </p>
            <Button
              variant="secondary"
              className="mt-2 w-full"
              onClick={() => router.push("/sales")}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>

          <div className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-[13px] font-semibold">Account status</h2>
            <div className="mt-3 space-y-1.5 text-[12.5px]">
              <div className="flex items-center justify-between">
                <span className="text-ink-soft">Outstanding</span>
                <span className="num">{info ? fmtMoney(info.outstanding) : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-soft">Credit limit</span>
                <span className="num">
                  {info && info.creditLimit > 0 ? fmtMoney(info.creditLimit) : "— none —"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-soft">After this sale</span>
                <span className="num">{info ? fmtMoney(info.outstanding + total) : "—"}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-[13px] font-semibold">Customer history</h2>
            <div className="mt-3 space-y-1.5 text-[12.5px]">
              <div className="flex items-center justify-between">
                <span className="text-ink-soft">Sales</span>
                <span className="num">{info ? info.salesCount : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-soft">Lifetime value</span>
                <span className="num">{info ? fmtMoney(info.lifetimeValue) : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-soft">Last sale</span>
                <span className="num">{info?.lastSale ? fmtDate(info.lastSale) : "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
