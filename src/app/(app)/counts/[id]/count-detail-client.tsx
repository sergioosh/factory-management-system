"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft2 } from "iconsax-reactjs";
import { cn } from "@/lib/cn";
import { fmtDate, fmtQty } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/confirm";
import { saveCountItems, submitCount, decideCount } from "./../actions";

type Count = {
  id: number;
  countNo: string;
  countDate: string;
  scope: string;
  status: string;
  notes: string | null;
  createdBy: string | null;
};

type Item = {
  id: number;
  itemType: string;
  systemQty: number;
  countedQty: number | null;
  itemCode: string;
  itemName: string;
  unit: string;
};

export function CountDetailClient({
  count,
  items,
  canEdit,
  canApprove,
}: {
  count: Count;
  items: Item[];
  canEdit: boolean;
  canApprove: boolean;
}) {
  const [vals, setVals] = useState<Record<number, string>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.countedQty == null ? "" : String(i.countedQty)])),
  );
  const [confirm, setConfirm] = useState<"approve" | "reject" | null>(null);
  const [busy, startTransition] = useTransition();

  const editable = count.status === "draft" && canEdit;
  const allEntered = items.every((i) => vals[i.id] !== "" && !Number.isNaN(Number(vals[i.id])));

  function payload() {
    return items.map((i) => ({
      id: i.id,
      countedQty: vals[i.id] === "" ? null : Number(vals[i.id]),
    }));
  }

  function save() {
    startTransition(async () => {
      const res = await saveCountItems({ countId: count.id, items: payload() });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Count saved");
    });
  }

  function submit() {
    startTransition(async () => {
      const saved = await saveCountItems({ countId: count.id, items: payload() });
      if (!saved.ok) return void toast.error(saved.error);
      const res = await submitCount(count.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Count submitted");
    });
  }

  function decide(approve: boolean) {
    startTransition(async () => {
      const res = await decideCount({ id: count.id, approve });
      if (!res.ok) return void toast.error(res.error);
      toast.success(approve ? "Count approved" : "Count rejected");
      setConfirm(null);
    });
  }

  function variance(i: Item): number | null {
    const v = vals[i.id];
    if (v === "" || Number.isNaN(Number(v))) return null;
    return Number(v) - i.systemQty;
  }

  return (
    <>
      <div className="mb-2">
        <Link
          href="/counts"
          className="inline-flex items-center gap-1 text-[12.5px] text-ink-soft hover:text-ink"
        >
          <ArrowLeft2 size={13} /> Counts
        </Link>
      </div>
      <PageHeader
        title={count.countNo}
        sub={
          <span className="flex items-center gap-2">
            {fmtDate(count.countDate)} · {count.scope.toUpperCase()} · {count.createdBy ?? "—"}
            <StatusBadge status={count.status} />
          </span>
        }
        actions={
          <>
            {editable && (
              <>
                <Button variant="secondary" disabled={busy} onClick={save}>
                  {busy ? "Saving…" : "Save"}
                </Button>
                <Button disabled={busy || !allEntered} onClick={submit}>
                  Submit
                </Button>
              </>
            )}
            {count.status === "submitted" && canApprove && (
              <>
                <Button variant="danger" disabled={busy} onClick={() => setConfirm("reject")}>
                  Reject
                </Button>
                <Button disabled={busy} onClick={() => setConfirm("approve")}>
                  Approve
                </Button>
              </>
            )}
          </>
        }
      />
      {count.notes && <p className="mb-3 text-[12.5px] text-ink-soft">{count.notes}</p>}
      <div className="rounded-xl border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line">
                {["Code", "Item", "Type", "Unit", "System", "Counted", "Variance"].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "whitespace-nowrap px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint",
                      i >= 4 && "text-right",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-[13px] text-ink-faint">
                    No items in scope
                  </td>
                </tr>
              )}
              {items.map((i) => {
                const v = variance(i);
                return (
                  <tr key={i.id} className="border-b border-line last:border-0">
                    <td className="num w-20 px-3 py-2">{i.itemCode}</td>
                    <td className="px-3 py-2">{i.itemName}</td>
                    <td className="w-14 px-3 py-2">
                      <Badge tone={i.itemType === "rm" ? "info" : "accent"}>
                        {i.itemType.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="w-16 px-3 py-2 text-ink-soft">{i.unit}</td>
                    <td className="num px-3 py-2 text-right">{fmtQty(i.systemQty)}</td>
                    <td className="w-28 px-3 py-1.5 text-right">
                      {editable ? (
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={vals[i.id]}
                          onChange={(e) => setVals({ ...vals, [i.id]: e.target.value })}
                          className="num h-7.5 w-24 rounded-lg border border-line-strong bg-surface px-2 text-right text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                        />
                      ) : (
                        <span className="num">{fmtQty(i.countedQty)}</span>
                      )}
                    </td>
                    <td
                      className={cn(
                        "num px-3 py-2 text-right",
                        v == null ? "text-ink-faint" : v === 0 ? "text-ok" : "font-semibold text-danger",
                      )}
                    >
                      {v == null ? "—" : `${v > 0 ? "+" : ""}${fmtQty(v)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmDialog
        open={confirm != null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "approve" ? `Approve ${count.countNo}?` : `Reject ${count.countNo}?`}
        body={
          confirm === "approve"
            ? "Stock will be adjusted to the counted quantities."
            : "The count will be closed without moving stock."
        }
        confirmLabel={confirm === "approve" ? "Approve" : "Reject"}
        danger={confirm === "reject"}
        busy={busy}
        onConfirm={() => decide(confirm === "approve")}
      />
    </>
  );
}
