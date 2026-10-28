"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Add, ArrowRight2, Trash } from "iconsax-reactjs";
import { fmtQty } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, NumberInput, Field, Select } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchSelect, type Option } from "@/components/ui/search-select";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Modal } from "@/components/ui/modal";
import { saveProduct, setProductArchived, suggestProductCode } from "./actions";

type BomLine = { materialId: number | null; qtyPerUnit: number };

type Initial = {
  name: string;
  unit: string;
  piecesPerCarton: number | null;
  sellingPrice: number;
  archived: boolean;
};

export function ProductFormClient({
  open,
  onOpenChange,
  onSaved,
  mode,
  productId,
  productCode,
  initial,
  materialOptions,
  initialBom,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  mode: "create" | "edit";
  productId?: number;
  productCode: string;
  initial: Initial;
  materialOptions: Option[];
  initialBom: BomLine[];
}) {
  const [code, setCode] = useState(productCode);
  const [name, setName] = useState(initial.name);
  const [unit, setUnit] = useState(initial.unit);
  const [piecesPerCarton, setPiecesPerCarton] = useState(initial.piecesPerCarton ?? 0);
  const [sellingPrice, setSellingPrice] = useState(initial.sellingPrice);
  const [active, setActive] = useState(!initial.archived);
  const [lines, setLines] = useState<BomLine[]>(initialBom);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [loadingCode, setLoadingCode] = useState(mode === "create");
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setName(initial.name);
    setUnit(initial.unit);
    setPiecesPerCarton(initial.piecesPerCarton ?? 0);
    setSellingPrice(initial.sellingPrice);
    setActive(!initial.archived);
    setLines(initialBom);
    if (mode === "create") {
      setCode(productCode);
      setLoadingCode(true);
      suggestProductCode().then((res) => {
        if (res.ok) setCode(res.data);
        setLoadingCode(false);
      });
    } else {
      setCode(productCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, productId]);

  // BOM lines are only editable at create time (see submit()) — an edit save must never
  // block on stale recipe rows it isn't even sending.
  const linesValid = mode === "edit" || lines.every((l) => l.materialId != null && l.qtyPerUnit > 0);
  const canSubmit = code.trim().length > 0 && name.trim().length > 0 && linesValid && !loadingCode;

  function submit() {
    startTransition(async () => {
      const res = await saveProduct({
        id: productId,
        code: mode === "create" ? code.trim().toUpperCase() : undefined,
        name: name.trim(),
        unit,
        piecesPerCarton: piecesPerCarton > 0 ? piecesPerCarton : undefined,
        sellingPrice,
        archived: !active,
        // Only send an initial recipe on create — an edit save must never touch bom_items,
        // that would silently overwrite whatever the versioned BOM editor has since done.
        bom:
          mode === "create"
            ? lines.map((l) => ({ materialId: l.materialId!, qtyPerUnit: l.qtyPerUnit }))
            : undefined,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(mode === "create" ? "Product created" : "Product updated");
      onSaved();
    });
  }

  function archive() {
    startTransition(async () => {
      const res = await setProductArchived(productId!, !initial.archived);
      if (!res.ok) return void toast.error(res.error);
      toast.success(initial.archived ? "Product restored" : "Product archived");
      onSaved();
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "New finished product" : `Edit ${productCode}`}
      size="lg"
      footerLeft={
        mode === "edit" && (
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmArchive(true)}>
            {initial.archived ? "Restore product" : "Archive product"}
          </Button>
        )
      }
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !canSubmit}>
            {busy ? "Saving…" : mode === "create" ? "Create product" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Code"
              required
              hint={mode === "create" ? "Uppercased automatically (e.g. FG001)" : "Code cannot be changed after creation."}
            >
              <Input
                value={loadingCode ? "…" : code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                disabled={mode === "edit" || loadingCode}
                autoFocus={mode === "create"}
                className="num"
              />
            </Field>
            <Field label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={mode === "edit"} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="UOM" required hint="BOM quantities are per 1 of this UOM.">
              <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="CTNS">CTNS — Cartons</option>
                <option value="KGS">KGS — Kilograms</option>
                <option value="PCS">PCS — Pieces</option>
                <option value="BUNDLE">BUNDLE — Bundle</option>
              </Select>
            </Field>
            <Field label="Pieces per carton" hint="Optional.">
              <NumberInput
                step={1}
                value={piecesPerCarton}
                onChange={setPiecesPerCarton}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Selling price" required hint="Default rate used on new orders and invoices.">
              <NumberInput
                className="num"
                value={sellingPrice}
                onChange={setSellingPrice}
              />
            </Field>
          </div>

          <Checkbox checked={active} onChange={setActive} label="Active — shows up in order and production pickers" />
        </div>

        <div className="border-t border-line pt-4">
          {mode === "create" ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[13px] font-semibold">Bill of materials</h2>
                  <p className="text-[11.5px] text-ink-faint">Material quantity consumed per 1 unit of UOM.</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setLines((ls) => [...ls, { materialId: null, qtyPerUnit: 0 }])}
                >
                  <Add size={14} /> Add material
                </Button>
              </div>

              {lines.length === 0 && (
                <p className="mt-3 rounded-lg border border-dashed border-line px-3 py-3 text-center text-[12px] text-ink-faint">
                  No materials
                </p>
              )}
              <div className="mt-3 space-y-2">
                {lines.map((l, i) => {
                  const incomplete = l.materialId == null || l.qtyPerUnit <= 0;
                  return (
                    <div key={i}>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <SearchSelect
                            options={materialOptions}
                            value={l.materialId}
                            onChange={(v) =>
                              setLines((ls) => ls.map((x, j) => (j === i ? { ...x, materialId: Number(v) } : x)))
                            }
                            placeholder="Material"
                          />
                        </div>
                        <NumberInput
                          className="num w-28"
                          placeholder="Qty/unit"
                          value={l.qtyPerUnit}
                          onChange={(n) =>
                            setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qtyPerUnit: n } : x)))
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                          className="rounded-md p-1.5 text-ink-faint hover:text-danger cursor-pointer"
                        >
                          <Trash size={15} />
                        </button>
                      </div>
                      {incomplete && (
                        <p className="mt-1 text-[11px] text-warn">Pick a material and a quantity above 0.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[13px] font-semibold">Bill of materials</h2>
                  <p className="text-[11.5px] text-ink-faint">
                    Recipe changes are versioned — edit them on the BOM page.
                  </p>
                </div>
                <Link
                  href={`/bom/${productId}`}
                  className="inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline"
                >
                  Edit BOM <ArrowRight2 size={13} />
                </Link>
              </div>

              {lines.length === 0 ? (
                <p className="mt-3 rounded-lg border border-dashed border-line px-3 py-3 text-center text-[12px] text-ink-faint">
                  No recipe set yet
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
                  {lines.map((l, i) => {
                    const m = materialOptions.find((o) => o.value === l.materialId);
                    return (
                      <li key={i} className="flex items-center justify-between px-3 py-1.5 text-[12.5px]">
                        <span>{m?.label ?? "—"}</span>
                        <span className="num text-ink-soft">{fmtQty(l.qtyPerUnit)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      {mode === "edit" && (
        <ConfirmDialog
          open={confirmArchive}
          onOpenChange={setConfirmArchive}
          title={initial.archived ? `Restore ${productCode}?` : `Archive ${productCode}?`}
          body={
            initial.archived
              ? "The product becomes available again in pickers and orders."
              : "The product is hidden from pickers but existing records are kept."
          }
          confirmLabel={initial.archived ? "Restore" : "Archive"}
          danger={!initial.archived}
          busy={busy}
          onConfirm={archive}
        />
      )}
    </Modal>
  );
}
