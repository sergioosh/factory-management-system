import { eq, and, gt, asc, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { products, rawMaterials, stockLedger, lots } from "@/db/schema";

export type ItemType = "rm" | "fg";

type Movement = {
  itemType: ItemType;
  itemId: number;
  txnType:
    | "opening"
    | "grn"
    | "production_out"
    | "production_in"
    | "production_return"
    | "sale"
    | "adjustment"
    | "count";
  qtyIn?: number;
  qtyOut?: number;
  refType?: string;
  refId?: number;
  refNo?: string;
  lotId?: number | null;
  userId?: string | null;
};

/**
 * The only way stock moves. Locks the item row, rejects negative balances,
 * updates currentStock and appends the ledger row in one transaction.
 */
export async function postStockMovement(tx: Tx, m: Movement): Promise<number> {
  const table = m.itemType === "rm" ? rawMaterials : products;
  const locked = await tx.execute(
    sql`SELECT id, name, current_stock FROM ${table} WHERE id = ${m.itemId} FOR UPDATE`,
  );
  const row = locked.rows[0] as { id: number; name: string; current_stock: string } | undefined;
  if (!row) throw new Error(`Item not found: ${m.itemType} #${m.itemId}`);

  const qtyIn = m.qtyIn ?? 0;
  const qtyOut = m.qtyOut ?? 0;
  const balance = Number(row.current_stock) + qtyIn - qtyOut;
  if (balance < 0) {
    throw new Error(`Insufficient stock: ${row.name} (available ${Number(row.current_stock)}, needed ${qtyOut})`);
  }

  await tx.update(table).set({ currentStock: balance }).where(eq(table.id, m.itemId));
  await tx.insert(stockLedger).values({
    itemType: m.itemType,
    itemId: m.itemId,
    txnType: m.txnType,
    qtyIn,
    qtyOut,
    balanceAfter: balance,
    refType: m.refType,
    refId: m.refId,
    refNo: m.refNo,
    lotId: m.lotId ?? null,
    createdBy: m.userId ?? null,
  });
  return balance;
}

export async function createLot(
  tx: Tx,
  args: {
    lotNo: string;
    itemType: ItemType;
    itemId: number;
    qty: number;
    sourceType: "opening" | "grn" | "production" | "adjustment";
    sourceId?: number;
  },
) {
  const [lot] = await tx
    .insert(lots)
    .values({
      lotNo: args.lotNo,
      itemType: args.itemType,
      itemId: args.itemId,
      initialQty: args.qty,
      remainingQty: args.qty,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
    })
    .returning();
  return lot;
}

/** Decrement lot remainingQty FIFO. Tolerates shortfall (untracked stock stays sound at ledger level). */
export async function consumeLotsFifo(tx: Tx, itemType: ItemType, itemId: number, qty: number) {
  let remaining = qty;
  const open = await tx
    .select()
    .from(lots)
    .where(and(eq(lots.itemType, itemType), eq(lots.itemId, itemId), gt(lots.remainingQty, 0)))
    .orderBy(asc(lots.createdAt), asc(lots.id))
    .for("update");
  for (const lot of open) {
    if (remaining <= 0) break;
    const take = Math.min(lot.remainingQty, remaining);
    await tx
      .update(lots)
      .set({ remainingQty: lot.remainingQty - take })
      .where(eq(lots.id, lot.id));
    remaining -= take;
  }
}
