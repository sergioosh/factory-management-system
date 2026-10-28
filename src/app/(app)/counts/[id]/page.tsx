import { notFound } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, rawMaterials, stockCountItems, stockCounts, users } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { CountDetailClient } from "./count-detail-client";

export const dynamic = "force-dynamic";

export default async function CountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireView("inventory");
  const { id } = await params;
  const countId = Number(id);
  if (!Number.isInteger(countId) || countId <= 0) notFound();

  const [count] = await db
    .select({
      id: stockCounts.id,
      countNo: stockCounts.countNo,
      countDate: stockCounts.countDate,
      scope: stockCounts.scope,
      status: stockCounts.status,
      notes: stockCounts.notes,
      createdBy: users.name,
    })
    .from(stockCounts)
    .leftJoin(users, eq(users.id, stockCounts.createdBy))
    .where(eq(stockCounts.id, countId));
  if (!count) notFound();

  const items = await db
    .select({
      id: stockCountItems.id,
      itemType: stockCountItems.itemType,
      systemQty: stockCountItems.systemQty,
      countedQty: stockCountItems.countedQty,
      itemCode: sql<string>`coalesce(${rawMaterials.code}, ${products.code}, '')`,
      itemName: sql<string>`coalesce(${rawMaterials.name}, ${products.name}, '')`,
      unit: sql<string>`coalesce(${rawMaterials.unit}, ${products.unit}, '')`,
    })
    .from(stockCountItems)
    .leftJoin(
      rawMaterials,
      and(eq(stockCountItems.itemType, "rm"), eq(stockCountItems.itemId, rawMaterials.id)),
    )
    .leftJoin(
      products,
      and(eq(stockCountItems.itemType, "fg"), eq(stockCountItems.itemId, products.id)),
    )
    .where(eq(stockCountItems.countId, countId))
    .orderBy(
      asc(stockCountItems.itemType),
      asc(sql`coalesce(${rawMaterials.code}, ${products.code})`),
    );

  return (
    <CountDetailClient
      count={count}
      items={items}
      canEdit={can(session, "inventory", "edit")}
      canApprove={can(session, "inventory", "approve")}
    />
  );
}
