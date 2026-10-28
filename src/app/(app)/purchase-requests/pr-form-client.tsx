"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Add, Trash } from "iconsax-reactjs";
import { fmtQty } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, NumberInput, Field, Textarea } from "@/components/ui/input";
import { SearchSelect, type Option } from "@/components/ui/search-select";
import { FormShell, FormCard, FormActions } from "@/components/ui/form-page";
import { createPurchaseRequest } from "./actions";

type MaterialOpt = { id: number; code: string; name: string; unit: string; currentStock: number };
type LineForm = { materialId: number | null; qty: number; note: string };

const newLine = (): LineForm => ({ materialId: null, qty: 0, note: "" });

export function PrFormClient({ materials }: { materials: MaterialOpt[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([newLine()]);
  const [busy, startTransition] = useTransition();

  const materialOptions: Option[] = materials.map((m) => ({
    value: m.id,
    label: m.name,
    hint: `${m.code} · ${fmtQty(m.currentStock)} ${m.unit}`,
  }));

  function updLine(i: number, patch: Partial<LineForm>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  const linesValid = lines.length > 0 && lines.every((l) => l.materialId != null && l.qty > 0);

  function submit() {
    startTransition(async () => {
      const res = await createPurchaseRequest({
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({
          materialId: l.materialId!,
          qty: l.qty,
          note: l.note.trim() || undefined,
        })),
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Request created");
      router.push("/purchase-requests");
    });
  }

  return (
    <FormShell backHref="/purchase-requests">
      <FormCard title="New purchase request" subtitle="What the factory is short of and needs to buy.">
        <div>
          <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">
            Lines<span className="text-danger"> *</span>
          </span>
          <p className="-mt-1 mb-2 text-[11.5px] text-ink-faint">
            Material, quantity needed, and an optional note (e.g. reason or preferred supplier).
          </p>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1">
                  <SearchSelect
                    options={materialOptions}
                    value={l.materialId}
                    onChange={(v) => updLine(i, { materialId: Number(v) })}
                    placeholder="Material"
                  />
                </div>
                <NumberInput
                  min={0}
                  placeholder="Qty"
                  className="num w-24 text-right"
                  value={l.qty}
                  onChange={(n) => updLine(i, { qty: n })}
                />
                <Input
                  placeholder="Note"
                  className="w-36"
                  value={l.note}
                  onChange={(e) => updLine(i, { note: e.target.value })}
                />
                <button
                  type="button"
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                  className="rounded-md p-1.5 text-ink-faint hover:text-danger disabled:opacity-40 cursor-pointer"
                >
                  <Trash size={15} />
                </button>
              </div>
            ))}
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
        <Field label="Notes" hint="Optional — context for whoever approves this request.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </FormCard>

      <FormActions>
        <Button variant="secondary" onClick={() => router.push("/purchase-requests")} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy || !linesValid}>
          {busy ? "Saving…" : "Create request"}
        </Button>
      </FormActions>
    </FormShell>
  );
}
