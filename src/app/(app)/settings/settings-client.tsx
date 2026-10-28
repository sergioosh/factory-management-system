"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { TickCircle, Warning2 } from "iconsax-reactjs";
import { cn } from "@/lib/cn";
import { ACCENT_PRESETS, accentShades, isHexColor } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input, Field, PasswordInput } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { saveSettings, resetSystemData } from "./actions";

type Values = {
  company_name: string;
  company_address: string;
  company_phone: string;
  theme_accent: string;
};

function applyAccent(hex: string) {
  const s = accentShades(hex);
  const root = document.documentElement.style;
  root.setProperty("--color-accent", s.accent);
  root.setProperty("--color-accent-dark", s.accentDark);
  root.setProperty("--color-accent-soft", s.accentSoft);
}

export function SettingsClient({ initial, canEdit }: { initial: Values; canEdit: boolean }) {
  const [form, setForm] = useState(initial);
  const [busy, startTransition] = useTransition();
  const saved = useRef(initial.theme_accent);

  // live preview while choosing; revert if the user leaves without saving
  useEffect(() => {
    if (isHexColor(form.theme_accent)) applyAccent(form.theme_accent);
    const savedNow = saved.current;
    return () => applyAccent(savedNow);
  }, [form.theme_accent]);

  function submit() {
    startTransition(async () => {
      const res = await saveSettings(form);
      if (!res.ok) return void toast.error(res.error);
      saved.current = form.theme_accent;
      toast.success("Settings saved");
    });
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid max-w-4xl items-start gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface">
          <header className="border-b border-line px-5 py-3">
            <h2 className="text-[13px] font-semibold">Company</h2>
            <p className="mt-0.5 text-[12px] text-ink-soft">Shown on printed invoices and GRNs</p>
          </header>
          <div className="space-y-3.5 p-5">
            <Field label="Company name">
              <Input
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Address">
              <Input
                value={form.company_address}
                onChange={(e) => setForm({ ...form, company_address: e.target.value })}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.company_phone}
                onChange={(e) => setForm({ ...form, company_phone: e.target.value })}
                disabled={!canEdit}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-surface">
          <header className="border-b border-line px-5 py-3">
            <h2 className="text-[13px] font-semibold">Theme</h2>
            <p className="mt-0.5 text-[12px] text-ink-soft">
              Accent color for everyone, previewed live
            </p>
          </header>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2.5">
              {ACCENT_PRESETS.map((p) => {
                const active = form.theme_accent.toLowerCase() === p.hex.toLowerCase();
                return (
                  <button
                    key={p.hex}
                    type="button"
                    title={p.name}
                    disabled={!canEdit}
                    onClick={() => setForm({ ...form, theme_accent: p.hex })}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full transition-transform cursor-pointer disabled:cursor-default",
                      active ? "scale-110 ring-2 ring-offset-2 ring-(--color-ink)" : "hover:scale-105",
                    )}
                    style={{ backgroundColor: p.hex }}
                  >
                    {active && <TickCircle size={16} variant="Bold" color="#fff" />}
                  </button>
                );
              })}
            </div>
            <Field label="Custom hex">
              <div className="flex items-center gap-2">
                <span
                  className="h-8 w-8 shrink-0 rounded-lg border border-line"
                  style={{
                    backgroundColor: isHexColor(form.theme_accent) ? form.theme_accent : "#fff",
                  }}
                />
                <Input
                  className="num w-32"
                  value={form.theme_accent}
                  onChange={(e) => setForm({ ...form, theme_accent: e.target.value })}
                  placeholder="#16794c"
                  disabled={!canEdit}
                />
              </div>
            </Field>
            <div className="rounded-lg border border-line p-3">
              <div className="flex items-center gap-2">
                <Button size="sm">Primary</Button>
                <Button size="sm" variant="secondary">Secondary</Button>
                <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11.5px] font-medium text-accent">
                  badge
                </span>
                <a className="text-[12.5px] text-accent hover:underline">Link</a>
              </div>
            </div>
          </div>
        </section>
      </div>
      {canEdit && (
        <div className="mt-4 flex max-w-4xl justify-end">
          <Button onClick={submit} disabled={busy || !isHexColor(form.theme_accent)}>
            {busy ? "Saving…" : "Save settings"}
          </Button>
        </div>
      )}
      {canEdit && <DangerZone />}
    </>
  );
}

function DangerZone() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [busy, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const res = await resetSystemData(key);
      if (!res.ok) return void toast.error(res.error);
      toast.success("System data reset — opening stock restored");
      setOpen(false);
      setKey("");
    });
  }

  return (
    <section className="mt-4 max-w-4xl rounded-xl border border-danger/30 bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-danger">
            <Warning2 size={15} /> Reset system data
          </h2>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            Deletes all orders, purchases, production, sales and stock movements, and restores
            opening stock. Masters, users and settings are kept. Cannot be undone.
          </p>
        </div>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Reset system data
        </Button>
      </div>

      <Dialog.Root open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <Dialog.Portal>
          <Dialog.Overlay className="sheet-overlay fixed inset-0 z-40 bg-black/25" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-5 shadow-xl outline-none">
            <Dialog.Title className="text-[14.5px] font-semibold text-danger">
              Reset all system data?
            </Dialog.Title>
            <Dialog.Description className="mt-1.5 text-[13px] text-ink-soft">
              Every transaction is permanently deleted and stock returns to opening levels. Enter
              the security key to proceed.
            </Dialog.Description>
            <div className="mt-4">
              <Field label="Security key" required>
                <PasswordInput
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  autoFocus
                  placeholder="Security key"
                />
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={confirm} disabled={busy || !key}>
                {busy ? "Resetting…" : "Reset everything"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
