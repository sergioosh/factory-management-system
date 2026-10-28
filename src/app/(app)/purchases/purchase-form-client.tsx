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
import { SearchSelect } from "@/components/ui/search-select";
import { Checkbox } from "@/components/ui/checkbox";
import { createPurchaseInvoice } from "./actions";

type SupplierOpt = { id: number; name: string; code: string | null; currency: string | null };
type OpenGrn = { id: number; grnNo: string; supplierId: number | null; receivedDate: string; value: number };

export function PurchaseFormClient({
  suppliers,
  openGrns,
}: {
  suppliers: SupplierOpt[];
  openGrns: OpenGrn[];
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [currency, setCurrency] = useState("");
  const [fxRate, setFxRate] = useState(1);
  const [taxRate, setTaxRate] = useState(18);
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, startTransition] = useTransition();

  const supplierGrns = useMemo(
    () => (supplierId ? openGrns.filter((g) => g.supplierId === supplierId) : []),
    [openGrns, supplierId],
  );

  function pickSupplier(id: number) {
    setSupplierId(id);
    setSelected(new Set());
    const sup = suppliers.find((s) => s.id === id);
    setCurrency(sup?.currency ?? "");
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const subtotal = supplierGrns.filter((g) => selected.has(g.id)).reduce((s, g) => s + g.value, 0);
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;
  const valid = supplierId != null && invoiceNo.trim().length > 0 && selected.size > 0;

  function submit() {
    startTransition(async () => {
      const res = await createPurchaseInvoice({
        supplierId: supplierId!,
        invoiceNo: invoiceNo.trim(),
        invoiceDate,
        currency: currency || undefined,
        fxRate,
        taxRate,
        notes: notes.trim() || undefined,
        grnIds: [...selected],
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Invoice posted");
      router.push("/purchases");
    });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/purchases"
        className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-ink-soft hover:text-ink"
      >
        <ArrowLeft2 size={14} /> Back to purchases
      </Link>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="rounded-xl border border-line bg-surface p-6">
          <h1 className="text-[15px] font-semibold">Invoice</h1>
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Supplier" required>
                <SearchSelect
                  options={suppliers.map((s) => ({ value: s.id, label: s.code ? `${s.code} — ${s.name}` : s.name }))}
                  value={supplierId}
                  onChange={(v) => pickSupplier(Number(v))}
                  placeholder="— pick supplier —"
                />
              </Field>
              <Field label="Invoice #" required hint="The supplier's invoice number.">
                <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Invoice date" required>
                <DatePicker value={invoiceDate} onChange={setInvoiceDate} />
              </Field>
              <Field label="Currency" hint="Label only — books stay in UGX.">
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="">UGX — Uganda Shilling (base)</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="CNY">CNY — Chinese Yuan</option>
                  <option value="KES">KES — Kenyan Shilling</option>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="FX rate to base" required hint="1 for invoices already in UGX.">
                <NumberInput
                  className="num"
                  value={fxRate}
                  onChange={setFxRate}
                />
              </Field>
              <Field label="Tax rate %" required hint="Applied to the matched subtotal.">
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
              <span className="mb-2 block text-[12px] font-medium text-ink-soft">Match GRNs</span>
              {supplierId == null ? (
                <p className="rounded-lg border border-line bg-bg px-3 py-3 text-[12.5px] text-ink-faint">
                  Pick a supplier to see its uninvoiced goods receipts.
                </p>
              ) : supplierGrns.length === 0 ? (
                <p className="rounded-lg border border-line bg-bg px-3 py-3 text-[12.5px] text-ink-faint">
                  No open GRNs for this supplier. Storekeeper must post a GRN first.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-line">
                  {supplierGrns.map((g) => (
                    <label
                      key={g.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-0 hover:bg-bg"
                    >
                      <Checkbox checked={selected.has(g.id)} onChange={() => toggle(g.id)} />
                      <span className="num text-[12.5px] font-medium">{g.grnNo}</span>
                      <span className="text-[12px] text-ink-soft">{fmtDate(g.receivedDate)}</span>
                      <span className="num ml-auto text-[12.5px]">{fmtMoney(g.value)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="h-fit rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-4">
          <h2 className="text-[14px] font-semibold">Invoice totals</h2>
          <div className="mt-4 space-y-2 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-ink-soft">GRNs selected</span>
              <span className="num">{selected.size}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-soft">Subtotal (invoice ccy)</span>
              <span className="num">{fmtMoney(currency ? subtotal / (fxRate || 1) : subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-soft">Subtotal (base)</span>
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
          <Button className="mt-4 w-full" onClick={submit} disabled={busy || !valid}>
            {busy ? "Posting…" : "Post invoice"}
          </Button>
          <p className="mt-2 text-[11.5px] text-ink-faint">
            Stock has already been posted by the GRNs. Posting the invoice just records the supplier bill.
          </p>
          <Button
            variant="secondary"
            className="mt-2 w-full"
            onClick={() => router.push("/purchases")}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
