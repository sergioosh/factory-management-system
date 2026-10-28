"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Add } from "iconsax-reactjs";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";
import { CountFormClient } from "./count-form-client";

type Row = {
  id: number;
  countNo: string;
  countDate: string;
  scope: string;
  status: string;
  totalItems: number;
  countedItems: number;
  createdBy: string | null;
};

export function CountsClient({ rows, canCreate }: { rows: Row[]; canCreate: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const filterDefs: FilterDef<Row>[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "draft", label: "Draft" },
        { value: "submitted", label: "Submitted" },
        { value: "approved", label: "Approved" },
        { value: "rejected", label: "Rejected" },
      ],
      getValue: (r) => r.status,
    },
    {
      key: "scope",
      label: "Scope",
      options: [
        { value: "rm", label: "RM" },
        { value: "fg", label: "FG" },
        { value: "all", label: "All" },
      ],
      getValue: (r) => r.scope,
    },
  ];

  const scopeLabel = (s: string) =>
    s === "rm" ? "Raw materials" : s === "fg" ? "Finished goods" : "All";

  const columns: Column<Row>[] = [
    { key: "countNo", label: "Doc #", className: "num w-24", sortValue: (r) => r.countNo },
    {
      key: "countDate",
      label: "Date",
      className: "w-28 text-ink-soft",
      sortValue: (r) => r.countDate,
      render: (r) => fmtDate(r.countDate),
    },
    {
      key: "scope",
      label: "Scope",
      className: "w-32",
      sortValue: (r) => r.scope,
      render: (r) => scopeLabel(r.scope),
    },
    {
      key: "lines",
      label: "Lines",
      numeric: true,
      className: "w-16",
      sortValue: (r) => r.totalItems,
      render: (r) => r.totalItems,
    },
    {
      key: "status",
      label: "Status",
      className: "w-24",
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge status={r.status} />,
    },
    { key: "by", label: "By", className: "w-32 text-ink-soft", render: (r) => r.createdBy ?? "—" },
  ];

  return (
    <>
      <PageHeader
        title="Stock Counts"
        sub={`${rows.length} counts`}
        actions={
          canCreate && (
            <Button onClick={() => setOpen(true)}>
              <Add size={16} /> New count
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchKeys={["countNo", "createdBy"]}
        searchPlaceholder="Search counts"
        empty="No counts yet."
        filters={filterDefs}
        onRowClick={(r) => router.push(`/counts/${r.id}`)}
        exportName="stock-counts"
        exportTitle="Stock Counts"
      />

      {canCreate && <CountFormClient open={open} onOpenChange={setOpen} />}
    </>
  );
}
