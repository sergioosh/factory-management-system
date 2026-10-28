"use client";

import { fmtDate, fmtMoney, fmtQty } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";

type Row = {
  id: number;
  lotNo: string;
  itemType: string;
  itemCode: string;
  itemName: string;
  unit: string;
  initialQty: number;
  remainingQty: number;
  sourceType: string;
  createdAt: Date;
  unitCost: number;
};

export function LotsClient({ rows }: { rows: Row[] }) {
  const filterDefs: FilterDef<Row>[] = [
    {
      key: "itemType",
      label: "Type",
      options: [
        { value: "rm", label: "RM" },
        { value: "fg", label: "FG" },
      ],
      getValue: (r) => r.itemType,
    },
    {
      key: "status",
      label: "Status",
      options: [
        { value: "open", label: "Open" },
        { value: "closed", label: "Closed" },
      ],
      getValue: (r) => (r.remainingQty > 0 ? "open" : "closed"),
    },
  ];

  const columns: Column<Row>[] = [
    { key: "lotNo", label: "Lot #", className: "num", sortValue: (r) => r.lotNo },
    {
      key: "itemType",
      label: "Type",
      className: "w-14",
      sortValue: (r) => r.itemType,
      render: (r) => (
        <Badge tone={r.itemType === "rm" ? "info" : "accent"}>{r.itemType.toUpperCase()}</Badge>
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
    { key: "unit", label: "UOM", className: "w-16 text-ink-soft" },
    {
      key: "initialQty",
      label: "Initial",
      numeric: true,
      sortValue: (r) => r.initialQty,
      render: (r) => fmtQty(r.initialQty),
    },
    {
      key: "createdAt",
      label: "Made",
      className: "w-28 text-ink-soft",
      sortValue: (r) => new Date(r.createdAt).getTime(),
      render: (r) => fmtDate(r.createdAt),
    },
    {
      key: "remainingQty",
      label: "On hand",
      numeric: true,
      sortValue: (r) => r.remainingQty,
      render: (r) => (
        <span className={r.remainingQty === 0 ? "text-ink-faint" : ""}>{fmtQty(r.remainingQty)}</span>
      ),
    },
    {
      key: "unitCost",
      label: "Unit cost (UGX)",
      numeric: true,
      sortValue: (r) => r.unitCost,
      render: (r) => (r.unitCost ? fmtMoney(r.unitCost) : "—"),
    },
    {
      key: "status",
      label: "Status",
      className: "w-20",
      sortValue: (r) => (r.remainingQty > 0 ? 1 : 0),
      render: (r) =>
        r.remainingQty > 0 ? <Badge tone="ok">Open</Badge> : <Badge tone="neutral">Closed</Badge>,
    },
  ];

  return (
    <>
      <PageHeader title="Lots / Batches" sub={`${rows.length} lots`} />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchKeys={["lotNo", "itemName", "itemCode"]}
        searchPlaceholder="Lot no, product code"
        empty="No lots match."
        filters={filterDefs}
        exportName="lots"
        exportTitle="Lots and Batches"
      />
    </>
  );
}
