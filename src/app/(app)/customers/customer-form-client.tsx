"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, NumberInput, Field, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Modal } from "@/components/ui/modal";
import { saveCustomer, setCustomerArchived, suggestCustomerCode } from "./actions";

type Initial = {
  name: string;
  phone: string;
  contactPerson: string;
  email: string;
  location: string;
  creditLimit: number;
  notes: string;
  archived: boolean;
};

export function CustomerFormClient({
  open,
  onOpenChange,
  onSaved,
  mode,
  customerId,
  customerName,
  customerCode,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  mode: "create" | "edit";
  customerId?: number;
  customerName: string;
  customerCode: string;
  initial: Initial;
}) {
  const [code, setCode] = useState(customerCode);
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [contactPerson, setContactPerson] = useState(initial.contactPerson);
  const [email, setEmail] = useState(initial.email);
  const [location, setLocation] = useState(initial.location);
  const [creditLimit, setCreditLimit] = useState(initial.creditLimit);
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
    setCreditLimit(initial.creditLimit);
    setNotes(initial.notes);
    setActive(!initial.archived);
    if (mode === "create") {
      setCode(customerCode);
      setLoadingCode(true);
      suggestCustomerCode().then((res) => {
        if (res.ok) setCode(res.data);
        setLoadingCode(false);
      });
    } else {
      setCode(customerCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, customerId]);

  const canSubmit = code.trim().length > 0 && name.trim().length > 0 && !loadingCode;

  function submit() {
    startTransition(async () => {
      const res = await saveCustomer({
        id: customerId,
        code: mode === "create" ? code.trim().toUpperCase() : undefined,
        name: name.trim(),
        phone,
        contactPerson,
        email,
        location,
        creditLimit,
        notes,
        archived: !active,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(mode === "create" ? "Customer created" : "Customer updated");
      onSaved();
    });
  }

  function archive() {
    startTransition(async () => {
      const res = await setCustomerArchived(customerId!, !initial.archived);
      if (!res.ok) return void toast.error(res.error);
      toast.success(initial.archived ? "Customer restored" : "Customer archived");
      onSaved();
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "New customer" : `Edit ${customerName}`}
      footerLeft={
        mode === "edit" && (
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmArchive(true)}>
            {initial.archived ? "Restore customer" : "Archive customer"}
          </Button>
        )
      }
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !canSubmit}>
            {busy ? "Saving…" : mode === "create" ? "Create customer" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Code"
            required
            hint={mode === "create" ? "Uppercased (e.g. CUS001 or WALKIN for cash)" : "Code cannot be changed after creation."}
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
          <Field label="Contact person" hint="Who to reach for orders and payment.">
            <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
          </Field>
          <Field label="Phone" hint="Used on invoices and delivery notes.">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" hint="Optional.">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Credit limit" hint="Warning shown on sale when exceeded (Phase 2).">
            <NumberInput
              className="num"
              value={creditLimit}
              onChange={setCreditLimit}
            />
          </Field>
        </div>

        <Field label="Address" hint="Optional.">
          <Textarea value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>

        <Field label="Notes" hint="Optional — credit terms, delivery notes, anything worth remembering.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <Checkbox checked={active} onChange={setActive} label="Active — shows up in sales order pickers" />
      </div>

      {mode === "edit" && (
        <ConfirmDialog
          open={confirmArchive}
          onOpenChange={setConfirmArchive}
          title={initial.archived ? `Restore ${customerName}?` : `Archive ${customerName}?`}
          body={
            initial.archived
              ? "The customer becomes available again in pickers and orders."
              : "The customer is hidden from pickers but existing records are kept."
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
