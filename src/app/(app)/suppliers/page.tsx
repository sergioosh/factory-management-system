import { asc } from "drizzle-orm";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { SuppliersClient } from "./suppliers-client";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const session = await requireView("masters");
  const rows = await db.select().from(suppliers).orderBy(asc(suppliers.name));
  return (
    <SuppliersClient
      rows={rows}
      canCreate={can(session, "masters", "create")}
      canEdit={can(session, "masters", "edit")}
    />
  );
}
