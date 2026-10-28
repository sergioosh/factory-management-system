"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Add, Trash } from "iconsax-reactjs";
import { fmtMoney, today } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, NumberInput, Field, Textarea } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchSelect, type Option } from "@/components/ui/search-select";
import { FormShell, FormCard, FormActions } from "@/components/ui/form-page";
import { createGrn } from "./actions";

type SupplierOpt = { id: number; name: string; code: string | null };
type MaterialOpt = { id: number; code: string; name: string; unit: string; price: number };
type FromPr = { id: number; prNo: string; lines: { materialId: number; qty: number }[] };
type Line = { materialId: number | null; qty: number; rate: number; batch: string };

const newLine = (): Line => ({ materialId: null, qty: 0, rate: 0, batch: "" });

export function GrnFormClient({
  suppliers,
  materials,
  fromPr,
}: {
  suppliers: SupplierOpt[];
  materials: MaterialOpt[];
  fromPr: FromPr | null;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [receivedDate, setReceivedDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>(() =>
    fromPr && fromPr.lines.length
      ? fromPr.lines.map((l) => ({
          materialId: l.materialId,
          qty: l.qty,
          rate: materials.find((m) => m.id === l.materialId)?.price ?? 0,
          batch: "",
        }))
      : [newLine()],
  );
  const [busy, startTransition] = useTransition();

  const supplierOptions: Option[] = useMemo(
    () => suppliers.map((sp) => ({ value: sp.id, label: sp.code ? `${sp.code} — ${sp.name}` : sp.name })),
    [suppliers],
  );
  const materialOptions: Option[] = useMemo(
    () => materials.map((m) => ({ value: m.id, label: m.name, hint: `${m.code} · ${m.unit}` })),
    [materials],
  );

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  const total = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const valid = supplierId != null && lines.some((l) => l.materialId != null && l.qty > 0);

  function submit() {
    startTransition(async () => {
      const res = await createGrn({
        supplierId: supplierId!,
        prId: fromPr?.id,
        receivedDate,
        notes: notes.trim() || undefined,
        lines: lines
          .filter((l) => l.materialId != null && l.qty > 0)
          .map((l) => ({ materialId: l.materialId!, qty: l.qty, rate: l.rate, batch: l.batch.trim() || undefined })),
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Goods received");
      router.push("/grn");
    });
  }

  return (
    <FormShell backHref="/grn" maxWidth="max-w-4xl">
      <FormCard
        title="Goods Received Note"
        subtitle={
          fromPr
            ? `From ${fromPr.prNo} · stock IN posts immediately at the unit cost entered here.`
            : "Stock IN posts the moment this GRN is saved, at the unit cost entered here."
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Supplier" required>
            <SearchSelect
              options={supplierOptions}
              value={supplierId}
              onChange={(v) => setSupplierId(Number(v))}
              placeholder="— pick supplier —"
            />
          </Field>
          <Field label="Received at" required>
            <DatePicker value={receivedDate} onChange={setReceivedDate} />
          </Field>
        </div>

        <div>
          <span className="mb-2 block text-[12px] font-medium text-ink-soft">Lines</span>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
                  <th className="px-3 py-2 text-left">Material</th>
                  <th className="px-2 py-2 text-right">Qty received</th>
                  <th className="px-2 py-2 text-right">Unit cost</th>
                  <th className="px-2 py-2 text-right">Line value</th>
                  <th className="px-3 py-2 text-left">Batch</th>
                  <th className="w-9" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-3 py-1.5">
                      <SearchSelect
                        options={materialOptions}
                        value={l.materialId}
                        onChange={(v) =>
                          setLine(i, {
                            materialId: Number(v),
                            rate: l.rate || (materials.find((m) => m.id === Number(v))?.price ?? 0),
                          })
                        }
                        placeholder="— pick material —"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <NumberInput
                        placeholder="Qty"
                        className="num w-24 text-right"
                        value={l.qty}
                        onChange={(n) => setLine(i, { qty: n })}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <NumberInput
                        placeholder="Cost"
                        className="num w-28 text-right"
                        value={l.rate}
                        onChange={(n) => setLine(i, { rate: n })}
                      />
                    </td>
                    <td className="num px-2 py-1.5 text-right font-medium">{fmtMoney(l.qty * l.rate)}</td>
                    <td className="px-3 py-1.5">
                      <Input
                        placeholder="opt."
                        className="w-24"
                        value={l.batch}
                        onChange={(e) => setLine(i, { batch: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                        className="rounded-md p-1 text-ink-faint hover:text-danger cursor-pointer disabled:opacity-40"
                        disabled={lines.length === 1}
                      >
                        <Trash size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line">
                  <td colSpan={3} className="px-3 py-2 text-right text-[12px] font-medium text-ink-soft">
                    Total
                  </td>
                  <td className="num px-2 py-2 text-right font-semibold">{fmtMoney(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => setLines((ls) => [...ls, newLine()])}
          >
            <Add size={14} /> Add line
          </Button>
        </div>

        <Field label="Notes" hint="Optional.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </FormCard>

      <FormActions>
        <Button variant="secondary" onClick={() => router.push("/grn")} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy || !valid}>
          {busy ? "Posting…" : "Post GRN"}
        </Button>
      </FormActions>
    </FormShell>
  );
}
