"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import { Add, Lock1 } from "iconsax-reactjs";
import { PERMISSIONS, SECTIONS, ADMIN_ROLE } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/confirm";
import { saveRolePerms, createRole, renameRole, deleteRole } from "./actions";

type Role = { id: number; name: string; permissions: string[]; isSystem: boolean; usersCount: number };

const clone = (m: Map<number, Set<string>>) => new Map([...m].map(([k, v]) => [k, new Set(v)]));

export function RolesClient({
  roles,
  canManage,
  canCreate,
}: {
  roles: Role[];
  canManage: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const server = useMemo(
    () => new Map(roles.map((r) => [r.id, new Set(r.permissions)])),
    [roles],
  );
  const [draft, setDraft] = useState<Map<number, Set<string>>>(() => clone(server));
  const [busy, startTransition] = useTransition();
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<Role | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleting, setDeleting] = useState<Role | null>(null);

  useEffect(() => {
    setDraft(clone(server));
  }, [server]);

  const isAdmin = (r: Role) => r.name === ADMIN_ROLE;
  const setFor = (id: number) => draft.get(id) ?? new Set<string>();

  const dirtyIds = useMemo(() => {
    const ids: number[] = [];
    for (const r of roles) {
      if (isAdmin(r)) continue;
      const a = server.get(r.id) ?? new Set();
      const b = setFor(r.id);
      if (a.size !== b.size || [...b].some((k) => !a.has(k))) ids.push(r.id);
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, server, roles]);

  function toggle(roleId: number, key: string) {
    setDraft((prev) => {
      const next = clone(prev);
      const s = next.get(roleId) ?? new Set<string>();
      if (s.has(key)) s.delete(key);
      else s.add(key);
      next.set(roleId, s);
      return next;
    });
  }

  function toggleSection(roleId: number, sectionId: string, sectionKeys: string[]) {
    setDraft((prev) => {
      const next = clone(prev);
      const s = next.get(roleId) ?? new Set<string>();
      const allOn = sectionKeys.every((k) => s.has(k));
      if (allOn) sectionKeys.forEach((k) => s.delete(k));
      else sectionKeys.forEach((k) => s.add(k));
      next.set(roleId, s);
      return next;
    });
  }

  function save() {
    const updates = dirtyIds.map((id) => ({ id, keys: [...setFor(id)] }));
    startTransition(async () => {
      const res = await saveRolePerms({ updates });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Permissions saved");
      router.refresh();
    });
  }

  function submitNew() {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await createRole(name);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Role created");
      setNewOpen(false);
      setNewName("");
      router.refresh();
    });
  }

  function submitRename() {
    if (!renaming) return;
    const name = renameName.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await renameRole({ id: renaming.id, name });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Role renamed");
      setRenaming(null);
      router.refresh();
    });
  }

  function doDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const res = await deleteRole(deleting.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Role deleted");
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        sub={
          <>
            Tick the boxes to grant. Untick to revoke. Changes highlight in amber — click{" "}
            <span className="font-medium text-ink">Save changes</span> to persist.
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            {canCreate && (
              <Button variant="secondary" onClick={() => setNewOpen(true)}>
                <Add size={16} /> New role
              </Button>
            )}
            {canManage && (
              <Button onClick={save} disabled={busy || dirtyIds.length === 0}>
                {busy ? "Saving…" : `Save changes${dirtyIds.length ? ` (${dirtyIds.length})` : ""}`}
              </Button>
            )}
          </div>
        }
      />

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky left-0 z-10 bg-surface px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Permission
              </th>
              {roles.map((r) => (
                <th key={r.id} className="min-w-[130px] px-3 py-2.5 text-center align-top">
                  <div className="flex items-center justify-center gap-1 text-[13px] font-semibold">
                    {r.name}
                    {isAdmin(r) && <Lock1 size={12} className="text-ink-faint" />}
                  </div>
                  <div className="text-[11px] font-normal text-ink-faint">
                    {r.usersCount} user{r.usersCount === 1 ? "" : "s"}
                  </div>
                  {!isAdmin(r) && canManage && (
                    <div className="mt-0.5 flex items-center justify-center gap-2 text-[11px]">
                      <button
                        type="button"
                        title={`Rename ${r.name}`}
                        onClick={() => {
                          setRenaming(r);
                          setRenameName(r.name);
                        }}
                        className="text-accent hover:underline cursor-pointer"
                      >
                        rename
                      </button>
                      <button
                        type="button"
                        title={`Delete ${r.name}`}
                        onClick={() => setDeleting(r)}
                        className="text-danger hover:underline cursor-pointer"
                      >
                        delete
                      </button>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map((section) => {
              const sectionKeys = PERMISSIONS.filter((p) => p.section === section.id).map((p) => p.key);
              return (
                <SectionBlock
                  key={section.id}
                  label={section.label}
                  perms={PERMISSIONS.filter((p) => p.section === section.id)}
                  sectionKeys={sectionKeys}
                  roles={roles}
                  isAdmin={isAdmin}
                  canManage={canManage}
                  setFor={setFor}
                  server={server}
                  toggle={toggle}
                  toggleSection={toggleSection}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 max-w-3xl text-[12px] text-ink-faint">
        The <span className="font-medium">Admin</span> role bypasses every permission check via a global
        gate, even if you untick boxes here. Other roles strictly follow the matrix above.
      </p>

      {/* New role */}
      <NameDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        title="New role"
        value={newName}
        onValue={setNewName}
        onSubmit={submitNew}
        submitLabel="Create role"
        busy={busy}
      />
      {/* Rename */}
      <NameDialog
        open={renaming != null}
        onOpenChange={(o) => !o && setRenaming(null)}
        title={`Rename ${renaming?.name ?? ""}`}
        value={renameName}
        onValue={setRenameName}
        onSubmit={submitRename}
        submitLabel="Save name"
        busy={busy}
      />

      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        body={
          deleting && deleting.usersCount > 0
            ? "This role has users assigned and cannot be deleted."
            : "This role and its permission grants will be removed."
        }
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={doDelete}
      />
    </>
  );
}

function SectionBlock({
  label,
  perms,
  sectionKeys,
  roles,
  isAdmin,
  canManage,
  setFor,
  server,
  toggle,
  toggleSection,
}: {
  label: string;
  perms: { key: string; label: string }[];
  sectionKeys: string[];
  roles: Role[];
  isAdmin: (r: Role) => boolean;
  canManage: boolean;
  setFor: (id: number) => Set<string>;
  server: Map<number, Set<string>>;
  toggle: (roleId: number, key: string) => void;
  toggleSection: (roleId: number, sectionId: string, sectionKeys: string[]) => void;
}) {
  return (
    <>
      <tr className="bg-bg/60">
        <td className="sticky left-0 z-10 bg-[color:var(--color-bg)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          {label}
        </td>
        {roles.map((r) => {
          const s = setFor(r.id);
          const granted = sectionKeys.filter((k) => s.has(k)).length;
          const all = granted === sectionKeys.length;
          const none = granted === 0;
          const admin = isAdmin(r);
          const text = admin || all ? "unselect all" : none ? "select all" : `${granted}/${sectionKeys.length}`;
          return (
            <td key={r.id} className="px-3 py-1.5 text-center">
              <button
                type="button"
                disabled={admin || !canManage}
                onClick={() => toggleSection(r.id, sectionKeys[0].split(".")[0], sectionKeys)}
                className={cn(
                  "text-[11px] text-ink-faint",
                  !admin && canManage && "hover:text-accent hover:underline cursor-pointer",
                )}
              >
                {text}
              </button>
            </td>
          );
        })}
      </tr>
      {perms.map((p) => (
        <tr key={p.key} className="border-b border-line last:border-0">
          <td className="sticky left-0 z-10 bg-surface px-4 py-2">
            <div className="num text-[11px] text-ink-faint">{p.key}</div>
            <div className="text-[12.5px]">{p.label}</div>
          </td>
          {roles.map((r) => {
            const admin = isAdmin(r);
            const on = admin || setFor(r.id).has(p.key);
            const changed = !admin && (server.get(r.id)?.has(p.key) ?? false) !== setFor(r.id).has(p.key);
            return (
              <td
                key={r.id}
                className={cn("px-3 py-2 text-center transition-colors", changed && "bg-accent-soft")}
              >
                <span className="inline-flex justify-center">
                  <Checkbox
                    checked={on}
                    disabled={admin || !canManage}
                    onChange={() => toggle(r.id, p.key)}
                  />
                </span>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function NameDialog({
  open,
  onOpenChange,
  title,
  value,
  onValue,
  onSubmit,
  submitLabel,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  value: string;
  onValue: (v: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  busy: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-5 shadow-xl">
          <Dialog.Title className="text-[15px] font-semibold">{title}</Dialog.Title>
          <div className="mt-4">
            <Input
              autoFocus
              placeholder="Role name"
              value={value}
              onChange={(e) => onValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={onSubmit} disabled={busy || !value.trim()}>
              {submitLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
