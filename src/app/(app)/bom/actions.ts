"use server";

import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { bomItems, bomVersions } from "@/db/schema";
import { requirePerm } from "@/lib/session";
import { act } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { notifyChange } from "@/lib/notify";

const schema = z.object({
  productId: z.number().int().positive(),
  effectiveDate: z.string().min(1, "Effective date is required"),
  notes: z.string().trim().optional(),
  lines: z
    .array(
      z.object({
        materialId: z.number().int().positive("Pick a material"),
        qtyPerUnit: z.number().positive("Qty must be above 0"),
        scrapPct: z.number().min(0).max(100),
      }),
    )
    .refine(
      (lines) => new Set(lines.map((l) => l.materialId)).size === lines.length,
      "Duplicate material in recipe",
    ),
});

/** Replaces the active recipe (bom_items) and records a new version that supersedes the previous. */
export async function saveBomVersion(input: z.infer<typeof schema>) {
  return act(async () => {
    const s = await requirePerm("masters", "edit");
    const data = schema.parse(input);

    const version = await db.transaction(async (tx) => {
      const [last] = await tx
        .select({ version: bomVersions.version })
        .from(bomVersions)
        .where(eq(bomVersions.productId, data.productId))
        .orderBy(desc(bomVersions.version))
        .limit(1);
      const nextVersion = (last?.version ?? 0) + 1;

      await tx.delete(bomItems).where(eq(bomItems.productId, data.productId));
      if (data.lines.length) {
        await tx.insert(bomItems).values(
          data.lines.map((l) => ({
            productId: data.productId,
            materialId: l.materialId,
            qtyPerUnit: l.qtyPerUnit,
            scrapPct: l.scrapPct,
          })),
        );
      }
      await tx.insert(bomVersions).values({
        productId: data.productId,
        version: nextVersion,
        effectiveDate: data.effectiveDate,
        materials: data.lines.length,
        notes: data.notes || null,
        createdBy: s.user.id,
      });
      return nextVersion;
    });

    await writeAudit({
      userId: s.user.id,
      action: "update",
      entity: "bom",
      entityId: data.productId,
      detail: { version, materials: data.lines.length },
    });
    await notifyChange("masters");
    revalidatePath("/bom");
    revalidatePath(`/bom/${data.productId}`);
    revalidatePath("/products");
    return version;
  });
}
