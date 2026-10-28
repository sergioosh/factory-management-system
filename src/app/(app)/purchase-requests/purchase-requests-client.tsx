"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Add } from "iconsax-reactjs";
import { fmtDate, fmtMoney, fmtQty } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm";
import { decidePurchaseRequest } from "./actions";

type PrRow = {
  id: number;
  prNo: string;
  status: string;
  notes: string | null;
  decisionNote: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  orderNo: string | null;
  customerName: string | null;
  requestedBy: string | null;
  decidedBy: string | null;
};

type PrItem = {
  prId: number;
  materialCode: string;
  materialName: string;
  unit: string;
  qty: number;
  price: number;
  note: string | null;
};

export function PurchaseRequestsClient({
  rows,
  items,
  canCreate,
  canApprove,
}: {
  rows: PrRow[];
  items: PrItem[];
  canCreate: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<PrRow | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [confirm, setConfirm] = useState<"approved" | "rejected" | null>(null);
  const [busy, startTransition] = useTransition();

  const filterDefs: FilterDef<PrRow>[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "pending", label: "Pending" },
        { value: "approved", label: "Approved" },
        { value: "rejected", label: "Rejected" },
        { value: "ordered", label: "Ordered" },
      ],
      getValue: (r) => r.status,
    },
  ];

  const lineCounts = useMemo(() => {
    const m: Record<number, number> = {};
    for (const it of items) m[it.prId] = (m[it.prId] ?? 0) + 1;
    return m;
  }, [items]);

  const estValues = useMemo(() => {
    const m: Record<number, number> = {};
    for (const it of items) m[it.prId] = (m[it.prId] ?? 0) + it.qty * it.price;
    return m;
  }, [items]);

  function decide(decision: "approved" | "rejected") {
    if (!detail) return;
    startTransition(async () => {
      const res = await decidePurchaseRequest({
        id: detail.id,
        decision,
        note: decisionNote.trim() || undefined,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(decision === "approved" ? "Request approved" : "Request rejected");
      setConfirm(null);
      setDetail(null);
    });
  }

  const columns: Column<PrRow>[] = [
    { key: "prNo", label: "PR #", className: "num w-24", sortValue: (r) => r.prNo },
    { key: "orderNo", label: "Order", className: "num", render: (r) => r.orderNo ?? "—" },
    { key: "customerName", label: "Customer", render: (r) => r.customerName ?? "—" },
    {
      key: "items",
      label: "Items",
      numeric: true,
      sortValue: (r) => lineCounts[r.id] ?? 0,
      render: (r) => lineCounts[r.id] ?? 0,
    },
    {
      key: "estValue",
      label: "Est. value (UGX)",
      numeric: true,
      sortValue: (r) => estValues[r.id] ?? 0,
      render: (r) => fmtMoney(estValues[r.id] ?? 0),
    },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "createdAt",
      label: "Created",
      className: "text-ink-soft",
      sortValue: (r) => new Date(r.createdAt).getTime(),
      render: (r) => fmtDate(r.createdAt),
    },
    {
      key: "actions",
      label: "Actions",
      className: "w-28 text-right",
      noExport: true,
      render: (r) => (
        <span className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
          {r.status === "approved" && canCreate && (
            <Link
              href={`/grn/new?fromPr=${r.id}`}
              className="text-[12.5px] text-accent hover:underline"
            >
              Receive
            </Link>
          )}
          <button
            onClick={() => {
              setDecisionNote("");
              setDetail(r);
            }}
            className="text-[12.5px] text-ink-soft hover:text-ink cursor-pointer"
          >
            Open
          </button>
        </span>
      ),
    },
  ];

  const detailItems = detail ? items.filter((it) => it.prId === detail.id) : [];

  return (
    <>
      <PageHeader
        title="Purchase Requests"
        sub={
          <>
            Generated from order MRP shortfalls. Each request is a frozen procurement list.{" "}
            <span className="text-ink-faint">
              · {rows.filter((r) => r.status === "pending").length} pending
            </span>
          </>
        }
        actions={
          canCreate && (
            <Link href="/purchase-requests/new">
              <Button>
                <Add size={16} /> New request
              </Button>
            </Link>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchKeys={["prNo", "orderNo", "customerName", "requestedBy"]}
        searchPlaceholder="Search requests"
        onRowClick={(r) => {
          setDecisionNote("");
          setDetail(r);
        }}
        empty="No purchase requests yet"
        exportName="purchase-requests"
        exportTitle="Purchase Requests"
        filters={filterDefs}
      />

      <Sheet
        open={detail != null}
        onOpenChange={(o) => !o && setDetail(null)}
        title={detail?.prNo ?? ""}
        description={detail ? `${fmtDate(detail.createdAt)} · ${detail.requestedBy ?? "—"}` : undefined}
        footer={
          detail?.status === "pending" && canApprove ? (
            <>
              <Button variant="danger" disabled={busy} onClick={() => setConfirm("rejected")}>
                Reject
              </Button>
              <Button disabled={busy} onClick={() => setConfirm("approved")}>
                Approve
              </Button>
            </>
          ) : detail?.status === "approved" && canCreate ? (
            <Button onClick={() => router.push(`/grn/new?fromPr=${detail.id}`)}>Receive</Button>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <StatusBadge status={detail.status} />
              {detail.orderNo && <span className="num text-[12px] text-ink-soft">{detail.orderNo}</span>}
            </div>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
                  <th className="py-1.5 pr-2">Material</th>
                  <th className="py-1.5 pr-2 text-right">Qty</th>
                  <th className="py-1.5">Note</th>
                </tr>
              </thead>
              <tbody>
                {detailItems.map((it, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="py-1.5 pr-2">
                      {it.materialName}{" "}
                      <span className="num text-[11px] text-ink-faint">{it.materialCode}</span>
                    </td>
                    <td className="num py-1.5 pr-2 text-right">
                      {fmtQty(it.qty)} {it.unit}
                    </td>
                    <td className="py-1.5 text-ink-soft">{it.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.notes && <p className="text-[12.5px] text-ink-soft">{detail.notes}</p>}
            {detail.status !== "pending" && (
              <p className="text-[12px] text-ink-faint">
                {detail.status} by {detail.decidedBy ?? "—"} · {fmtDate(detail.decidedAt)}
                {detail.decisionNote ? ` · ${detail.decisionNote}` : ""}
              </p>
            )}
            {detail.status === "pending" && canApprove && (
              <Field label="Decision note (optional)">
                <Input
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder="Reason if rejecting"
                />
              </Field>
            )}
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={confirm === "approved"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Approve ${detail?.prNo}?`}
        body="The request becomes available for purchase orders."
        confirmLabel="Approve"
        busy={busy}
        onConfirm={() => decide("approved")}
      />
      <ConfirmDialog
        open={confirm === "rejected"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Reject ${detail?.prNo}?`}
        body={decisionNote.trim() ? `Note: ${decisionNote.trim()}` : "No decision note given."}
        confirmLabel="Reject"
        danger
        busy={busy}
        onConfirm={() => decide("rejected")}
      />
    </>
  );
}
