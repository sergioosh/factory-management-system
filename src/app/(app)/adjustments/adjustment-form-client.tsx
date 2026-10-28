"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Input, Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchSelect, type Option } from "@/components/ui/search-select";
import { Modal } from "@/components/ui/modal";
import { createAdjustment } from "./actions";

type MasterItem = { id: number; code: string; name: string; unit: string };

export function AdjustmentFormClient({
  open,
  onOpenChange,
  onSaved,
  rms,
  fgs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  rms: MasterItem[];
  fgs: MasterItem[];
}) {
  const [itemType, setItemType] = useState<"rm" | "fg">("rm");
  const [itemId, setItemId] = useState<number | null>(null);
  const [qtyDelta, setQtyDelta] = useState("");
  const [reason, setReason] = useState("");
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setItemType("rm");
    setItemId(null);
    setQtyDelta("");
    setReason("");
  }, [open]);

  const rmOptions: Option[] = rms.map((m) => ({ value: m.id, label: `${m.code} ${m.name}`, hint: m.unit }));
  const fgOptions: Option[] = fgs.map((p) => ({ value: p.id, label: `${p.code} ${p.name}`, hint: p.unit }));

  const qtyNum = Number(qtyDelta);
  const valid = itemId != null && qtyDelta.trim() !== "" && qtyNum !== 0 && reason.trim() !== "";

  function submit() {
    if (!valid) return;
    startTransition(async () => {
      const res = await createAdjustment({ itemType, itemId: itemId!, qtyDelta: qtyNum, reason: reason.trim() });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${res.data.adjNo} posted — stock updated`);
      onSaved();
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Stock adjustment"
      description="Correct stock for damage, loss, or a physical-count discrepancy. Posts immediately."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !valid}>
            {busy ? "Posting…" : "Post adjustment"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Item type" required>
            <Select
              value={itemType}
              onChange={(e) => {
                setItemType(e.target.value as "rm" | "fg");
                setItemId(null);
              }}
            >
              <option value="rm">Raw material</option>
              <option value="fg">Finished good</option>
            </Select>
          </Field>
          <Field label="Item" required>
            <SearchSelect
              options={itemType === "rm" ? rmOptions : fgOptions}
              value={itemId}
              onChange={(v) => setItemId(Number(v))}
              placeholder="— pick item —"
            />
          </Field>
        </div>

        <Field
          label="Qty change (signed)"
          required
          hint="Positive = gain, negative = shrinkage. E.g. -2.5 for spillage."
        >
          <Input
            type="number"
            className="num"
            value={qtyDelta}
            onChange={(e) => setQtyDelta(e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Reason" required hint="Recorded on the movement for the audit trail.">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Spillage during transfer / spoilage / counted overage"
          />
        </Field>
      </div>
    </Modal>
  );
}
