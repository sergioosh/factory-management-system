"use client";

import { fmtMoney, fmtQty } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";

type Row = {
  id: number;
  code: string;
  name: string;
  unit: string;
  currentStock: number;
  sellingPrice: number;
};

export function StockProductsClient({ rows }: { rows: Row[] }) {
  const totalValue = rows.reduce((sum, r) => sum + r.currentStock * r.sellingPrice, 0);
  const inStock = rows.filter((r) => r.currentStock > 0).length;

  const filterDefs: FilterDef<Row>[] = [
    {
      key: "unit",
      label: "UOM",
      options: [
        { value: "CTNS", label: "CTNS" },
        { value: "KGS", label: "KGS" },
        { value: "PCS", label: "PCS" },
      ],
      getValue: (r) => r.unit,
    },
    {
      key: "status",
      label: "Status",
      options: [
        { value: "in_stock", label: "In stock" },
        { value: "out", label: "Out" },
      ],
      getValue: (r) => (r.currentStock > 0 ? "in_stock" : "out"),
    },
  ];

  const columns: Column<Row>[] = [
    { key: "code", label: "Code", className: "num w-24", sortValue: (r) => r.code },
    { key: "name", label: "Product" },
    { key: "unit", label: "UOM", className: "w-16 text-ink-soft" },
    {
      key: "currentStock",
      label: "On hand",
      numeric: true,
      sortValue: (r) => r.currentStock,
      render: (r) => fmtQty(r.currentStock),
    },
    {
      key: "sellingPrice",
      label: "Sell price (UGX)",
      numeric: true,
      sortValue: (r) => r.sellingPrice,
      render: (r) => fmtMoney(r.sellingPrice),
    },
    {
      key: "value",
      label: "Sale value (UGX)",
      numeric: true,
      sortValue: (r) => r.currentStock * r.sellingPrice,
      render: (r) => fmtMoney(r.currentStock * r.sellingPrice),
    },
    {
      key: "status",
      label: "Status",
      className: "w-20",
      sortValue: (r) => (r.currentStock > 0 ? 1 : 0),
      render: (r) =>
        r.currentStock > 0 ? <Badge tone="ok">In stock</Badge> : <Badge tone="danger">Out</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Finished Goods Stock"
        actions={
          <div className="text-right">
            <div className="text-[11.5px] uppercase tracking-wide text-ink-faint">
              Total sale value of stock on hand
            </div>
            <div className="num text-[20px] font-semibold leading-tight">
              {fmtMoney(totalValue)} <span className="text-[12px] font-normal text-ink-soft">UGX</span>
            </div>
            <div className="text-[12px] text-ink-soft">
              {inStock} of {rows.length} products in stock
            </div>
          </div>
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchKeys={["code", "name"]}
        searchPlaceholder="Search code or name"
        empty="No products"
        filters={filterDefs}
        exportName="finished-goods-stock"
        exportTitle="Finished Goods Stock"
      />
      <p className="mt-2 text-[11.5px] text-ink-faint">
        Balance is the latest running balance from the stock ledger. Sale value = balance × selling price.
      </p>
    </>
  );
}
