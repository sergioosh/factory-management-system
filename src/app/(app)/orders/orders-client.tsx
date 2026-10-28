"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Add } from "iconsax-reactjs";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";

type Row = {
  id: number;
  orderNo: string;
  orderDate: string;
  targetDate: string | null;
  status: string;
  customerName: string;
  lines: number;
  value: number;
};

export function OrdersClient({
  rows,
  canCreate,
}: {
  rows: Row[];
  canCreate: boolean;
}) {
  const router = useRouter();

  const filterDefs: FilterDef<Row>[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "draft", label: "Draft" },
        { value: "confirmed", label: "Confirmed" },
        { value: "in_production", label: "In production" },
        { value: "ready", label: "Ready" },
        { value: "invoiced", label: "Invoiced" },
        { value: "closed", label: "Closed" },
        { value: "cancelled", label: "Cancelled" },
      ],
      getValue: (r) => r.status,
    },
  ];

  const columns: Column<Row>[] = [
    { key: "orderNo", label: "Order #", className: "num w-40" },
    { key: "orderDate", label: "Date", render: (r) => fmtDate(r.orderDate), className: "w-28 text-ink-soft" },
    {
      key: "targetDate",
      label: "Target",
      className: "w-28 text-ink-soft",
      sortValue: (r) => r.targetDate ?? "",
      render: (r) => (r.targetDate ? fmtDate(r.targetDate) : "—"),
    },
    { key: "customerName", label: "Customer" },
    { key: "lines", label: "Lines", numeric: true, className: "w-16" },
    { key: "value", label: "Total (UGX)", numeric: true, sortValue: (r) => r.value, render: (r) => fmtMoney(r.value) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, className: "w-28" },
    {
      key: "actions",
      label: "Actions",
      className: "w-20 text-right",
      noExport: true,
      render: (r) => (
        <Link
          href={`/orders/${r.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[12.5px] text-accent hover:underline"
        >
          Open
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Sales Orders"
        sub={`${rows.filter((r) => !["closed", "cancelled"].includes(r.status)).length} open`}
        actions={
          canCreate && (
            <Link href="/orders/new">
              <Button>
                <Add size={16} /> New order
              </Button>
            </Link>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchKeys={["orderNo", "customerName"]}
        searchPlaceholder="Search orders"
        onRowClick={(r) => router.push(`/orders/${r.id}`)}
        empty="No orders yet"
        exportName="sales-orders"
        exportTitle="Sales Orders"
        filters={filterDefs}
      />
    </>
  );
}
