import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { DEFAULT_ACCENT } from "@/lib/theme";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

const KEYS = ["company_name", "company_address", "company_phone", "theme_accent"] as const;

export default async function SettingsPage() {
  const session = await requireView("admin");
  const rows = await db.select().from(settings).where(inArray(settings.key, [...KEYS]));
  const values = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return (
    <SettingsClient
      initial={{
        company_name: values.company_name ?? "",
        company_address: values.company_address ?? "",
        company_phone: values.company_phone ?? "",
        theme_accent: values.theme_accent ?? DEFAULT_ACCENT,
      }}
      canEdit={can(session, "admin", "edit")}
    />
  );
}
