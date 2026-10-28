"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Field, Select, PasswordInput } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import { createUser, updateUser } from "./actions";

export type RoleOption = { id: number; name: string };

type Initial = { id: string; name: string; roleId: number | null; active: boolean };

export function UserFormClient({
  open,
  onOpenChange,
  onSaved,
  mode,
  roleOptions,
  currentUserId,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  mode: "create" | "edit";
  roleOptions: RoleOption[];
  currentUserId: string;
  initial?: Initial;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState(initial?.roleId ?? roleOptions[0]?.id ?? 0);
  const [active, setActive] = useState(initial?.active ?? true);
  const [newPassword, setNewPassword] = useState("");
  const [busy, startTransition] = useTransition();

  const isSelf = mode === "edit" && initial?.id === currentUserId;

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setEmail("");
    setPassword("");
    setRoleId(initial?.roleId ?? roleOptions[0]?.id ?? 0);
    setActive(initial?.active ?? true);
    setNewPassword("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const canSubmit =
    name.trim().length > 0 &&
    !!roleId &&
    (mode === "edit" || (email.trim().length > 0 && password.length >= 8));

  function submit() {
    startTransition(async () => {
      const res =
        mode === "edit"
          ? await updateUser({
              id: initial!.id,
              name,
              roleId,
              active,
              newPassword: newPassword.trim() || undefined,
            })
          : await createUser({
              name,
              email: email.trim(),
              password,
              roleId,
            });
      if (!res.ok) return void toast.error(res.error);
      toast.success(mode === "create" ? "User added" : "User updated");
      onSaved();
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "New user" : `Edit ${initial?.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !canSubmit}>
            {busy ? "Saving…" : mode === "create" ? "Add user" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        {mode === "create" && (
          <>
            <Field label="Email" required hint="Used to sign in — cannot be changed later.">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" required hint="Share this with the user; they can change it after signing in.">
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
              />
            </Field>
          </>
        )}
        <Field label="Role" required hint="Controls what this user can see and do.">
          <Select value={roleId || ""} onChange={(e) => setRoleId(Number(e.target.value))}>
            <option value="" disabled>
              Select role
            </option>
            {roleOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        {mode === "edit" && (
          <>
            <Field label="Reset password" hint="Leave blank to keep the current password.">
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Leave blank to keep current"
              />
            </Field>
            <Checkbox checked={active} onChange={setActive} disabled={isSelf} label="Active — inactive users cannot sign in" />
            {isSelf && <p className="text-[12px] text-ink-faint">You cannot disable your own account.</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
