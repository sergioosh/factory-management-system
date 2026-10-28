"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { purchaseRequests, purchaseRequestItems } from "@/db/schema";
import { requirePerm } from "@/lib/session";
import { act } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { notifyChange } from "@/lib/notify";
import { nextDocNo } from "@/lib/docno";

const createSchema = z.object({
  notes: z.string().trim().optional(),
  lines: z
    .array(
      z.object({
        materialId: z.number().int().positive(),
        qty: z.number().positive(),
        note: z.string().trim().optional(),
      }),
    )
    .min(1, "Add at least one line"),
});

export async function createPurchaseRequest(input: z.infer<typeof createSchema>) {
  return act(async () => {
    const s = await requirePerm("purchasing", "create");
    const data = createSchema.parse(input);
    const pr = await db.transaction(async (tx) => {
      const prNo = await nextDocNo(tx, "PR");
      const [header] = await tx
        .insert(purchaseRequests)
        .values({ prNo, notes: data.notes || null, requestedBy: s.user.id })
        .returning();
      await tx.insert(purchaseRequestItems).values(
        data.lines.map((l) => ({
          prId: header.id,
          materialId: l.materialId,
          qty: l.qty,
          note: l.note || null,
        })),
      );
      return header;
    });
    await writeAudit({
      userId: s.user.id,
      action: "create",
      entity: "purchase_request",
      entityId: pr.id,
      detail: { prNo: pr.prNo, ...data },
    });
    await notifyChange("purchasing");
    revalidatePath("/purchase-requests");
    revalidatePath("/purchase-requests/new");
    return pr.id;
  });
}

const decideSchema = z.object({
  id: z.number().int().positive(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().optional(),
});

export async function decidePurchaseRequest(input: z.infer<typeof decideSchema>) {
  return act(async () => {
    const s = await requirePerm("purchasing", "approve");
    const data = decideSchema.parse(input);
    const [pr] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, data.id));
    if (!pr) throw new Error("Request not found");
    if (pr.status !== "pending") throw new Error(`Request already ${pr.status}`);
    await db
      .update(purchaseRequests)
      .set({
        status: data.decision,
        decidedBy: s.user.id,
        decidedAt: new Date(),
        decisionNote: data.note || null,
      })
      .where(eq(purchaseRequests.id, data.id));
    await writeAudit({
      userId: s.user.id,
      action: data.decision === "approved" ? "approve" : "reject",
      entity: "purchase_request",
      entityId: data.id,
      detail: { prNo: pr.prNo, note: data.note },
    });
    await notifyChange("purchasing");
    revalidatePath("/purchase-requests");
  });
}
