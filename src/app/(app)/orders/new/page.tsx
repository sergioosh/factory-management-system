import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, products } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { OrderFormClient } from "../order-form-client";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const session = await requireView("orders");
  if (!can(session, "orders", "create")) redirect("/orders");

  const [customerList, productList] = await Promise.all([
    db
      .select({ id: customers.id, name: customers.name, code: customers.code })
      .from(customers)
      .where(eq(customers.archived, false)),
    db
      .select({ id: products.id, code: products.code, name: products.name, sellingPrice: products.sellingPrice })
      .from(products)
      .where(eq(products.archived, false)),
  ]);

  return <OrderFormClient mode="create" customers={customerList} products={productList} />;
}
