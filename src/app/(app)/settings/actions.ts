"use server";

import { z } from "zod";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { requirePerm } from "@/lib/session";
import { act } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { notifyChange } from "@/lib/notify";

const settingsSchema = z.object({
  company_name: z.string().trim(),
  company_address: z.string().trim(),
  company_phone: z.string().trim(),
  theme_accent: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Accent must be a hex color like #16794c"),
});

export async function saveSettings(input: z.infer<typeof settingsSchema>) {
  return act(async () => {
    const s = await requirePerm("admin", "edit");
    const data = settingsSchema.parse(input);
    for (const [key, value] of Object.entries(data)) {
      await db
        .insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } });
    }
    await writeAudit({ userId: s.user.id, action: "update", entity: "settings", detail: data });
    await notifyChange("admin");
    revalidatePath("/settings");
  });
}

const RESET_KEY = process.env.RESET_SECURITY_KEY ?? "7x$K!m9_";

/**
 * Wipes every transaction and restores opening stock. Masters, customers,
 * suppliers, users, settings and the audit log are kept.
 */
export async function resetSystemData(key: string) {
  return act(async () => {
    const s = await requirePerm("admin", "edit");
    if (key !== RESET_KEY) throw new Error("Wrong security key");

    await db.transaction(async (tx) => {
      const tables = [
        "payments", "invoice_items", "invoices",
        "grn_items", "goods_received", "purchase_items", "purchases",
        "purchase_request_items", "purchase_requests",
        "production_consumption", "production_runs",
        "sales_order_items", "sales_orders",
        "adjustment_items", "adjustments", "stock_count_items", "stock_counts",
      ];
      for (const t of tables) await tx.execute(sql.raw(`DELETE FROM ${t}`));
      await tx.execute(sql`DELETE FROM stock_ledger WHERE txn_type <> 'opening'`);
      await tx.execute(sql`DELETE FROM lots WHERE source_type <> 'opening'`);
      await tx.execute(sql`UPDATE lots SET remaining_qty = initial_qty`);
      await tx.execute(sql`
        UPDATE raw_materials SET current_stock = coalesce(
          (SELECT l.initial_qty FROM lots l
           WHERE l.item_type = 'rm' AND l.item_id = raw_materials.id AND l.source_type = 'opening'),
          0)`);
      await tx.execute(sql`UPDATE products SET current_stock = 0`);
      await tx.execute(sql`UPDATE doc_counters SET value = 0`);
      await writeAudit({ userId: s.user.id, action: "reset_system_data", entity: "system" }, tx);
    });

    await notifyChange(
      "stock", "orders", "purchases", "grn", "production", "sales",
      "adjustments", "counts", "masters",
    );
    revalidatePath("/", "layout");
  });
}
