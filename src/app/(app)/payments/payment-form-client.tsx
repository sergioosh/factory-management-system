"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft2 } from "iconsax-reactjs";
import { fmtDate, fmtMoney, today } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, NumberInput, Field, Textarea, Select } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchSelect } from "@/components/ui/search-select";
import { recordPayment } from "../sales/actions";

type CustomerOpt = { id: number; name: string; code: string | null; creditLimit: number };
type OpenInvoice = { id: number; customerId: number; invoiceNo: string; invoiceDate: string; balance: number };

export function PaymentFormClient({
  customers,
  openInvoices,
}: {
  customers: CustomerOpt[];
  openInvoices: OpenInvoice[];
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [amount, setAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(today());
  const [currency, setCurrency] = useState("");
  const [fxRate, setFxRate] = useState(1);
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [autoFifo, setAutoFifo] = useState(true);
  const [alloc, setAlloc] = useState<Record<number, number>>({});
  const [busy, startTransition] = useTransition();

  const custInvoices = useMemo(
    () => (customerId ? openInvoices.filter((i) => i.customerId === customerId) : []),
    [openInvoices, customerId],
  );
  const customer = customers.find((c) => c.id === customerId);
  const outstanding = custInvoices.reduce((s, i) => s + i.balance, 0);

  function pickCustomer(id: number) {
    setCustomerId(id);
    setAlloc({});
  }

  function fifo() {
    let remaining = amount;
    const next: Record<number, number> = {};
    for (const inv of custInvoices) {
      if (remaining <= 0.005) break;
      const take = Math.min(inv.balance, remaining);
      next[inv.id] = Math.round(take * 100) / 100;
      remaining -= take;
    }
    setAlloc(next);
  }

  const allocated = Object.values(alloc).reduce((s, v) => s + (v || 0), 0);
  const unapplied = Math.max(0, amount - allocated);
  const valid = customerId != null && amount > 0 && allocated <= amount + 0.01;

  function submit() {
    // if auto and nothing set yet, allocate now
    let allocations = Object.entries(alloc)
      .map(([id, amt]) => ({ invoiceId: Number(id), amount: amt }))
      .filter((a) => a.amount > 0);
    if (autoFifo && allocations.length === 0 && custInvoices.length > 0) {
      let remaining = amount;
      allocations = [];
      for (const inv of custInvoices) {
        if (remaining <= 0.005) break;
        const take = Math.min(inv.balance, remaining);
        allocations.push({ invoiceId: inv.id, amount: Math.round(take * 100) / 100 });
        remaining -= take;
      }
    }
    startTransition(async () => {
      const res = await recordPayment({
        customerId: customerId!,
        amount,
        paymentDate,
        method: method as "cash" | "mobile_money" | "bank",
        currency: currency || undefined,
        fxRate,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        allocations,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Payment recorded");
      router.push("/payments");
    });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/payments"
        className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-ink-soft hover:text-ink"
      >
        <ArrowLeft2 size={14} /> Back to payments
      </Link>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surface p-6">
            <h1 className="text-[15px] font-semibold">Payment</h1>
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Customer" required>
                  <SearchSelect
                    options={customers.map((c) => ({ value: c.id, label: c.code ? `${c.code} — ${c.name}` : c.name }))}
                    value={customerId}
                    onChange={(v) => pickCustomer(Number(v))}
                    placeholder="— pick customer —"
                  />
                </Field>
                <Field label="Payment date" required>
                  <DatePicker value={paymentDate} onChange={setPaymentDate} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Amount received" required>
                  <NumberInput
                    className="num"
                    value={amount}
                    onChange={setAmount}
                  />
                </Field>
                <Field label="Currency" hint="Label only — books stay in UGX.">
                  <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    <option value="">UGX — Uganda Shilling (base)</option>
                    <option value="USD">USD — US Dollar</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="KES">KES — Kenyan Shilling</option>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="FX rate to base" required hint="1 for payments already in UGX.">
                  <NumberInput className="num" value={fxRate} onChange={setFxRate} />
                </Field>
                <Field label="Method" required>
                  <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                    <option value="cash">Cash</option>
                    <option value="mobile_money">Mobile money</option>
                    <option value="bank">Bank</option>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Reference" hint="Cheque number / mobile-money txn id / bank ref.">
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="optional" />
                </Field>
                <Field label="Notes" hint="Optional.">
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
                </Field>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold">Allocate to invoices</h2>
              <div className="flex items-center gap-2">
                <Checkbox checked={autoFifo} onChange={setAutoFifo} label="Auto-allocate FIFO on save" />
                <Button variant="secondary" size="sm" onClick={fifo} disabled={!customerId || amount <= 0}>
                  Preview FIFO
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setAlloc({})}>
                  Clear
                </Button>
              </div>
            </div>
            {customerId == null ? (
              <p className="mt-3 text-[12.5px] text-ink-faint">Pick a customer to see open invoices.</p>
            ) : custInvoices.length === 0 ? (
              <p className="mt-3 text-[12.5px] text-ink-faint">
                This customer has no outstanding invoices. The payment will be recorded as unallocated credit.
              </p>
            ) : (
              <div className="mt-3 overflow-hidden rounded-lg border border-line">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-line text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
                      <th className="px-3 py-2 text-left">Invoice</th>
                      <th className="px-2 py-2 text-left">Date</th>
                      <th className="px-2 py-2 text-right">Balance</th>
                      <th className="px-3 py-2 text-right">Allocate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {custInvoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-line last:border-0">
                        <td className="num px-3 py-1.5 text-[12.5px]">{inv.invoiceNo}</td>
                        <td className="px-2 py-1.5 text-[12px] text-ink-soft">{fmtDate(inv.invoiceDate)}</td>
                        <td className="num px-2 py-1.5 text-right">{fmtMoney(inv.balance)}</td>
                        <td className="px-3 py-1.5 text-right">
                          <NumberInput
                            className="num w-28 text-right"
                            value={alloc[inv.id]}
                            onChange={(n) => {
                              const v = Math.max(0, Math.min(inv.balance, n));
                              setAlloc((a) => ({ ...a, [inv.id]: v }));
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-[14px] font-semibold">Account status</h2>
            <div className="mt-3 space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-ink-soft">Currently outstanding</span>
                <span className="num">{fmtMoney(outstanding)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-soft">Credit limit</span>
                <span className="num">{customer && customer.creditLimit > 0 ? fmtMoney(customer.creditLimit) : "— none —"}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-4">
            <h2 className="text-[14px] font-semibold">Totals</h2>
            <div className="mt-3 space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-ink-soft">Amount (base)</span>
                <span className="num">{fmtMoney(amount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-soft">Allocated</span>
                <span className="num">{fmtMoney(allocated)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-2 text-[14px] font-semibold">
                <span>Unapplied</span>
                <span className="num">{fmtMoney(unapplied)}</span>
              </div>
            </div>
            <Button className="mt-4 w-full" onClick={submit} disabled={busy || !valid}>
              {busy ? "Posting…" : "Post payment"}
            </Button>
            <Button
              variant="secondary"
              className="mt-2 w-full"
              onClick={() => router.push("/payments")}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
