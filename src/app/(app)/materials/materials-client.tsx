"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Add } from "iconsax-reactjs";
import type { rawMaterials } from "@/db/schema";
import { fmtMoney, fmtQty } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";
import { setMaterialArchived, setMaterialsArchived } from "./actions";
import { MaterialFormClient } from "./material-form-client";

type Material = typeof rawMaterials.$inferSelect;
type ModalState = { mode: "create" } | { mode: "edit"; material: Material } | null;

export function MaterialsClient({
  rows,
  canCreate,
  canEdit,
}: {
  rows: Material[];
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalState>(null);

  const filterDefs: FilterDef<Material>[] = [
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
      key: "unit",
      label: "Unit",
      options: [
        { value: "KG", label: "KG" },
        { value: "PCS", label: "PCS" },
      ],
      getValue: (r) => r.unit,
    },
    {
      key: "stock",
      label: "Stock",
      options: [
        { value: "low", label: "Below minimum" },
        { value: "ok", label: "At or above minimum" },
      ],
      getValue: (r) => (r.currentStock < r.minStock ? "low" : "ok"),
    },
  ];

  function toggleArchived(r: Material) {
    startTransition(async () => {
      const res = await setMaterialArchived(r.id, !r.archived);
      if (!res.ok) return void toast.error(res.error);
      toast.success(r.archived ? "Activated" : "Deactivated");
    });
  }

  function closeModal() {
    setModal(null);
  }

  function onSaved() {
    closeModal();
    router.refresh();
  }

  const columns: Column<Material>[] = [
    { key: "code", label: "Code", className: "num w-20", sortValue: (r) => r.code },
    { key: "name", label: "Name", sortValue: (r) => r.name },
    { key: "unit", label: "UOM", className: "w-20 text-ink-soft" },
    {
      key: "price",
      label: "Std cost (UGX)",
      numeric: true,
      sortValue: (r) => r.price,
      render: (r) => fmtMoney(r.price),
    },
    {
      key: "minStock",
      label: "Reorder",
      numeric: true,
      sortValue: (r) => r.minStock,
      render: (r) => fmtQty(r.minStock),
    },
    {
      key: "status",
      label: "Status",
      className: "w-24",
      sortValue: (r) => (r.archived ? 0 : 1),
      render: (r) =>
        r.archived ? <Badge tone="neutral">Inactive</Badge> : <Badge tone="ok">Active</Badge>,
    },
    {
      key: "actions",
      label: "Actions",
      className: "w-32 text-right",
      noExport: true,
      render: (r) =>
        canEdit ? (
          <span className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setModal({ mode: "edit", material: r })}
              className="text-[12.5px] text-accent hover:underline cursor-pointer"
            >
              Edit
            </button>
            <button
              onClick={() => toggleArchived(r)}
              disabled={busy}
              className="text-[12.5px] text-ink-soft hover:text-danger cursor-pointer disabled:opacity-50"
            >
              {r.archived ? "Activate" : "Deactivate"}
            </button>
          </span>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Raw Materials"
        sub={`${rows.filter((r) => !r.archived).length} materials`}
        actions={
          canCreate && (
            <Button onClick={() => setModal({ mode: "create" })}>
              <Add size={16} /> Add material
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchKeys={["code", "name"]}
        searchPlaceholder="Search materials"
        onRowClick={canEdit ? (r) => setModal({ mode: "edit", material: r }) : undefined}
        filters={filterDefs}
        exportName="raw-materials"
        exportTitle="Raw Materials"
        selectable={canEdit}
        bulkActions={(sel, clear) => {
          const anyActive = sel.some((m) => !m.archived);
          return (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                startTransition(async () => {
                  const res = await setMaterialsArchived(sel.map((m) => m.id), anyActive);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(anyActive ? "Archived" : "Restored");
                  clear();
                })
              }
            >
              {anyActive ? "Archive" : "Restore"} {sel.length}
            </Button>
          );
        }}
      />

      {modal && (
        <MaterialFormClient
          key={modal.mode === "edit" ? modal.material.id : "create"}
          open
          onOpenChange={(o) => !o && closeModal()}
          onSaved={onSaved}
          mode={modal.mode}
          materialId={modal.mode === "edit" ? modal.material.id : undefined}
          materialCode={modal.mode === "edit" ? modal.material.code : ""}
          initial={
            modal.mode === "edit"
              ? {
                  name: modal.material.name,
                  unit: modal.material.unit,
                  price: modal.material.price,
                  minStock: modal.material.minStock,
                  archived: modal.material.archived,
                }
              : { name: "", unit: "KG", price: 0, minStock: 0, archived: false }
          }
        />
      )}
    </>
  );
}
