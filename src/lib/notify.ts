import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";

/** Paths each topic touches — revalidated on every mutation so cold navigations are always fresh. */
const TOPIC_PATHS: Record<string, string[]> = {
  stock: ["/", "/stock/materials", "/stock/products", "/ledger", "/lots", "/materials", "/products"],
  masters: ["/materials", "/products", "/suppliers", "/customers", "/bom"],
  orders: ["/", "/orders"],
  purchases: ["/purchase-requests", "/purchases", "/approvals"],
  grn: ["/grn", "/purchases"],
  production: ["/", "/production"],
  sales: ["/", "/sales", "/payments"],
  adjustments: ["/adjustments", "/approvals"],
  counts: ["/counts", "/approvals"],
  admin: ["/users", "/roles", "/audit", "/settings"],
};

const TOPIC_DYNAMIC: Record<string, string[]> = {
  orders: ["/orders/[id]"],
  production: ["/orders/[id]"],
  sales: ["/orders/[id]", "/sales/[id]/print"],
  purchases: ["/orders/[id]"],
  grn: ["/orders/[id]"],
  counts: ["/counts/[id]"],
  stock: ["/counts/[id]"],
};

/**
 * Broadcast changed topics to all connected clients (via Postgres NOTIFY → SSE)
 * and revalidate every path those topics affect.
 */
export async function notifyChange(...topics: string[]) {
  for (const t of topics) {
    for (const p of TOPIC_PATHS[t] ?? []) revalidatePath(p);
    for (const p of TOPIC_DYNAMIC[t] ?? []) revalidatePath(p, "page");
  }
  try {
    await db.execute(sql`SELECT pg_notify('app_events', ${JSON.stringify({ topics })})`);
  } catch {
    // realtime is best-effort; never fail the mutation over it
  }
}
