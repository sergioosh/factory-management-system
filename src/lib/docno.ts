import { sql } from "drizzle-orm";
import type { Tx } from "@/db";

export async function nextDocNo(tx: Tx, key: string): Promise<string> {
  const res = await tx.execute(
    sql`UPDATE doc_counters SET value = value + 1 WHERE key = ${key} RETURNING value`,
  );
  const row = res.rows[0] as { value: number } | undefined;
  if (!row) throw new Error(`Unknown document counter: ${key}`);
  return `${key}-${String(row.value).padStart(4, "0")}`;
}
