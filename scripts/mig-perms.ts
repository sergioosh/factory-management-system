import "dotenv/config";
import { count, eq, notInArray } from "drizzle-orm";
import { db, pool } from "../src/db/index";
import { roles, users } from "../src/db/schema";
import { ROLE_DEFAULTS, normalizeKeys } from "../src/lib/permissions";

// ---- Legacy shape (pre-migration): per-module booleans ----
type LegacyModulePerms = { view?: boolean; create?: boolean; edit?: boolean; approve?: boolean };
type LegacyPermissionMap = Partial<Record<string, LegacyModulePerms>>;

/**
 * Best-effort forward mapping from the old per-module PermissionMap shape to the new
 * granular key set. This is inherently lossy (the old shape can't distinguish, e.g.,
 * "can edit sales orders" from "can reverse sales orders" — deriveModulePerms() collapses
 * several granular keys into one boolean). We resolve that by picking, for each set
 * boolean, the *union* of granular keys that could have produced it — so a role that
 * re-derives back through deriveModulePerms() ends up with at least the same coarse
 * access it had before, never less. Never grants MORE than what re-deriving would show,
 * so it's an equivalent (not expanded) starting point an admin can review in the Roles UI.
 */
function mapModule(module: string, p: LegacyModulePerms): string[] {
  const out: string[] = [];
  const on = (...ks: string[]) => out.push(...ks);
  switch (module) {
    case "masters":
      if (p.view) on("master.bom.view", "master.customer.view", "master.material.view", "master.product.view", "master.supplier.view");
      if (p.create || p.edit)
        on("master.bom.manage", "master.customer.manage", "master.material.manage", "master.product.manage", "master.supplier.manage");
      break;
    case "orders":
      if (p.view) on("sales_order.view");
      if (p.create) on("sales_order.create");
      if (p.edit) on("sales_order.manage", "sales_order.cancel");
      if (p.approve) on("sales_order.advance");
      break;
    case "sales":
      if (p.view) on("sale.view", "payment.view");
      if (p.create) on("sale.create", "sale.post", "payment.create", "payment.post");
      if (p.edit) on("sale.reverse", "payment.reverse");
      break;
    case "purchasing":
      if (p.view) on("purchase.view", "grn.view");
      if (p.create) on("purchase.create", "purchase.post", "grn.create", "grn.post");
      if (p.edit) on("purchase.reverse", "grn.reverse");
      if (p.approve) on("approval.decide", "approval.view");
      break;
    case "production":
      if (p.view) on("production.view");
      if (p.create) on("production.create");
      if (p.edit) on("production.post", "production.reverse", "production.cancel");
      break;
    case "inventory":
      if (p.view) on("inventory.view");
      if (p.create) on("inventory.adjust", "inventory.count");
      if (p.edit) on("inventory.adjust");
      if (p.approve) on("inventory.count", "approval.decide", "approval.view");
      break;
    case "reports":
      if (p.view) on("report.financial.view", "report.operational.view");
      break;
    case "admin":
      if (p.view) on("audit.view");
      if (p.create) on("admin.user.manage", "admin.role.manage");
      if (p.edit) on("admin.user.manage", "admin.role.manage", "admin.setting.manage");
      break;
  }
  return out;
}

function convertLegacyMap(raw: unknown): string[] | null {
  if (Array.isArray(raw)) return null; // already granular (or empty) — nothing to convert
  if (raw == null || typeof raw !== "object") return []; // junk — reset to empty, safe default
  const legacy = raw as LegacyPermissionMap;
  const set = new Set<string>();
  for (const [module, perms] of Object.entries(legacy)) {
    if (!perms) continue;
    for (const k of mapModule(module, perms)) set.add(k);
  }
  return [...set];
}

async function main() {
  // Upsert the new granular role set for the 5 built-in roles.
  for (const r of ROLE_DEFAULTS) {
    await db
      .insert(roles)
      .values({ name: r.name, isSystem: r.isSystem, permissions: r.keys })
      .onConflictDoUpdate({ target: roles.name, set: { permissions: r.keys, isSystem: r.isSystem } });
    console.log("upserted", r.name, `(${r.keys.length} perms)`);
  }

  // Everything else is a custom role from before the granular migration (or created since).
  const keep = ROLE_DEFAULTS.map((r) => r.name);
  const others = await db.select().from(roles).where(notInArray(roles.name, keep));

  for (const o of others) {
    const [{ n }] = await db.select({ n: count() }).from(users).where(eq(users.roleId, o.id));
    const converted = convertLegacyMap(o.permissions);

    if (converted === null) {
      // Already a valid granular array — but scrub any stale/unknown keys defensively.
      const clean = normalizeKeys(o.permissions);
      if (clean.length !== (o.permissions as string[]).length) {
        await db.update(roles).set({ permissions: clean }).where(eq(roles.id, o.id));
        console.log("cleaned stale keys on", o.name, `(${o.permissions?.length ?? 0} -> ${clean.length})`);
      } else {
        console.log("ok (already granular)", o.name);
      }
      continue;
    }

    if (n === 0) {
      // No one depends on this role's exact grants — safe to just remove it.
      await db.delete(roles).where(eq(roles.id, o.id));
      console.log("deleted unused legacy role", o.name);
      continue;
    }

    // Has users: convert in place instead of leaving it silently broken.
    await db.update(roles).set({ permissions: converted }).where(eq(roles.id, o.id));
    console.log(
      "converted legacy role",
      o.name,
      `(${n} user${n === 1 ? "" : "s"}) -> ${converted.length} granular perms — review in Roles & Permissions`,
    );
  }

  console.log("done");
}

main().then(() => pool.end());
