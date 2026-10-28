"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Add } from "iconsax-reactjs";
import type { suppliers } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";
import { setSupplierArchived, setSuppliersArchived } from "./actions";
import { SupplierFormClient } from "./supplier-form-client";

type Supplier = typeof suppliers.$inferSelect;
type ModalState = { mode: "create" } | { mode: "edit"; supplier: Supplier } | null;

export function SuppliersClient({
  rows,
  canCreate,
  canEdit,
}: {
  rows: Supplier[];
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalState>(null);

  const filterDefs: FilterDef<Supplier>[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "active", label: "Active" },
        { value: "archived", label: "Archived" },
      ],
      getValue: (r) => (r.archived ? "archived" : "active"),
    },
  ];

  function toggleArchived(r: Supplier) {
    startTransition(async () => {
      const res = await setSupplierArchived(r.id, !r.archived);
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

  const columns: Column<Supplier>[] = [
    { key: "code", label: "Code", className: "num w-24", sortValue: (r) => r.code ?? "" },
    { key: "name", label: "Name", sortValue: (r) => r.name },
    { key: "contactPerson", label: "Contact", render: (r) => r.contactPerson ?? "—" },
    { key: "phone", label: "Phone", className: "num", render: (r) => r.phone ?? "—" },
    { key: "currency", label: "CCY", className: "w-16 text-ink-soft", render: (r) => r.currency || "UGX" },
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
              onClick={() => setModal({ mode: "edit", supplier: r })}
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
        title="Suppliers"
        sub={`${rows.filter((r) => !r.archived).length} suppliers`}
        actions={
          canCreate && (
            <Button onClick={() => setModal({ mode: "create" })}>
              <Add size={16} /> Add supplier
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchKeys={["code", "name", "phone", "contactPerson", "location"]}
        searchPlaceholder="Search suppliers"
        onRowClick={canEdit ? (r) => setModal({ mode: "edit", supplier: r }) : undefined}
        filters={filterDefs}
        exportName="suppliers"
        exportTitle="Suppliers"
        selectable={canEdit}
        bulkActions={(sel, clear) => {
          const anyActive = sel.some((sup) => !sup.archived);
          return (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                startTransition(async () => {
                  const res = await setSuppliersArchived(sel.map((sup) => sup.id), anyActive);
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
        <SupplierFormClient
          key={modal.mode === "edit" ? modal.supplier.id : "create"}
          open
          onOpenChange={(o) => !o && closeModal()}
          onSaved={onSaved}
          mode={modal.mode}
          supplierId={modal.mode === "edit" ? modal.supplier.id : undefined}
          supplierName={modal.mode === "edit" ? modal.supplier.name : ""}
          supplierCode={modal.mode === "edit" ? (modal.supplier.code ?? "") : ""}
          initial={
            modal.mode === "edit"
              ? {
                  name: modal.supplier.name,
                  phone: modal.supplier.phone ?? "",
                  contactPerson: modal.supplier.contactPerson ?? "",
                  email: modal.supplier.email ?? "",
                  location: modal.supplier.location ?? "",
                  currency: modal.supplier.currency ?? "",
                  notes: modal.supplier.notes ?? "",
                  archived: modal.supplier.archived,
                }
              : {
                  name: "",
                  phone: "",
                  contactPerson: "",
                  email: "",
                  location: "",
                  currency: "",
                  notes: "",
                  archived: false,
                }
          }
        />
      )}
    </>
  );
}
