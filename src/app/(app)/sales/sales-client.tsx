"use client";

import Link from "next/link";
import { Add, Printer } from "iconsax-reactjs";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";

type Row = {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  total: number;
  customerName: string;
  orderNo: string | null;
  lines: number;
  paid: number;
};

function payStatus(r: Row) {
  if (r.paid >= r.total) return "paid";
  if (r.paid > 0) return "partial";
  return "unpaid";
}

export function SalesClient({
  rows,
  canCreate,
}: {
  rows: Row[];
  canCreate: boolean;
}) {
  const filterDefs: FilterDef<Row>[] = [
    {
      key: "payStatus",
      label: "Payment status",
      options: [
        { value: "unpaid", label: "Unpaid" },
        { value: "partial", label: "Partial" },
        { value: "paid", label: "Paid" },
      ],
      getValue: (r) => payStatus(r),
    },
  ];

  const columns: Column<Row>[] = [
    { key: "invoiceNo", label: "Sale #", className: "num w-24" },
    { key: "invoiceDate", label: "Date", render: (r) => fmtDate(r.invoiceDate), className: "w-28 text-ink-soft" },
    { key: "customerName", label: "Customer" },
    { key: "lines", label: "Lines", numeric: true, className: "w-16", sortValue: (r) => r.lines },
    { key: "ccy", label: "CCY", className: "w-16 text-ink-soft", render: () => "UGX" },
    { key: "total", label: "Total (UGX)", numeric: true, sortValue: (r) => r.total, render: (r) => fmtMoney(r.total) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={payStatus(r)} />, className: "w-24" },
    {
      key: "actions",
      label: "Actions",
      className: "w-24 text-right",
      noExport: true,
      render: (r) => (
        <span className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
          <Link href={`/sales/${r.id}/print`} className="inline-flex text-ink-faint hover:text-ink" title="Print">
            <Printer size={15} />
          </Link>
          <Link href={`/sales/${r.id}/print`} className="text-[12.5px] text-accent hover:underline">
            Open
          </Link>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Sales"
        sub={`${rows.length} sales`}
        actions={
          canCreate && (
            <Link href="/sales/new">
              <Button>
                <Add size={16} /> New sale
              </Button>
            </Link>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchKeys={["invoiceNo", "customerName", "orderNo"]}
        searchPlaceholder="Search code or name"
        empty="No sales yet"
        exportName="sales"
        exportTitle="Sales"
        filters={filterDefs}
      />
    </>
  );
}
