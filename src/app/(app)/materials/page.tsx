import { asc } from "drizzle-orm";
import { db } from "@/db";
import { rawMaterials } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { MaterialsClient } from "./materials-client";

export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  const session = await requireView("masters");
  const rows = await db.select().from(rawMaterials).orderBy(asc(rawMaterials.code));
  return (
    <MaterialsClient
      rows={rows}
      canCreate={can(session, "masters", "create")}
      canEdit={can(session, "masters", "edit")}
    />
  );
}
