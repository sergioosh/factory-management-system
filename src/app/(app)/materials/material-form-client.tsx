"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, NumberInput, Field, Select } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Modal } from "@/components/ui/modal";
import { saveMaterial, setMaterialArchived, suggestMaterialCode } from "./actions";

type Initial = {
  name: string;
  unit: string;
  price: number;
  minStock: number;
  archived: boolean;
};

export function MaterialFormClient({
  open,
  onOpenChange,
  onSaved,
  mode,
  materialId,
  materialCode,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  mode: "create" | "edit";
  materialId?: number;
  materialCode: string;
  initial: Initial;
}) {
  const [code, setCode] = useState(materialCode);
  const [name, setName] = useState(initial.name);
  const [unit, setUnit] = useState(initial.unit);
  const [price, setPrice] = useState(initial.price);
  const [minStock, setMinStock] = useState(initial.minStock);
  const [openingStock, setOpeningStock] = useState(0);
  const [active, setActive] = useState(!initial.archived);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [loadingCode, setLoadingCode] = useState(mode === "create");
  const [busy, startTransition] = useTransition();

  // Re-seed local state whenever a fresh row is opened (create → suggest a code; edit → its values).
  useEffect(() => {
    if (!open) return;
    setName(initial.name);
    setUnit(initial.unit);
    setPrice(initial.price);
    setMinStock(initial.minStock);
    setOpeningStock(0);
    setActive(!initial.archived);
    if (mode === "create") {
      setCode(materialCode);
      setLoadingCode(true);
      suggestMaterialCode().then((res) => {
        if (res.ok) setCode(res.data);
        setLoadingCode(false);
      });
    } else {
      setCode(materialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, materialId]);

  const canSubmit = code.trim().length > 0 && name.trim().length > 0 && !loadingCode;

  function submit() {
    startTransition(async () => {
      const res = await saveMaterial({
        id: materialId,
        code: mode === "create" ? code.trim().toUpperCase() : undefined,
        name: name.trim(),
        unit,
        price,
        minStock,
        openingStock: mode === "create" && openingStock > 0 ? openingStock : undefined,
        archived: !active,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(mode === "create" ? "Material created" : "Material updated");
      onSaved();
    });
  }

  function archive() {
    startTransition(async () => {
      const res = await setMaterialArchived(materialId!, !initial.archived);
      if (!res.ok) return void toast.error(res.error);
      toast.success(initial.archived ? "Material restored" : "Material archived");
      onSaved();
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "New raw material" : `Edit ${materialCode}`}
      footerLeft={
        mode === "edit" && (
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmArchive(true)}>
            {initial.archived ? "Restore material" : "Archive material"}
          </Button>
        )
      }
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !canSubmit}>
            {busy ? "Saving…" : mode === "create" ? "Create material" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Code"
            required
            hint={mode === "create" ? "Uppercased automatically (e.g. RM001)" : "Code cannot be changed after creation."}
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
          <Field label="UOM" required hint="How this material is counted and stocked.">
            <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="KG">KG — Kilograms</option>
              <option value="PCS">PCS — Pieces</option>
              <option value="BUNDLE">BUNDLE — Bundle</option>
              <option value="LTR">LTR — Litres</option>
              <option value="ROLL">ROLL — Roll</option>
              <option value="METRES">METRES — Metres</option>
              <option value="CARTONS">CARTONS — Cartons</option>
            </Select>
          </Field>
          <Field label="Standard cost" hint="Per UOM. Used to value current stock on hand.">
            <NumberInput
              className="num"
              value={price}
              onChange={setPrice}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Reorder level" hint="Triggers a low-stock alert below this.">
            <NumberInput
              className="num"
              value={minStock}
              onChange={setMinStock}
            />
          </Field>
          {mode === "create" && (
            <Field label="Opening stock" hint="Used as the day-one ledger entry.">
              <NumberInput
                className="num"
                value={openingStock}
                onChange={setOpeningStock}
              />
            </Field>
          )}
        </div>

        <Checkbox checked={active} onChange={setActive} label="Active — available in new transactions" />

        {mode === "edit" && (
          <p className="text-[12px] text-ink-faint">
            Stock level changes go through Goods Received, Production or Adjustments — not here.
          </p>
        )}
      </div>

      {mode === "edit" && (
        <ConfirmDialog
          open={confirmArchive}
          onOpenChange={setConfirmArchive}
          title={initial.archived ? `Restore ${materialCode}?` : `Archive ${materialCode}?`}
          body={
            initial.archived
              ? "The material becomes available again in pickers and BOMs."
              : "The material is hidden from pickers but existing records are kept."
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
