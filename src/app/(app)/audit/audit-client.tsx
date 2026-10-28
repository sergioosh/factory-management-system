"use client";

import { useMemo } from "react";
import { fmtDateTime } from "@/lib/format";
import { Badge, type Tone } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";

type AuditRow = {
  id: number;
  createdAt: Date;
  userName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  detail: unknown;
};

const ACTION_TONES: Record<string, Tone> = {
  create: "ok",
  update: "info",
  approve: "ok",
  reject: "danger",
  delete: "danger",
  archive: "warn",
  restore: "info",
};

function preview(detail: unknown): string {
  if (detail == null) return "";
  const s = JSON.stringify(detail);
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
}

export function AuditClient({ rows }: { rows: AuditRow[] }) {
  const filterDefs: FilterDef<AuditRow>[] = useMemo(() => {
    const entities = [...new Set(rows.map((r) => r.entity))].sort();
    const actions = [...new Set(rows.map((r) => r.action))].sort();
    return [
      {
        key: "entity",
        label: "Entity",
        options: entities.map((e) => ({ value: e, label: e })),
        getValue: (r) => r.entity,
      },
      {
        key: "action",
        label: "Action",
        options: actions.map((a) => ({ value: a, label: a })),
        getValue: (r) => r.action,
      },
    ];
  }, [rows]);

  const columns: Column<AuditRow>[] = [
    {
      key: "createdAt",
      label: "Time",
      className: "whitespace-nowrap text-ink-soft",
      sortValue: (r) => r.createdAt.getTime(),
      render: (r) => fmtDateTime(r.createdAt),
    },
    { key: "userName", label: "User", render: (r) => r.userName ?? "system" },
    {
      key: "action",
      label: "Action",
      render: (r) => <Badge tone={ACTION_TONES[r.action] ?? "neutral"}>{r.action}</Badge>,
    },
    { key: "entity", label: "Entity", className: "text-ink-soft" },
    { key: "entityId", label: "ID", className: "num", render: (r) => r.entityId ?? "—" },
    {
      key: "detail",
      label: "Detail",
      className: "max-w-105",
      render: (r) => <span className="text-[12px] text-ink-faint">{preview(r.detail)}</span>,
    },
  ];

  return (
    <>
      <PageHeader title="Audit Log" sub={`Latest ${rows.length} entries`} />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchKeys={["entity", "action", "userName"]}
        searchPlaceholder="Search log"
        pageSize={50}
        filters={filterDefs}
        empty="No audit entries"
        exportName="audit-log"
        exportTitle="Audit Log"
      />
    </>
  );
}
