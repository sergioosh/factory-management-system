"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Add, ArrowLeft2, Trash } from "iconsax-reactjs";
import { fmtDate, fmtDateTime, today } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, NumberInput, Field } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchSelect, type Option } from "@/components/ui/search-select";
import { saveBomVersion } from "../actions";

type Line = { materialId: number | null; qtyPerUnit: number; scrapPct: number };
type Version = {
  version: number;
  effectiveDate: string;
  materials: number;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
};

export function BomEditorClient({
  product,
  materialOptions,
  initialLines,
  versions,
}: {
  product: { id: number; code: string; name: string; unit: string };
  materialOptions: Option[];
  initialLines: Line[];
  versions: Version[];
}) {
  const router = useRouter();
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>(
    initialLines.length ? initialLines : [{ materialId: null, qtyPerUnit: 0, scrapPct: 0 }],
  );
  const [busy, startTransition] = useTransition();

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const linesValid = lines.every((l) => l.materialId != null && l.qtyPerUnit > 0);

  function submit() {
    if (!linesValid) return void toast.error("Every line needs a material and a quantity above 0");
    startTransition(async () => {
      const res = await saveBomVersion({
        productId: product.id,
        effectiveDate,
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({ materialId: l.materialId!, qtyPerUnit: l.qtyPerUnit, scrapPct: l.scrapPct })),
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Saved BOM v${res.data}`);
      router.push("/bom");
    });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/bom"
        className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-ink-soft hover:text-ink"
      >
        <ArrowLeft2 size={14} /> Back to BOMs
      </Link>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surface p-6">
            <h1 className="text-[16px] font-semibold">{product.name}</h1>
            <p className="num mt-0.5 text-[12px] text-ink-faint">
              {product.code} · per 1 {product.unit}
            </p>
          </div>

          <div className="rounded-xl border border-line bg-surface p-6">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Effective from" required hint="When this recipe version takes effect.">
                <DatePicker value={effectiveDate} onChange={setEffectiveDate} />
              </Field>
              <Field label="Notes" hint="Optional — e.g. revised after Q1 trial.">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-medium text-ink-soft">Recipe lines</span>
                <span className="text-[11.5px] text-ink-faint">
                  Quantities are per 1 {product.unit} of finished product.
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-line text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
                      <th className="px-3 py-2 text-left">Material</th>
                      <th className="px-2 py-2 text-right">Std qty / unit</th>
                      <th className="px-3 py-2 text-right">Scrap %</th>
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
                            onChange={(v) => setLine(i, { materialId: Number(v) })}
                            placeholder="Pick material"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <NumberInput
                            placeholder="Qty"
                            className="num w-28 text-right"
                            value={l.qtyPerUnit}
                            onChange={(n) => setLine(i, { qtyPerUnit: n })}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <NumberInput
                            className="num w-24 text-right"
                            value={l.scrapPct}
                            onChange={(n) => setLine(i, { scrapPct: n })}
                          />
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
                onClick={() => setLines((ls) => [...ls, { materialId: null, qtyPerUnit: 0, scrapPct: 0 }])}
              >
                <Add size={14} /> Add line
              </Button>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => router.push("/bom")} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy || !linesValid}>
                {busy ? "Saving…" : "Save as new version"}
              </Button>
            </div>
          </div>
        </div>

        <div className="h-fit rounded-xl border border-line bg-surface p-5">
          <h2 className="text-[14px] font-semibold">Version history</h2>
          {versions.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-ink-faint">No versions yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {versions.map((v) => (
                <div key={v.version} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="num text-[13px] font-semibold">v{v.version}</span>
                    <span className="text-[11.5px] text-ink-soft">{fmtDate(v.effectiveDate)}</span>
                  </div>
                  <div className="text-[11.5px] text-ink-faint">
                    {v.materials} material{v.materials === 1 ? "" : "s"} · {v.createdBy ?? "—"}
                  </div>
                  {v.notes && <div className="mt-0.5 text-[11.5px] text-ink-soft">{v.notes}</div>}
                  <div className="mt-0.5 text-[10.5px] text-ink-faint">{fmtDateTime(v.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
