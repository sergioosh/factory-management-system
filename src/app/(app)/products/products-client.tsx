"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Add } from "iconsax-reactjs";
import type { products, bomItems } from "@/db/schema";
import { fmtMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";
import type { Option } from "@/components/ui/search-select";
import { setProductArchived, setProductsArchived } from "./actions";
import { ProductFormClient } from "./product-form-client";

type Product = typeof products.$inferSelect;
type BomItem = typeof bomItems.$inferSelect;
type ModalState = { mode: "create" } | { mode: "edit"; product: Product } | null;

export function ProductsClient({
  rows,
  bom,
  materialOptions,
  canCreate,
  canEdit,
}: {
  rows: Product[];
  bom: BomItem[];
  materialOptions: Option[];
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalState>(null);

  const filterDefs: FilterDef<Product>[] = [
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
      label: "UOM",
      options: [
        { value: "CTNS", label: "CTNS" },
        { value: "KGS", label: "KGS" },
        { value: "PCS", label: "PCS" },
        { value: "BUNDLE", label: "BUNDLE" },
      ],
      getValue: (r) => r.unit,
    },
  ];

  const bomCount = (id: number) => bom.filter((b) => b.productId === id).length;

  function toggleArchived(r: Product) {
    startTransition(async () => {
      const res = await setProductArchived(r.id, !r.archived);
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

  const columns: Column<Product>[] = [
    { key: "code", label: "Code", className: "num w-20", sortValue: (r) => r.code },
    { key: "name", label: "Name", sortValue: (r) => r.name },
    { key: "unit", label: "UOM", className: "w-16 text-ink-soft" },
    {
      key: "piecesPerCarton",
      label: "PCS/CTN",
      numeric: true,
      sortValue: (r) => r.piecesPerCarton ?? 0,
      render: (r) => (r.piecesPerCarton != null ? r.piecesPerCarton : "—"),
    },
    {
      key: "sellingPrice",
      label: "Selling price (UGX)",
      numeric: true,
      sortValue: (r) => r.sellingPrice,
      render: (r) => fmtMoney(r.sellingPrice),
    },
    {
      key: "bomLines",
      label: "BOM",
      numeric: true,
      sortValue: (r) => bomCount(r.id),
      render: (r) => bomCount(r.id),
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
              onClick={() => setModal({ mode: "edit", product: r })}
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
        title="Finished Products"
        sub={`${rows.filter((r) => !r.archived).length} products`}
        actions={
          canCreate && (
            <Button onClick={() => setModal({ mode: "create" })}>
              <Add size={16} /> Add product
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchKeys={["code", "name"]}
        searchPlaceholder="Search products"
        onRowClick={canEdit ? (r) => setModal({ mode: "edit", product: r }) : undefined}
        filters={filterDefs}
        exportName="products"
        exportTitle="Products"
        selectable={canEdit}
        bulkActions={(sel, clear) => {
          const anyActive = sel.some((p) => !p.archived);
          return (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                startTransition(async () => {
                  const res = await setProductsArchived(sel.map((p) => p.id), anyActive);
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
        <ProductFormClient
          key={modal.mode === "edit" ? modal.product.id : "create"}
          open
          onOpenChange={(o) => !o && closeModal()}
          onSaved={onSaved}
          mode={modal.mode}
          productId={modal.mode === "edit" ? modal.product.id : undefined}
          productCode={modal.mode === "edit" ? modal.product.code : ""}
          materialOptions={materialOptions}
          initial={
            modal.mode === "edit"
              ? {
                  name: modal.product.name,
                  unit: modal.product.unit,
                  piecesPerCarton: modal.product.piecesPerCarton,
                  sellingPrice: modal.product.sellingPrice,
                  archived: modal.product.archived,
                }
              : { name: "", unit: "CTNS", piecesPerCarton: null, sellingPrice: 0, archived: false }
          }
          initialBom={
            modal.mode === "edit"
              ? bom
                  .filter((b) => b.productId === modal.product.id)
                  .map((b) => ({ materialId: b.materialId, qtyPerUnit: b.qtyPerUnit }))
              : []
          }
        />
      )}
    </>
  );
}
