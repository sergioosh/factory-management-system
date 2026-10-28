"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { today } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, Field, Select, Textarea } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Modal } from "@/components/ui/modal";
import { createCount } from "./actions";

export function CountFormClient({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ countDate: today(), scope: "rm", notes: "" });
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    if (open) setForm({ countDate: today(), scope: "rm", notes: "" });
  }, [open]);

  function submit() {
    startTransition(async () => {
      const res = await createCount({
        countDate: form.countDate,
        scope: form.scope as "rm" | "fg" | "all",
        notes: form.notes || undefined,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Count created");
      onOpenChange(false);
      router.push(`/counts/${res.data}`);
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Open a stock count"
      description="Snapshots the current system balance for every active item in scope. You can then enter physical counts and close."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.countDate}>
            {busy ? "Opening…" : "Open count"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" required>
            <DatePicker
              value={form.countDate}
              onChange={(v) => setForm({ ...form, countDate: v })}
            />
          </Field>
          <Field label="Scope" required hint="Which items to count: raw materials, finished goods, or both.">
            <Select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
              <option value="rm">Raw materials</option>
              <option value="fg">Finished goods</option>
              <option value="all">All</option>
            </Select>
          </Field>
        </div>
        <Field label="Notes" hint="Optional.">
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
