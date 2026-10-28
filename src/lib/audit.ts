import { db, type Tx } from "@/db";
import { auditLog } from "@/db/schema";

export async function writeAudit(
  args: {
    userId: string | null;
    action: string;
    entity: string;
    entityId?: string | number;
    detail?: unknown;
  },
  tx?: Tx,
) {
  await (tx ?? db).insert(auditLog).values({
    userId: args.userId,
    action: args.action,
    entity: args.entity,
    entityId: args.entityId != null ? String(args.entityId) : null,
    detail: args.detail ?? null,
  });
}
