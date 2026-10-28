"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Add } from "iconsax-reactjs";
import { fmtDate, fmtQty } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";
import { AdjustmentFormClient } from "./adjustment-form-client";

type Row = {
  id: number;
  adjNo: string;
  createdAt: Date;
  reason: string;
  itemType: string | null;
  qtyDelta: number | null;
  itemCode: string;
  itemName: string;
  unit: string;
  by: string | null;
};

type MasterItem = { id: number; code: string; name: string; unit: string };

export function AdjustmentsClient({
  rows,
  rms,
  fgs,
  canCreate,
}: {
  rows: Row[];
  rms: MasterItem[];
  fgs: MasterItem[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const filterDefs: FilterDef<Row>[] = [
    {
      key: "itemType",
      label: "Type",
      options: [
        { value: "rm", label: "RM" },
        { value: "fg", label: "FG" },
      ],
      getValue: (r) => r.itemType ?? "",
    },
    {
      key: "direction",
      label: "Direction",
      options: [
        { value: "gain", label: "Gain (+)" },
        { value: "loss", label: "Loss (−)" },
      ],
      getValue: (r) => ((r.qtyDelta ?? 0) >= 0 ? "gain" : "loss"),
    },
  ];

  const columns: Column<Row>[] = [
    { key: "adjNo", label: "Doc #", className: "num w-24", sortValue: (r) => r.adjNo },
    {
      key: "createdAt",
      label: "When",
      className: "w-28 text-ink-soft",
      sortValue: (r) => new Date(r.createdAt).getTime(),
      render: (r) => fmtDate(r.createdAt),
    },
    {
      key: "itemType",
      label: "Type",
      className: "w-14",
      sortValue: (r) => r.itemType ?? "",
      render: (r) =>
        r.itemType ? (
          <Badge tone={r.itemType === "rm" ? "info" : "accent"}>{r.itemType.toUpperCase()}</Badge>
        ) : (
          "—"
        ),
    },
    {
      key: "itemName",
      label: "Item",
      render: (r) => (
        <span>
          <span className="num mr-1.5 text-ink-faint">{r.itemCode}</span>
          {r.itemName}
        </span>
      ),
    },
    {
      key: "qtyDelta",
      label: "Qty Δ",
      numeric: true,
      sortValue: (r) => r.qtyDelta ?? 0,
      render: (r) =>
        r.qtyDelta == null ? (
          "—"
        ) : (
          <span className={r.qtyDelta < 0 ? "text-danger" : "text-ok"}>
            {r.qtyDelta > 0 ? "+" : ""}
            {fmtQty(r.qtyDelta)}
          </span>
        ),
    },
    { key: "reason", label: "Reason", render: (r) => r.reason },
    { key: "by", label: "By", className: "w-32 text-ink-soft", render: (r) => r.by ?? "—" },
  ];

  return (
    <>
      <PageHeader
        title="Stock Adjustments"
        sub={`${rows.length} adjustments`}
        actions={
          canCreate && (
            <Button onClick={() => setOpen(true)}>
              <Add size={16} /> New adjustment
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchKeys={["adjNo", "reason", "itemName", "itemCode", "by"]}
        searchPlaceholder="Search adjustments"
        empty="No adjustments yet."
        filters={filterDefs}
        exportName="stock-adjustments"
        exportTitle="Stock Adjustments"
      />

      {canCreate && (
        <AdjustmentFormClient
          open={open}
          onOpenChange={setOpen}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
          rms={rms}
          fgs={fgs}
        />
      )}
    </>
  );
}
