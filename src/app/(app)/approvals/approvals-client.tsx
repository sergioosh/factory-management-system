"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { TickCircle } from "iconsax-reactjs";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/confirm";
import { decidePurchaseRequest } from "../purchase-requests/actions";
import { decideCount } from "../counts/actions";

type Pr = {
  id: number;
  prNo: string;
  createdAt: Date;
  notes: string | null;
  orderNo: string | null;
  requestedBy: string | null;
  lines: number;
};
type Count = {
  id: number;
  countNo: string;
  countDate: string;
  scope: string;
  createdBy: string | null;
  variances: number;
};

type Pending = { title: string; body: string; label: string; danger?: boolean; fn: () => Promise<{ ok: boolean; error?: string }> };

export function ApprovalsClient({
  prs,
  counts,
}: {
  prs: Pr[];
  counts: Count[];
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, startTransition] = useTransition();

  const total = prs.length + counts.length;

  function decide(p: Pending) {
    setPending(p);
  }

  function confirm() {
    if (!pending) return;
    startTransition(async () => {
      const res = await pending.fn();
      if (!res.ok) return void toast.error(res.error ?? "Failed");
      toast.success("Done");
      setPending(null);
    });
  }

  function Section<T>({
    title,
    href,
    rows,
    render,
  }: {
    title: string;
    href: string;
    rows: T[];
    render: (row: T) => React.ReactNode;
  }) {
    if (rows.length === 0) return null;
    return (
      <section className="rounded-xl border border-line bg-surface">
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">{title}</h2>
          <Link href={href} className="text-[12px] text-accent hover:underline">
            Open list
          </Link>
        </header>
        <div className="divide-y divide-(--color-line)">{rows.map(render)}</div>
      </section>
    );
  }

  return (
    <>
      <PageHeader title="Approvals" sub={total === 0 ? "Queue is clear" : `${total} waiting`} />

      {total === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface py-14 text-ink-faint">
          <TickCircle size={28} variant="Bold" className="text-ok" />
          <span className="text-[13px]">Nothing waiting for approval</span>
        </div>
      )}

      <div className="space-y-4">
        <Section
          title="Purchase requests"
          href="/purchase-requests"
          rows={prs}
          render={(pr) => (
            <div key={pr.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <span className="num text-[12.5px]">{pr.prNo}</span>
                <span className="ml-2 text-[12.5px] text-ink-soft">
                  {pr.lines} materials
                  {pr.orderNo && <> · for {pr.orderNo}</>}
                  {pr.requestedBy && <> · {pr.requestedBy}</>}
                  <span className="text-ink-faint"> · {fmtDate(pr.createdAt)}</span>
                </span>
                {pr.notes && <div className="truncate text-[12px] text-ink-faint">{pr.notes}</div>}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  onClick={() =>
                    decide({
                      title: `Approve ${pr.prNo}?`,
                      body: "The request can then be turned into a purchase order.",
                      label: "Approve",
                      fn: () => decidePurchaseRequest({ id: pr.id, decision: "approved" }),
                    })
                  }
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    decide({
                      title: `Reject ${pr.prNo}?`,
                      body: "The request is closed without ordering.",
                      label: "Reject",
                      danger: true,
                      fn: () => decidePurchaseRequest({ id: pr.id, decision: "rejected" }),
                    })
                  }
                >
                  Reject
                </Button>
              </div>
            </div>
          )}
        />

        <Section
          title="Stock counts"
          href="/counts"
          rows={counts}
          render={(c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <Link href={`/counts/${c.id}`} className="num text-[12.5px] text-accent hover:underline">
                  {c.countNo}
                </Link>
                <span className="ml-2 text-[12.5px] text-ink-soft">
                  {c.scope.toUpperCase()} · {c.variances} variances
                  {c.createdBy && <> · {c.createdBy}</>}
                  <span className="text-ink-faint"> · {fmtDate(c.countDate)}</span>
                </span>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  onClick={() =>
                    decide({
                      title: `Approve ${c.countNo}?`,
                      body: `Posts ${c.variances} variance corrections to stock.`,
                      label: "Approve",
                      fn: () => decideCount({ id: c.id, approve: true }),
                    })
                  }
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    decide({
                      title: `Reject ${c.countNo}?`,
                      body: "The count is discarded. No stock moves.",
                      label: "Reject",
                      danger: true,
                      fn: () => decideCount({ id: c.id, approve: false }),
                    })
                  }
                >
                  Reject
                </Button>
              </div>
            </div>
          )}
        />
      </div>

      {pending && (
        <ConfirmDialog
          open={!!pending}
          onOpenChange={(o) => !o && setPending(null)}
          title={pending.title}
          body={pending.body}
          confirmLabel={pending.label}
          danger={pending.danger}
          busy={busy}
          onConfirm={confirm}
        />
      )}
    </>
  );
}
