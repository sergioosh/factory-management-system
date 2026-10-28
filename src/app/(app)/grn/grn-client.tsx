"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Add } from "iconsax-reactjs";
import { fmtDate, fmtMoney, fmtQty } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";

type GrnRow = {
  id: number;
  grnNo: string;
  receivedDate: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  supplierName: string | null;
  createdBy: string | null;
};

type GrnItem = {
  grnId: number;
  materialCode: string;
  materialName: string;
  unit: string;
  qty: number;
  rate: number;
  lotNo: string | null;
};

export function GrnClient({
  rows,
  items,
  canCreate,
}: {
  rows: GrnRow[];
  items: GrnItem[];
  canCreate: boolean;
}) {
  const [detail, setDetail] = useState<GrnRow | null>(null);

  const agg = useMemo(() => {
    const m: Record<number, { lines: number; qty: number; value: number }> = {};
    for (const it of items) {
      const a = (m[it.grnId] ??= { lines: 0, qty: 0, value: 0 });
      a.lines += 1;
      a.qty += it.qty;
      a.value += it.qty * it.rate;
    }
    return m;
  }, [items]);

  const filterDefs: FilterDef<GrnRow>[] = useMemo(() => {
    const supplierNames = [...new Set(rows.map((r) => r.supplierName).filter(Boolean) as string[])].sort();
    return [
      {
        key: "status",
        label: "Status",
        options: [
          { value: "received", label: "Received" },
          { value: "invoiced", label: "Invoiced" },
        ],
        getValue: (r) => r.status,
      },
      {
        key: "supplierName",
        label: "Supplier",
        options: supplierNames.map((s) => ({ value: s, label: s })),
        getValue: (r) => r.supplierName ?? "",
      },
    ];
  }, [rows]);

  const columns: Column<GrnRow>[] = [
    { key: "grnNo", label: "GRN #", className: "num w-24", sortValue: (r) => r.grnNo },
    {
      key: "receivedDate",
      label: "Received",
      sortValue: (r) => r.receivedDate,
      render: (r) => fmtDate(r.receivedDate),
    },
    { key: "supplierName", label: "Supplier", render: (r) => r.supplierName ?? "—" },
    {
      key: "lines",
      label: "Lines",
      numeric: true,
      sortValue: (r) => agg[r.id]?.lines ?? 0,
      render: (r) => agg[r.id]?.lines ?? 0,
    },
    {
      key: "qty",
      label: "Qty",
      numeric: true,
      sortValue: (r) => agg[r.id]?.qty ?? 0,
      render: (r) => fmtQty(agg[r.id]?.qty ?? 0),
    },
    {
      key: "value",
      label: "Value (UGX)",
      numeric: true,
      sortValue: (r) => agg[r.id]?.value ?? 0,
      render: (r) => fmtMoney(agg[r.id]?.value ?? 0),
    },
    {
      key: "status",
      label: "Status",
      className: "w-24",
      render: (r) =>
        r.status === "invoiced" ? <Badge tone="ok">invoiced</Badge> : <Badge tone="info">received</Badge>,
    },
    {
      key: "actions",
      label: "Actions",
      className: "w-20 text-right",
      noExport: true,
      render: (r) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDetail(r);
          }}
          className="text-[12.5px] text-accent hover:underline cursor-pointer"
        >
          Open
        </button>
      ),
    },
  ];

  const detailItems = detail ? items.filter((it) => it.grnId === detail.id) : [];

  return (
    <>
      <PageHeader
        title="Goods Received Notes"
        actions={
          canCreate && (
            <Link href="/grn/new">
              <Button>
                <Add size={16} /> New GRN
              </Button>
            </Link>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchKeys={["grnNo", "supplierName"]}
        searchPlaceholder="Search code or name"
        onRowClick={setDetail}
        empty="Nothing received yet"
        exportName="goods-received"
        exportTitle="Goods Received"
        filters={filterDefs}
      />
      <p className="mt-2 text-[11.5px] text-ink-faint">
        Storekeeper records receipts here. Stock IN posts the moment a GRN is saved. Use the Purchases
        module to match GRNs to supplier invoices.
      </p>

      <Sheet
        open={detail != null}
        onOpenChange={(o) => !o && setDetail(null)}
        title={detail?.grnNo ?? ""}
        description={
          detail ? `${fmtDate(detail.receivedDate)} · ${detail.supplierName ?? "—"}` : undefined
        }
      >
        {detail && (
          <div className="space-y-4">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
                  <th className="py-1.5 pr-2">Material</th>
                  <th className="py-1.5 pr-2 text-right">Qty</th>
                  <th className="py-1.5 pr-2 text-right">Unit cost</th>
                  <th className="py-1.5 pr-2 text-right">Value</th>
                  <th className="py-1.5">Lot</th>
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
                    <td className="num py-1.5 pr-2 text-right text-ink-soft">{fmtMoney(it.rate)}</td>
                    <td className="num py-1.5 pr-2 text-right font-medium">{fmtMoney(it.qty * it.rate)}</td>
                    <td className="num py-1.5 text-[11.5px] text-ink-soft">{it.lotNo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.notes && <p className="text-[12.5px] text-ink-soft">{detail.notes}</p>}
          </div>
        )}
      </Sheet>
    </>
  );
}
