import { asc } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { CustomersClient } from "./customers-client";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const session = await requireView("masters");
  const rows = await db.select().from(customers).orderBy(asc(customers.name));
  return (
    <CustomersClient
      rows={rows}
      canCreate={can(session, "masters", "create")}
      canEdit={can(session, "masters", "edit")}
    />
  );
}
