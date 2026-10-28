"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Field, Textarea, Select } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Modal } from "@/components/ui/modal";
import { saveSupplier, setSupplierArchived, suggestSupplierCode } from "./actions";

type Initial = {
  name: string;
  phone: string;
  contactPerson: string;
  email: string;
  location: string;
  currency: string;
  notes: string;
  archived: boolean;
};

export function SupplierFormClient({
  open,
  onOpenChange,
  onSaved,
  mode,
  supplierId,
  supplierName,
  supplierCode,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  mode: "create" | "edit";
  supplierId?: number;
  supplierName: string;
  supplierCode: string;
  initial: Initial;
}) {
  const [code, setCode] = useState(supplierCode);
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [contactPerson, setContactPerson] = useState(initial.contactPerson);
  const [email, setEmail] = useState(initial.email);
  const [location, setLocation] = useState(initial.location);
  const [currency, setCurrency] = useState(initial.currency);
  const [notes, setNotes] = useState(initial.notes);
  const [active, setActive] = useState(!initial.archived);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [loadingCode, setLoadingCode] = useState(mode === "create");
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setName(initial.name);
    setPhone(initial.phone);
    setContactPerson(initial.contactPerson);
    setEmail(initial.email);
    setLocation(initial.location);
    setCurrency(initial.currency);
    setNotes(initial.notes);
    setActive(!initial.archived);
    if (mode === "create") {
      setCode(supplierCode);
      setLoadingCode(true);
      suggestSupplierCode().then((res) => {
        if (res.ok) setCode(res.data);
        setLoadingCode(false);
      });
    } else {
      setCode(supplierCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, supplierId]);

  const canSubmit = code.trim().length > 0 && name.trim().length > 0 && !loadingCode;

  function submit() {
    startTransition(async () => {
      const res = await saveSupplier({
        id: supplierId,
        code: mode === "create" ? code.trim().toUpperCase() : undefined,
        name: name.trim(),
        phone,
        contactPerson,
        email,
        location,
        currency,
        notes,
        archived: !active,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(mode === "create" ? "Supplier created" : "Supplier updated");
      onSaved();
    });
  }

  function archive() {
    startTransition(async () => {
      const res = await setSupplierArchived(supplierId!, !initial.archived);
      if (!res.ok) return void toast.error(res.error);
      toast.success(initial.archived ? "Supplier restored" : "Supplier archived");
      onSaved();
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "New supplier" : `Edit ${supplierName}`}
      footerLeft={
        mode === "edit" && (
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmArchive(true)}>
            {initial.archived ? "Restore supplier" : "Archive supplier"}
          </Button>
        )
      }
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !canSubmit}>
            {busy ? "Saving…" : mode === "create" ? "Create supplier" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Code"
            required
            hint={mode === "create" ? "Uppercased (e.g. SUP001)" : "Code cannot be changed after creation."}
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
          <Field label="Contact person" hint="Who to reach for orders and deliveries.">
            <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
          </Field>
          <Field label="Phone" hint="Used on purchase orders.">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" hint="Optional.">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Currency" hint="Default purchase currency for this supplier.">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="">— None (UGX) —</option>
              <option value="UGX">UGX — Uganda Shilling</option>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="CNY">CNY — Chinese Yuan</option>
              <option value="KES">KES — Kenyan Shilling</option>
            </Select>
          </Field>
        </div>

        <Field label="Address" hint="Optional.">
          <Textarea value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>

        <Field label="Notes" hint="Optional — payment terms, delivery notes, anything worth remembering.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <Checkbox checked={active} onChange={setActive} label="Active — shows up in purchase order pickers" />
      </div>

      {mode === "edit" && (
        <ConfirmDialog
          open={confirmArchive}
          onOpenChange={setConfirmArchive}
          title={initial.archived ? `Restore ${supplierName}?` : `Archive ${supplierName}?`}
          body={
            initial.archived
              ? "The supplier becomes available again in pickers and orders."
              : "The supplier is hidden from pickers but existing records are kept."
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
