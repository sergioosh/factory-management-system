"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Buildings2, ArrowRight2 } from "iconsax-reactjs";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input, Field, PasswordInput } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await authClient.signIn.email({ email, password });
    if (res.error) {
      setError(res.error.message ?? "Sign in failed");
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-surface">
      {/* form side */}
      <div className="flex flex-1 items-center justify-center px-6">
        <form onSubmit={submit} className="w-full max-w-[340px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white">
              <Buildings2 size={20} variant="Bulk" />
            </span>
            <span className="text-[16px] font-semibold tracking-tight">Factory</span>
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight">Sign in</h1>
          <p className="mb-7 mt-1 text-[13px] text-ink-soft">Use your work account</p>
          <div className="space-y-4">
            <Field label="Email" required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                autoComplete="email"
                required
              />
            </Field>
            <Field label="Password" required>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            {error && <p className="text-[12.5px] text-danger">{error}</p>}
            <Button type="submit" disabled={busy} className="h-9.5 w-full">
              {busy ? "Signing in…" : "Sign in"}
              {!busy && <ArrowRight2 size={15} />}
            </Button>
          </div>
          <p className="mt-8 text-[12px] text-ink-faint">
            Access is managed by your administrator.
          </p>
        </form>
      </div>

      {/* brand side */}
      <div className="relative hidden flex-1 overflow-hidden bg-side lg:flex">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-16 h-[420px] w-[420px] rounded-full bg-black/10" />
        <div className="relative flex flex-1 flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white backdrop-blur">
              <Buildings2 size={22} variant="Bulk" />
            </span>
            <span className="text-[17px] font-semibold tracking-tight text-white">Factory</span>
          </div>
          <div>
            <p className="max-w-sm text-[24px] font-medium leading-snug tracking-tight text-white">
              One flow from order to delivery.
            </p>
            <p className="num mt-5 text-[12.5px] tracking-wide text-white/60">
              ORDER → MATERIALS → PURCHASE → PRODUCTION → INVOICE
            </p>
          </div>
          <p className="text-[12px] text-white/40">Kampala, Uganda</p>
        </div>
      </div>
    </div>
  );
}
