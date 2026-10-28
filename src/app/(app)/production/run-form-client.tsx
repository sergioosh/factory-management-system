"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft2, InfoCircle } from "iconsax-reactjs";
import Link from "next/link";
import { fmtQty, today } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input, NumberInput, Field, Textarea } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchSelect } from "@/components/ui/search-select";
import { createRun } from "./actions";

export type ProductOpt = { id: number; code: string; name: string };
export type Material = { id: number; code: string; name: string; unit: string; currentStock: number };
export type BomLine = { productId: number; materialId: number; qtyPerUnit: number };
export type SalesOrderOpt = { id: number; orderNo: string };

export function RunFormClient({
  products,
  materials,
  bom,
  salesOrders = [],
}: {
  products: ProductOpt[];
  materials: Material[];
  bom: BomLine[];
  salesOrders?: SalesOrderOpt[];
}) {
  const router = useRouter();

  // ── form state ──────────────────────────────────────────────────────────────
  const [salesOrderId, setSalesOrderId] = useState<number | null>(null);
  const [productId, setProductId] = useState<number | null>(null);
  const [plannedQty, setPlannedQty] = useState(0);
  const [runDate, setRunDate] = useState(today());
  const [machine, setMachine] = useState("");
  const [operator, setOperator] = useState("");
  const [notes, setNotes] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [busy, startTransition] = useTransition();

  // ── derived ─────────────────────────────────────────────────────────────────
  const matById = new Map(materials.map((m) => [m.id, m]));
  const runBom = productId ? bom.filter((b) => b.productId === productId) : [];

  // ── actions ─────────────────────────────────────────────────────────────────
  function submit() {
    if (!productId) return void toast.error("Pick a product");
    if (plannedQty <= 0) return void toast.error("Enter planned qty");
    startTransition(async () => {
      const res = await createRun({
        productId,
        salesOrderId: salesOrderId ?? undefined,
        plannedQty,
        runDate,
        machine: machine.trim() || undefined,
        operator: operator.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Production run created");
      router.push("/production");
    });
  }

  // ── sales order options ──────────────────────────────────────────────────────
  const soOptions = salesOrders.map((o) => ({ value: o.id, label: o.orderNo }));

  return (
    <div className="w-full">
      {/* ── breadcrumb ───────────────────────────────────────────────────────── */}
      <Link
        href="/production"
        className="mb-5 inline-flex items-center gap-1 text-[12.5px] text-ink-soft hover:text-ink"
      >
        <ArrowLeft2 size={14} /> Back to production
      </Link>

      {/* ── main card ────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-line bg-surface p-7 space-y-5">
        <h1 className="text-[19px] font-semibold">Production run</h1>

        {/* ── sales order line (optional) ──────────────────────────────────── */}
        <div className="rounded-lg border border-line bg-bg p-4 space-y-2">
          <p className="text-[13.5px] font-medium text-ink">
            For sales order line <span className="font-normal text-ink-faint">(optional)</span>
          </p>

          {/* dropdown — "not tied to an order" is value null */}
          <SearchSelect
            options={[
              { value: -1, label: "— not tied to an order (make to stock) —" },
              ...soOptions,
            ]}
            value={salesOrderId ?? -1}
            onChange={(v) => {
              const n = Number(v);
              setSalesOrderId(n === -1 ? null : n);
            }}
            placeholder="— not tied to an order (make to stock) —"
          />

          <div className="space-y-0.5">
            <p className="text-[12px] text-ink-faint">
              Pick an open order line to make this run fulfil it. Leaving empty produces to stock.
            </p>
            {salesOrders.length === 0 && (
              <p className="text-[12px] text-ink-faint italic flex items-center gap-1">
                <InfoCircle size={12} />
                No eligible order lines right now (orders must be Confirmed–In Production with qty still to produce).
              </p>
            )}
          </div>
        </div>

        {/* ── product / qty / date ─────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-5">
          <Field label="Product" required>
            <SearchSelect
              options={products.map((p) => ({ value: p.id, label: p.name, hint: p.code }))}
              value={productId}
              onChange={(v) => {
                setProductId(v as number);
                setShowPreview(false);
              }}
              placeholder="— no products with active BOM —"
            />
          </Field>

          <Field label="Qty to produce" required hint="per 1 CTNS of finished product">
            <NumberInput
              className="num"
              value={plannedQty}
              onChange={setPlannedQty}
            />
          </Field>

          <Field label="Production date" required>
            <DatePicker value={runDate} onChange={setRunDate} />
          </Field>
        </div>

        {/* ── machine / operator ───────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-5">
          <Field label="Machine">
            <Input
              value={machine}
              onChange={(e) => setMachine(e.target.value)}
              placeholder="optional"
            />
          </Field>

          <Field label="Operator">
            <Input
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              placeholder="optional"
            />
          </Field>
        </div>

        {/* ── notes ───────────────────────────────────────────────────────── */}
        <Field label="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            className="min-h-[72px]"
          />
        </Field>

        {/* ── BOM preview ─────────────────────────────────────────────────── */}
        <div className="rounded-lg border border-line">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-[13.5px] font-medium text-ink">Preview BOM consumption</p>
              <p className="text-[12px] text-ink-faint">
                Shows what&apos;s needed vs what&apos;s on hand. Start is disabled if anything is short.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={!productId || plannedQty <= 0}
              onClick={() => setShowPreview((v) => !v)}
            >
              {showPreview ? "Hide" : "Preview"}
            </Button>
          </div>

          {showPreview && (
            <div>
              {runBom.length === 0 ? (
                <p className="px-4 py-3 text-[12.5px] text-warn">No BOM for this product</p>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_100px_100px_90px] gap-2 border-b border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    <span>Material</span>
                    <span className="text-right">Need</span>
                    <span className="text-right">In stock</span>
                    <span className="text-right">Status</span>
                  </div>
                  {runBom.map((b) => {
                    const m = matById.get(b.materialId);
                    const need = b.qtyPerUnit * (plannedQty || 0);
                    const enough = (m?.currentStock ?? 0) >= need;
                    return (
                      <div
                        key={b.materialId}
                        className="grid grid-cols-[1fr_100px_100px_90px] gap-2 border-b border-line px-4 py-1.5 last:border-0 text-[12.5px]"
                      >
                        <span className="truncate">{m?.name}</span>
                        <span className="num text-right text-ink-soft">
                          {fmtQty(need)} {m?.unit}
                        </span>
                        <span className="num text-right text-ink-faint">
                          {fmtQty(m?.currentStock)}
                        </span>
                        <span
                          className={cn(
                            "text-right font-medium",
                            enough ? "text-ok" : "text-danger",
                          )}
                        >
                          {enough ? "OK" : "Short"}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── footer actions ───────────────────────────────────────────────────── */}
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => router.push("/production")}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? "Starting…" : "Start production"}
        </Button>
      </div>
    </div>
  );
}
