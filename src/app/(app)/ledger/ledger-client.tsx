"use client";

import { fmtDateTime, fmtMoney, fmtQty } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";

type Row = {
  id: number;
  createdAt: Date;
  itemType: string;
  itemName: string;
  unit: string;
  txnType: string;
  refNo: string | null;
  qtyIn: number;
  qtyOut: number;
  balanceAfter: number;
  unitCost: number;
};

export function LedgerClient({ rows }: { rows: Row[] }) {
  const filterDefs: FilterDef<Row>[] = [
    {
      key: "itemType",
      label: "Item type",
      options: [
        { value: "rm", label: "Raw material" },
        { value: "fg", label: "Finished good" },
      ],
      getValue: (r) => r.itemType,
    },
    {
      key: "txnType",
      label: "Type",
      options: [
        { value: "opening", label: "Opening" },
        { value: "grn", label: "GRN" },
        { value: "production_in", label: "Production in" },
        { value: "production_out", label: "Production out" },
        { value: "sale", label: "Sale" },
        { value: "adjustment", label: "Adjustment" },
        { value: "count", label: "Count" },
      ],
      getValue: (r) => r.txnType,
    },
  ];

  const columns: Column<Row>[] = [
    {
      key: "createdAt",
      label: "When",
      className: "num w-32 whitespace-nowrap",
      sortValue: (r) => new Date(r.createdAt).getTime(),
      render: (r) => fmtDateTime(r.createdAt),
    },
    { key: "itemName", label: "Item" },
    { key: "unit", label: "UOM", className: "w-16 text-ink-soft" },
    {
      key: "txnType",
      label: "Type",
      className: "w-28",
      sortValue: (r) => r.txnType,
      render: (r) => <Badge>{r.txnType.replaceAll("_", " ")}</Badge>,
    },
    {
      key: "qtyIn",
      label: "In",
      numeric: true,
      sortValue: (r) => r.qtyIn,
      render: (r) => (r.qtyIn ? fmtQty(r.qtyIn) : ""),
    },
    {
      key: "qtyOut",
      label: "Out",
      numeric: true,
      sortValue: (r) => r.qtyOut,
      render: (r) => (r.qtyOut ? fmtQty(r.qtyOut) : ""),
    },
    {
      key: "balanceAfter",
      label: "Balance",
      numeric: true,
      sortValue: (r) => r.balanceAfter,
      render: (r) => fmtQty(r.balanceAfter),
    },
    {
      key: "unitCost",
      label: "Unit cost (UGX)",
      numeric: true,
      sortValue: (r) => r.unitCost,
      render: (r) => (r.unitCost ? fmtMoney(r.unitCost) : "—"),
    },
    { key: "refNo", label: "Reference", className: "num", render: (r) => r.refNo ?? "—" },
  ];

  return (
    <>
      <PageHeader title="Stock Ledger" sub={`${rows.length} movements`} />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        pageSize={50}
        searchKeys={["itemName", "refNo"]}
        searchPlaceholder="Search item / reference"
        empty="No movements match."
        filters={filterDefs}
        exportName="stock-ledger"
        exportTitle="Stock Ledger"
      />
    </>
  );
}
