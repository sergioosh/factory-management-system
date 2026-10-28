import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "./index";
import {
  roles,
  users,
  customers,
  suppliers,
  products,
  rawMaterials,
  bomItems,
  docCounters,
  settings,
  lots,
  stockLedger,
} from "./schema";
import { ROLE_DEFAULTS } from "../lib/permissions";
import seedData from "./seed-data.json";

const COUNTERS = ["SO", "PR", "PO", "GRN", "PRD", "INV", "ADJ", "SC"];

async function main() {
  // Roles
  for (const r of ROLE_DEFAULTS) {
    await db
      .insert(roles)
      .values({ name: r.name, isSystem: r.isSystem, permissions: r.keys })
      .onConflictDoUpdate({ target: roles.name, set: { permissions: r.keys, isSystem: r.isSystem } });
  }
  const adminRole = (await db.select().from(roles).where(eq(roles.name, "Admin")))[0];

  // Counters + settings
  for (const key of COUNTERS) {
    await db.insert(docCounters).values({ key, value: 0 }).onConflictDoNothing();
  }
  const defaultSettings: Record<string, string> = {
    company_name: "Factory",
    company_address: "Kampala, Uganda",
    company_phone: "",
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db.insert(settings).values({ key, value }).onConflictDoNothing();
  }

  // Admin user via Better Auth (correct password hashing)
  const email = "admin@factory.local";
  const password = "admin1234";
  const existingUser = await db.select().from(users).where(eq(users.email, email));
  if (existingUser.length === 0) {
    const { auth } = await import("@/lib/auth");
    await auth.api.signUpEmail({
      body: { email, password, name: "Administrator" },
    });
    await db
      .update(users)
      .set({ roleId: adminRole.id, active: true })
      .where(eq(users.email, email));
    console.log(`Admin user created: ${email} / ${password}`);
  } else {
    console.log("Admin user already exists, skipping");
  }

  // Masters + BOM + opening stock (only on empty DB)
  const existingProducts = await db.select({ n: sql<number>`count(*)` }).from(products);
  if (Number(existingProducts[0].n) > 0) {
    console.log("Masters already seeded, skipping");
  } else {
    await db.insert(products).values(
      seedData.products.map((p) => ({ code: p.code, name: p.name, unit: p.unit })),
    );
    await db.insert(rawMaterials).values(
      seedData.materials.map((m) => ({
        code: m.code,
        name: m.name,
        unit: m.unit,
        price: m.price,
        minStock: m.minStock,
        currentStock: 0,
      })),
    );
    const prodByCode = new Map(
      (await db.select().from(products)).map((p) => [p.code, p.id]),
    );
    const matByCode = new Map(
      (await db.select().from(rawMaterials)).map((m) => [m.code, m.id]),
    );
    await db.insert(bomItems).values(
      seedData.bom.map((b) => ({
        productId: prodByCode.get(b.productCode)!,
        materialId: matByCode.get(b.materialCode)!,
        qtyPerUnit: b.qtyPerUnit,
      })),
    );
    await db.insert(suppliers).values(seedData.suppliers);
    await db.insert(customers).values(seedData.customers);

    // Opening stock: one lot + one ledger row per material
    for (const m of seedData.materials) {
      if (!m.openingStock) continue;
      const materialId = matByCode.get(m.code)!;
      const [lot] = await db
        .insert(lots)
        .values({
          lotNo: `OPEN-${m.code}`,
          itemType: "rm",
          itemId: materialId,
          initialQty: m.openingStock,
          remainingQty: m.openingStock,
          sourceType: "opening",
        })
        .returning();
      await db.insert(stockLedger).values({
        itemType: "rm",
        itemId: materialId,
        txnType: "opening",
        qtyIn: m.openingStock,
        qtyOut: 0,
        balanceAfter: m.openingStock,
        refType: "opening",
        refNo: "OPENING",
        lotId: lot.id,
      });
      await db
        .update(rawMaterials)
        .set({ currentStock: m.openingStock })
        .where(eq(rawMaterials.id, materialId));
    }
    console.log(
      `Seeded ${seedData.products.length} products, ${seedData.materials.length} materials, ${seedData.bom.length} BOM lines`,
    );
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
