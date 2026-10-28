"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Add, ArrowLeft2, Trash } from "iconsax-reactjs";
import { fmtMoney, today } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, NumberInput, Field, Textarea } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchSelect } from "@/components/ui/search-select";
import { saveOrder } from "./actions";

export type CustomerOpt = { id: number; name: string; code: string | null };
export type ProductOpt = { id: number; code: string; name: string; sellingPrice: number };

type Line = { productId: number | null; qty: number; rate: number };

export function OrderFormClient({
  mode,
  customers,
  products,
  initial,
}: {
  mode: "create" | "edit";
  customers: CustomerOpt[];
  products: ProductOpt[];
  initial?: {
    id: number;
    orderNo: string;
    customerId: number;
    orderDate: string;
    targetDate: string | null;
    taxRate: number;
    notes: string | null;
    items: Line[];
  };
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState<number | null>(initial?.customerId ?? null);
  const [orderDate, setOrderDate] = useState(initial?.orderDate ?? today());
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? "");
  const [taxRate, setTaxRate] = useState(initial?.taxRate ?? 18);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(
    initial?.items ?? [{ productId: null, qty: 0, rate: 0 }],
  );
  const [busy, startTransition] = useTransition();

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.qty * l.rate, 0), [lines]);
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  function submit() {
    if (!customerId) return void toast.error("Pick a customer");
    const items = lines.filter((l) => l.productId && l.qty > 0);
    if (items.length === 0) return void toast.error("Add at least one line");
    startTransition(async () => {
      const res = await saveOrder({
        id: initial?.id,
        customerId,
        orderDate,
        targetDate: targetDate || undefined,
        taxRate,
        notes: notes || undefined,
        items: items.map((l) => ({ productId: l.productId!, qty: l.qty, rate: l.rate })),
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(initial ? "Order updated" : "Order created");
      router.push(`/orders/${res.data}`);
    });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/orders"
        className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-ink-soft hover:text-ink"
      >
        <ArrowLeft2 size={14} /> Back to orders
      </Link>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="rounded-xl border border-line bg-surface p-6">
          <h1 className="text-[15px] font-semibold">Order details</h1>
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Customer" required>
                <SearchSelect
                  options={customers.map((c) => ({
                    value: c.id,
                    label: c.code ? `${c.code} — ${c.name}` : c.name,
                  }))}
                  value={customerId}
                  onChange={(v) => setCustomerId(v as number)}
                  placeholder="Pick customer"
                />
              </Field>
              <Field label="Order date" required>
                <DatePicker value={orderDate} onChange={setOrderDate} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Target / ship date" hint="When the customer expects delivery.">
                <DatePicker value={targetDate} onChange={setTargetDate} placeholder="Optional" />
              </Field>
              <Field label="Tax rate %" required hint="Applied to the order subtotal.">
                <NumberInput
                  className="num"
                  value={taxRate}
                  onChange={setTaxRate}
                />
              </Field>
            </div>

            <Field label="Notes" hint="Special instructions, branding, deadlines.">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-medium text-ink-soft">Line items</span>
                <span className="text-[11.5px] text-ink-faint">
                  Rate defaults to the product's selling price.
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-line text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
                      <th className="px-3 py-2 text-left">Product</th>
                      <th className="px-2 py-2 text-right">Qty</th>
                      <th className="px-2 py-2 text-right">Unit price</th>
                      <th className="px-3 py-2 text-right">Line total</th>
                      <th className="w-9" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        <td className="px-3 py-1.5">
                          <SearchSelect
                            options={products.map((p) => ({ value: p.id, label: p.name, hint: p.code }))}
                            value={line.productId}
                            onChange={(v) => {
                              const p = products.find((x) => x.id === v);
                              setLine(i, { productId: v as number, rate: line.rate || p?.sellingPrice || 0 });
                            }}
                            placeholder="Pick product"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <NumberInput
                            placeholder="Qty"
                            className="num w-20 text-right"
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
                    ))}
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

        <div className="h-fit rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-4">
          <h2 className="text-[14px] font-semibold">Totals</h2>
          <div className="mt-4 space-y-2 text-[13px]">
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
            {busy ? "Saving…" : mode === "create" ? "Save as Draft" : "Save order"}
          </Button>
          <p className="mt-2 text-[11.5px] text-ink-faint">
            {mode === "create"
              ? "Order starts in Draft. Confirm it later to move through the workflow."
              : "Only draft orders can be edited."}
          </p>
          <Button variant="secondary" className="mt-2 w-full" onClick={() => router.push("/orders")} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
