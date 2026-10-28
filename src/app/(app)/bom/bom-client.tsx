"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";

type BomRow = {
  id: number;
  code: string;
  name: string;
  unit: string;
  archived: boolean;
  materials: number;
  version: number | null;
  effectiveDate: string | null;
};

export function BomClient({ rows, canEdit }: { rows: BomRow[]; canEdit: boolean }) {
  const router = useRouter();

  const filterDefs: FilterDef<BomRow>[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "active", label: "Active" },
        { value: "archived", label: "Archived" },
      ],
      getValue: (r) => (r.archived ? "archived" : "active"),
    },
    {
      key: "bom",
      label: "Recipe",
      options: [
        { value: "has", label: "Has BOM" },
        { value: "none", label: "No BOM" },
      ],
      getValue: (r) => (r.materials > 0 ? "has" : "none"),
    },
  ];

  const columns: Column<BomRow>[] = [
    { key: "code", label: "Product", className: "num w-24", sortValue: (r) => r.code },
    { key: "name", label: "Name", sortValue: (r) => r.name },
    { key: "unit", label: "UOM", className: "w-16 text-ink-soft" },
    {
      key: "version",
      label: "BOM version",
      className: "w-28",
      sortValue: (r) => r.version ?? 0,
      render: (r) =>
        r.version != null ? (
          <span className="num">v{r.version}</span>
        ) : (
          <span className="text-ink-faint">no BOM</span>
        ),
    },
    {
      key: "materials",
      label: "Materials",
      numeric: true,
      sortValue: (r) => r.materials,
      render: (r) => r.materials,
    },
    {
      key: "effectiveDate",
      label: "Effective",
      className: "w-28 text-ink-soft",
      sortValue: (r) => r.effectiveDate ?? "",
      render: (r) => (r.effectiveDate ? fmtDate(r.effectiveDate) : "—"),
    },
    {
      key: "actions",
      label: "Actions",
      className: "w-20 text-right",
      noExport: true,
      render: (r) =>
        canEdit ? (
          <Link
            href={`/bom/${r.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[12.5px] text-accent hover:underline"
          >
            Open
          </Link>
        ) : (
          <span className="text-[12.5px] text-ink-faint">—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Bill of Materials"
        sub="One header per product. Saving the editor creates a new version and supersedes the previous."
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchKeys={["code", "name"]}
        searchPlaceholder="Search code or name"
        onRowClick={canEdit ? (r) => router.push(`/bom/${r.id}`) : undefined}
        filters={filterDefs}
        exportName="bom"
        exportTitle="Bill of Materials"
      />
    </>
  );
}
