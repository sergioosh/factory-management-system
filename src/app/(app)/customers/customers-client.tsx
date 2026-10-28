"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Add } from "iconsax-reactjs";
import type { customers } from "@/db/schema";
import { fmtMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";
import { setCustomerArchived, setCustomersArchived } from "./actions";
import { CustomerFormClient } from "./customer-form-client";

type Customer = typeof customers.$inferSelect;
type ModalState = { mode: "create" } | { mode: "edit"; customer: Customer } | null;

export function CustomersClient({
  rows,
  canCreate,
  canEdit,
}: {
  rows: Customer[];
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalState>(null);

  const filterDefs: FilterDef<Customer>[] = [
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

  function toggleArchived(r: Customer) {
    startTransition(async () => {
      const res = await setCustomerArchived(r.id, !r.archived);
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

  const columns: Column<Customer>[] = [
    { key: "code", label: "Code", className: "num w-24", sortValue: (r) => r.code ?? "" },
    { key: "name", label: "Name", sortValue: (r) => r.name },
    { key: "contactPerson", label: "Contact", render: (r) => r.contactPerson ?? "—" },
    { key: "phone", label: "Phone", className: "num", render: (r) => r.phone ?? "—" },
    {
      key: "creditLimit",
      label: "Credit limit (UGX)",
      numeric: true,
      sortValue: (r) => r.creditLimit,
      render: (r) => fmtMoney(r.creditLimit),
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
              onClick={() => setModal({ mode: "edit", customer: r })}
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
        title="Customers"
        sub={`${rows.filter((r) => !r.archived).length} customers`}
        actions={
          canCreate && (
            <Button onClick={() => setModal({ mode: "create" })}>
              <Add size={16} /> Add customer
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchKeys={["code", "name", "phone", "contactPerson", "location"]}
        searchPlaceholder="Search customers"
        onRowClick={canEdit ? (r) => setModal({ mode: "edit", customer: r }) : undefined}
        filters={filterDefs}
        exportName="customers"
        exportTitle="Customers"
        selectable={canEdit}
        bulkActions={(sel, clear) => {
          const anyActive = sel.some((c) => !c.archived);
          return (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                startTransition(async () => {
                  const res = await setCustomersArchived(sel.map((c) => c.id), anyActive);
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
        <CustomerFormClient
          key={modal.mode === "edit" ? modal.customer.id : "create"}
          open
          onOpenChange={(o) => !o && closeModal()}
          onSaved={onSaved}
          mode={modal.mode}
          customerId={modal.mode === "edit" ? modal.customer.id : undefined}
          customerName={modal.mode === "edit" ? modal.customer.name : ""}
          customerCode={modal.mode === "edit" ? (modal.customer.code ?? "") : ""}
          initial={
            modal.mode === "edit"
              ? {
                  name: modal.customer.name,
                  phone: modal.customer.phone ?? "",
                  contactPerson: modal.customer.contactPerson ?? "",
                  email: modal.customer.email ?? "",
                  location: modal.customer.location ?? "",
                  creditLimit: modal.customer.creditLimit,
                  notes: modal.customer.notes ?? "",
                  archived: modal.customer.archived,
                }
              : {
                  name: "",
                  phone: "",
                  contactPerson: "",
                  email: "",
                  location: "",
                  creditLimit: 0,
                  notes: "",
                  archived: false,
                }
          }
        />
      )}
    </>
  );
}
