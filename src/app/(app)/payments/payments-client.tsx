"use client";

import Link from "next/link";
import { Add } from "iconsax-reactjs";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";

type Row = {
  id: number;
  payNo: string | null;
  paymentDate: string;
  method: string;
  reference: string | null;
  currency: string | null;
  amount: number;
  customerName: string | null;
  allocs: number;
  allocated: number;
};

function status(r: Row) {
  if (r.allocated >= r.amount - 0.005) return "allocated";
  if (r.allocated > 0.005) return "partial";
  return "unapplied";
}

export function PaymentsClient({ rows, canCreate }: { rows: Row[]; canCreate: boolean }) {
  const filterDefs: FilterDef<Row>[] = [
    {
      key: "method",
      label: "Method",
      options: [
        { value: "cash", label: "Cash" },
        { value: "mobile_money", label: "Mobile money" },
        { value: "bank", label: "Bank" },
      ],
      getValue: (r) => r.method,
    },
    {
      key: "status",
      label: "Status",
      options: [
        { value: "allocated", label: "Allocated" },
        { value: "partial", label: "Partial" },
        { value: "unapplied", label: "Unapplied" },
      ],
      getValue: (r) => status(r),
    },
  ];

  const columns: Column<Row>[] = [
    { key: "payNo", label: "Doc #", className: "num w-24", sortValue: (r) => r.payNo ?? "" },
    {
      key: "paymentDate",
      label: "Date",
      sortValue: (r) => r.paymentDate,
      render: (r) => fmtDate(r.paymentDate),
    },
    { key: "customerName", label: "Customer", render: (r) => r.customerName ?? "—" },
    {
      key: "method",
      label: "Method",
      className: "w-32 text-ink-soft",
      render: (r) => r.method.replaceAll("_", " "),
    },
    { key: "reference", label: "Reference", className: "num", render: (r) => r.reference ?? "—" },
    {
      key: "amount",
      label: "Amount (UGX)",
      numeric: true,
      sortValue: (r) => r.amount,
      render: (r) => fmtMoney(r.amount),
    },
    {
      key: "allocs",
      label: "Allocs",
      numeric: true,
      sortValue: (r) => r.allocs,
      render: (r) => r.allocs,
    },
    {
      key: "status",
      label: "Status",
      className: "w-24",
      sortValue: (r) => status(r),
      render: (r) => {
        const st = status(r);
        return (
          <Badge tone={st === "allocated" ? "ok" : st === "partial" ? "warn" : "info"}>{st}</Badge>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Customer Payments"
        actions={
          canCreate && (
            <Link href="/payments/new">
              <Button>
                <Add size={16} /> Record payment
              </Button>
            </Link>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchKeys={["payNo", "customerName", "reference"]}
        searchPlaceholder="Search code or name"
        empty="No payments yet"
        exportName="customer-payments"
        exportTitle="Customer Payments"
        filters={filterDefs}
      />
      <p className="mt-2 text-[11.5px] text-ink-faint">
        A payment is recorded against a customer and allocated across their open invoices (oldest first).
        Any unallocated amount is held as credit.
      </p>
    </>
  );
}
