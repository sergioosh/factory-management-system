"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Add } from "iconsax-reactjs";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";
import { UserFormClient, type RoleOption } from "./user-form-client";

type UserRow = {
  id: string;
  name: string;
  email: string;
  roleId: number | null;
  roleName: string | null;
  active: boolean;
  createdAt: Date;
};

type ModalState = { mode: "create" } | { mode: "edit"; user: UserRow } | null;

export function UsersClient({
  rows,
  roleOptions,
  currentUserId,
  canCreate,
  canEdit,
}: {
  rows: UserRow[];
  roleOptions: RoleOption[];
  currentUserId: string;
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);

  const filterDefs: FilterDef<UserRow>[] = useMemo(
    () => [
      {
        key: "role",
        label: "Role",
        options: roleOptions.map((r) => ({ value: r.name, label: r.name })),
        getValue: (r) => r.roleName,
      },
      {
        key: "status",
        label: "Status",
        options: [
          { value: "active", label: "Active" },
          { value: "disabled", label: "Disabled" },
        ],
        getValue: (r) => (r.active ? "active" : "disabled"),
      },
    ],
    [roleOptions],
  );

  function closeModal() {
    setModal(null);
  }

  function onSaved() {
    closeModal();
    router.refresh();
  }

  const columns: Column<UserRow>[] = [
    { key: "name", label: "Name", sortValue: (r) => r.name },
    { key: "email", label: "Email", className: "text-ink-soft" },
    { key: "roleName", label: "Role", render: (r) => r.roleName ?? "—" },
    {
      key: "active",
      label: "Status",
      sortValue: (r) => (r.active ? 1 : 0),
      render: (r) => <Badge tone={r.active ? "ok" : "danger"}>{r.active ? "active" : "disabled"}</Badge>,
    },
    {
      key: "createdAt",
      label: "Created",
      className: "text-ink-soft",
      sortValue: (r) => r.createdAt.getTime(),
      render: (r) => fmtDate(r.createdAt),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        sub={`${rows.filter((r) => r.active).length} active`}
        actions={
          canCreate && (
            <Button onClick={() => setModal({ mode: "create" })}>
              <Add size={16} /> Add user
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchKeys={["name", "email", "roleName"]}
        searchPlaceholder="Search users"
        onRowClick={canEdit ? (r) => setModal({ mode: "edit", user: r }) : undefined}
        filters={filterDefs}
        exportName="users"
        exportTitle="Users"
      />

      {modal && (
        <UserFormClient
          key={modal.mode === "edit" ? modal.user.id : "create"}
          open
          onOpenChange={(o) => !o && closeModal()}
          onSaved={onSaved}
          mode={modal.mode}
          roleOptions={roleOptions}
          currentUserId={currentUserId}
          initial={
            modal.mode === "edit"
              ? {
                  id: modal.user.id,
                  name: modal.user.name,
                  roleId: modal.user.roleId,
                  active: modal.user.active,
                }
              : undefined
          }
        />
      )}
    </>
  );
}
