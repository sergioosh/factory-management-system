import { notFound, redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bomItems, bomVersions, products, rawMaterials, users } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { BomEditorClient } from "./bom-editor-client";

export const dynamic = "force-dynamic";

export default async function BomEditorPage({ params }: { params: Promise<{ productId: string }> }) {
  const session = await requireView("masters");
  if (!can(session, "masters", "edit")) redirect("/bom");

  const id = Number((await params).productId);
  if (!Number.isFinite(id)) notFound();

  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) notFound();

  const [materials, lines, versions] = await Promise.all([
    db
      .select({ id: rawMaterials.id, code: rawMaterials.code, name: rawMaterials.name, unit: rawMaterials.unit })
      .from(rawMaterials)
      .where(eq(rawMaterials.archived, false))
      .orderBy(asc(rawMaterials.code)),
    db
      .select({ materialId: bomItems.materialId, qtyPerUnit: bomItems.qtyPerUnit, scrapPct: bomItems.scrapPct })
      .from(bomItems)
      .where(eq(bomItems.productId, id)),
    db
      .select({
        version: bomVersions.version,
        effectiveDate: bomVersions.effectiveDate,
        materials: bomVersions.materials,
        notes: bomVersions.notes,
        createdAt: bomVersions.createdAt,
        createdBy: users.name,
      })
      .from(bomVersions)
      .leftJoin(users, eq(bomVersions.createdBy, users.id))
      .where(eq(bomVersions.productId, id))
      .orderBy(desc(bomVersions.version)),
  ]);

  return (
    <BomEditorClient
      product={{ id: product.id, code: product.code, name: product.name, unit: product.unit }}
      materialOptions={materials.map((m) => ({ value: m.id, label: m.name, hint: `${m.code} · ${m.unit}` }))}
      initialLines={lines.map((l) => ({ materialId: l.materialId, qtyPerUnit: l.qtyPerUnit, scrapPct: l.scrapPct }))}
      versions={versions.map((v) => ({
        version: v.version,
        effectiveDate: v.effectiveDate,
        materials: v.materials,
        notes: v.notes,
        createdAt: v.createdAt.toISOString(),
        createdBy: v.createdBy,
      }))}
    />
  );
}
