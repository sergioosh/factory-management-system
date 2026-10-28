"use client";

import type { rawMaterials } from "@/db/schema";
import { fmtMoney, fmtQty } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";

type Row = typeof rawMaterials.$inferSelect;

export function StockMaterialsClient({ rows }: { rows: Row[] }) {
  const totalValue = rows.reduce((sum, r) => sum + r.currentStock * r.avgCost, 0);

  const filterDefs: FilterDef<Row>[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "low", label: "Low" },
        { value: "ok", label: "OK" },
      ],
      getValue: (r) => (r.currentStock < r.minStock ? "low" : "ok"),
    },
    {
      key: "unit",
      label: "Unit",
      options: [
        { value: "KG", label: "KG" },
        { value: "PCS", label: "PCS" },
      ],
      getValue: (r) => r.unit,
    },
  ];

  const columns: Column<Row>[] = [
    { key: "code", label: "Code", className: "num w-20", sortValue: (r) => r.code },
    { key: "name", label: "Material" },
    { key: "unit", label: "UOM", className: "w-16 text-ink-soft" },
    {
      key: "currentStock",
      label: "Balance",
      numeric: true,
      sortValue: (r) => r.currentStock,
      render: (r) => fmtQty(r.currentStock),
    },
    {
      key: "minStock",
      label: "Reorder",
      numeric: true,
      sortValue: (r) => r.minStock,
      render: (r) => fmtQty(r.minStock),
    },
    {
      key: "avgCost",
      label: "Avg cost (UGX)",
      numeric: true,
      sortValue: (r) => r.avgCost,
      render: (r) => fmtMoney(r.avgCost),
    },
    {
      key: "value",
      label: "Value (UGX)",
      numeric: true,
      sortValue: (r) => r.currentStock * r.avgCost,
      render: (r) => fmtMoney(r.currentStock * r.avgCost),
    },
    {
      key: "status",
      label: "Status",
      className: "w-20",
      sortValue: (r) => (r.currentStock < r.minStock ? 0 : 1),
      render: (r) =>
        r.currentStock < r.minStock ? <Badge tone="danger">low</Badge> : <Badge tone="ok">ok</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Raw Material Stock"
        sub={
          <>
            {rows.length} materials · total value <span className="num">{fmtMoney(totalValue)}</span> UGX
          </>
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchKeys={["code", "name"]}
        searchPlaceholder="Search materials"
        empty="No materials"
        filters={filterDefs}
        exportName="raw-material-stock"
        exportTitle="Raw Material Stock"
      />
      <p className="mt-2 text-[11.5px] text-ink-faint">
        Balance is the latest running balance from the stock ledger. Avg cost is the moving average
        recalculated on every GRN. Reorder threshold drives the low-stock alert.
      </p>
    </>
  );
}
