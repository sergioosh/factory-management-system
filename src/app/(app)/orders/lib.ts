import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { bomItems, products, rawMaterials, salesOrderItems, salesOrders } from "@/db/schema";

export type MaterialCheckRow = {
  materialId: number;
  code: string;
  name: string;
  unit: string;
  required: number;
  stock: number;
  reservedOthers: number;
  free: number;
  short: number;
};

export type MaterialCheck = {
  rows: MaterialCheckRow[];
  productsWithoutBom: string[];
  totalShort: number;
};

/** Explode an order's lines through the BOM and compare against free stock
 *  (current stock minus requirements of OTHER active orders). */
export async function computeMaterialCheck(orderId: number): Promise<MaterialCheck> {
  const [items, allBom] = await Promise.all([
    db
      .select({ productId: salesOrderItems.productId, qty: salesOrderItems.qty })
      .from(salesOrderItems)
      .where(eq(salesOrderItems.orderId, orderId)),
    db.select().from(bomItems),
  ]);
  const bomByProduct = new Map<number, { materialId: number; qtyPerUnit: number }[]>();
  for (const b of allBom) {
    const list = bomByProduct.get(b.productId) ?? [];
    list.push({ materialId: b.materialId, qtyPerUnit: b.qtyPerUnit });
    bomByProduct.set(b.productId, list);
  }

  const explode = (lines: { productId: number; qty: number }[]) => {
    const req = new Map<number, number>();
    for (const line of lines) {
      for (const b of bomByProduct.get(line.productId) ?? []) {
        req.set(b.materialId, (req.get(b.materialId) ?? 0) + b.qtyPerUnit * line.qty);
      }
    }
    return req;
  };

  const required = explode(items);

  // requirements of other orders still competing for the same materials
  const otherActive = await db
    .select({ productId: salesOrderItems.productId, qty: salesOrderItems.qty })
    .from(salesOrderItems)
    .innerJoin(salesOrders, eq(salesOrderItems.orderId, salesOrders.id))
    .where(
      and(inArray(salesOrders.status, ["confirmed", "in_production"]), ne(salesOrders.id, orderId)),
    );
  const reserved = explode(otherActive);

  const materialIds = [...required.keys()];
  const mats = materialIds.length
    ? await db.select().from(rawMaterials).where(inArray(rawMaterials.id, materialIds))
    : [];
  const matById = new Map(mats.map((m) => [m.id, m]));

  const rows: MaterialCheckRow[] = materialIds
    .map((id) => {
      const m = matById.get(id)!;
      const req = required.get(id) ?? 0;
      const res = reserved.get(id) ?? 0;
      const free = m.currentStock - res;
      return {
        materialId: id,
        code: m.code,
        name: m.name,
        unit: m.unit,
        required: req,
        stock: m.currentStock,
        reservedOthers: res,
        free,
        short: Math.max(0, req - free),
      };
    })
    .sort((a, b) => b.short - a.short || a.code.localeCompare(b.code));

  const productIds = [...new Set(items.map((i) => i.productId))];
  const prods = productIds.length
    ? await db.select().from(products).where(inArray(products.id, productIds))
    : [];
  const productsWithoutBom = prods
    .filter((p) => !bomByProduct.has(p.id))
    .map((p) => p.name);

  return {
    rows,
    productsWithoutBom,
    totalShort: rows.reduce((s, r) => s + r.short, 0),
  };
}
